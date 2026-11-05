import { describe, expect, it } from "vitest";
import { modeTabs } from "../src/lib/route-modes";

const by = (tabs: ReturnType<typeof modeTabs>, m: string) => tabs.find((t) => t.mode === m)!;

describe("onglets par mode", () => {
  it("quatre onglets dans l'ordre du sélecteur : voiture, moto, livraison, vélo", () => {
    expect(modeTabs({ carDurationS: 840, bikeServiceDurationS: null, straightDurationS: 1200 }).map((t) => t.mode)).toEqual(["car", "moto", "delivery", "bike"]);
  });
  it("voiture et livraison : la durée du réseau routier, exacte ; moto : la même, marquée estimation", () => {
    const t = modeTabs({ carDurationS: 840, bikeServiceDurationS: null, straightDurationS: 1200 });
    expect(by(t, "car")).toMatchObject({ durationS: 840, estimate: false, text: "Voiture 14 min", note: null });
    expect(by(t, "delivery")).toMatchObject({ durationS: 840, estimate: false, text: "Livraison 14 min" });
    expect(by(t, "moto")).toMatchObject({ durationS: 840, estimate: true, text: "Moto ≈ 14 min" });
    expect(by(t, "moto").note).toMatch(/estimation/);
  });
  it("vélo sans tracé vélo : à vol d'oiseau, étiqueté estimation", () => {
    const b = by(modeTabs({ carDurationS: 840, bikeServiceDurationS: null, straightDurationS: 1500 }), "bike");
    expect(b).toMatchObject({ durationS: 1500, estimate: true, text: "Vélo ≈ 25 min" });
    expect(b.note).toMatch(/vol d’oiseau/);
  });
  it("vélo avec un tracé vélo calculé : durée du service, exacte, sans mention d'estimation", () => {
    const b = by(modeTabs({ carDurationS: 840, bikeServiceDurationS: 1260, straightDurationS: 1500 }), "bike");
    expect(b).toMatchObject({ durationS: 1260, estimate: false, text: "Vélo 21 min", note: null });
  });
  it("durée inconnue : « — », jamais un nombre inventé", () => {
    const t = modeTabs({ carDurationS: null, bikeServiceDurationS: null, straightDurationS: null });
    for (const tab of t) { expect(tab.durationS).toBeNull(); expect(tab.text.endsWith("—")).toBe(true); }
    expect(by(t, "car").text).toBe("Voiture —");
  });
  it("valeurs invalides (0, négatif, NaN) : traitées comme inconnues", () => {
    const t = modeTabs({ carDurationS: 0, bikeServiceDurationS: -5, straightDurationS: NaN });
    expect(t.every((x) => x.durationS === null)).toBe(true);
  });
  it("aucun libellé ne contient « inconnu »", () => {
    for (const x of [modeTabs({ carDurationS: null, bikeServiceDurationS: null, straightDurationS: null }), modeTabs({ carDurationS: 600, bikeServiceDurationS: null, straightDurationS: 900 })].flat()) {
      expect(/inconnu/i.test(x.text + (x.note ?? ""))).toBe(false);
    }
  });
});
