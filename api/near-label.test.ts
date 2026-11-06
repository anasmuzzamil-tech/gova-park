import { describe, expect, it } from "vitest";
import { nearCountLabel, nearLabel, NEAR_COUNT_RADIUS_M } from "../src/lib/near-label";
import { getMapDiag, mapDiag, mapDiagLine } from "../src/lib/map-diag";

describe("poignée de la feuille basse", () => {
  it("sans adresse ni position : près du centre (jamais « près de du centre »)", () => {
    expect(nearLabel(35, { hasPosition: false })).toBe("35 places près du centre");
    expect(nearLabel(35, { hasPosition: false, address: "  " })).toBe("35 places près du centre");
  });
  it("avec une adresse cherchée", () => { expect(nearLabel(12, { hasPosition: false, address: "rue de Rivoli, Paris" })).toBe("12 places près de rue de Rivoli, Paris"); });
  it("avec la position de l'appareil", () => { expect(nearLabel(1, { hasPosition: true })).toBe("1 place près de vous"); });
  it("l'adresse cherchée l'emporte sur la position", () => { expect(nearLabel(2, { hasPosition: true, address: "Bastille" })).toBe("2 places près de Bastille"); });
});

describe("compteur de la poignée (1 km, places prises exclues)", () => {
  it("rayon de 1 km et libellé exact, sans le mot « libres »", () => {
    expect(NEAR_COUNT_RADIUS_M).toBe(1000);
    expect(nearCountLabel(3, true)).toBe("3 places à moins de 1 km de vous");
    expect(nearCountLabel(1, false)).toBe("1 place à moins de 1 km du centre de la carte");
    expect(nearCountLabel(0, true)).toBe("0 place à moins de 1 km de vous");
  });
});

describe("diagnostic de la carte", () => {
  it("carte non créée, en chargement, chargée", () => {
    expect(getMapDiag().style).toBe("carte non créée");
    mapDiag.map = { isStyleLoaded: () => false };
    expect(getMapDiag().style).toBe("en chargement");
    mapDiag.loaded = true;
    expect(getMapDiag().style).toBe("chargé, tuiles en cours");
    mapDiag.map = { isStyleLoaded: () => true }; mapDiag.tiles = 7; mapDiag.lastError = "Failed to fetch";
    expect(mapDiagLine(getMapDiag())).toBe("Carte : style chargé · tuiles reçues 7 · tentative 1 · dernière erreur Failed to fetch");
  });
  it("un état illisible ne lève jamais d'exception", () => {
    mapDiag.map = { isStyleLoaded: () => { throw new Error("x"); } };
    expect(getMapDiag().style).toBe("illisible");
  });
});
