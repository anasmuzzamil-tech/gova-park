import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VEHICLE_SPOT_TYPES, VEHICLE_TYPES } from "@contracts/vehicle-types";
import { GRID, fromE5, tileKey, tilesForBounds, toE5 } from "@contracts/paris-spots";
import {
  POLY, POLY_KIND, vehicleOfRegime, anchorKey, bucketPolygons, buildPolygonFeatures, classifyRing, decodePolygonTile, encodePolygonRow, isCarRegime, isDefaultRegime, isMotoRegime, isRectangle, limitPolygonsNearCenter,
  normalizeRing, outerRings, polygonsVisible, spotAnchorKey, splitSegments,
  type LngLat, type ParisPolygon, type PolygonColor, type PolygonIndex, type PolygonTileFile,
} from "@contracts/paris-polygons";

// Couples « Régime prioritaire » / « Régime particulier » du jeu « emprises » (mêmes 53 couples que les emplacements, relevé du 31/10/2026) : true = voiture ordinaire.
const REAL_REGIMES: Array<[string, string, boolean]> = [
  ["PAYANT MIXTE", "Mixte", true], ["PAYANT ROTATIF", "Rotatif", true], ["GRATUIT", "Gratuit", true],
  ["2 ROUES", "Vélos", false], ["2 ROUES", "Vélo-cargo", false], ["2 ROUES", "Box à vélos", false], ["2 ROUES", "Motos payant Mixte", false], ["2 ROUES", "Motos payant Rotatif", false], ["2 ROUES", "Mixte", false],
  ["LIVRAISON", "ZL périodique", false], ["LIVRAISON", "ZL permanente", false],
  ["GIG/GIC", "GIG/GIC Standard", false], ["GIG/GIC", "GIG/GIC Elargie", false], ["GIG/GIC", "GIG/GIC Standard piétonne", false],
  ["LOCATION", "Vélib'", false], ["LOCATION", "Véhicule partagé", false], ["LOCATION", "Véhicules électriques partagés", false], ["LOCATION", "Mobilib utilitaire", false], ["LOCATION", "Autopartage", false],
  ["ELECTRIQUE", "Bélib'", false], ["ELECTRIQUE", "Bélib' 2RM", false],
  ["AUTOCAR", "Autocar (payant)", false], ["AUTOCAR", "Autocar dépose/reprise", false], ["AUTOCAR", "Autocar dépose", false], ["AUTOCAR", "Autocar reprise", false], ["AUTOCAR", "Autocar stationnement gratuit", false],
  ["AUTRE REGIME", "Transport de fonds", false], ["AUTRE REGIME", "SP - Police", false], ["AUTRE REGIME", "SP - Pompiers", false],
  ["AUTRE REGIME", "SP - Services de secours (SAMU, SMUR, protection civile)", false], ["AUTRE REGIME", "SP - Nettoiement", false], ["AUTRE REGIME", "SP - Véhicules Postaux", false],
  ["AUTRE REGIME", "SP - Mairie", false], ["AUTRE REGIME", "SP - Ministère", false], ["AUTRE REGIME", "SP - Administration", false], ["AUTRE REGIME", "SP - Juridiction", false], ["AUTRE REGIME", "SP - Gendarmerie", false],
  // Incertains : jamais deviné, donc jamais importé.
  ["PAYANT MIXTE", "Mixte Marché", false], ["PAYANT ROTATIF", "Rotatif Marché", false], ["GRATUIT", "Gratuit Bois", false], ["GRATUIT", "Gratuit Marché", false],
  ["AUTRE REGIME", "Taxi gaine autorisée", false], ["AUTRE REGIME", "Taxi gaine interdite", false], ["AUTRE REGIME", "Trilib'", false], ["AUTRE REGIME", "cd-cmd", false], ["AUTRE REGIME", "Travaux", false],
  ["AUTRE REGIME", "Marché", false], ["AUTRE REGIME", "Inaccessible", false], ["AUTRE REGIME", "Station Service", false], ["AUTRE REGIME", "Dépose minute", false],
  ["ELECTRIQUE", "Ex Autolib' 2 avec bornes de recharge", false], ["ELECTRIQUE", "Ex Autolib' 1 pour stat elec sans recharge", false], ["ELECTRIQUE", "Ex Autolib' 2 pour stat elec sans recharge", false],
];

