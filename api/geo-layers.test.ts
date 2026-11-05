import { describe, expect, it } from "vitest";
import {
  LAYER, bucketFeatures, decodeTile, distanceToFeatureMeters, encodeFeature, formatDataDate, geometryParts, layerTilesForBounds, layerVisible, limitFeaturesNearCenter,
  looksWgs84, normalizePart, originFor, simplifyCoords, sizeProblems, tileKeysOf, toGeoJson, type GeoFeature, type LayerIndex,
} from "@contracts/geo-layers";

const line: GeoFeature = { kind: "line", coords: [[2.3, 48.85], [2.3003, 48.8503], [2.3006, 48.8506]], props: ["x", 3, null] };

describe("géométrie GeoJSON", () => {
  it("lit points, lignes, contours (anneau extérieur) et multi-parties", () => {
    expect(geometryParts({ type: "Point", coordinates: [2.3, 48.8] })).toEqual([{ kind: "pt", coords: [[2.3, 48.8]] }]);
    expect(geometryParts({ type: "LineString", coordinates: [[2.3, 48.8], [2.31, 48.81]] })[0].kind).toBe("line");
    const poly = { type: "Polygon", coordinates: [[[2.3, 48.8], [2.31, 48.8], [2.31, 48.81], [2.3, 48.8]], [[2.301, 48.801], [2.302, 48.801], [2.302, 48.802], [2.301, 48.801]]] };
    const parts = geometryParts(poly);
    expect(parts).toHaveLength(1);
    expect(parts[0].coords).toHaveLength(4); // le trou est ignoré
    expect(geometryParts({ type: "MultiLineString", coordinates: [[[2.3, 48.8], [2.31, 48.81]], [[2.4, 48.8], [2.41, 48.81]]] })).toHaveLength(2);
    expect(geometryParts({ type: "Feature", geometry: { type: "Point", coordinates: [2.3, 48.8] } })).toHaveLength(1);
  });
  it("géométrie absente ou invalide : aucune partie, rien d'inventé", () => {
    expect(geometryParts(null)).toEqual([]);
    expect(geometryParts({ type: "LineString", coordinates: [[2.3, 48.8]] })).toEqual([]);
    expect(geometryParts({ type: "Polygon", coordinates: [[[2.3, 48.8], [2.31, 48.8], [2.3, 48.8]]] })).toEqual([]);
    expect(geometryParts({ type: "Point", coordinates: ["a", 1] })).toEqual([]);
    expect(geometryParts({ type: "Triangle", coordinates: [] })).toEqual([]);
  });
  it("reconnaît le WGS84 et refuse le Lambert 93", () => {
    expect(looksWgs84([2.35, 48.85])).toBe(true);
    expect(looksWgs84([652000, 6862000])).toBe(false);
  });
});

describe("normalisation et simplification", () => {
  it("retire doublons et point de fermeture, arrondit au millionième", () => {
    const p = normalizePart({ kind: "poly", coords: [[2.3000001, 48.8], [2.3000002, 48.8], [2.31, 48.8], [2.31, 48.81], [2.3000001, 48.8]] });
    expect(p?.coords).toHaveLength(3);
    expect(normalizePart({ kind: "line", coords: [[2.3, 48.8], [2.3, 48.8]] })).toBeNull();
    expect(normalizePart({ kind: "poly", coords: [[2.3, 48.8], [2.31, 48.8]] })).toBeNull();
  });
  it("simplifie une ligne droite et garde un vrai coude", () => {
    expect(simplifyCoords([[2.3, 48.85], [2.3005, 48.85], [2.301, 48.85]], 0.5)).toHaveLength(2);
    expect(simplifyCoords([[2.3, 48.85], [2.3005, 48.8505], [2.301, 48.85]], 0.5)).toHaveLength(3);
    expect(simplifyCoords(line.coords, 0)).toHaveLength(3);
  });
});

describe("distances", () => {
  it("point : distance directe ; ligne : distance au segment ; contour : 0 à l'intérieur", () => {
    expect(distanceToFeatureMeters({ kind: "pt", coords: [[2.3, 48.85]] }, 48.85, 2.3)).toBeCloseTo(0, 1);
    const d = distanceToFeatureMeters({ kind: "line", coords: [[2.3, 48.85], [2.302, 48.85]] }, 48.85009, 2.301);
    expect(d).toBeGreaterThan(9); expect(d).toBeLessThan(11);
    const sq: GeoFeature["coords"] = [[2.3, 48.85], [2.302, 48.85], [2.302, 48.852], [2.3, 48.852]];
    expect(distanceToFeatureMeters({ kind: "poly", coords: sq }, 48.851, 2.301)).toBe(0);
    expect(distanceToFeatureMeters({ kind: "poly", coords: sq }, 48.851, 2.3025)).toBeGreaterThan(30);
  });
  it("au-delà du bout d'une ligne, la distance est celle de l'extrémité", () => {
    const d = distanceToFeatureMeters({ kind: "line", coords: [[2.3, 48.85], [2.301, 48.85]] }, 48.85, 2.3015);
    expect(d).toBeGreaterThan(30); expect(d).toBeLessThan(40);
  });
});

