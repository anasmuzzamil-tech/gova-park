import { describe, expect, it } from "vitest";
import { RateLimiter, rulesForRequest, WRITE_LIMITS } from "./lib/rate-limit";

describe("limiteur de débit en mémoire", () => {
  it("bloque au-delà de la limite puis repart après la fenêtre", () => {
    const l = new RateLimiter();
    for (let i = 0; i < 3; i++) expect(l.hit("a", 3, 1000, 0).allowed).toBe(true);
    const blocked = l.hit("a", 3, 1000, 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(l.hit("a", 3, 1000, 1001).allowed).toBe(true);
  });
  it("des clés différentes ont des compteurs séparés", () => {
    const l = new RateLimiter();
    l.hit("a", 1, 1000, 0);
    expect(l.hit("a", 1, 1000, 1).allowed).toBe(false);
    expect(l.hit("b", 1, 1000, 1).allowed).toBe(true);
  });
  it("la table reste bornée", () => {
    const l = new RateLimiter(10);
    for (let i = 0; i < 100; i++) l.hit(`k${i}`, 5, 60_000, 0);
    expect(l.size() <= 10).toBe(true);
  });
});

describe("règles par route", () => {
  it("lecture : seulement la limite générale", () => {
    const r = rulesForRequest("GET", "/api/trpc/govapark.listings.list");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("general");
  });
  it("connexion, signalement en rue, création d'annonce : limites d'écriture plus strictes que la limite générale", () => {
    for (const p of ["auth.login", "govapark.street.create", "govapark.listings.create"]) {
      const rules = rulesForRequest("POST", `/api/trpc/${p}`);
      const w = rules.find((x) => x.name === p);
      expect(w !== undefined).toBe(true);
      expect(w!.limit < 300).toBe(true);
      expect(w!.limit).toBe(WRITE_LIMITS[p].limit);
    }
  });
  it("requête groupée : chaque procédure d'écriture compte", () => {
    const rules = rulesForRequest("POST", "/api/trpc/auth.login,auth.login,govapark.listings.list");
    expect(rules.filter((x) => x.name === "auth.login")).toHaveLength(2);
  });
  it("une écriture limitée ne passe pas la 11e fois depuis la même IP (connexion)", () => {
    const l = new RateLimiter();
    let allowed = 0;
    for (let i = 0; i < 12; i++) {
      const ok = rulesForRequest("POST", "/api/trpc/auth.login").every((r) => l.hit(`${r.name}|1.2.3.4`, r.limit, r.windowMs, 0).allowed || false);
      if (ok) allowed++;
    }
    expect(allowed).toBe(10);
  });
  it("/api/log a sa propre limite", () => {
    expect(rulesForRequest("POST", "/api/log")[0].limit).toBe(600);
  });
});