// Rectangle de `length` m (grand axe) sur `width` m, centré en (lat, lng), grand axe orienté de `angleDeg` degrés depuis l'est (sens trigonométrique). Sommets dans l'ordre du contour.
const LAT = 48.85, KX = Math.cos((LAT * Math.PI) / 180) * 111320, KY = 111320;
function rect(length: number, width: number, angleDeg: number, lat = LAT, lng = 2.35, startOnShortSide = false): LngLat[] {
  const a = (angleDeg * Math.PI) / 180, ux = [Math.cos(a), Math.sin(a)], vx = [-Math.sin(a), Math.cos(a)];
  const pt = (s: number, t: number): LngLat => [lng + (ux[0] * s + vx[0] * t) / KX, lat + (ux[1] * s + vx[1] * t) / KY];
  const l = length / 2, w = width / 2;
  const pts = [pt(-l, -w), pt(l, -w), pt(l, w), pt(-l, w)];
  return startOnShortSide ? [pts[1], pts[2], pts[3], pts[0]] : pts;
}
const metric = (p: LngLat): [number, number] => [p[0] * KX, p[1] * KY];
const dist = (p: LngLat, q: LngLat) => Math.hypot(metric(p)[0] - metric(q)[0], metric(p)[1] - metric(q)[1]);

describe("classification voiture / non-voiture (mêmes règles que les emplacements)", () => {
  it("chaque couple réel du jeu est classé comme prévu : seuls payant mixte, payant rotatif et gratuit sont des voitures", () => {
    expect(REAL_REGIMES).toHaveLength(53);
    for (const [prio, part, cars] of REAL_REGIMES) expect(isCarRegime(prio, part), `${prio} | ${part}`).toBe(cars);
    expect(REAL_REGIMES.filter((r) => r[2])).toHaveLength(3);
  });
  it("motos : seuls « 2 ROUES | Motos payant Mixte / Rotatif » ; jamais les vélos, ni « 2 ROUES | Mixte » (incertain)", () => {
    const motos = REAL_REGIMES.filter(([p, q]) => isMotoRegime(p, q)).map(([p, q]) => `${p}|${q}`);
    expect(motos).toEqual(["2 ROUES|Motos payant Mixte", "2 ROUES|Motos payant Rotatif"]);
    for (const q of ["Vélos", "Vélo-cargo", "Box à vélos", "Mixte"]) { expect(isMotoRegime("2 ROUES", q), q).toBe(false); expect(isDefaultRegime("2 ROUES", q), q).toBe(false); }
    expect(isMotoRegime("2 ROUES", "motos PAYANT rotatif")).toBe(true);
    expect(isMotoRegime("", "")).toBe(false);
  });
  it("type de véhicule d'une emprise : voiture, moto, bus (autocars), vélo ; livraison : aucun ; jamais deviné", () => {
    const got = Object.fromEntries(REAL_REGIMES.map(([p, q]) => [`${p}|${q}`, vehicleOfRegime(p, q)]));
    expect(got["PAYANT MIXTE|Mixte"]).toBe("car"); expect(got["GRATUIT|Gratuit"]).toBe("car");
    expect(got["2 ROUES|Motos payant Rotatif"]).toBe("moto");
    expect(got["AUTOCAR|Autocar (payant)"]).toBe("bus"); expect(got["AUTOCAR|Autocar dépose"]).toBe("bus");
    expect(got["LIVRAISON|ZL permanente"]).toBeNull(); expect(got["LIVRAISON|ZL périodique"]).toBeNull(); // zones de livraison : aucun type, pas de contour
    expect(got["2 ROUES|Vélos"]).toBe("bike"); expect(got["2 ROUES|Vélo-cargo"]).toBe("bike"); expect(got["2 ROUES|Box à vélos"]).toBe("bike");
    for (const k of ["2 ROUES|Mixte", "PAYANT MIXTE|Mixte Marché", "GIG/GIC|GIG/GIC Standard", "AUTRE REGIME|Marché", "AUTRE REGIME|SP - Police", "LOCATION|Autopartage", "ELECTRIQUE|Bélib'"]) expect(got[k], k).toBeNull();
    expect(vehicleOfRegime("", "")).toBeNull();
  });
  it("emprises importées (voitures et motos) : exactement 5 des 53 couples réels", () => {
    expect(REAL_REGIMES.filter(([p, q]) => isDefaultRegime(p, q)).map(([p, q]) => `${p}|${q}`)).toEqual(["PAYANT MIXTE|Mixte", "PAYANT ROTATIF|Rotatif", "GRATUIT|Gratuit", "2 ROUES|Motos payant Mixte", "2 ROUES|Motos payant Rotatif"]);
  });
  it("insensible à la casse et aux accents, et refuse l'absent ou l'inconnu", () => {
    expect(isCarRegime("payant mixte", "MIXTE")).toBe(true);
    expect(isCarRegime("Gratuit", "gratuit")).toBe(true);
    expect(isCarRegime("", "")).toBe(false);
    expect(isCarRegime(null, undefined)).toBe(false);
    expect(isCarRegime("PAYANT MIXTE", "")).toBe(false);
  });
});

