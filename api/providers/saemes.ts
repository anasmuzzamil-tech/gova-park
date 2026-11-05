// Parkings en ouvrage de Saemes (Paris) : disponibilité temps réel, récupérée CÔTÉ SERVEUR (aucune clé, aucun appel depuis le navigateur), cache de 60 s au plus.
//
// ÉTAT : NON BRANCHÉ (non enregistré dans registry.ts) et NON TESTÉ sur la vraie source. Raisons (voir docs/DONNEES.md) :
//  - le jeu « Places disponibles parkings Saemes » (portail Opendatasoft opendata.saemes.fr, Licence Ouverte) est marqué « Archivé » sur data.gouv.fr, dernière mise à jour 21/03/2017 ;
//  - transport.data.gouv.fr ne liste AUCUNE ressource temps réel pour Saemes (seulement le fichier statique des lieux, 2026-06-23) ;
//  - l'environnement de développement ne peut pas joindre opendata.saemes.fr : les noms de champs ci-dessous sont une HYPOTHÈSE (candidats), à confirmer avec scripts/check-saemes.mjs.
// Tant que les champs ne sont pas retrouvés, `free` reste null : le parking est gris, jamais vert.
import { REALTIME_CACHE_SECONDS, type RealtimeParking, type RealtimeSource } from "@contracts/parking-realtime";

export const SAEMES_SOURCE: RealtimeSource = {
  name: "Places disponibles parkings Saemes", producer: "Saemes", license: "Licence Ouverte",
  url: "https://opendata.saemes.fr/explore/dataset/places-disponibles-parkings-saemes/",
};
/** Point d'accès Opendatasoft « Explore v2.1 » du portail (forme standard de ces portails ; à confirmer). Sans clé d'après la page data.gouv.fr du jeu. */
export const SAEMES_ENDPOINT = "https://opendata.saemes.fr/api/explore/v2.1/catalog/datasets/places-disponibles-parkings-saemes/records?limit=100";

/** Noms de champs candidats (HYPOTHÈSE) : le premier présent est utilisé. */
export const SAEMES_FIELDS = {
  id: ["id", "id_parking", "parking_id", "idparking"],
  name: ["nom_parking", "nom", "name", "parking", "libelle"],
  free: ["places_disponibles", "nb_places_libres", "places_libres", "disponible", "free", "available"],
  capacity: ["capacite", "capacite_totale", "nb_places", "places_totales", "total", "capacity"],
  time: ["horodatage", "datetime", "date_maj", "derniere_mise_a_jour", "last_update", "record_timestamp", "updated_at"],
  geo: ["geo_point_2d", "geopoint", "position", "coordonnees", "location"],
} as const;

const pick = (row: Record<string, unknown>, names: readonly string[]): unknown => { for (const n of names) if (row[n] !== undefined && row[n] !== null && row[n] !== "") return row[n]; return undefined; };
const toInt = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };
const toIso = (v: unknown): string | null => { if (v == null) return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
function toLatLng(v: unknown): { lat: number; lng: number } | null {
  let a: unknown = v;
  if (typeof a === "string") { const m = a.split(/[,;\s]+/).filter(Boolean).map(Number); a = m.length === 2 ? m : null; }
  if (Array.isArray(a) && a.length === 2 && a.every((x) => Number.isFinite(Number(x)))) return { lat: Number(a[0]), lng: Number(a[1]) };
  if (a && typeof a === "object") { const o = a as Record<string, unknown>; const lat = Number(o.lat ?? o.latitude), lng = Number(o.lon ?? o.lng ?? o.longitude); if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }; }
  return null;
}

/** Lit une réponse Opendatasoft (v2.1 : `results[]` à plat ; v1 : `records[].fields`). Une ligne sans nom ou sans position valide est ignorée ; un champ absent donne null, jamais une valeur inventée. */
export function parseSaemes(json: unknown): RealtimeParking[] {
  const root = (json ?? {}) as { results?: unknown; records?: unknown };
  const rows: Array<Record<string, unknown>> = Array.isArray(root.results) ? root.results as Array<Record<string, unknown>>
    : Array.isArray(root.records) ? (root.records as Array<{ fields?: Record<string, unknown> }>).map((r) => r.fields ?? {}) : [];
  const out: RealtimeParking[] = [];
  rows.forEach((row, i) => {
    const name = pick(row, SAEMES_FIELDS.name); const pos = toLatLng(pick(row, SAEMES_FIELDS.geo));
    if (typeof name !== "string" || !name.trim() || !pos || pos.lat < 48.7 || pos.lat > 49 || pos.lng < 2.1 || pos.lng > 2.6) return;
    out.push({ id: String(pick(row, SAEMES_FIELDS.id) ?? `saemes-${i}`), name: name.trim(), lat: pos.lat, lng: pos.lng, capacity: toInt(pick(row, SAEMES_FIELDS.capacity)), free: toInt(pick(row, SAEMES_FIELDS.free)), observedAt: toIso(pick(row, SAEMES_FIELDS.time)) });
  });
  return out;
}

let cache: { at: number; data: RealtimeParking[] } | null = null;
let inflight: Promise<RealtimeParking[]> | null = null;
/** Récupération serveur avec cache de 60 s ; une panne lève une erreur (l'appelant affiche « indisponible », jamais d'ancienne valeur présentée comme fraîche : la date de mesure fait foi). */
export async function fetchSaemes(fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<RealtimeParking[]> {
  if (cache && now - cache.at < REALTIME_CACHE_SECONDS * 1000) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const response = await fetchImpl(SAEMES_ENDPOINT, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Saemes : réponse ${response.status}`);
    const data = parseSaemes(await response.json());
    cache = { at: now, data };
    return data;
  })().finally(() => { inflight = null; });
  return inflight;
}
export const resetSaemesCache = () => { cache = null; inflight = null; };
