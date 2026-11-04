import { describe, expect, it } from "vitest";
import { clusterPoints } from "../src/lib/cluster";

const pts = [{ latitude: 48.8566, longitude: 2.3522 }, { latitude: 48.8567, longitude: 2.3523 }, { latitude: 48.95, longitude: 2.5 }];
describe("regroupement de marqueurs", () => {
  it("regroupe les points proches à faible zoom", () => {
    const groups = clusterPoints(pts, 10);
    expect(groups.length).toBe(2);
    expect(groups.some((g) => g.items.length === 2)).toBe(true);
  });
  it("ne regroupe plus à fort zoom", () => { expect(clusterPoints(pts, 15).length).toBe(3); });
});