describe("contours : lecture et simplification", () => {
  it("Polygon : l'anneau extérieur ; les trous sont ignorés ; MultiPolygon : une partie par anneau", () => {
    const outer = [[2.3, 48.8], [2.31, 48.8], [2.31, 48.81], [2.3, 48.81], [2.3, 48.8]];
    const hole = [[2.302, 48.802], [2.303, 48.802], [2.303, 48.803], [2.302, 48.802]];
    expect(outerRings({ type: "Polygon", coordinates: [outer, hole] })).toEqual([outer]);
    expect(outerRings({ type: "MultiPolygon", coordinates: [[outer], [outer, hole]] })).toEqual([outer, outer]);
  });
  it("géométrie absente, d'un autre type ou invalide : aucune forme (rien d'inventé)", () => {
    expect(outerRings(null)).toEqual([]);
    expect(outerRings({ type: "Point", coordinates: [2.3, 48.8] })).toEqual([]);
    expect(outerRings({ type: "Polygon", coordinates: [] })).toEqual([]);
    expect(outerRings({ type: "Polygon", coordinates: [[[2.3, 48.8], [2.31, 48.8], [2.3, 48.8]]] })).toEqual([]);
    expect(outerRings({ type: "Polygon", coordinates: [[["x", 48.8], [2.31, 48.8], [2.31, 48.81], [2.3, 48.8]]] })).toEqual([]);
  });
  it("arrondit à 6 décimales, retire le point de fermeture et les doublons consécutifs", () => {
    const ring: LngLat[] = [[2.2983413755, 48.8410173730], [2.2983329314, 48.8410287455], [2.2983329316, 48.8410287456], [2.2983549535, 48.8410358699], [2.2983633976, 48.8410244975], [2.2983413755, 48.8410173730]];
    const out = normalizeRing(ring)!;
    expect(out).toEqual([[2.298341, 48.841017], [2.298333, 48.841029], [2.298355, 48.841036], [2.298363, 48.841024]]);
  });
  it("moins de 3 sommets distincts après arrondi : rejeté", () => {
    expect(normalizeRing([[2.3, 48.8], [2.3000001, 48.8000001], [2.31, 48.8], [2.3, 48.8]])).toBeNull();
    expect(normalizeRing([])).toBeNull();
  });
});

describe("rectangle ou non", () => {
  it("un rectangle orienté dans n'importe quel sens est reconnu (un rectangle de 1,4 m x 1,8 m est trop proche du carré : pas de grand axe net)", () => {
    for (const angle of [0, 15, 37, 90, 123, 200, 305]) expect(isRectangle(rect(6, 2, angle)), `angle ${angle}`).toBe(true);
    expect(isRectangle(rect(1.4, 1.8, 20))).toBe(false); // rapport 1,29 < 1,3 : pas de grand axe net
  });
  it("trapèze, parallélogramme très penché, triangle et formes à plus de 4 sommets : pas un rectangle", () => {
    const r = rect(6, 2, 0);
    expect(isRectangle([r[0], r[1], [r[2][0] + 3 / KX, r[2][1]], [r[3][0] + 3 / KX, r[3][1]]])).toBe(false);
    expect(isRectangle([r[0], r[1], r[2]])).toBe(false);
    expect(isRectangle([...r, [r[3][0], r[3][1] + 1 / KY]])).toBe(false);
    expect(classifyRing(rect(6, 2, 40))).toBe(POLY_KIND.rect);
    expect(classifyRing([r[0], r[1], [r[2][0] + 3 / KX, r[2][1]], [r[3][0] + 3 / KX, r[3][1]]])).toBe(POLY_KIND.shape);
  });
  it("sommets confondus : jamais de division par zéro", () => {
    expect(isRectangle([[2.3, 48.8], [2.3, 48.8], [2.3, 48.8], [2.3, 48.8]])).toBe(false);
  });
});

