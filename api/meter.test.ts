import { describe, expect, it } from "vitest";
import { meterCostCents } from "@contracts/meter";

describe("compteur de stationnement", () => {
  it("calcule au prorata de la minute", () => {
    expect(meterCostCents(300, new Date("2026-11-04T10:00:00Z"), new Date("2026-11-04T11:30:30Z"))).toBe(450);
  });
  it("ne donne aucun tarif sans tarif horaire", () => {
    expect(meterCostCents(null, new Date("2026-11-04T10:00:00Z"), new Date("2026-11-04T11:00:00Z"))).toBeNull();
    expect(meterCostCents(0, new Date("2026-11-04T10:00:00Z"), new Date("2026-11-04T11:00:00Z"))).toBeNull();
  });
});
