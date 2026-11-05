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

/** Types d'emplacement (codes stockés dans les fichiers). 0 = régime non reconnu : jamais deviné. */
export const SPOT_TYPE = { other: 0, paid: 1, free: 2, delivery: 3, bike: 4, moto: 5, coach: 6, pmr: 7, reserved: 8 } as const;
export type SpotTypeCode = (typeof SPOT_TYPE)[keyof typeof SPOT_TYPE];
export const SPOT_TYPE_LABEL: Record<number, string> = {
  0: "Autre régime", 1: "Stationnement payant", 2: "Stationnement gratuit", 3: "Zone de livraison", 4: "Vélos", 5: "Deux-roues motorisés", 6: "Autocars", 7: "Places PMR (GIG/GIC)", 8: "Réservé (taxis, services, partage…)",
};
/** Symbole affiché dans l'icône (la couleur, elle, ne dit que le statut). */
export const SPOT_TYPE_GLYPH: Record<number, string> = { 0: "?", 1: "€", 2: "P", 3: "L", 4: "V", 5: "M", 6: "C", 7: "PMR", 8: "R" };
export const SPOT_TYPE_CODES: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 0];
/** Affichés par défaut : les emplacements où une VOITURE ordinaire peut se garer (payant, mixte, gratuit). Les autres restent activables par le filtre. */
export const DEFAULT_SPOT_TYPES: number[] = [SPOT_TYPE.paid, SPOT_TYPE.free];

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------- Interprétation des régimes (colonnes « Régime prioritaire » et « Régime particulier ») ----------
// Chaque couple réellement présent dans le fichier du 31/10/2026 est traité explicitement (voir api/paris-spots.test.ts).
// Un couple inconnu ou incertain n'est JAMAIS deviné : libellé « Régime : [valeur brute] », aucune promesse, hors de l'affichage par défaut.
// Les tarifs et les horaires ne sont pas dans ces colonnes : on n'en affiche aucun.

export type RegimeInfo = {
  /** Code de type (filtre, icône). */
  t: SpotTypeCode;
  /** true = une voiture ordinaire peut s'y garer d'après le régime ; false = réservé à un autre usage ; null = régime incertain, aucune promesse. */
  cars: boolean | null;
  /** Type en langage simple, sans la rue. */
  title: string;
  /** Précision courte (usage réservé, limite des données), ou null. */
  note: string | null;
};

const info = (t: SpotTypeCode, cars: boolean | null, title: string, note: string | null = null): RegimeInfo => ({ t, cars, title, note });
const UNSURE_NOTE = "Usage non précisé par les données : voir la signalisation sur place.";
/** Valeur brute, sans promesse. */
const rawRegime = (prio: string, part: string): RegimeInfo => info(SPOT_TYPE.other, null, `Régime : ${(part || prio || "non renseigné").trim()}`, UNSURE_NOTE);

