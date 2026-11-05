// Couches géographiques statiques (stationnement interdit, chantiers, bornes de recharge) : géométrie compacte, tuilage par zone visible, distances.
// Même principe que les emplacements et les emprises de Paris : fichiers générés légers (jamais le CSV source), chargés par tuiles
// de 0,02 degré SEULEMENT pour la zone visible, avec une limite. Aucune disponibilité n'est portée par ces fichiers.
//
// Fichier autonome (import d'un seul module voisin) : utilisé par le site, par les tests et par les scripts `scripts/import-*.mjs`.
// Fonctions pures, testées dans api/geo-layers.test.ts.
import { tileKey, tilesForBounds, type Bounds } from "./paris-spots.ts";

export type LngLat = [number, number];
export type PartKind = "pt" | "line" | "poly";
export type GeoPart = { kind: PartKind; coords: LngLat[] };
/** Valeur d'attribut gardée dans une tuile : texte, nombre ou absent. */
export type Prop = string | number | null;
/** Une entité : un point, une ligne ou un contour de polygone (anneau extérieur seulement), avec ses attributs (tableau ordonné défini par chaque source). */
export type GeoFeature = { kind: PartKind; coords: LngLat[]; props: Prop[] };

export const KIND_CODE: Record<PartKind, number> = { pt: 1, line: 2, poly: 3 };
const CODE_KIND: Record<number, PartKind> = { 1: "pt", 2: "line", 3: "poly" };

export const LAYER = {
  /** Côté d'une tuile, en degrés (modifiable à l'import avec --tile-deg pour réduire le poids d'une tuile). */
  tileDeg: 0.02,
  /** Nombre maximal de tuiles chargées pour une vue. */
  maxTiles: 12,
  /** Nombre maximal d'entités dessinées à la fois, les plus proches du centre de la carte. */
  drawLimit: 3000,
  /** Les lignes et contours (stationnement interdit, chantiers) sont chargés à partir de ce zoom (zoom rue). */
  streetZoom: 16,
  /** Les bornes de recharge sont chargées à partir de ce zoom (quartier). */
  pointZoom: 14,
  /** Chiffres après la virgule gardés (6 = environ 0,1 m). */
  coordDecimals: 6,
  /** Seuils de poids d'un import (décision d'Anas) : total de toutes les nouvelles données, et plus grosse tuile. */
  maxTotalBytes: 6 * 1048576,
  maxTileBytes: 150 * 1024,
} as const;

// ---------- Géométrie GeoJSON -> parties ----------

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const toPt = (c: unknown): LngLat | null => (Array.isArray(c) && isNum(c[0]) && isNum(c[1]) ? [c[0], c[1]] : null);
const toPts = (list: unknown): LngLat[] => (Array.isArray(list) ? list.map(toPt).filter((p): p is LngLat => p !== null) : []);

/**
 * Parties d'une géométrie GeoJSON (ou d'une Feature) : Point/MultiPoint -> points, LineString/MultiLineString -> lignes, Polygon/MultiPolygon -> contours extérieurs
 * (les trous sont ignorés). Géométrie absente, invalide ou d'un autre type : liste vide, jamais de forme inventée.
 */
export function geometryParts(input: unknown): GeoPart[] {
  let g = input as { type?: string; coordinates?: unknown; geometry?: unknown; geometries?: unknown[] } | null;
  if (!g || typeof g !== "object") return [];
  if (g.type === "Feature") g = g.geometry as typeof g;
  if (!g || typeof g !== "object") return [];
  const out: GeoPart[] = [];
  const c = g.coordinates;
  switch (g.type) {
    case "Point": { const p = toPt(c); if (p) out.push({ kind: "pt", coords: [p] }); break; }
    case "MultiPoint": for (const p of toPts(c)) out.push({ kind: "pt", coords: [p] }); break;
    case "LineString": { const l = toPts(c); if (l.length >= 2) out.push({ kind: "line", coords: l }); break; }
    case "MultiLineString": if (Array.isArray(c)) for (const part of c) { const l = toPts(part); if (l.length >= 2) out.push({ kind: "line", coords: l }); } break;
    case "Polygon": if (Array.isArray(c)) { const r = toPts(c[0]); if (r.length >= 4) out.push({ kind: "poly", coords: r }); } break;
    case "MultiPolygon": if (Array.isArray(c)) for (const poly of c) { const r = Array.isArray(poly) ? toPts(poly[0]) : []; if (r.length >= 4) out.push({ kind: "poly", coords: r }); } break;
    case "GeometryCollection": if (Array.isArray(g.geometries)) for (const sub of g.geometries) out.push(...geometryParts(sub)); break;
    default: break;
  }
  return out;
}

