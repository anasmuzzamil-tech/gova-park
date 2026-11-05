// Limitation de débit en mémoire (une seule instance Render ; aucun service externe).
// Les compteurs sont perdus au redémarrage : c'est assumé.

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private maxKeys = 5000) {}

  // Compte une requête. `allowed` est faux au-delà de `limit` dans la fenêtre.
  hit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) { entry = { count: 0, resetAt: now + windowMs }; this.hits.set(key, entry); }
    entry.count += 1;
    if (this.hits.size > this.maxKeys) this.prune(now);
    return { allowed: entry.count <= limit, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  size() { return this.hits.size; }

  // Retire les entrées expirées ; si la table dépasse encore le plafond, retire les plus anciennes.
  private prune(now: number) {
    for (const [key, value] of this.hits) if (value.resetAt <= now) this.hits.delete(key);
    for (const key of this.hits.keys()) { if (this.hits.size <= this.maxKeys) break; this.hits.delete(key); }
  }
}

export type LimitRule = { name: string; limit: number; windowMs: number };

const MIN = 60_000;
// Routes d'écriture : plus strictes que la limite générale, par adresse IP.
export const WRITE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  "auth.login": { limit: 10, windowMs: 15 * MIN },
  "auth.register": { limit: 5, windowMs: 60 * MIN },
  "govapark.street.create": { limit: 30, windowMs: 10 * MIN },
  "govapark.listings.create": { limit: 10, windowMs: 60 * MIN },
  "govapark.community.create": { limit: 20, windowMs: 60 * MIN },
  "govapark.reservations.create": { limit: 20, windowMs: 60 * MIN },
  "govapark.storage.upload": { limit: 30, windowMs: 60 * MIN },
};

// Règles à appliquer à une requête. Une requête tRPC groupée (« a.b,c.d ») compte pour chaque procédure.
export function rulesForRequest(method: string, path: string): LimitRule[] {
  const rules: LimitRule[] = [{ name: path.startsWith("/api/log") ? "log" : "general", limit: path.startsWith("/api/log") ? 600 : 300, windowMs: MIN }];
  if (method === "POST" && path.startsWith("/api/trpc/")) {
    const procedures = path.slice("/api/trpc/".length).split(",").map((p) => p.trim()).filter(Boolean);
    const counted = new Map<string, number>();
    for (const procedure of procedures) if (WRITE_LIMITS[procedure]) counted.set(procedure, (counted.get(procedure) ?? 0) + 1);
    for (const [procedure, times] of counted) {
      const { limit, windowMs } = WRITE_LIMITS[procedure];
      for (let i = 0; i < times; i++) rules.push({ name: procedure, limit, windowMs });
    }
  }
  return rules;
}