describe("découpe indicative en N parts égales le long du grand axe", () => {
  for (const angle of [0, 90, 37, 143, 250]) {
    for (const startShort of [false, true]) {
      it(`rectangle 12 m x 2 m orienté ${angle}° (départ côté ${startShort ? "court" : "long"}) : N-1 séparateurs perpendiculaires, espacés de L/N`, () => {
        const pts = rect(12, 2, angle, LAT, 2.35, startShort);
        const n = 4, seg = splitSegments(pts, n);
        expect(seg).toHaveLength(n - 1);
        const a = (angle * Math.PI) / 180, axis = [Math.cos(a), Math.sin(a)];
        const centers: number[] = [];
        for (const [p, q] of seg) {
          const d = [metric(q)[0] - metric(p)[0], metric(q)[1] - metric(p)[1]];
          // Perpendiculaire au grand axe (produit scalaire nul), longueur = largeur du rectangle (2 m).
          expect(Math.abs(d[0] * axis[0] + d[1] * axis[1])).toBeLessThan(1e-3);
          expect(Math.hypot(d[0], d[1])).toBeCloseTo(2, 3);
          const mid = [(metric(p)[0] + metric(q)[0]) / 2 - metric([2.35, LAT])[0], (metric(p)[1] + metric(q)[1]) / 2 - metric([2.35, LAT])[1]];
          centers.push(mid[0] * axis[0] + mid[1] * axis[1]); // abscisse le long du grand axe, depuis le centre
        }
        centers.sort((x, y) => x - y);
        expect(centers[0]).toBeCloseTo(-3, 3); expect(centers[1]).toBeCloseTo(0, 3); expect(centers[2]).toBeCloseTo(3, 3); // 12 m / 4 = 3 m entre séparateurs
      });
    }
  }
  it("les extrémités de chaque séparateur sont sur les deux grands côtés du rectangle", () => {
    const pts = rect(10, 2.4, 25);
    const [s] = splitSegments(pts, 2);
    const onEdge = (p: LngLat, a: LngLat, b: LngLat) => Math.abs((metric(b)[0] - metric(a)[0]) * (metric(p)[1] - metric(a)[1]) - (metric(b)[1] - metric(a)[1]) * (metric(p)[0] - metric(a)[0])) / dist(a, b);
    expect(onEdge(s[0], pts[0], pts[1])).toBeLessThan(1e-3);
    expect(onEdge(s[1], pts[3], pts[2])).toBeLessThan(1e-3);
    expect(dist(s[0], pts[0])).toBeCloseTo(5, 3); // N = 2 : au milieu
  });
  it("N = 2 : un seul séparateur ; N = 12 : onze", () => {
    expect(splitSegments(rect(8, 2, 10), 2)).toHaveLength(1);
    expect(splitSegments(rect(30, 2, 10), 12)).toHaveLength(11);
  });
  it("cas limites : N absent, 0, 1, négatif, décimal, supérieur à 12 ou NaN -> contour seul (aucun séparateur)", () => {
    const r = rect(10, 2, 30);
    for (const n of [undefined, null, 0, 1, -3, 2.5, 13, 40, Number.NaN, Number.POSITIVE_INFINITY]) expect(splitSegments(r, n as number | null | undefined), String(n)).toEqual([]);
  });
  it("forme non rectangulaire ou quasi carrée : jamais de découpe", () => {
    const r = rect(10, 2, 0);
    expect(splitSegments([r[0], r[1], r[2]], 4)).toEqual([]);
    expect(splitSegments([...r, [r[0][0], r[0][1] + 0.00002]], 4)).toEqual([]);
    expect(splitSegments(rect(2, 1.9, 0), 3)).toEqual([]);
    expect(splitSegments([r[0], r[1], [r[2][0] + 4 / KX, r[2][1]], [r[3][0] + 4 / KX, r[3][1]]], 4)).toEqual([]);
  });
});