describe("tuiles", () => {
  it("encode puis décode sans perte (au millionième de degré)", () => {
    const [f] = decodeTile({ v: 1, rows: [encodeFeature(line)] });
    expect(f.kind).toBe("line");
    expect(f.coords).toEqual(line.coords);
    expect(f.props).toEqual(["x", 3, null]);
  });
  it("une ligne qui traverse deux tuiles est dans les deux, un point dans une seule", () => {
    const origin = { south: 48.8, west: 2.2 };
    const long: GeoFeature = { kind: "line", coords: [[2.209, 48.81], [2.231, 48.81]], props: [] };
    expect(tileKeysOf(long, origin, 0.02)).toEqual(["0_0", "1_0"]);
    const m = bucketFeatures([long, { kind: "pt", coords: [[2.21, 48.81]], props: [] }], origin, 0.02);
    expect(m.get("0_0")?.rows).toHaveLength(2);
    expect(m.get("1_0")?.rows).toHaveLength(1);
  });
  it("ordre des lignes déterministe et origine arrondie sous les données", () => {
    const a = originFor([line], 0.02);
    expect(a.south <= 48.85).toBe(true); expect(a.west <= 2.3).toBe(true);
    const one = bucketFeatures([line, { ...line, coords: [[2.29, 48.84], [2.291, 48.841]] }], a, 0.02);
    const two = bucketFeatures([{ ...line, coords: [[2.29, 48.84], [2.291, 48.841]] }, line], a, 0.02);
    expect(JSON.stringify([...one])).toBe(JSON.stringify([...two]));
  });
  it("choisit les tuiles visibles avec un maximum, et dédoublonne via l'identifiant", () => {
    const index: Pick<LayerIndex, "origin" | "tileDeg" | "tiles"> = { origin: { south: 48.8, west: 2.2 }, tileDeg: 0.02, tiles: { "0_0": 1, "1_0": 1, "5_5": 1 } };
    const r = layerTilesForBounds({ south: 48.8, north: 48.83, west: 2.2, east: 2.25 }, index, 12);
    expect(r.keys.sort()).toEqual(["0_0", "1_0"]);
    expect(layerTilesForBounds({ south: 48.8, north: 48.9, west: 2.2, east: 2.4 }, index, 1).truncated).toBe(true);
    const row = encodeFeature(line);
    expect(decodeTile({ v: 1, rows: [row] })[0].id).toBe(decodeTile({ v: 1, rows: [row] })[0].id);
  });
  it("limite les entités dessinées en gardant les plus proches du centre", () => {
    const list = [0, 1, 2, 3].map((i) => ({ coords: [[2.3 + i * 0.01, 48.85]] as GeoFeature["coords"], i }));
    const r = limitFeaturesNearCenter(list, { lat: 48.85, lng: 2.3 }, 2);
    expect(r.truncated).toBe(true);
    expect(r.list.map((x) => x.i)).toEqual([0, 1]);
    expect(limitFeaturesNearCenter(list, { lat: 48.85, lng: 2.3 }, 10).truncated).toBe(false);
  });
  it("tuile ignorée si la ligne est malformée", () => {
    expect(decodeTile({ v: 1, rows: [[9, 1, 2, [], 0, 0] as never, [] as never] })).toEqual([]);
  });
});

describe("zoom, poids et dates", () => {
  it("charge seulement au zoom voulu et si la couche est active", () => {
    expect(layerVisible(LAYER.streetZoom, LAYER.streetZoom, true)).toBe(true);
    expect(layerVisible(LAYER.streetZoom - 1, LAYER.streetZoom, true)).toBe(false);
    expect(layerVisible(19, LAYER.streetZoom, false)).toBe(false);
  });
  it("signale les dépassements de poids (6 Mo, 150 Ko)", () => {
    expect(sizeProblems(1000, 1000)).toEqual([]);
    expect(sizeProblems(7 * 1048576, 1000)).toHaveLength(1);
    expect(sizeProblems(7 * 1048576, 200 * 1024)).toHaveLength(2);
  });
  it("met la date des données en français, ou rien si elle est invalide", () => {
    expect(formatDataDate("2026-07-05")).toBe("5 juillet 2026");
    expect(formatDataDate(null)).toBeNull();
    expect(formatDataDate("hier")).toBeNull();
    expect(formatDataDate("2026-13-45")).toBeNull();
  });
  it("GeoJSON : ferme le contour et garde le type", () => {
    const fc = toGeoJson([{ id: "a", kind: "poly", coords: [[2.3, 48.8], [2.31, 48.8], [2.31, 48.81]], props: [] }]);
    const g = fc.features[0].geometry as GeoJSON.Polygon;
    expect(g.coordinates[0]).toHaveLength(4);
  });
});
