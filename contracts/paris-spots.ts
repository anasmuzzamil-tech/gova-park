// Emplacements officiels de stationnement sur voie publique de Paris, affichés en GRIS « statut inconnu ».
// Source : jeu de données « Stationnement sur voie publique - emplacements » de la Ville de Paris, licence ODbL.
// Les données changent vite et la Ville ne garantit pas leur exhaustivité : ce sont des EMPLACEMENTS, jamais une disponibilité.
// Décision d'Anas : aucune DISPONIBILITÉ pré-remplie. Seul un signalement utilisateur récent (contracts/street-reports.ts) colore
// un emplacement (vert, orange, rouge), puis il redevient gris.
//
// Fichier autonome (aucun import) : il est utilisé par le site, par les tests et par le script d'import `scripts/import-paris-spots.mjs`.
// Fonctions pures, testées dans api/paris-spots.test.ts.

export const PARIS_SOURCE = {
  name: "Stationnement sur voie publique - emplacements",
  producer: "Ville de Paris",
  license: "ODbL",
  url: "https://www.data.gouv.fr/datasets/stationnement-sur-voie-publique-emplacements",
} as const;

export const PARIS_ATTRIBUTION = "Emplacements : Ville de Paris, licence ODbL, non exhaustifs. Statut inconnu (gris) sauf signalement récent d'un utilisateur.";

/** Types d'emplacement (codes stockés dans les fichiers). */
export const SPOT_TYPE = { other: 0, paid: 1, free: 2, delivery: 3, bike: 4, moto: 5, coach: 6 } as const;
export type SpotTypeCode = (typeof SPOT_TYPE)[keyof typeof SPOT_TYPE];
export const SPOT_TYPE_LABEL: Record<number, string> = {
  0: "Emplacement de voirie", 1: "Stationnement payant", 2: "Stationnement gratuit", 3: "Zone de livraison", 4: "Stationnement vélo", 5: "Deux-roues motorisés", 6: "Autocars",
};
/** Symbole affiché dans l'icône (la couleur, elle, ne dit que le statut). */
export const SPOT_TYPE_GLYPH: Record<number, string> = { 0: "P", 1: "€", 2: "P", 3: "L", 4: "V", 5: "M", 6: "C" };
export const SPOT_TYPE_CODES: number[] = [1, 2, 3, 4, 5, 6, 0];

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Type d'emplacement à partir des libellés du jeu de données (régime, type, usage…). Inconnu = 0, jamais deviné. */
export function classifyType(...texts: Array<string | number | null | undefined>): SpotTypeCode {
  const t = texts.map(norm).join(" | ");
  if (/livraison/.test(t)) return SPOT_TYPE.delivery;
  if (/velo|cycle|bicyclette/.test(t)) return SPOT_TYPE.bike;
  if (/2rm|2 roues|deux[ -]?roues|moto|scooter|motorise/.test(t)) return SPOT_TYPE.moto;
  if (/\bcars?\b|autocar/.test(t)) return SPOT_TYPE.coach;
  if (/gratuit|non payant/.test(t)) return SPOT_TYPE.free;
  if (/payant|rotatif|mixte|resident|horodateur/.test(t)) return SPOT_TYPE.paid;
  return SPOT_TYPE.other;
}

// ---------- Découpage en fichiers (tuiles) et vue d'ensemble agrégée ----------

export const GRID = {
  /** Côté d'une tuile de données, en degrés (environ 1,5 km sur 2,2 km). */
  tileDeg: 0.02,
  /** Côté d'une cellule d'agrégation de la vue d'ensemble, en degrés. */
  overviewDeg: 0.004,
  /** Au-delà de cette largeur de carte (degrés de longitude), on affiche la vue d'ensemble agrégée au lieu des emplacements. */
  detailMaxSpanLng: 0.03,
  /** Nombre maximal d'emplacements détaillés dessinés à la fois (performances iPhone). */
  detailLimit: 8000,
  /** Nombre maximal de tuiles chargées pour une vue. */
  maxTiles: 12,
  /** Un signalement à moins de cette distance d'un emplacement colore cet emplacement (identique à STREET_RULES.sameSpotMeters). */
  matchMeters: 15,
} as const;

