// Emprises de stationnement sur voie publique de Paris : contour de chaque zone, dessiné en POINTILLÉS le long de la chaussée au zoom rue.
// Source : jeu « Stationnement sur voie publique - emprises » de la Ville de Paris, licence ODbL (même relevé que les emplacements).
//
// Ce que la donnée dit : le CONTOUR d'une zone de stationnement et son « Nombre places réelles ». Elle ne dit PAS où est chaque place.
// La découpe d'un rectangle en N parts égales (`splitSegments`) est donc INDICATIVE, calculée par GOVAPARK : jamais une donnée de la Ville,
// et jamais appliquée aux formes qui ne sont pas des rectangles (contour seul). Aucune disponibilité n'est portée par ce fichier : la couleur
// vient uniquement d'un signalement d'utilisateur récent (contracts/street-reports.ts), via le point d'ancrage = l'emplacement correspondant.
//
// Fonctions pures, testées dans api/paris-polygons.test.ts ; utilisées par le site et par `scripts/import-paris-polygons.mjs`.
import { SPOT_TYPE, interpretRegime, tileKey, toE5 } from "./paris-spots.ts";

export const PARIS_POLYGONS_SOURCE = {
  name: "Stationnement sur voie publique - emprises",
  producer: "Ville de Paris",
  license: "ODbL",
  url: "https://www.data.gouv.fr/datasets/stationnement-sur-voie-publique-emprises",
} as const;

/** Mention affichée dans la fiche d'un emplacement et dans le panneau « i » (jamais en bandeau sur la carte). */
export const PARIS_POLYGONS_NOTE = "Places réparties à titre indicatif : la Ville de Paris publie des zones de stationnement, pas chaque place.";
/** Source et licence du jeu « emprises », pour le panneau « i ». */
export const PARIS_POLYGONS_ATTRIBUTION = "Contours des zones : Ville de Paris, « Stationnement sur voie publique - emprises », licence ODbL.";

export const POLY = {
  /** Côté d'une tuile de contours, en degrés : MÊME grille et mêmes clés « ix_iy » que les tuiles des emplacements (GRID.tileDeg). */
  tileDeg: 0.02,
  /** À partir de ce zoom (zoom rue), on charge et on dessine les contours. */
  minZoom: 17,
  /** Nombre maximal de tuiles de contours chargées pour une vue. */
  maxTiles: 12,
  /** Nombre maximal d'emprises dessinées à la fois, les plus proches du centre de la carte. */
  drawLimit: 4000,
  /** Découpe indicative : seulement pour 2 à 12 places réelles. */
  splitMin: 2,
  splitMax: 12,
  /** Un quadrilatère est un « rectangle » si ses quatre angles sont à 90° près de cette tolérance (degrés). */
  rectAngleTol: 8,
  /** Rapport longueur / largeur minimal pour qu'un grand axe existe ; en dessous (quasi carré), pas de découpe. */
  minAspect: 1.3,
  /** Chiffres après la virgule gardés pour les sommets (6 = environ 0,1 m). */
  coordDecimals: 6,
} as const;

/** 1 = rectangle (découpe indicative possible) ; 2 = autre forme (contour seul). */
export const POLY_KIND = { rect: 1, shape: 2 } as const;

/** Deux-roues motorisés (« 2 ROUES » + « Motos payant Mixte » / « Motos payant Rotatif ») : jamais les vélos, ni « 2 ROUES | Mixte » (incertain). */
export function isMotoRegime(prioritaire: string | null | undefined, particulier: string | null | undefined): boolean {
  return interpretRegime(prioritaire, particulier).t === SPOT_TYPE.moto;
}

/** Emprises importées : celles affichées par défaut (« Voitures et motos »), voiture ordinaire OU deux-roues motorisé. */
export const isDefaultRegime = (prioritaire: string | null | undefined, particulier: string | null | undefined): boolean => isCarRegime(prioritaire, particulier) || isMotoRegime(prioritaire, particulier);

/** Une voiture ordinaire peut-elle s'y garer ? MÊME règle que l'affichage par défaut des emplacements (interpretRegime) : payant mixte / rotatif, gratuit. */
export function isCarRegime(prioritaire: string | null | undefined, particulier: string | null | undefined): boolean {
  return interpretRegime(prioritaire, particulier).cars === true;
}

// ---------- Géométrie ----------

export type LngLat = [number, number];
const M_PER_DEG = 111320;
const toMeters = (p: LngLat, lat0: number): [number, number] => [p[0] * Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG, p[1] * M_PER_DEG];