describe("fichiers de tuiles", () => {
  const origin = { south: 48.8, west: 2.22 };
  const mk = (lat: number, lng: number, extra: Partial<{ t: number; places: number; kind: number; ring: LngLat[] }> = {}) => ({
    latE5: toE5(lat), lngE5: toE5(lng), t: 1, places: 4, kind: POLY_KIND.rect, ring: normalizeRing(rect(10, 2, 33, lat, lng))!, ...extra,
  });
  it("une ligne se décode en donnant les mêmes sommets (au millionième de degré) et les mêmes champs", () => {
    const item = mk(48.85123, 2.34567, { places: 7, t: 2 });
    const [poly] = decodePolygonTile("5_2", { v: 1, rows: [encodePolygonRow(item)] });
    expect(poly.id).toBe("5_2:0");
    expect(poly.places).toBe(7); expect(poly.t).toBe(2); expect(poly.kind).toBe(POLY_KIND.rect);
    expect(poly.lat).toBeCloseTo(48.85123, 5); expect(poly.lng).toBeCloseTo(2.34567, 5);
    expect(poly.ring).toHaveLength(4);
    poly.ring.forEach((p, i) => { expect(p[0]).toBeCloseTo(item.ring[i][0], 6); expect(p[1]).toBeCloseTo(item.ring[i][1], 6); });
  });
  it("la ligne est compacte : 5 champs + 2 nombres par sommet, sommets relatifs à l'ancrage", () => {
    const row = encodePolygonRow(mk(48.85, 2.35));
    expect(row).toHaveLength(5 + 8);
    expect(row.slice(5).every((v) => Number.isInteger(v) && Math.abs(v) < 500)).toBe(true);
  });
  it("le tuilage utilise la même grille et la même clé que les emplacements", () => {
    const items = [mk(48.851, 2.351), mk(48.8215, 2.2405), mk(48.9, 2.4)];
    const tiles = bucketPolygons(items, origin, GRID.tileDeg);
    expect(POLY.tileDeg).toBe(GRID.tileDeg);
    for (const it of items) expect(tiles.has(tileKey(it.latE5 / 1e5, it.lngE5 / 1e5, origin, GRID.tileDeg))).toBe(true);
    expect(tiles.size).toBe(3);
    expect([...tiles.keys()]).toContain("6_2");
    expect([...tiles.values()].reduce((s, f) => s + f.rows.length, 0)).toBe(3);
  });
  it("tuilage déterministe (indépendant de l'ordre d'entrée) et plusieurs contours dans la même tuile", () => {
    const a = mk(48.8501, 2.3501), b = mk(48.8502, 2.3502), c = mk(48.8503, 2.3499);
    const t1 = bucketPolygons([a, b, c], origin, GRID.tileDeg), t2 = bucketPolygons([c, a, b], origin, GRID.tileDeg);
    expect(JSON.stringify([...t1])).toBe(JSON.stringify([...t2]));
    expect([...t1.values()][0].rows).toHaveLength(3);
  });
  it("une tuile à la limite exacte de la grille tombe dans la bonne case", () => {
    const tiles = bucketPolygons([mk(48.82, 2.24)], origin, GRID.tileDeg);
    expect([...tiles.keys()]).toEqual(["1_1"]);
  });
  it("les tuiles à charger pour une zone visible sont celles de l'index, les plus proches du centre d'abord, avec un maximum", () => {
    const index = { origin, tileDeg: POLY.tileDeg, tiles: { "5_2": 10, "6_2": 10, "5_3": 10, "20_20": 3 } };
    const r = tilesForBounds({ south: 48.84, north: 48.87, west: 2.32, east: 2.37 }, index, POLY.maxTiles);
    expect(r.keys.sort()).toEqual(["5_2", "5_3", "6_2"]);
    expect(tilesForBounds({ south: 48.84, north: 48.87, west: 2.32, east: 2.37 }, index, 1).truncated).toBe(true);
  });
  it("clé d'ancrage : celle d'un contour et celle de l'emplacement au même point (arrondi E5) sont identiques", () => {
    expect(anchorKey(4885123, 234567)).toBe("4885123_234567");
    expect(spotAnchorKey(fromE5(4885123), fromE5(234567))).toBe(anchorKey(4885123, 234567));
    const [poly] = decodePolygonTile("0_0", { v: 1, rows: [encodePolygonRow(mk(48.85123, 2.34567))] });
    expect(poly.anchor).toBe(spotAnchorKey(48.85123, 2.34567));
  });
});

