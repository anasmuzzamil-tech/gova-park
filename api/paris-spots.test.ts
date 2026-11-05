import { describe, expect, it } from "vitest";
import {
  GRID, SPOT_TYPE, aggregateOverview, bucketTiles, classifyType, decodeOverview, decodeTile, displayMode, limitNearCenter, mergeWithReports, tileKey, tilesForBounds,
  type OfficialSpot, type ReportLite,
} from "@contracts/paris-spots";

// Les libellés ci-dessous sont des entrées de test écrites à la main (fixtures), pas des extraits du jeu de données réel.
describe("type d'emplacement", () => {
  it("reconnaît les mots-clés, sans tenir compte des accents ni de la casse", () => {
    expect(classifyType("Livraison")).toBe(SPOT_TYPE.delivery);
    expect(classifyType("Stationnement VÉLO")).toBe(SPOT_TYPE.bike);
    expect(classifyType("2RM")).toBe(SPOT_TYPE.moto);
    expect(classifyType("Deux-roues motorisés")).toBe(SPOT_TYPE.moto);
    expect(classifyType("Autocars")).toBe(SPOT_TYPE.coach);
    expect(classifyType("Gratuit")).toBe(SPOT_TYPE.free);
    expect(classifyType("Non payant")).toBe(SPOT_TYPE.free);
    expect(classifyType("Payant mixte")).toBe(SPOT_TYPE.paid);
    expect(classifyType("Rotatif")).toBe(SPOT_TYPE.paid);
  });
  it("inconnu = autre, jamais deviné", () => {
    expect(classifyType("")).toBe(SPOT_TYPE.other);
    expect(classifyType(undefined, null, "Linéaire")).toBe(SPOT_TYPE.other);
  });
});

const origin = { south: 48.8, west: 2.2 };
const pts = [
  { lat: 48.8501, lng: 2.3001, t: 1 }, { lat: 48.8502, lng: 2.3002, t: 1 }, { lat: 48.8503, lng: 2.3003, t: 2 }, { lat: 48.9001, lng: 2.4001, t: 3 },
];

describe("découpage en tuiles", () => {
  it("clé de tuile stable", () => {
    expect(tileKey(48.8501, 2.3001, origin, GRID.tileDeg)).toBe("5_2");
    expect(tileKey(48.8, 2.2, origin, GRID.tileDeg)).toBe("0_0");
  });
  it("répartit tous les points, sans en perdre, et se relit à 5 décimales", () => {
    const b = bucketTiles(pts, origin, GRID.tileDeg);
    expect([...b.values()].reduce((s, r) => s + r.length, 0)).toBe(4);
    const spots = decodeTile("5_2", b.get("5_2")!);
    expect(spots).toHaveLength(3);
    expect(spots[0].lat).toBe(48.8501);
    expect(spots[0].n).toBe(1);
  });
  it("tuiles de la zone visible : seulement celles qui existent, proches du centre d'abord, avec un maximum", () => {
    const index = { origin, tileDeg: GRID.tileDeg, tiles: { "5_2": 3, "9_5": 1 } };
    expect(tilesForBounds({ south: 48.84, north: 48.86, west: 2.29, east: 2.31 }, index).keys).toEqual(["5_2"]);
    const all = tilesForBounds({ south: 48.8, north: 48.95, west: 2.2, east: 2.5 }, index);
    expect(all.keys).toHaveLength(2);
    expect(tilesForBounds({ south: 48.8, north: 48.95, west: 2.2, east: 2.5 }, index, 1)).toEqual({ keys: ["5_2"], truncated: true } as never);
  });
});