export type TileIndex = {
  version: 1; source: typeof PARIS_SOURCE | Record<string, string>; attribution: string; generatedAt: string; count: number;
  origin: { south: number; west: number }; tileDeg: number; overviewDeg: number;
  /** Nombre d'emplacements par tuile « ix_iy ». */
  tiles: Record<string, number>;
};

export type OfficialSpot = { id: string; lat: number; lng: number; t: number; /** nombre d'emplacements représentés (1 = emplacement réel) */ n: number };
export type RawPoint = { lat: number; lng: number; t: number };

export const toE5 = (v: number) => Math.round(v * 1e5);
export const fromE5 = (v: number) => v / 1e5;

export function tileKey(lat: number, lng: number, origin: TileIndex["origin"], tileDeg: number): string {
  return `${Math.floor((lng - origin.west) / tileDeg + 1e-9)}_${Math.floor((lat - origin.south) / tileDeg + 1e-9)}`;
}

/** Répartit les points en tuiles : lignes compactes [latE5, lngE5, type]. */
export function bucketTiles(points: RawPoint[], origin: TileIndex["origin"], tileDeg: number): Map<string, number[][]> {
  const out = new Map<string, number[][]>();
  for (const p of points) {
    const key = tileKey(p.lat, p.lng, origin, tileDeg);
    let rows = out.get(key);
    if (!rows) { rows = []; out.set(key, rows); }
    rows.push([toE5(p.lat), toE5(p.lng), p.t]);
  }
  return out;
}

/** Vue d'ensemble : un point par cellule et par type, avec le nombre d'emplacements (le regroupement côté carte additionne ces nombres). */
export function aggregateOverview(points: RawPoint[], origin: TileIndex["origin"], cellDeg: number): number[][] {
  const cells = new Map<string, { lat: number; lng: number; n: number; t: number }>();
  for (const p of points) {
    const key = `${tileKey(p.lat, p.lng, origin, cellDeg)}:${p.t}`;
    const c = cells.get(key);
    if (c) { c.lat += p.lat; c.lng += p.lng; c.n += 1; } else cells.set(key, { lat: p.lat, lng: p.lng, n: 1, t: p.t });
  }
  return [...cells.values()].map((c) => [toE5(c.lat / c.n), toE5(c.lng / c.n), c.n, c.t]);
}

export function decodeTile(key: string, rows: number[][]): OfficialSpot[] {
  return rows.map((r, i) => ({ id: `${key}:${i}`, lat: fromE5(r[0]), lng: fromE5(r[1]), t: r[2], n: 1 }));
}
export function decodeOverview(rows: number[][]): OfficialSpot[] {
  return rows.map((r, i) => ({ id: `o:${i}`, lat: fromE5(r[0]), lng: fromE5(r[1]), t: r[3], n: r[2] }));
}

export type Bounds = { south: number; north: number; west: number; east: number };

/** Mode d'affichage selon la largeur de la carte : vue d'ensemble agrégée, ou emplacements détaillés. */
export function displayMode(bounds: Bounds): "overview" | "detail" {
  return bounds.east - bounds.west <= GRID.detailMaxSpanLng ? "detail" : "overview";
}