/** Sommets extérieurs d'une géométrie GeoJSON Polygon / MultiPolygon, un anneau par partie. Les trous sont ignorés. Autre type ou forme invalide : liste vide. */
export function outerRings(geometry: unknown): LngLat[][] {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || typeof g !== "object" || !Array.isArray(g.coordinates)) return [];
  const parts: unknown[] = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const out: LngLat[][] = [];
  for (const part of parts) {
    const ring = Array.isArray(part) ? part[0] : null;
    if (!Array.isArray(ring)) continue;
    const pts: LngLat[] = [];
    for (const c of ring) { if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) pts.push([Number(c[0]), Number(c[1])]); }
    if (pts.length >= 4) out.push(pts);
  }
  return out;
}

/** Arrondit à `decimals` chiffres, retire le point de fermeture et les doublons consécutifs. Moins de 3 sommets distincts : null (aucune forme inventée). */
export function normalizeRing(ring: LngLat[], decimals: number = POLY.coordDecimals): LngLat[] | null {
  const f = 10 ** decimals;
  const pts: LngLat[] = [];
  for (const [lng, lat] of ring) {
    const p: LngLat = [Math.round(lng * f) / f, Math.round(lat * f) / f];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return pts.length >= 3 ? pts : null;
}

/** Rectangle = 4 sommets, angles à 90° près de `tolDeg`, et grand axe net (longueur / largeur >= minAspect). Sinon false. */
export function isRectangle(pts: LngLat[], tolDeg: number = POLY.rectAngleTol, minAspect: number = POLY.minAspect): boolean {
  if (pts.length !== 4) return false;
  const lat0 = pts[0][1];
  const m = pts.map((p) => toMeters(p, lat0));
  for (let i = 0; i < 4; i++) {
    const a = m[i], b = m[(i + 1) % 4], c = m[(i + 2) % 4];
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const n = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]);
    if (!(n > 0)) return false;
    const angle = (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n))) * 180) / Math.PI;
    if (Math.abs(angle - 90) > tolDeg) return false;
  }
  const l1 = Math.hypot(m[1][0] - m[0][0], m[1][1] - m[0][1]), l2 = Math.hypot(m[2][0] - m[1][0], m[2][1] - m[1][1]);
  const long = Math.max(l1, l2), short = Math.min(l1, l2);
  return short > 0 && long / short >= minAspect;
}

export const classifyRing = (pts: LngLat[]): number => (isRectangle(pts) ? POLY_KIND.rect : POLY_KIND.shape);

/**
 * Séparateurs INDICATIFS : coupe un rectangle en `n` parts égales le long de son grand axe (n - 1 segments, un par frontière entre deux parts).
 * Liste vide si ce n'est pas un rectangle, si n n'est pas un entier de 2 à 12 (n = 0, absent ou 1 : contour seul).
 */
export function splitSegments(pts: LngLat[], n: number | null | undefined): Array<[LngLat, LngLat]> {
  if (n == null || !Number.isInteger(n) || n < POLY.splitMin || n > POLY.splitMax || !isRectangle(pts)) return [];
  const lat0 = pts[0][1];
  const m = pts.map((p) => toMeters(p, lat0));
  const len = (i: number) => Math.hypot(m[(i + 1) % 4][0] - m[i][0], m[(i + 1) % 4][1] - m[i][1]);
  // Grand axe = direction des deux côtés les plus longs. Côtés 0 (p0->p1) et 2 (p2->p3), ou 1 (p1->p2) et 3 (p3->p0).
  const alongZero = len(0) + len(2) >= len(1) + len(3);
  const [a0, a1, b0, b1] = alongZero ? [pts[0], pts[1], pts[3], pts[2]] : [pts[1], pts[2], pts[0], pts[3]];
  const lerp = (p: LngLat, q: LngLat, t: number): LngLat => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const out: Array<[LngLat, LngLat]> = [];
  for (let k = 1; k < n; k++) out.push([lerp(a0, a1, k / n), lerp(b0, b1, k / n)]);
  return out;
}

// ---------- Fichiers (tuiles de contours) ----------

/** Contenu d'une tuile : lignes [latE5, lngE5, type, places, forme, dLat1, dLng1, dLat2, dLng2, ...] (sommets en millionièmes de degré, relatifs au point d'ancrage). */
export type PolygonTileFile = { v: 1; rows: number[][] };
export type PolygonIndex = {
  version: 1; source: typeof PARIS_POLYGONS_SOURCE | Record<string, string>; attribution: string; generatedAt: string; count: number;
  origin: { south: number; west: number }; tileDeg: number; tiles: Record<string, number>;
};
export type PolygonInput = { latE5: number; lngE5: number; t: number; places: number; kind: number; ring: LngLat[] };

/** Un contour décodé. `anchor` = clé du point d'ancrage (identique à celle de l'emplacement correspondant, voir spotAnchorKey). */
export type ParisPolygon = { id: string; anchor: string; lat: number; lng: number; t: number; places: number; kind: number; ring: LngLat[] };

