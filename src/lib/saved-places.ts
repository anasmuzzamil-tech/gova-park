// Lieux favoris nommés (« Domicile », « Travail », « + Nouveau ») et dernières destinations de la recherche d'adresse.
// 100 % local : stockage dans le navigateur de l'appareil (localStorage protégé par try/catch). Rien n'est envoyé au serveur, aucun compte n'est requis.
// Fonctions pures (testées dans api/saved-places.test.ts) : chaque fonction renvoie une NOUVELLE valeur, l'écran fait seul la lecture et l'écriture.
export type SavedKind = "home" | "work" | "custom";
export type SavedPlace = { id: string; kind: SavedKind; name: string; label: string; lat: number; lng: number };
export type RecentPlace = { label: string; subtitle?: string; lat: number; lng: number; at: number };
export type PlacesStore = { favorites: SavedPlace[]; recents: RecentPlace[] };
export type PlaceInput = { label: string; subtitle?: string; lat: number; lng: number };

export const PLACES_KEY = "govapark.places.v1";
/** Plafond des destinations récentes (les plus anciennes sortent). */
export const MAX_RECENTS = 10;
/** Plafond des favoris : Domicile + Travail + lieux nommés. */
export const MAX_FAVORITES = 12;
export const MAX_NAME = 24;
/** Deux destinations à moins de ce rayon (m) ou de même libellé sont la même entrée. */
export const SAME_RECENT_METERS = 30;
export const KIND_NAME: Record<"home" | "work", string> = { home: "Domicile", work: "Travail" };

export const EMPTY_PLACES: PlacesStore = { favorites: [], recents: [] };

const validPoint = (lat: unknown, lng: unknown): lat is number => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const cleanText = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function meters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Lecture tolérante : texte illisible, entrées mal formées ou hors plafond = ignorés, jamais d'exception. */
export function parsePlaces(raw: unknown): PlacesStore {
  let data: unknown = raw;
  if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { data = null; } }
  const out: PlacesStore = { favorites: [], recents: [] };
  if (!data || typeof data !== "object") return out;
  const { favorites, recents } = data as Record<string, unknown>;
  const seenKinds = new Set<string>();
  if (Array.isArray(favorites)) for (const f of favorites as Array<Record<string, unknown>>) {
    if (!f || typeof f !== "object" || !validPoint(f.lat, f.lng)) continue;
    const kind: SavedKind = f.kind === "home" || f.kind === "work" ? f.kind : "custom";
    if (kind !== "custom" && seenKinds.has(kind)) continue;
    seenKinds.add(kind);
    const name = kind === "custom" ? cleanText(f.name, MAX_NAME) : KIND_NAME[kind];
    const label = cleanText(f.label, 200);
    if (!name || !label) continue;
    out.favorites.push({ id: cleanText(f.id, 40) || `${kind}-${out.favorites.length}`, kind, name, label, lat: f.lat as number, lng: f.lng as number });
    if (out.favorites.length >= MAX_FAVORITES) break;
  }
  if (Array.isArray(recents)) for (const r of recents as Array<Record<string, unknown>>) {
    if (!r || typeof r !== "object" || !validPoint(r.lat, r.lng)) continue;
    const label = cleanText(r.label, 200);
    if (!label) continue;
    const subtitle = cleanText(r.subtitle, 200);
    out.recents.push({ label, ...(subtitle ? { subtitle } : {}), lat: r.lat as number, lng: r.lng as number, at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0 });
  }
  out.recents.sort((a, b) => b.at - a.at);
  out.recents = out.recents.slice(0, MAX_RECENTS);
  return out;
}

/** Ajoute une destination en tête des récents (même lieu = déplacée en tête, pas de doublon), plafonnée à MAX_RECENTS. Coordonnées invalides : inchangé. */
export function addRecent(store: PlacesStore, place: PlaceInput, now: number): PlacesStore {
  const label = cleanText(place.label, 200);
  if (!label || !validPoint(place.lat, place.lng)) return store;
  const subtitle = cleanText(place.subtitle, 200);
  const entry: RecentPlace = { label, ...(subtitle ? { subtitle } : {}), lat: place.lat, lng: place.lng, at: now };
  const others = store.recents.filter((r) => r.label.toLowerCase() !== label.toLowerCase() && meters(r.lat, r.lng, place.lat, place.lng) >= SAME_RECENT_METERS);
  return { ...store, recents: [entry, ...others].slice(0, MAX_RECENTS) };
}

/** Retire une destination récente (par position dans la liste affichée). Indice hors liste : inchangé. */
export function removeRecent(store: PlacesStore, index: number): PlacesStore {
  if (!Number.isInteger(index) || index < 0 || index >= store.recents.length) return store;
  return { ...store, recents: store.recents.filter((_, i) => i !== index) };
}

/**
 * Enregistre un favori. « home » et « work » sont uniques (remplacés) et gardent leur nom ; « custom » exige un nom non vide (24 caractères au plus) ;
 * un lieu nommé de même nom (sans tenir compte de la casse) est remplacé. Au-delà de MAX_FAVORITES, ou entrée invalide : inchangé.
 */
export function setFavorite(store: PlacesStore, kind: SavedKind, place: PlaceInput, name?: string): PlacesStore {
  const label = cleanText(place.label, 200);
  if (!label || !validPoint(place.lat, place.lng)) return store;
  const finalName = kind === "custom" ? cleanText(name, MAX_NAME) : KIND_NAME[kind];
  if (!finalName) return store;
  const kept = store.favorites.filter((f) => (kind === "custom" ? !(f.kind === "custom" && f.name.toLowerCase() === finalName.toLowerCase()) : f.kind !== kind));
  if (kept.length >= MAX_FAVORITES) return store;
  const id = kind === "custom" ? `c-${Math.round(place.lat * 1e5)}-${Math.round(place.lng * 1e5)}-${finalName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}` : kind;
  const fav: SavedPlace = { id, kind, name: finalName, label, lat: place.lat, lng: place.lng };
  // Domicile et Travail restent en tête, dans cet ordre ; les lieux nommés suivent dans l'ordre de création.
  const order = (f: SavedPlace) => (f.kind === "home" ? 0 : f.kind === "work" ? 1 : 2);
  return { ...store, favorites: [...kept, fav].sort((a, b) => order(a) - order(b)) };
}

export function removeFavorite(store: PlacesStore, id: string): PlacesStore {
  return store.favorites.some((f) => f.id === id) ? { ...store, favorites: store.favorites.filter((f) => f.id !== id) } : store;
}

export const getFavorite = (store: PlacesStore, kind: "home" | "work"): SavedPlace | null => store.favorites.find((f) => f.kind === kind) ?? null;

function safeStorage(): Storage | null { try { return window.localStorage; } catch { return null; } }
export function loadPlaces(storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : safeStorage()): PlacesStore {
  try { return parsePlaces(storage?.getItem(PLACES_KEY) ?? null); } catch { return { favorites: [], recents: [] }; }
}
/** Renvoie false si l'écriture a échoué (navigation privée, stockage plein) : l'écran fonctionne alors sans mémoire. */
export function savePlaces(store: PlacesStore, storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : safeStorage()): boolean {
  try { if (!storage) return false; storage.setItem(PLACES_KEY, JSON.stringify(store)); return true; } catch { return false; }
}
