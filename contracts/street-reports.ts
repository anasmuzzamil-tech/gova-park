// Places GRATUITES EN RUE signalées par la communauté (couche « Places en rue »).
// Aucune source ouverte ne donne l'occupation par place en rue : seuls les signalements d'utilisateurs alimentent cette couche.
// Cette couche est séparée des places privées, résidences et parkings collectifs : ne jamais les mélanger.
//
// Règles de statut (décision d'Anas, remplace l'ancienne règle « un signalement utilisateur ne devient jamais vert ») :
//  - « libre » : VERT pendant 5 min, ORANGE de 5 à 10 min, puis la place disparaît de la carte.
//  - « prise »  : ROUGE pendant 10 min, puis la place disparaît.
//  - Le signalement le plus récent l'emporte ; des signalements concordants d'utilisateurs différents relèvent la fiabilité.
//  - Jamais de vert sans signalement récent : aucune DISPONIBILITÉ n'est pré-remplie. Les emplacements officiels de Paris (contracts/paris-spots.ts)
//    sont affichés en gris « statut inconnu » et ne sont colorés que par un signalement récent. Un signalement n'est jamais une vérité garantie.
// Fonctions pures, sans dépendance, partagées client/serveur et testées dans api/street-reports.test.ts.

import { STATUS_COLORS, type StatusColor } from "./parking-status";

export type StreetStatus = "free" | "taken";

export const STREET_RULES = {
  /** Un signalement « libre » est vert pendant cette durée. */
  greenMinutes: 5,
  /** Fin de vie d'un signalement « libre » (orange entre greenMinutes et cette valeur). */
  freeMaxMinutes: 10,
  /** Fin de vie d'un signalement « prise » (rouge). */
  takenMaxMinutes: 10,
  /** Distance maximale entre la place signalée et la position GPS envoyée par l'appareil. */
  deviceMaxMeters: 50,
  /** Un utilisateur ne peut signaler qu'une fois par durée donnée dans la même zone. */
  rateSeconds: 60,
  /** Rayon de la « zone » de la limite d'une fois par minute. */
  rateZoneMeters: 100,
  /** Deux signalements à moins de cette distance concernent la même place. */
  sameSpotMeters: 15,
  /** Des signalements concordants sont « rapprochés » s'ils sont à moins de cette durée du plus récent. */
  concordantWithinMinutes: 5,
  /** Rayon du compteur « places libres signalées près de vous » de l'écran d'accueil. */
  nearbyRadiusMeters: 500,
  /** Taille maximale (en degrés) de la zone demandée par la carte. */
  maxSpanDeg: 0.25,
  defaultLimit: 200,
  maxLimit: 300,
} as const;

export const STREET_SOURCE = "Signalé par un utilisateur";

export type StreetReportRow = {
  id: number;
  latitude: number;
  longitude: number;
  status: StreetStatus;
  /** Identifiant interne de l'auteur : sert uniquement à compter des auteurs distincts, jamais exposé. */
  userId: number | string | null;
  createdAt: Date | string;
  expiresAt?: Date | string | null;
};

export type StreetSpot = {
  id: number;
  latitude: number;
  longitude: number;
  status: StreetStatus;
  color: StatusColor;
  label: string;
  detail: string;
  source: string;
  reportedAt: string;
  expiresAt: string;
  ageMinutes: number;
  agoText: string;
  reliabilityPct: number;
  reliability: "good" | "medium" | "low";
  reliabilityText: string;
  /** Nombre d'utilisateurs distincts ayant signalé la même chose (le plus récent compris). */
  agreeing: number;
  /** Vrai pour tout signalement de démonstration (mode démo, sans base). */
  example: boolean;
};

export type StreetBBox = { south: number; north: number; west: number; east: number };

const minute = 60000;

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const ms = (d: Date | string) => new Date(d).getTime();

/** Texte « il y a X min » à partir d'un âge en minutes entières. */
export function agoText(ageMinutes: number): string {
  if (ageMinutes < 1) return "à l'instant";
  return `il y a ${ageMinutes} min`;
}

export function maxMinutesFor(status: StreetStatus): number {
  return status === "free" ? STREET_RULES.freeMaxMinutes : STREET_RULES.takenMaxMinutes;
}

