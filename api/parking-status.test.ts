import { describe, expect, it } from "vitest";
import { resolveStatus, type StatusSignal } from "@contracts/parking-status";

const now = new Date("2026-11-04T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000);
const community = (over: Partial<StatusSignal>): StatusSignal => ({ state: "free", sourceType: "community", source: "Communauté", observedAt: minutesAgo(2), confidence: 50, confirmations: 0, contradictions: 0, ...over });

describe("statut des places", () => {
  it("sans donnée : gris et disponibilité inconnue", () => {
    const s = resolveStatus([], now);
    expect(s.color).toBe("gray"); expect(s.availability).toBe("unknown"); expect(s.source).toBeNull();
  });
  it("source fiable libre récente : vert", () => {
    const s = resolveStatus([{ state: "free", sourceType: "owner", source: "Calendrier du propriétaire", observedAt: minutesAgo(1) }], now);
    expect(s.color).toBe("green"); expect(s.availability).toBe("available"); expect(s.source).toBe("Calendrier du propriétaire");
  });
  it("source fiable occupée : rouge", () => {
    expect(resolveStatus([{ state: "occupied", sourceType: "operator", source: "Exploitant", observedAt: minutesAgo(3) }], now).color).toBe("red");
  });
  it("un signalement communautaire libre n'est jamais vert, même très confirmé", () => {
    const s = resolveStatus([community({ confidence: 98, confirmations: 10 })], now);
    expect(s.color).toBe("orange"); expect(s.availability).toBe("uncertain");
  });
  it("occupé non confirmé : orange ; confirmé par 2 personnes : rouge", () => {
    expect(resolveStatus([community({ state: "occupied" })], now).color).toBe("orange");
    expect(resolveStatus([community({ state: "occupied", confidence: 74, confirmations: 2 })], now).color).toBe("red");
  });
  it("signalement libre expiré après 15 min : gris, information trop ancienne", () => {
    const s = resolveStatus([community({ observedAt: minutesAgo(16) })], now);
    expect(s.color).toBe("gray"); expect(s.stale).toBe(true); expect(s.availability).toBe("unknown");
  });
  it("donnée d'exploitant expirée après 10 min : gris", () => {
    expect(resolveStatus([{ state: "free", sourceType: "operator", source: "X", observedAt: minutesAgo(11) }], now).color).toBe("gray");
  });
  it("signalement contredit : ignoré", () => {
    expect(resolveStatus([community({ confirmations: 0, contradictions: 2 })], now).color).toBe("gray");
  });
  it("la source fiable l'emporte sur la communauté", () => {
    const s = resolveStatus([community({ state: "free" }), { state: "occupied", sourceType: "sensor", source: "Capteur", observedAt: minutesAgo(5) }], now);
    expect(s.color).toBe("red");
  });
  it("départ annoncé : orange avec heure, valable jusqu'à 10 min après l'heure estimée", () => {
    const s = resolveStatus([community({ state: "departure", observedAt: minutesAgo(40), estimatedDeparture: new Date(now.getTime() + 5 * 60000) })], now);
    expect(s.color).toBe("orange"); expect(s.label).toContain("Départ annoncé");
  });
  it("hors horaires : gris et indisponible", () => {
    const s = resolveStatus([{ state: "closed", sourceType: "owner", source: "Calendrier", observedAt: now }], now);
    expect(s.color).toBe("gray"); expect(s.availability).toBe("unavailable");
  });
  it("date future ignorée", () => {
    expect(resolveStatus([community({ observedAt: new Date(now.getTime() + 3600000) })], now).color).toBe("gray");
  });
});
