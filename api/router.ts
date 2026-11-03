import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { govaparkRouter } from "./govapark-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  govapark: govaparkRouter,
});

export type AppRouter = typeof appRouter;