/** Date d'expiration d'un signalement, calculée côté serveur à la création. */
export function expiresAtFor(status: StreetStatus, createdAt: Date): Date {
  return new Date(createdAt.getTime() + maxMinutesFor(status) * minute);
}

/** Un signalement est actif tant que son âge est inférieur à sa durée de vie et qu'il n'est pas daté du futur. */
export function isActive(row: Pick<StreetReportRow, "status" | "createdAt" | "expiresAt">, now: Date): boolean {
  const created = ms(row.createdAt);
  if (!Number.isFinite(created) || created > now.getTime() + minute) return false;
  if (now.getTime() - created >= maxMinutesFor(row.status) * minute) return false;
  if (row.expiresAt != null && ms(row.expiresAt) <= now.getTime()) return false;
  return true;
}

/** Groupe les signalements actifs qui concernent la même place (à moins de sameSpotMeters), du plus récent au plus ancien. */
export function clusterReports(rows: StreetReportRow[], now: Date): StreetReportRow[][] {
  const active = rows.filter((r) => isActive(r, now)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || b.id - a.id);
  const clusters: StreetReportRow[][] = [];
  for (const row of active) {
    const home = clusters.find((c) => distanceMeters(c[0].latitude, c[0].longitude, row.latitude, row.longitude) <= STREET_RULES.sameSpotMeters);
    if (home) home.push(row); else clusters.push([row]);
  }
  return clusters;
}

const authorKey = (r: StreetReportRow) => (r.userId == null ? `anon-${r.id}` : String(r.userId));

/**
 * Fiabilité d'une place (10 à 95 %) : 50 % pour un seul signalement, +15 par autre utilisateur qui dit la même chose
 * à moins de 5 min du plus récent, -20 par autre utilisateur qui dit le contraire. Le plus récent l'emporte toujours.
 */
export function clusterReliability(cluster: StreetReportRow[]): { pct: number; agreeing: number; contradicting: number } {
  const head = cluster[0];
  const headTime = ms(head.createdAt);
  const agreeAuthors = new Set<string>([authorKey(head)]);
  const againstAuthors = new Set<string>();
  for (const other of cluster.slice(1)) {
    const key = authorKey(other);
    if (other.status === head.status) {
      if (headTime - ms(other.createdAt) <= STREET_RULES.concordantWithinMinutes * minute) agreeAuthors.add(key);
    } else if (key !== authorKey(head)) {
      againstAuthors.add(key);
    }
  }
  const agreeing = agreeAuthors.size, contradicting = againstAuthors.size;
  const pct = Math.max(10, Math.min(95, 50 + 15 * (agreeing - 1) - 20 * contradicting));
  return { pct, agreeing, contradicting };
}

export function reliabilityLevel(pct: number): StreetSpot["reliability"] {
  return pct >= 70 ? "good" : pct >= 50 ? "medium" : "low";
}
const reliabilityWord = { good: "bonne", medium: "moyenne", low: "faible" } as const;

/** Statut affiché d'une place à partir de son groupe de signalements, ou null si elle a disparu. */
export function spotFromCluster(cluster: StreetReportRow[], now: Date, example = false): StreetSpot | null {
  const head = cluster[0];
  if (!head || !isActive(head, now)) return null;
  const created = ms(head.createdAt);
  const age = Math.max(0, Math.floor((now.getTime() - created) / minute));
  const rel = clusterReliability(cluster);
  const level = reliabilityLevel(rel.pct);
  let color: StatusColor, label: string, detail: string;
  if (head.status === "taken") {
    color = "red"; label = `Signalée prise ${agoText(age)}`;
    detail = "Signalement d'un utilisateur : la place était prise à ce moment-là.";
  } else if (age < STREET_RULES.greenMinutes) {
    color = "green"; label = `Signalée libre ${agoText(age)}`;
    detail = "Signalement récent d'un utilisateur : la place peut avoir été prise depuis, rien n'est garanti.";
  } else {
    color = "orange"; label = `Signalée libre ${agoText(age)}`;
    detail = "Signalement de plus de 5 min : la place a pu être prise, à vérifier sur place.";
  }
  const expires = new Date(Math.min(created + maxMinutesFor(head.status) * minute, head.expiresAt != null ? ms(head.expiresAt) : Infinity));
  return {
    id: head.id, latitude: head.latitude, longitude: head.longitude, status: head.status, color, label, detail,
    source: STREET_SOURCE, reportedAt: new Date(created).toISOString(), expiresAt: expires.toISOString(), ageMinutes: age, agoText: agoText(age),
    reliabilityPct: rel.pct, reliability: level, reliabilityText: `${reliabilityWord[level]} (${rel.pct} %)`, agreeing: rel.agreeing, example,
  };
}