/** Les coordonnées ressemblent-elles à du WGS84 (longitude, latitude) ? Un fichier en Lambert 93 (valeurs de centaines de milliers) est refusé, jamais « corrigé » au hasard. */
export const looksWgs84 = (p: LngLat): boolean => p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;

const M_PER_DEG = 111320;
const toMeters = (p: LngLat, lat0: number): [number, number] => [p[0] * Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG, p[1] * M_PER_DEG];

/** Arrondit les sommets, retire les doublons consécutifs (et le point de fermeture d'un contour). Ligne : au moins 2 sommets ; contour : au moins 3 ; sinon null. */
export function normalizePart(part: GeoPart, decimals: number = LAYER.coordDecimals): GeoPart | null {
  const f = 10 ** decimals;
  const pts: LngLat[] = [];
  for (const [lng, lat] of part.coords) {
    const p: LngLat = [Math.round(lng * f) / f, Math.round(lat * f) / f];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  if (part.kind === "poly") while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const min = part.kind === "poly" ? 3 : part.kind === "line" ? 2 : 1;
  return pts.length >= min ? { kind: part.kind, coords: pts } : null;
}

/** Douglas-Peucker : retire les sommets à moins de `tolMeters` du segment qui les entoure (poids des fichiers). Les extrémités sont toujours gardées. */
export function simplifyCoords(coords: LngLat[], tolMeters: number): LngLat[] {
  if (coords.length <= 2 || !(tolMeters > 0)) return coords;
  const lat0 = coords[0][1];
  const m = coords.map((p) => toMeters(p, lat0));
  const keep = new Array(coords.length).fill(false); keep[0] = keep[coords.length - 1] = true;
  const stack: Array<[number, number]> = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, idx = -1;
    for (let i = a + 1; i < b; i++) { const d = segDistance(m[i], m[a], m[b]); if (d > worst) { worst = d; idx = i; } }
    if (idx >= 0 && worst > tolMeters) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return coords.filter((_, i) => keep[i]);
}

function segDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// ---------- Distances ----------

/** Distance en mètres d'un point à une entité : 0 à l'intérieur d'un contour, sinon distance au bord ; point : distance directe. */
export function distanceToFeatureMeters(f: Pick<GeoFeature, "kind" | "coords">, lat: number, lng: number): number {
  if (!f.coords.length) return Infinity;
  const p = toMeters([lng, lat], lat);
  const m = f.coords.map((c) => toMeters(c, lat));
  if (f.kind === "pt") return Math.hypot(p[0] - m[0][0], p[1] - m[0][1]);
  if (f.kind === "poly" && pointInRing(p, m)) return 0;
  let best = Infinity;
  const n = f.kind === "poly" ? m.length : m.length - 1;
  for (let i = 0; i < n; i++) best = Math.min(best, segDistance(p, m[i], m[(i + 1) % m.length]));
  return best;
}

function pointInRing(p: [number, number], ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- Fichiers (tuiles) ----------

/** Ligne de tuile : [code de forme, latE6 du premier sommet, lngE6 du premier sommet, attributs, dLat2, dLng2, ...] (sommets suivants en millionièmes de degré, relatifs au premier). */
export type LayerRow = [number, number, number, Prop[], ...number[]];
export type LayerTileFile = { v: 1; rows: LayerRow[] };
export type LayerIndex = {
  version: 1; layer: string; source: Record<string, string>; attribution: string; generatedAt: string;
  /** Date des DONNÉES (publication ou mise à jour annoncée par la source), pas la date de l'import. null = non renseignée. */
  dataDate: string | null;
  count: number; origin: { south: number; west: number }; tileDeg: number;
  /** Nombre d'entités par tuile « ix_iy » (une entité qui traverse des tuiles est répétée dans chacune). */
  tiles: Record<string, number>;
};
export type DecodedFeature = GeoFeature & { id: string };

const e6 = (v: number) => Math.round(v * 1e6);

export function encodeFeature(f: GeoFeature): LayerRow {
  const lat0 = e6(f.coords[0][1]), lng0 = e6(f.coords[0][0]);
  const row: LayerRow = [KIND_CODE[f.kind], lat0, lng0, f.props];
  for (let i = 1; i < f.coords.length; i++) row.push(e6(f.coords[i][1]) - lat0, e6(f.coords[i][0]) - lng0);
  return row;
}

export function decodeTile(file: LayerTileFile): DecodedFeature[] {
  const out: DecodedFeature[] = [];
  for (const r of file.rows) {
    if (!Array.isArray(r) || r.length < 4) continue;
    const kind = CODE_KIND[r[0]];
    if (!kind) continue;
    const coords: LngLat[] = [[r[2] / 1e6, r[1] / 1e6]];
    for (let k = 4; k + 1 < r.length; k += 2) coords.push([(r[2] + (r[k + 1] as number)) / 1e6, (r[1] + (r[k] as number)) / 1e6]);
    out.push({ id: `${r[0]}:${r[1]}:${r[2]}:${r.length}`, kind, coords, props: Array.isArray(r[3]) ? r[3] : [] });
  }
  return out;
}

/** Clés « ix_iy » des tuiles que touche le cadre englobant d'une entité. */
export function tileKeysOf(f: GeoFeature, origin: LayerIndex["origin"], tileDeg: number): string[] {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  for (const [lng, lat] of f.coords) { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng); }
  const [x0, y0] = tileKey(s, w, origin, tileDeg).split("_").map(Number), [x1, y1] = tileKey(n, e, origin, tileDeg).split("_").map(Number);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x}_${y}`);
  return keys;
}

/** Répartit les entités en tuiles (une entité qui traverse plusieurs tuiles est répétée). Ordre des lignes déterministe. */
export function bucketFeatures(features: GeoFeature[], origin: LayerIndex["origin"], tileDeg: number): Map<string, LayerTileFile> {
  const out = new Map<string, LayerTileFile>();
  const sorted = [...features].sort((a, b) => a.coords[0][1] - b.coords[0][1] || a.coords[0][0] - b.coords[0][0]);
  for (const f of sorted) {
    const row = encodeFeature(f);
    for (const key of tileKeysOf(f, origin, tileDeg)) {
      let file = out.get(key);
      if (!file) { file = { v: 1, rows: [] }; out.set(key, file); }
      file.rows.push(row);
    }
  }
  return out;
}

/** Origine de la grille : coin sud-ouest arrondi à `tileDeg` sous toutes les entités. */
export function originFor(features: GeoFeature[], tileDeg: number): LayerIndex["origin"] {
  let s = Infinity, w = Infinity;
  for (const f of features) for (const [lng, lat] of f.coords) { s = Math.min(s, lat); w = Math.min(w, lng); }
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  return { south: r5(Math.floor(s / tileDeg) * tileDeg), west: r5(Math.floor(w / tileDeg) * tileDeg) };
}

/** Tuiles existantes qui touchent la zone visible, les plus proches du centre d'abord (même règle que les emplacements). */
export function layerTilesForBounds(bounds: Bounds, index: Pick<LayerIndex, "origin" | "tileDeg" | "tiles">, max: number = LAYER.maxTiles) {
  return tilesForBounds(bounds, index, max);
}

/** Garde au plus `limit` entités, les plus proches du centre de la carte. */
export function limitFeaturesNearCenter<T extends Pick<GeoFeature, "coords">>(list: T[], center: { lat: number; lng: number }, limit: number): { list: T[]; truncated: boolean } {
  if (list.length <= limit) return { list, truncated: false };
  const k = Math.cos((center.lat * Math.PI) / 180);
  const d = (f: T) => (f.coords[0][1] - center.lat) ** 2 + ((f.coords[0][0] - center.lng) * k) ** 2;
  return { list: [...list].sort((a, b) => d(a) - d(b)).slice(0, limit), truncated: true };
}

/** Faut-il charger cette couche ? Couche active et zoom suffisant. */
export const layerVisible = (zoom: number, minZoom: number, layerOn: boolean = true): boolean => layerOn && zoom >= minZoom;

/** Vérifie les seuils de poids d'un import. Renvoie la liste des dépassements (vide = conforme). */
export function sizeProblems(totalBytes: number, biggestTileBytes: number): string[] {
  const out: string[] = [];
  if (totalBytes > LAYER.maxTotalBytes) out.push(`poids total ${(totalBytes / 1048576).toFixed(2)} Mo > ${(LAYER.maxTotalBytes / 1048576).toFixed(0)} Mo`);
  if (biggestTileBytes > LAYER.maxTileBytes) out.push(`plus grosse tuile ${(biggestTileBytes / 1024).toFixed(0)} Ko > ${(LAYER.maxTileBytes / 1024).toFixed(0)} Ko`);
  return out;
}

/** Date lisible « 5 juillet 2026 » d'une date ISO (AAAA-MM-JJ), ou null si la valeur n'est pas une date valide. */
export function formatDataDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(d);
}

/** Entités à dessiner en GeoJSON : lignes et contours (sans attribut inutile). */
export function toGeoJson(list: DecodedFeature[], pick: (f: DecodedFeature) => Record<string, string | number | null> = () => ({})): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: list.map((f) => ({
      type: "Feature" as const, properties: { i: f.id, ...pick(f) },
      geometry: f.kind === "pt" ? { type: "Point" as const, coordinates: f.coords[0] }
        : f.kind === "line" ? { type: "LineString" as const, coordinates: f.coords }
        : { type: "Polygon" as const, coordinates: [[...f.coords, f.coords[0]]] },
    })),
  };
}
