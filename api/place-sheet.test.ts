import { describe, expect, it } from "vitest";
import { alertTone, parisSheetContent, type ParisSpotInfo } from "../src/lib/place-sheet";

const REGIMES: Array<[string, string]> = [["PAYANT MIXTE", "Mixte"], ["2 ROUES", "Motos payant Mixte"]];
const spot = (extra: Partial<ParisSpotInfo> = {}): ParisSpotInfo => ({ lat: 48.853, lng: 2.369, t: 1, places: 5, regime: 0, street: "RUE|de Lappe", num: 0, color: "gray", reportId: 0, ...extra });
const NOW = new Date("2026-11-05T12:00:00Z").getTime();

describe("fiche de place unique : contenu", () => {
  it("place grise : titre, nombre de places, aucune ligne de statut", () => {
    const c = parisSheetContent(spot(), REGIMES, null, null, NOW);
    expect(c.places).toBe("5 places");
    expect(c.status).toBeNull();
    expect(c.title.length > 0).toBe(true);
    expect(/inconnu/i.test(JSON.stringify(c))).toBe(false);
  });
  it("signalement récent : une ligne de statut avec la couleur du statut", () => {
    const c = parisSheetContent(spot({ color: "green", reportId: 3 }), REGIMES, { status: "free", reportedAt: new Date(NOW - 2 * 60000).toISOString(), example: false }, null, NOW);
    expect(c.status?.text).toContain("libre");
    expect(c.status?.text).toContain("il y a 2 min");
    expect(c.status?.color).toBe("#12a150");
  });
  it("boutons Je me gare / Je libère : seulement si la position est proche ET le type autorisé", () => {
    const near = { lat: 48.853, lng: 2.369 }, far = { lat: 48.86, lng: 2.4 };
    expect(parisSheetContent(spot(), REGIMES, null, near, NOW).canReport).toBe(true);
    expect(parisSheetContent(spot(), REGIMES, null, far, NOW).canReport).toBe(false);
    expect(parisSheetContent(spot(), REGIMES, null, null, NOW).canReport).toBe(false);
    expect(parisSheetContent(spot({ t: 8 }), REGIMES, null, near, NOW).canReport).toBe(false); // type réservé : aucun signalement possible
  });
  it("teinte des puces d'alerte", () => {
    expect(alertTone("Stationnement interdit à cet endroit")).toBe("red");
    expect(alertTone("Chantier à 80 m · Sens unique")).toBe("orange");
    expect(alertTone("Zone à faibles émissions")).toBe("neutral");
  });
});

describe("fiche d'une place PMR (affichage seulement)", () => {
  const spot = { lat: 48.8566, lng: 2.3522, t: 7, places: 1, regime: 0, street: "Quai d'Orléans", num: 0, color: "gray", reportId: 0 };
  it("titre « Place réservée PMR », mention de la carte, aucun signalement possible même sur place", () => {
    const c = parisSheetContent(spot, [["GIG/GIC", "GIG/GIC Standard"]], null, { lat: 48.8566, lng: 2.3522 });
    expect(c.title.startsWith("Place réservée PMR")).toBe(true);
    expect(c.note).toBe("Réservée aux titulaires de la carte de stationnement pour personnes handicapées");
    expect(c.status).toBeNull();
    expect(c.canReport).toBe(false);
  });
  it("régime Élargie : précision gardée", () => {
    const c = parisSheetContent({ ...spot, regime: 0 }, [["GIG/GIC", "GIG/GIC Elargie"]], null, null);
    expect(c.note).toContain("Elargie");
  });
});