/**
 * Compteur de l'écran d'accueil : places signalées LIBRES depuis moins de greenMinutes (donc vertes à l'instant `now`),
 * à moins de `radiusMeters` du point de référence. Calculé à partir de la date du signalement, pas de la couleur reçue
 * (qui peut dater de quelques secondes). Retourne 0 s'il n'y a aucun signalement : jamais de nombre inventé.
 */
export function countFreeNearby(
  spots: Array<{ status: StreetStatus; latitude: number; longitude: number; reportedAt: string; example?: boolean }>,
  ref: { lat: number; lng: number }, now: Date, radiusMeters: number = STREET_RULES.nearbyRadiusMeters,
): { count: number; examples: number } {
  let count = 0, examples = 0;
  for (const s of spots) {
    if (s.status !== "free") continue;
    const created = ms(s.reportedAt);
    if (!Number.isFinite(created) || created > now.getTime() + minute) continue;
    if (now.getTime() - created >= STREET_RULES.greenMinutes * minute) continue;
    if (distanceMeters(ref.lat, ref.lng, s.latitude, s.longitude) > radiusMeters) continue;
    count += 1; if (s.example) examples += 1;
  }
  return { count, examples };
}

export function inBBox(lat: number, lng: number, b: StreetBBox): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/** Places visibles dans une zone : signalements actifs regroupés par place, les plus récents d'abord, avec une limite. */
export function resolveStreetSpots(rows: StreetReportRow[], bbox: StreetBBox, limit: number, now: Date, example = false): StreetSpot[] {
  const cap = Math.max(1, Math.min(STREET_RULES.maxLimit, Math.floor(limit) || STREET_RULES.defaultLimit));
  return clusterReports(rows, now)
    .map((c) => spotFromCluster(c, now, example))
    .filter((s): s is StreetSpot => s !== null && inBBox(s.latitude, s.longitude, bbox))
    .slice(0, cap);
}

/** La position GPS de l'appareil doit être proche de la place signalée. */
export function checkDeviceDistance(spot: { latitude: number; longitude: number }, device: { latitude: number; longitude: number }): { ok: boolean; meters: number } {
  const meters = distanceMeters(spot.latitude, spot.longitude, device.latitude, device.longitude);
  return { ok: meters <= STREET_RULES.deviceMaxMeters, meters };
}

/** Anti-spam : un seul signalement par utilisateur, par minute et par zone (rayon rateZoneMeters). */
export function checkReportRate(recent: Array<{ latitude: number; longitude: number; createdAt: Date | string }>, candidate: { latitude: number; longitude: number }, now: Date): { ok: boolean; retryAfterSeconds: number } {
  let wait = 0;
  for (const r of recent) {
    const elapsed = (now.getTime() - ms(r.createdAt)) / 1000;
    if (elapsed < 0 || elapsed >= STREET_RULES.rateSeconds) continue;
    if (distanceMeters(r.latitude, r.longitude, candidate.latitude, candidate.longitude) <= STREET_RULES.rateZoneMeters) wait = Math.max(wait, Math.ceil(STREET_RULES.rateSeconds - elapsed));
  }
  return { ok: wait === 0, retryAfterSeconds: wait };
}

// ---------- Validation stricte des entrées (aucune dépendance : lève une Error au message français) ----------

export type StreetReportInput = { status: StreetStatus; latitude: number; longitude: number; deviceLatitude: number; deviceLongitude: number };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function coord(obj: Record<string, unknown>, key: string, min: number, max: number, name: string): number {
  const v = obj[key];
  if (!num(v) || v < min || v > max) throw new Error(`${name} invalide.`);
  return v;
}
const asObject = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Requête invalide.");
  return raw as Record<string, unknown>;
};

