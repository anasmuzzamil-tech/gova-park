import * as cookie from "cookie";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, ownerVerifications } from "@db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { signSessionToken } from "./kimi/session";
import { env } from "./lib/env";
import { isDemoMode } from "./demo";

const scrypt = promisify(scryptCallback);
const authAttempts = new Map<string, { count: number; resetAt: number }>();
function enforceAuthRateLimit(ctx: { clientIp: string }) {
  const key = ctx.clientIp || "unknown-client"; // IP determinee par api/lib/client-ip.ts, jamais l'en-tete brut du client
  const now = Date.now(); const current = authAttempts.get(key);
  if (!current || current.resetAt <= now) { authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 }); return; }
  if (current.count >= 10) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de tentatives. Réessayez dans 15 minutes." });
  current.count += 1;
}
async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltHex, keyHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function createSession(ctx: { req: Request; resHeaders: Headers }, unionId: string) {
  const token = await signSessionToken({ unionId, clientId: env.appId || "govapark-local" });
  const opts = getSessionCookieOptions(ctx.req.headers);
  ctx.resHeaders.append("set-cookie", cookie.serialize(Session.cookieName, token, {
    httpOnly: opts.httpOnly, path: opts.path, sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
    secure: opts.secure, maxAge: Session.maxAgeMs / 1000,
  }));
}

export const authRouter = createRouter({
  me: authedQuery.query(({ ctx }) => ({
    id: ctx.user.id, name: ctx.user.name, email: ctx.user.email,
    avatar: ctx.user.avatar, role: ctx.user.role, ownerVerificationStatus: ctx.user.ownerVerificationStatus, createdAt: ctx.user.createdAt,
    // Indique au site qu'il tourne en mode démo (sans base) : étiquettes « exemple » et textes de démo seulement dans ce cas.
    demo: isDemoMode,
  })),
  register: publicQuery.input(z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(320),
    password: z.string().min(10).max(128),
    accountType: z.enum(["user", "owner"]),
  })).mutation(async ({ ctx, input }) => {
    enforceAuthRateLimit(ctx);
    const db = getDb();
    const email = input.email.toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Cette adresse e-mail possède déjà un compte." });
    const unionId = `local:${randomBytes(24).toString("hex")}`;
    const passwordHash = await hashPassword(input.password);
    const [created] = await db.insert(users).values({ unionId, name: input.name, email, passwordHash, role: input.accountType, ownerVerificationStatus: input.accountType === "owner" ? "pending" : "not_applicable", lastSignInAt: new Date() }).$returningId();
    if (input.accountType === "owner") await db.insert(ownerVerifications).values({ userId: created.id, status: "pending" });
    await createSession(ctx, unionId);
    return { success: true };
  }),
  login: publicQuery.input(z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
    enforceAuthRateLimit(ctx);
    const [user] = await getDb().select().from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
    if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Adresse e-mail ou mot de passe incorrect." });
    }
    await getDb().update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
    await createSession(ctx, user.unionId);
    return { success: true };
  }),
  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append("set-cookie", cookie.serialize(Session.cookieName, "", {
      httpOnly: opts.httpOnly, path: opts.path, sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure, maxAge: 0,
    }));
    return { success: true };
  }),
});