describe("vue d'ensemble agrégée", () => {
  it("additionne les emplacements par cellule et par type (le total est conservé)", () => {
    const rows = aggregateOverview(pts, origin, GRID.overviewDeg);
    const spots = decodeOverview(rows);
    expect(spots.reduce((s, p) => s + p.n, 0)).toBe(4);
    expect(spots.some((p) => p.n === 2 && p.t === 1)).toBe(true);
  });
  it("mode d'affichage selon la largeur de la carte", () => {
    expect(displayMode({ south: 48.8, north: 48.9, west: 2.2, east: 2.5 })).toBe("overview");
    expect(displayMode({ south: 48.85, north: 48.86, west: 2.3, east: 2.32 })).toBe("detail");
  });
  it("limite les emplacements détaillés autour du centre", () => {
    const many: OfficialSpot[] = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, lat: 48.85 + i * 0.001, lng: 2.35, t: 1, n: 1 }));
    const r = limitNearCenter(many, { lat: 48.85, lng: 2.35 }, 3);
    expect(r.truncated).toBe(true);
    expect(r.spots.map((s) => s.id)).toEqual(["a0", "a1", "a2"]);
    expect(limitNearCenter(many, { lat: 48.85, lng: 2.35 }, 20).truncated).toBe(false);
  });
});

describe("fusion avec les signalements (jamais de vert sans signalement)", () => {
  const officials: OfficialSpot[] = [
    { id: "a", lat: 48.85, lng: 2.35, t: 1, n: 1 },
    { id: "b", lat: 48.85002, lng: 2.35, t: 2, n: 1 }, // environ 2 m de a
    { id: "c", lat: 48.8505, lng: 2.35, t: 1, n: 1 }, // environ 55 m de a
    { id: "agg", lat: 48.85, lng: 2.35, t: 1, n: 12 },
  ];
  const rep = (over: Partial<ReportLite>): ReportLite => ({ id: 1, latitude: 48.85, longitude: 2.35, color: "green", reportedAt: "2026-11-05T12:00:00Z", ...over });
  it("sans signalement, tout est gris", () => {
    const r = mergeWithReports(officials, []);
    expect(r.spots.every((s) => s.color === "gray" && s.reportId === 0)).toBe(true);
    expect(r.matchedReportIds.size).toBe(0);
  });
  it("un signalement à moins de 15 m colore l'emplacement le plus proche, et lui seul", () => {
    const r = mergeWithReports(officials, [rep({})]);
    expect(r.spots.find((s) => s.id === "a")!.color).toBe("green");
    expect(r.spots.find((s) => s.id === "a")!.reportId).toBe(1);
    expect(r.spots.filter((s) => s.color !== "gray")).toHaveLength(1);
    expect(r.matchedReportIds.has(1)).toBe(true);
  });
  it("à plus de 15 m : aucun emplacement coloré, le signalement reste une place en rue à part", () => {
    const r = mergeWithReports(officials, [rep({ latitude: 48.8503 })]);
    expect(r.spots.every((s) => s.color === "gray")).toBe(true);
    expect(r.matchedReportIds.size).toBe(0);
  });
  it("orange et rouge reprennent la couleur du signalement ; une couleur inconnue (grise) ne colore rien", () => {
    expect(mergeWithReports(officials, [rep({ color: "orange" })]).spots[0].color).toBe("orange");
    expect(mergeWithReports(officials, [rep({ color: "red" })]).spots[0].color).toBe("red");
    expect(mergeWithReports(officials, [rep({ color: "gray" })]).spots.every((s) => s.color === "gray")).toBe(true);
  });
  it("le signalement le plus récent l'emporte sur un même emplacement", () => {
    const r = mergeWithReports(officials, [rep({ id: 1, color: "green", reportedAt: "2026-11-05T12:00:00Z" }), rep({ id: 2, color: "red", reportedAt: "2026-11-05T12:03:00Z" })]);
    expect(r.spots.find((s) => s.id === "a")!.color).toBe("red");
  });
  it("les points agrégés (n > 1) ne sont jamais colorés", () => {
    const r = mergeWithReports([{ id: "agg", lat: 48.85, lng: 2.35, t: 1, n: 12 }], [rep({})]);
    expect(r.spots[0].color).toBe("gray");
    expect(r.matchedReportIds.size).toBe(0);
  });
});