export function parseStreetReportInput(raw: unknown): StreetReportInput {
  const o = asObject(raw);
  const allowed = new Set(["status", "latitude", "longitude", "deviceLatitude", "deviceLongitude"]);
  if (Object.keys(o).some((k) => !allowed.has(k))) throw new Error("Champs non autorisés.");
  if (o.status !== "free" && o.status !== "taken") throw new Error("Statut invalide.");
  return {
    status: o.status,
    latitude: coord(o, "latitude", -90, 90, "Latitude"), longitude: coord(o, "longitude", -180, 180, "Longitude"),
    deviceLatitude: coord(o, "deviceLatitude", -90, 90, "Latitude de l'appareil"), deviceLongitude: coord(o, "deviceLongitude", -180, 180, "Longitude de l'appareil"),
  };
}

export type StreetListInput = StreetBBox & { limit: number };

export function parseStreetListInput(raw: unknown): StreetListInput {
  const o = asObject(raw);
  const south = coord(o, "south", -90, 90, "Zone"), north = coord(o, "north", -90, 90, "Zone");
  const west = coord(o, "west", -180, 180, "Zone"), east = coord(o, "east", -180, 180, "Zone");
  if (north <= south || east <= west) throw new Error("Zone invalide.");
  if (north - south > STREET_RULES.maxSpanDeg || east - west > STREET_RULES.maxSpanDeg) throw new Error("Zone trop grande : zoomez sur la carte.");
  let limit: number = STREET_RULES.defaultLimit;
  if (o.limit !== undefined) {
    if (!num(o.limit) || !Number.isInteger(o.limit) || o.limit < 1 || o.limit > STREET_RULES.maxLimit) throw new Error("Limite invalide.");
    limit = o.limit;
  }
  return { south, north, west, east, limit };
}

// ---------- Création d'un signalement (étapes communes à la démo et à la base réelle) ----------

export type StreetPrepared =
  | { ok: false; code: "BAD_REQUEST" | "TOO_MANY_REQUESTS"; message: string }
  | { ok: true; row: { status: StreetStatus; latitude: number; longitude: number; createdAt: Date; expiresAt: Date; reliability: number } };

/**
 * Vérifie la distance à l'appareil et la limite d'une fois par minute et par zone, puis fabrique la ligne à enregistrer
 * (dates et expiration calculées ici, côté serveur, jamais fournies par le client).
 * `authorId` : l'auteur (ses propres signalements précédents ne comptent pas comme concordants). `recentOwn` : signalements de cet utilisateur de la dernière minute. `nearby` : signalements autour de la place (pour la fiabilité).
 */
export function prepareStreetReport(
  input: StreetReportInput, authorId: number | string, recentOwn: Array<{ latitude: number; longitude: number; createdAt: Date | string }>, nearby: StreetReportRow[], now: Date,
): StreetPrepared {
  const dist = checkDeviceDistance(input, { latitude: input.deviceLatitude, longitude: input.deviceLongitude });
  if (!dist.ok) return { ok: false, code: "BAD_REQUEST", message: `Vous devez être à moins de ${STREET_RULES.deviceMaxMeters} m de la place pour la signaler (vous en êtes à environ ${Math.round(dist.meters)} m).` };
  const rate = checkReportRate(recentOwn, input, now);
  if (!rate.ok) return { ok: false, code: "TOO_MANY_REQUESTS", message: `Un seul signalement par minute dans la même zone. Réessayez dans ${rate.retryAfterSeconds} s.` };
  const draft: StreetReportRow = { id: 0, latitude: input.latitude, longitude: input.longitude, status: input.status, userId: authorId, createdAt: now };
  const cluster = clusterReports([draft, ...nearby], now).find((c) => c.some((r) => r.id === 0));
  const reliability = cluster ? clusterReliability(cluster).pct : 50;
  return { ok: true, row: { status: input.status, latitude: input.latitude, longitude: input.longitude, createdAt: now, expiresAt: expiresAtFor(input.status, now), reliability } };
}

export const STREET_COLORS = STATUS_COLORS;