describe("dessin : entités pour la carte", () => {
  const poly = (id: string, over: Partial<ParisPolygon> = {}): ParisPolygon => ({ id, anchor: `a${id}`, lat: 48.85, lng: 2.35, t: 1, places: 4, kind: POLY_KIND.rect, ring: normalizeRing(rect(12, 2, 20))!, ...over });
  const types = new Set([1, 2]);
  it("un rectangle de 4 places : un contour et 3 séparateurs, tout gris par défaut", () => {
    const f = buildPolygonFeatures([poly("1")], null, types);
    expect(f.outlines.features).toHaveLength(1);
    expect(f.separators.features).toHaveLength(3);
    expect(f.outlines.features[0].properties).toMatchObject({ c: "gray" });
    expect(f.separators.features.every((s) => s.properties?.c === "gray")).toBe(true);
    const ring = f.outlines.features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(5); expect(ring[0]).toEqual(ring[4]);
  });
  it("N = 0, N = 1, N > 12 ou forme non rectangulaire : contour seul", () => {
    const f = buildPolygonFeatures([poly("a", { places: 0 }), poly("b", { places: 1 }), poly("c", { places: 13 }), poly("d", { kind: POLY_KIND.shape, places: 5 })], null, types);
    expect(f.outlines.features).toHaveLength(4);
    expect(f.separators.features).toHaveLength(0);
  });
  it("forme à 6 sommets marquée « autre forme » : contour seul même avec un nombre de places", () => {
    const ring = normalizeRing([[2.35, 48.85], [2.3502, 48.85], [2.3503, 48.8501], [2.3502, 48.8502], [2.35, 48.8502], [2.3499, 48.8501]])!;
    const f = buildPolygonFeatures([poly("e", { kind: POLY_KIND.shape, ring, places: 6 })], null, types);
    expect(f.outlines.features).toHaveLength(1); expect(f.separators.features).toHaveLength(0);
  });
  it("un rectangle marqué rectangle mais qui ne l'est pas : le calcul le refuse aussi (double garde)", () => {
    const r = rect(10, 2, 0);
    const f = buildPolygonFeatures([poly("f", { ring: [r[0], r[1], [r[2][0] + 4 / KX, r[2][1]], [r[3][0] + 4 / KX, r[3][1]]] })], null, types);
    expect(f.outlines.features).toHaveLength(1); expect(f.separators.features).toHaveLength(0);
  });
  it("la couleur vient uniquement du signalement relié à l'ancrage (vert, orange, rouge), le reste reste gris", () => {
    const colors = new Map<string, PolygonColor>([["a1", "green"], ["a2", "red"], ["a3", "orange"]]);
    const f = buildPolygonFeatures([poly("1"), poly("2"), poly("3"), poly("4")], colors, types);
    expect(f.outlines.features.map((x) => x.properties?.c)).toEqual(["green", "red", "orange", "gray"]);
    expect(f.separators.features.filter((s) => s.properties?.c === "green")).toHaveLength(3);
    expect(f.separators.features.filter((s) => s.properties?.c === "gray")).toHaveLength(3);
  });
  it("le filtre « Voitures et motos / Tout afficher » s'applique aussi aux contours", () => {
    const list = [poly("1", { t: 1 }), poly("2", { t: 2 }), poly("3", { t: 3 })];
    expect(buildPolygonFeatures(list, null, new Set([1, 2])).outlines.features).toHaveLength(2);
    expect(buildPolygonFeatures(list, null, new Set([2])).outlines.features).toHaveLength(1);
    expect(buildPolygonFeatures(list, null, new Set()).outlines.features).toHaveLength(0);
    expect(buildPolygonFeatures(list, null, new Set([1, 2, 3, 4, 5, 6, 7, 8, 0])).outlines.features).toHaveLength(3);
  });
  it("liste vide ou contour dégénéré : rien dessiné, pas d'erreur", () => {
    expect(buildPolygonFeatures([], null, types).outlines.features).toHaveLength(0);
    expect(buildPolygonFeatures([poly("x", { ring: [[2.3, 48.8], [2.31, 48.8]] })], null, types).outlines.features).toHaveLength(0);
  });
});