export function interpretRegime(prioritaire: string | null | undefined, particulier: string | null | undefined): RegimeInfo {
  const prio = String(prioritaire ?? "").trim(), part = String(particulier ?? "").trim();
  const p = norm(prio), q = norm(part);
  switch (p) {
    case "payant mixte":
      return q === "mixte" ? info(SPOT_TYPE.paid, true, "Stationnement payant", "Ouvert à tous les véhicules") : rawRegime(prio, part);
    case "payant rotatif":
      return q === "rotatif" ? info(SPOT_TYPE.paid, true, "Stationnement payant (rotatif)") : rawRegime(prio, part);
    case "gratuit":
      return q === "gratuit" ? info(SPOT_TYPE.free, true, "Stationnement gratuit") : rawRegime(prio, part);
    case "2 roues":
      if (q === "velos") return info(SPOT_TYPE.bike, false, "Stationnement vélos", "Réservé aux vélos");
      if (q === "velo-cargo") return info(SPOT_TYPE.bike, false, "Vélos cargo", "Réservé aux vélos cargo");
      if (q === "box a velos") return info(SPOT_TYPE.bike, false, "Box à vélos", "Réservé aux vélos");
      if (q === "motos payant mixte" || q === "motos payant rotatif") return info(SPOT_TYPE.moto, false, "Deux-roues motorisés (payant)", "Réservé aux deux-roues motorisés");
      if (q === "mixte") return info(SPOT_TYPE.moto, false, "Stationnement deux-roues", "Réservé aux deux-roues (régime : Mixte)");
      return rawRegime(prio, part);
    case "livraison":
      if (q === "zl permanente") return info(SPOT_TYPE.delivery, false, "Zone de livraison (permanente)", "Réservée aux livraisons");
      if (q === "zl periodique") return info(SPOT_TYPE.delivery, false, "Zone de livraison (périodique)", "Réservée aux livraisons ; horaires non fournis dans les données, voir le panneau");
      return rawRegime(prio, part);
    case "gig/gic":
      if (q.startsWith("gig/gic")) return info(SPOT_TYPE.pmr, false, "Place PMR (GIG/GIC)", `Réservée aux personnes à mobilité réduite titulaires de la carte${q === "gig/gic standard" ? "" : ` (régime : ${part})`}`);
      return rawRegime(prio, part);
    case "location":
      if (q === "velib'") return info(SPOT_TYPE.bike, false, "Station Vélib'", "Réservé aux vélos en libre-service");
      if (part) return info(SPOT_TYPE.reserved, false, `Réservé : ${part}`, "Emplacement de location ou de partage de véhicules");
      return rawRegime(prio, part);
    case "electrique":
      if (q.startsWith("belib")) return info(SPOT_TYPE.reserved, false, `Recharge électrique (${part})`, "Réservé à la recharge de véhicules électriques");
      return rawRegime(prio, part);
    case "autocar":
      return info(SPOT_TYPE.coach, false, "Stationnement autocars", `Réservé aux autocars (régime : ${part || prio})`);
    case "autre regime":
      if (q.startsWith("sp - ")) return info(SPOT_TYPE.reserved, false, `Réservé : ${part.slice(5).trim() || part}`, "Emplacement réservé à un service public");
      if (q === "transport de fonds") return info(SPOT_TYPE.reserved, false, "Réservé : transport de fonds", "Emplacement réservé");
      return rawRegime(prio, part);
    default:
      return rawRegime(prio, part);
  }
}

// ---------- Rue et numéro (colonnes « Type voie », « Nom voie », « Numéro voie ») ----------

const VOIE_TYPE: Record<string, string> = {
  RUE: "rue", AV: "avenue", BD: "boulevard", PL: "place", QU: "quai", RTE: "route", PAS: "passage", ALL: "allée", CRS: "cours", SQ: "square", VLA: "villa", CITE: "cité",
  IMP: "impasse", CHEM: "chemin", VOIE: "voie", COUR: "cour", PROM: "promenade", CAR: "carrefour", CHAU: "chaussée", SEN: "sentier", PORT: "port", ESPL: "esplanade", RPT: "rond-point", PONT: "pont", PARC: "parc",
};
const PARTICLES = new Set(["de", "du", "des", "la", "le", "les", "et", "sur", "sous", "aux", "au", "a", "en"]);