export const anchorKey = (latE5: number, lngE5: number) => `${latE5}_${lngE5}`;
/** Clé d'un emplacement officiel (OfficialSpot / ParisSpot) : celle du contour qui lui correspond. */
export const spotAnchorKey = (lat: number, lng: number) => anchorKey(toE5(lat), toE5(lng));

/** Ligne de tuile : sommets en millionièmes de degré, relatifs à l'ancrage (nombres entiers courts). */
export function encodePolygonRow(p: PolygonInput): number[] {
  const baseLat = p.latE5 * 10, baseLng = p.lngE5 * 10;
  const row = [p.latE5, p.lngE5, p.t, p.places, p.kind];
  for (const [lng, lat] of p.ring) row.push(Math.round(lat * 1e6) - baseLat, Math.round(lng * 1e6) - baseLng);
  return row;
}

export function decodePolygonTile(key: string, file: PolygonTileFile): ParisPolygon[] {
  const out: ParisPolygon[] = [];
  file.rows.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 5 + 6) return;
    const baseLat = r[0] * 10, baseLng = r[1] * 10;
    const ring: LngLat[] = [];
    for (let k = 5; k + 1 < r.length; k += 2) ring.push([(baseLng + r[k + 1]) / 1e6, (baseLat + r[k]) / 1e6]);
    out.push({ id: `${key}:${i}`, anchor: anchorKey(r[0], r[1]), lat: r[0] / 1e5, lng: r[1] / 1e5, t: r[2], places: r[3], kind: r[4], ring });
  });
  return out;
}

/** Répartit les contours en tuiles de `tileDeg` (même origine que les emplacements, clé « ix_iy »). Ordre des lignes déterministe. */
export function bucketPolygons(items: PolygonInput[], origin: PolygonIndex["origin"], tileDeg: number): Map<string, PolygonTileFile> {
  const out = new Map<string, PolygonTileFile>();
  for (const p of [...items].sort((a, b) => a.latE5 - b.latE5 || a.lngE5 - b.lngE5)) {
    const key = tileKey(p.latE5 / 1e5, p.lngE5 / 1e5, origin, tileDeg);
    let file = out.get(key);
    if (!file) { file = { v: 1, rows: [] }; out.set(key, file); }
    file.rows.push(encodePolygonRow(p));
  }
  return out;
}

/** Garde au plus `limit` contours, les plus proches du centre de la carte. */
export function limitPolygonsNearCenter(polys: ParisPolygon[], center: { lat: number; lng: number }, limit: number): { polys: ParisPolygon[]; truncated: boolean } {
  if (polys.length <= limit) return { polys, truncated: false };
  const k = Math.cos((center.lat * Math.PI) / 180);
  const d = (p: ParisPolygon) => (p.lat - center.lat) ** 2 + ((p.lng - center.lng) * k) ** 2;
  return { polys: [...polys].sort((a, b) => d(a) - d(b)).slice(0, limit), truncated: true };
}

/** Faut-il charger les contours ? Seulement au zoom rue (et pas du tout si la couche est masquée). */
export const polygonsVisible = (zoom: number, layerOn: boolean = true): boolean => layerOn && zoom >= POLY.minZoom;

// ---------- Mise en forme pour la carte ----------

export type PolygonColor = "gray" | "green" | "orange" | "red";
export type PolygonFeatures = { outlines: GeoJSON.FeatureCollection<GeoJSON.Polygon>; separators: GeoJSON.FeatureCollection<GeoJSON.LineString> };

/**
 * Entités à dessiner : un contour par emprise (dont le type est coché), plus les séparateurs indicatifs des rectangles dont le nombre de places
 * réelles est connu (2 à 12). `colorOf` donne la couleur d'après un signalement récent (clé d'ancrage -> couleur) ; sans signalement : gris.
 * `types` : codes de type à garder (le filtre « Voitures et motos / Tout afficher » de la carte).
 */
export function buildPolygonFeatures(polys: ParisPolygon[], colorOf: ReadonlyMap<string, PolygonColor> | null, types: ReadonlySet<number>): PolygonFeatures {
  const outlines: GeoJSON.Feature<GeoJSON.Polygon>[] = [], separators: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const p of polys) {
    if (!types.has(p.t) || p.ring.length < 3) continue;
    const c = colorOf?.get(p.anchor) ?? "gray";
    outlines.push({ type: "Feature", properties: { c, i: p.id }, geometry: { type: "Polygon", coordinates: [[...p.ring, p.ring[0]]] } });
    if (p.kind !== POLY_KIND.rect) continue;
    for (const seg of splitSegments(p.ring, p.places)) separators.push({ type: "Feature", properties: { c }, geometry: { type: "LineString", coordinates: seg } });
  }
  return { outlines: { type: "FeatureCollection", features: outlines }, separators: { type: "FeatureCollection", features: separators } };
}
