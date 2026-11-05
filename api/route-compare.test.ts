import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_ROUTE_ALTERNATIVES, VIA_MIN_METERS, capAlternatives, pointInRing, routeCrossesZfe, tripTag, viaRoad } from "../src/lib/route-compare";
import type { ZfeFile } from "../contracts/paris-zfe";

// Carré de 0,2° x 0,2° [lng, lat] : (2,48) à (2.2,48.2), NON refermé comme le fichier réel.
const SQUARE: Array<[number, number]> = [[2, 48], [2.2, 48], [2.2, 48.2], [2, 48.2]];

describe("point dans un périmètre", () => {
  it("dedans, dehors, et de l'autre côté de chaque bord", () => {
    expect(pointInRing(48.1, 2.1, SQUARE)).toBe(true);
    expect(pointInRing(48.1, 2.3, SQUARE)).toBe(false);
    expect(pointInRing(48.1, 1.9, SQUARE)).toBe(false);
    expect(pointInRing(47.9, 2.1, SQUARE)).toBe(false);
    expect(pointInRing(48.3, 2.1, SQUARE)).toBe(false);
  });
});

describe("le tracé traverse-t-il la ZFE", () => {
  it("tracé entièrement dehors : non", () => { expect(routeCrossesZfe([[48.1, 1.5], [48.1, 1.9]], SQUARE)).toBe(false); });
  it("tracé qui entre dans le périmètre : oui", () => { expect(routeCrossesZfe([[48.1, 1.5], [48.1, 2.1]], SQUARE)).toBe(true); });
  it("tracé entièrement dedans : oui", () => { expect(routeCrossesZfe([[48.05, 2.05], [48.1, 2.1]], SQUARE)).toBe(true); });
  it("tracé qui coupe le périmètre entre deux points (aucun point dedans) : oui", () => { expect(routeCrossesZfe([[48.1, 1.5], [48.1, 2.5]], SQUARE)).toBe(true); });
  it("tracé qui coupe seulement le bord de fermeture (dernier point vers le premier) : oui", () => { expect(routeCrossesZfe([[48.1, 1.5], [48.1, 1.99], [48.1, 2.01]], SQUARE)).toBe(true); expect(routeCrossesZfe([[48.3, 2.1], [48.1, 2.1]], SQUARE)).toBe(true); });
  it("tracé qui passe à côté d'un coin : non", () => { expect(routeCrossesZfe([[48.25, 2.15], [48.15, 2.3]], SQUARE)).toBe(false); });
  it("sans périmètre ou sans tracé : jamais d'affirmation", () => {
    expect(routeCrossesZfe([[48.1, 2.1]], null)).toBe(false);
    expect(routeCrossesZfe([[48.1, 2.1]], undefined)).toBe(false);
    expect(routeCrossesZfe([[48.1, 2.1]], [[2, 48], [2.1, 48]])).toBe(false);
    expect(routeCrossesZfe([], SQUARE)).toBe(false);
  });
  const zfe = JSON.parse(readFileSync(new URL("../public/data/paris-zfe/zone.json", import.meta.url), "utf8")) as ZfeFile;
  it("périmètre réel de Paris : Notre-Dame dedans, Versailles et Roissy dehors, un trajet Paris-Versailles le traverse", () => {
    expect(pointInRing(48.853, 2.3499, zfe.ring)).toBe(true);
    expect(pointInRing(48.8049, 2.1204, zfe.ring)).toBe(false);
    expect(pointInRing(49.0097, 2.5479, zfe.ring)).toBe(false);
    expect(routeCrossesZfe([[48.8049, 2.1204], [48.83, 2.2], [48.853, 2.3499]], zfe.ring)).toBe(true);
  });
  it("périmètre réel : un trajet Versailles - Saint-Germain-en-Laye reste dehors", () => {
    expect(routeCrossesZfe([[48.8049, 2.1204], [48.84, 2.1], [48.8987, 2.0937]], zfe.ring)).toBe(false);
  });
  it("périmètre réel : un trajet Montreuil - Boulogne qui traverse Paris sans point dedans entre deux sommets est détecté", () => {
    expect(routeCrossesZfe([[48.8625, 2.4413], [48.8352, 2.2410]], zfe.ring)).toBe(true);
  });
});

describe("« via » : la voie nommée la plus longue", () => {
  it("cumule les étapes de même nom et prend la plus longue", () => {
    expect(viaRoad([{ distance: 300, name: "Rue A" }, { distance: 400, name: "Boulevard B" }, { distance: 500, name: "Rue A" }])).toBe("Rue A");
  });
  it("aucun nom : null (rien n'est inventé)", () => {
    expect(viaRoad([{ distance: 900 }, { distance: 900, name: "" }, { distance: 900, name: "   " }])).toBeNull();
    expect(viaRoad([])).toBeNull();
  });
  it("voie trop courte (< 200 m) : null", () => {
    expect(VIA_MIN_METERS).toBe(200);
    expect(viaRoad([{ distance: 150, name: "Rue A" }, { distance: 40, name: "Rue B" }])).toBeNull();
    expect(viaRoad([{ distance: 200, name: "Rue A" }])).toBe("Rue A");
  });
  it("ignore les distances invalides et les espaces en trop", () => {
    expect(viaRoad([{ distance: NaN, name: "X" }, { distance: -5, name: "Y" }, { distance: 300, name: "  Avenue   Foch " }])).toBe("Avenue Foch");
  });
});

describe("alternatives : jamais plus de 3, jamais inventées", () => {
  const r = (d: number, t: number, n = 5) => ({ distance: d, duration: t, coordinates: new Array(n).fill([0, 0]) });
  it("une seule route reçue = une seule renvoyée", () => { expect(capAlternatives([r(1000, 100)])).toHaveLength(1); });
  it("liste vide = liste vide", () => { expect(capAlternatives([])).toEqual([]); });
  it("plafond à 3", () => { expect(MAX_ROUTE_ALTERNATIVES).toBe(3); expect(capAlternatives([r(1, 1), r(2, 2), r(3, 3), r(4, 4), r(5, 5)])).toHaveLength(3); });
  it("doublon strict écarté, routes différentes gardées dans l'ordre", () => {
    const out = capAlternatives([r(1000, 100), r(1000, 100), r(1100, 90)]);
    expect(out.map((x) => x.distance)).toEqual([1000, 1100]);
  });
});

describe("étiquette d'une carte de trajet", () => {
  it("reprend les libellés calculés, rien pour une simple alternative", () => {
    expect(tripTag("Le plus rapide")).toBe("Le plus rapide");
    expect(tripTag("Le moins cher")).toBe("Le moins cher");
    expect(tripTag("Le plus court · prix indisponible")).toBe("Le plus court");
    expect(tripTag("Meilleur rapport qualité/prix")).toBe("Équilibré");
    expect(tripTag("Meilleur compromis · prix incomplet")).toBe("Équilibré");
    expect(tripTag("Alternative")).toBeNull();
    expect(tripTag(undefined)).toBeNull();
  });
});