/** Tuiles existantes qui touchent la zone visible, les plus proches du centre d'abord, avec un maximum. */
export function tilesForBounds(bounds: Bounds, index: Pick<TileIndex, "origin" | "tileDeg" | "tiles">, max: number = GRID.maxTiles): { keys: string[]; truncated: boolean } {
  const { origin, tileDeg } = index;
  const x0 = Math.floor((bounds.west - origin.west) / tileDeg), x1 = Math.floor((bounds.east - origin.west) / tileDeg);
  const y0 = Math.floor((bounds.south - origin.south) / tileDeg), y1 = Math.floor((bounds.north - origin.south) / tileDeg);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const found: Array<{ key: string; d: number }> = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const key = `${x}_${y}`;
    if (index.tiles[key]) found.push({ key, d: Math.hypot(x - cx, y - cy) });
  }
  found.sort((a, b) => a.d - b.d);
  return { keys: found.slice(0, max).map((f) => f.key), truncated: found.length > max };
}

/** Garde au plus `limit` emplacements, les plus proches du centre de la carte. */
export function limitNearCenter(spots: OfficialSpot[], center: { lat: number; lng: number }, limit: number): { spots: OfficialSpot[]; truncated: boolean } {
  if (spots.length <= limit) return { spots, truncated: false };
  const d = (s: OfficialSpot) => (s.lat - center.lat) ** 2 + ((s.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180)) ** 2;
  return { spots: [...spots].sort((a, b) => d(a) - d(b)).slice(0, limit), truncated: true };
}

// ---------- Fusion avec les signalements d'utilisateurs ----------

export type ReportColor = "green" | "orange" | "red";
export type ReportLite = { id: number; latitude: number; longitude: number; color: string; reportedAt: string };
export type ParisSpot = OfficialSpot & { /** « gray » sans signalement récent */ color: "gray" | ReportColor; /** identifiant du signalement qui colore l'emplacement, 0 sinon */ reportId: number };

function meters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const isReportColor = (c: string): c is ReportColor => c === "green" || c === "orange" || c === "red";

/**
 * Fusion : chaque signalement actif à moins de `matchMeters` d'un emplacement officiel (réel, n = 1) colore cet emplacement
 * (le signalement le plus récent l'emporte si plusieurs visent le même). Les autres emplacements restent gris.
 * Retourne aussi les signalements absorbés : ils ne doivent plus être dessinés à part (sinon doublon). Un signalement
 * sans emplacement officiel proche reste une place en rue à part entière (couche « Places en rue »).
 * Jamais de vert sans signalement : la couleur vient uniquement des signalements fournis.
 */
export function mergeWithReports(officials: OfficialSpot[], reports: ReportLite[], matchMeters: number = GRID.matchMeters): { spots: ParisSpot[]; matchedReportIds: Set<number> } {
  const cell = 0.0004; // environ 44 m : le voisinage 3 x 3 couvre largement 15 m
  const grid = new Map<string, number[]>();
  officials.forEach((s, i) => {
    if (s.n !== 1) return;
    const key = `${Math.floor(s.lat / cell)}_${Math.floor(s.lng / cell)}`;
    const list = grid.get(key); if (list) list.push(i); else grid.set(key, [i]);
  });
  const colored = new Map<number, { report: ReportLite; at: number }>();
  const matched = new Set<number>();
  for (const r of reports) {
    if (!isReportColor(r.color)) continue;
    const cx = Math.floor(r.latitude / cell), cy = Math.floor(r.longitude / cell);
    let best = -1, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of grid.get(`${cx + dx}_${cy + dy}`) ?? []) {
        const d = meters(r.latitude, r.longitude, officials[i].lat, officials[i].lng);
        if (d <= matchMeters && d < bestD) { best = i; bestD = d; }
      }
    }
    if (best === -1) continue;
    matched.add(r.id);
    const at = new Date(r.reportedAt).getTime();
    const prev = colored.get(best);
    if (!prev || at > prev.at) colored.set(best, { report: r, at });
  }
  const spots: ParisSpot[] = officials.map((s, i) => {
    const c = colored.get(i);
    return c ? { ...s, color: c.report.color as ReportColor, reportId: c.report.id } : { ...s, color: "gray", reportId: 0 };
  });
  return { spots, matchedReportIds: matched };
}
