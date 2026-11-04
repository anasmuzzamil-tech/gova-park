import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { log } from "./lib/logger";
import { handleClientLog } from "./lib/clientlog";
import { REQUEST_ID_HEADER, runWithRequestId } from "./lib/requestcontext";

const app = new Hono<{ Bindings: HttpBindings }>();

// One middleware for both halves of request observability, because they need the
// same scope and the same id:
//   - G3 correlation: mint a request id, echo it on the response header (what the
//     browser logger reads), and run the rest of the request inside it so every
//     server log line carries it.
//   - G4 access log: one line per request with method/path/status/duration, so
//     "who called what and how long did it take" is answerable. Until now only
//     failures were logged at all, and success left no trace.
// /api/log is skipped: it is the browser's log sink, and an access line per
// POSTed batch would be self-amplifying noise in the very file it writes.
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  if (c.req.path === "/api/log") {
    await next();
    return;
  }
  const start = Date.now();
  await runWithRequestId(requestId, async () => {
    await next();
    // Set the header AFTER next(): the tRPC route hands Hono a raw Response
    // built by fetchRequestHandler, which carries its own headers, so a
    // c.header() called before dispatch is dropped on that path. Setting it on
    // the resolved c.res covers every route, including the tRPC one.
    c.res.headers.set(REQUEST_ID_HEADER, requestId);
    // Only /api/* is logged. In production serveStaticFiles() registers a
    // catch-all AFTER this middleware, so a page load pulls in every asset as
    // its own request — logging those would bury the API calls the agent reads
    // this file for, and inflate the log for no diagnostic gain.
    if (!c.req.path.startsWith("/api/")) return;
    log.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  });
});

// Scoped to the tRPC route, NOT global: on the dev server (@hono/vite-dev-server)
// a global bodyLimit breaks bodyless requests. Hono's bodyLimit reads any truthy
// request stream to the end and then rebuilds the Request with `new Request(raw,
// { body, duplex: "half" })`; the dev server's Response/Request class makes that
// rebuild throw `TypeError: Cannot read private member #state ...`, so every
// bodyless request (DELETE/PATCH on the app's own REST routes) 500s at dispatch.
// /api/log keeps its own 64KB caps in lib/clientlog.ts, so it needs no middleware.
app.get("/health", (c) => c.json({ status: "ok", service: "GOVAPARK" }));

// En-tetes de securite (equivalent de Helmet, integre a Hono). La politique CSP est laissee de cote
// car la carte 3D charge des tuiles et des workers depuis des domaines externes.
app.use("*", secureHeaders({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: "cross-origin" }));

// Limitation de requetes par adresse IP (en memoire, suffisant pour une seule instance Render).
// Pas de CORS ouvert : l'API n'est utilisable que depuis le site lui-meme.
const hits = new Map<string, { count: number; resetAt: number }>();
app.use("/api/*", async (c, next) => {
  const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0]?.trim() || "inconnu";
  const limit = c.req.path.startsWith("/api/log") ? 600 : 300; // par minute
  const now = Date.now();
  let entry = hits.get(ip);
  if (!entry || entry.resetAt < now) { entry = { count: 0, resetAt: now + 60_000 }; hits.set(ip, entry); }
  entry.count += 1;
  if (hits.size > 5000) for (const [key, value] of hits) if (value.resetAt < now) hits.delete(key);
  if (entry.count > limit) {
    c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: "Trop de requêtes, réessayez dans une minute." }, 429);
  }
  await next();
});
// Service worker : toujours revalide (jamais de cache long), servi a la racine pour couvrir tout le site.
app.use("/sw.js", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-cache");
  c.header("Service-Worker-Allowed", "/");
});
app.use("/api/trpc/*", bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
// Browser-side log sink (see lib/clientlog.ts). Must be registered before the
// /api/* 404 catch-all below. bodyLimit guards it too: lib/clientlog.ts caps the
// body itself, but only AFTER Hono has read it into memory, and this route sits
// on the public preview URL — the cap has to bite before the read.
app.post(
  "/api/log",
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.body(null, 413) }),
  handleClientLog,
);
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// Unhandled request errors must reach /tmp/kimi-logs/app.log, not just stdout:
// that file is what the building agent reads when a preview 500s, and without
// this the log looks clean while the request actually failed. Response stays a
// generic 500 (no stack leaked to the caller); the detail goes to the log only.
app.onError((err, c) => {
  log.error("unhandled request error", {
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    log.info(`Server running on http://localhost:${port}/`);
  });
}