/** Met en forme un nom de voie en MAJUSCULES du fichier : « CHERCHE-MIDI » devient « Cherche-Midi », « JEANNE D'ARC » devient « Jeanne d'Arc ». Les accents absents du fichier ne sont pas devinés. */
export function titleCaseVoie(text: string): string {
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  return text.toLowerCase().split(" ").filter(Boolean).map((word, index) => {
    if (index > 0 && PARTICLES.has(word)) return word;
    return word.split("-").map((part) => {
      const k = part.search(/['’]/);
      return k > 0 && k <= 2 ? part.slice(0, k + 1) + cap(part.slice(k + 1)) : cap(part);
    }).join("-");
  }).join(" ");
}

/** Clé de rue stockée dans les tuiles : « Type voie|Nom voie » tels que dans le fichier. */
export const streetKey = (typeVoie: string, nomVoie: string) => `${typeVoie.trim()}|${nomVoie.trim()}`;

/** Numéro codé dans une tuile : numéro × 10 + suffixe (1 bis, 2 ter, 3 quater). 0 = inconnu. */
export function encodeNumero(numero: string | null | undefined, complement?: string | null): number {
  const n = Number(String(numero ?? "").trim());
  if (!Number.isInteger(n) || n <= 0 || n > 9999) return 0;
  const c = norm(complement);
  return n * 10 + (c === "bis" ? 1 : c === "ter" ? 2 : c === "quater" ? 3 : 0);
}
export function decodeNumero(code: number): string {
  if (!code || code <= 0) return "";
  const n = Math.floor(code / 10), suffix = ["", " bis", " ter", " quater"][code % 10] ?? "";
  return `${n}${suffix}`;
}

/** « 61 rue du Cherche-Midi » à partir de la clé de rue et du numéro codé ; numéro omis s'il est inconnu. Chaîne vide si la rue est inconnue. */
export function formatStreet(key: string, numeroCode: number): string {
  const [typeRaw = "", nameRaw = ""] = key.split("|");
  const words = typeRaw.trim().split(" ").filter(Boolean);
  if (!words.length && !nameRaw.trim()) return "";
  const first = words[0] ?? "";
  const kind = [VOIE_TYPE[first] ?? first, ...words.slice(1).map((w) => w.toLowerCase())].join(" ");
  const joined = /['’]$/.test(kind) ? `${kind}${titleCaseVoie(nameRaw)}` : `${kind} ${titleCaseVoie(nameRaw)}`;
  const label = joined.trim();
  const number = decodeNumero(numeroCode);
  const full = number ? `${number} ${label}` : label;
  return full.charAt(0).toUpperCase() + full.slice(1);
}

/** Les quatre lignes de la fiche d'un emplacement (la source et la licence sont ajoutées par l'écran, en petit). */
export function describeParisSpot(input: {
  regime: RegimeInfo; places: number; street: string; numeroCode: number;
  /** Signalement d'utilisateur qui colore l'emplacement, sinon null. */
  report?: { status: "free" | "taken"; minutes: number; stale: boolean; example: boolean } | null;
}): { title: string; places: string; note: string | null; status: string; carsOk: boolean } {
  const street = formatStreet(input.street, input.numeroCode);
  const places = input.places > 0 ? `${input.places} ${input.places > 1 ? "places" : "place"} sur ce tronçon` : "Nombre de places non renseigné";
  const r = input.report;
  const status = !r ? "Aucun signalement récent : disponibilité inconnue"
    : `Signalé ${r.status === "free" ? "libre" : "pris"} ${r.minutes < 1 ? "à l'instant" : `il y a ${r.minutes} min`} par un utilisateur${r.stale ? " (à vérifier)" : ""}${r.example ? " · exemple" : ""}`;
  return { title: street ? `${input.regime.title} · ${street}` : input.regime.title, places, note: input.regime.note, status, carsOk: input.regime.cars === true };
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
  version: 2; source: typeof PARIS_SOURCE | Record<string, string>; attribution: string; generatedAt: string; count: number;
  /** Nombre total de places (somme de « Nombre places réelles »). */
  places: number;
  origin: { south: number; west: number }; tileDeg: number; overviewDeg: number;
  /** Nombre de tronçons (lignes du fichier) par tuile « ix_iy ». */
  tiles: Record<string, number>;
  /** Couples [Régime prioritaire, Régime particulier] du fichier, désignés par leur rang dans les tuiles. */
  regimes: Array<[string, string]>;
};

/**
 * Un tronçon (ligne du fichier) en vue détaillée, ou un total d'une cellule en vue d'ensemble (`agg`).
 * `places` = « Nombre places réelles » du tronçon (0 = non renseigné), ou total de places de la cellule.
 */
export type OfficialSpot = {
  id: string; lat: number; lng: number; t: number; places: number; agg: boolean;
  /** Rang du couple de régimes dans TileIndex.regimes (-1 = vue d'ensemble). */
  g: number;
  /** Clé de rue « Type voie|Nom voie » et numéro codé (voir encodeNumero). */
  street: string; num: number;
};
export type RawPoint = { lat: number; lng: number; t: number; places: number; g: number; street: string; num: number };
/** Contenu d'un fichier de tuile : dictionnaire de rues, puis lignes [latE5, lngE5, type, places, régime, rue, numéro]. */
export type TileFile = { v: 2; streets: string[]; rows: number[][] };

export const toE5 = (v: number) => Math.round(v * 1e5);
export const fromE5 = (v: number) => v / 1e5;

export function tileKey(lat: number, lng: number, origin: TileIndex["origin"], tileDeg: number): string {
  return `${Math.floor((lng - origin.west) / tileDeg + 1e-9)}_${Math.floor((lat - origin.south) / tileDeg + 1e-9)}`;
}

/** Répartit les points en tuiles : dictionnaire de rues + lignes compactes [latE5, lngE5, type, places, régime, rue, numéro]. */
export function bucketTiles(points: RawPoint[], origin: TileIndex["origin"], tileDeg: number): Map<string, TileFile> {
  const out = new Map<string, TileFile>();
  const dict = new Map<string, Map<string, number>>();
  for (const p of points) {
    const key = tileKey(p.lat, p.lng, origin, tileDeg);
    let file = out.get(key);
    if (!file) { file = { v: 2, streets: [], rows: [] }; out.set(key, file); dict.set(key, new Map()); }
    const streets = dict.get(key)!;
    let si = streets.get(p.street);
    if (si === undefined) { si = file.streets.length; file.streets.push(p.street); streets.set(p.street, si); }
    file.rows.push([toE5(p.lat), toE5(p.lng), p.t, p.places, p.g, si, p.num]);
  }
  return out;
}

/** Vue d'ensemble : un point par cellule et par type, avec le TOTAL DE PLACES (le regroupement côté carte additionne ces nombres). */
export function aggregateOverview(points: RawPoint[], origin: TileIndex["origin"], cellDeg: number): number[][] {
  const cells = new Map<string, { lat: number; lng: number; k: number; places: number; t: number }>();
  for (const p of points) {
    const key = `${tileKey(p.lat, p.lng, origin, cellDeg)}:${p.t}`;
    const c = cells.get(key);
    if (c) { c.lat += p.lat; c.lng += p.lng; c.k += 1; c.places += p.places; } else cells.set(key, { lat: p.lat, lng: p.lng, k: 1, places: p.places, t: p.t });
  }
  return [...cells.values()].map((c) => [toE5(c.lat / c.k), toE5(c.lng / c.k), c.places, c.t]);
}

export function decodeTile(key: string, file: TileFile): OfficialSpot[] {
  return file.rows.map((r, i) => ({ id: `${key}:${i}`, lat: fromE5(r[0]), lng: fromE5(r[1]), t: r[2], places: r[3] ?? 0, agg: false, g: r[4] ?? -1, street: file.streets[r[5]] ?? "", num: r[6] ?? 0 }));
}
export function decodeOverview(rows: number[][]): OfficialSpot[] {
  return rows.map((r, i) => ({ id: `o:${i}`, lat: fromE5(r[0]), lng: fromE5(r[1]), t: r[3], places: r[2], agg: true, g: -1, street: "", num: 0 }));
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
 * Fusion : chaque signalement actif à moins de `matchMeters` d'un emplacement officiel (tronçon réel, pas un total de la vue d'ensemble) colore cet emplacement
 * (le signalement le plus récent l'emporte si plusieurs visent le même). Les autres emplacements restent gris.
 * Retourne aussi les signalements absorbés : ils ne doivent plus être dessinés à part (sinon doublon). Un signalement
 * sans emplacement officiel proche reste une place en rue à part entière (couche « Places en rue »).
 * Jamais de vert sans signalement : la couleur vient uniquement des signalements fournis.
 */
export function mergeWithReports(officials: OfficialSpot[], reports: ReportLite[], matchMeters: number = GRID.matchMeters): { spots: ParisSpot[]; matchedReportIds: Set<number> } {
  const cell = 0.0004; // environ 44 m : le voisinage 3 x 3 couvre largement 15 m
  const grid = new Map<string, number[]>();
  officials.forEach((s, i) => {
    if (s.agg) return;
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
