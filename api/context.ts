import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";
import { isDemoMode, demoUser } from "./demo";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  clientIp: string;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
  clientIp = "inconnu",
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders, clientIp };
  if (isDemoMode) {
    // Mode demo (sans base) : visiteur connecte d'office, la carte s'ouvre directement.
    ctx.user = demoUser;
    return ctx;
  }
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Authentication is optional here
  }
  return ctx;
}
