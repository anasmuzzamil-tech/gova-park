import { describe, expect, it } from "vitest";
import { calculatePrice, overlaps } from "@contracts/pricing";

describe("tarification GOVAPARK", () => {
  it("facture toute heure commencée et applique les plafonds", () => {
    const result = calculatePrice({ startAt: new Date("2026-11-03T10:00:00"), endAt: new Date("2026-11-03T11:01:00"), hourlyCents: 300, dailyCents: 1800, weeklyCents: 9000 });
    expect(result.startedHours).toBe(2);
    expect(result.baseCents).toBe(600);
    expect(result.feeCents).toBe(48);
    expect(result.totalCents).toBe(648);
  });
  it("rejette une durée nulle ou négative", () => {
    expect(() => calculatePrice({ startAt: new Date("2026-11-03T10:00:00"), endAt: new Date("2026-11-03T10:00:00"), hourlyCents: 300, dailyCents: 1800, weeklyCents: 9000 })).toThrow();
  });
});

describe("chevauchement de créneaux", () => {
  it("détecte les créneaux qui se recoupent", () => {
    expect(overlaps(new Date("2026-11-03T10:00:00"), new Date("2026-11-03T12:00:00"), new Date("2026-11-03T11:00:00"), new Date("2026-11-03T13:00:00"))).toBe(true);
  });
  it("autorise deux créneaux qui se suivent exactement", () => {
    expect(overlaps(new Date("2026-11-03T10:00:00"), new Date("2026-11-03T12:00:00"), new Date("2026-11-03T12:00:00"), new Date("2026-11-03T13:00:00"))).toBe(false);
  });
});