describe("limites de chargement", () => {
  const at = (i: number, lat: number): ParisPolygon => ({ id: `p${i}`, anchor: `a${i}`, lat, lng: 2.35, t: 1, places: 2, kind: POLY_KIND.shape, ring: [] });
  it("au plus `limit` contours, les plus proches du centre", () => {
    const list = Array.from({ length: 10 }, (_, i) => at(i, 48.85 + i * 0.001));
    const r = limitPolygonsNearCenter(list, { lat: 48.8505, lng: 2.35 }, 3);
    expect(r.truncated).toBe(true);
    expect(r.polys.map((p) => p.id).sort()).toEqual(["p0", "p1", "p2"]);
    expect(limitPolygonsNearCenter(list, { lat: 48.85, lng: 2.35 }, 10).truncated).toBe(false);
    expect(POLY.drawLimit).toBe(4000);
  });
  it("les contours ne se chargent qu'au zoom rue et si la couche est active", () => {
    expect(polygonsVisible(16.9)).toBe(false);
    expect(polygonsVisible(17)).toBe(true);
    expect(polygonsVisible(18.5, false)).toBe(false);
    expect(POLY.minZoom).toBe(17);
  });
});

// Contrôle des fichiers générés réellement présents dans le dépôt (public/data/paris/polygons).
describe("fichiers générés dans le dépôt", () => {
  const root = path.resolve(import.meta.dirname, "..", "public", "data", "paris");
  const read = <T,>(...p: string[]) => JSON.parse(fs.readFileSync(path.join(root, ...p), "utf8")) as T;
  const have = fs.existsSync(path.join(root, "polygons", "index.json"));
  it.runIf(have)("un jeu de tuiles par type de véhicule : poids, clés, comptes, types de contours, tous reliés à un emplacement du même type", () => {
    const index = read<PolygonIndex>("polygons", "index.json");
    const spots = read<{ origin: { south: number; west: number }; tileDeg: number; tiles: Record<string, number> }>("index.json");
    expect(index.version).toBe(2);
    expect(index.origin).toEqual(spots.origin);
    expect(index.tileDeg).toBe(spots.tileDeg);
    expect(index.source).toMatchObject({ producer: "Ville de Paris", license: "ODbL" });
    expect(Object.keys(index.tiles).sort()).toEqual([...VEHICLE_TYPES].sort());
    const anchors = new Map<string, number>(); // ancrage -> type d'emplacement
    for (const key of Object.keys(spots.tiles)) for (const row of read<{ rows: number[][] }>("tiles", `${key}.json`).rows) anchors.set(anchorKey(row[0], row[1]), row[2]);
    let total = 0, bytes = fs.statSync(path.join(root, "polygons", "index.json")).size, biggest = 0, linked = 0, rects = 0, bad = 0;
    for (const v of VEHICLE_TYPES) for (const [key, count] of Object.entries(index.tiles[v])) {
      expect(spots.tiles[key], `tuile ${key} inconnue des emplacements`).toBeGreaterThan(0);
      const file = path.join(root, "polygons", "tiles", v, `${key}.json`);
      const size = fs.statSync(file).size; bytes += size; biggest = Math.max(biggest, size);
      const tile = JSON.parse(fs.readFileSync(file, "utf8")) as PolygonTileFile;
      expect(tile.rows).toHaveLength(count); total += count;
      for (const poly of decodePolygonTile(`${v}/${key}`, tile)) {
        const spotType = anchors.get(poly.anchor);
        if (spotType === undefined) continue;
        linked++;
        if (spotType !== poly.t || !VEHICLE_SPOT_TYPES[v].includes(poly.t)) bad++; // un contour « moto » ne s'accroche qu'à un emplacement moto
        if (poly.ring.length < 3 || ![1, 2].includes(poly.kind)) bad++;
        if (poly.kind === POLY_KIND.rect) { rects++; if (!isRectangle(poly.ring)) bad++; }
      }
    }
    expect(total).toBe(index.count);
    expect(bad).toBe(0);
    expect(linked).toBe(total);
    expect(rects).toBe(index.rectangles);
    expect(biggest).toBeLessThanOrEqual(150 * 1024);
    expect(bytes).toBeLessThanOrEqual(6 * 1024 * 1024);
  });
});
