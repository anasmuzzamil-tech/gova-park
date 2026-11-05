// Mode hors ligne limité de Govapark.
// Périmètre : app shell + tuiles de carte déjà vues/téléchargées + dernières places chargées (statut jamais "disponible").
// Pas d'itinéraire hors ligne (voir Home.tsx : ligne droite sans guidage).
import { useEffect, useState } from "react";

export const TILE_CACHE_NAME = "govapark-tiles-v1";
const PLACES_KEY = "govapark.offline.places.v1";
const AREAS_KEY = "govapark.offline.areas.v1";
const MAX_PLACES = 300;
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/* ---------- En ligne / hors ligne ---------- */

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

/* ---------- Dernières places chargées ---------- */

export type CachedPlaces<T> = { savedAt: number; items: T[] };

export function loadPlaces<T>(): CachedPlaces<T> {
  try {
    const raw = localStorage.getItem(PLACES_KEY);
    if (!raw) return { savedAt: 0, items: [] };
    const parsed = JSON.parse(raw) as CachedPlaces<T>;
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.savedAt !== "number") return { savedAt: 0, items: [] };
    return parsed;
  } catch { return { savedAt: 0, items: [] }; }
}

/** Enregistre les places publiques (déjà nettoyées côté serveur). Les plus récentes passent devant, plafond MAX_PLACES. */
export function savePlaces<T extends { id: number }>(fresh: T[]) {
  if (!fresh.length) return;
  try {
    const previous = loadPlaces<T>().items;
    const ids = new Set(fresh.map((item) => item.id));
    let items = [...fresh, ...previous.filter((item) => !ids.has(item.id))].slice(0, MAX_PLACES);
    for (let attempt = 0; attempt < 3; attempt++) {
      try { localStorage.setItem(PLACES_KEY, JSON.stringify({ savedAt: Date.now(), items })); return; }
      catch { items = items.slice(0, Math.floor(items.length / 2)); if (!items.length) return; } // quota dépassé : on réduit
    }
  } catch { /* stockage indisponible : le mode hors ligne s'en passe */ }
}

/** Statut affiché pour une place issue du cache : toujours grise, avec la date de dernière actualisation. */
export function offlineStatus(savedAt: number, reason: "offline" | "server" = "offline") {
  const when = savedAt ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(savedAt)) : "date non enregistrée";
  return {
    color: "gray" as const,
    availability: "unknown" as const,
    label: reason === "offline" ? "Hors ligne – disponibilité non actualisée" : "Serveur injoignable – disponibilité non actualisée",
    detail: `Dernière actualisation des places : ${when}. Disponibilité non confirmée.`,
    source: null,
    updatedAt: savedAt ? new Date(savedAt).toISOString() : null,
    expiresAt: null,
    reliability: "none" as const,
    reliabilityPct: null,
    stale: true,
  };
}

/* ---------- Zones de carte téléchargées ---------- */

export type OfflineArea = { lat: number; lng: number; at: number; tiles: number; basemap: "vector" | "raster" };

export function loadAreas(): OfflineArea[] {
  try { const parsed = JSON.parse(localStorage.getItem(AREAS_KEY) || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function saveArea(area: OfflineArea) {
  try { localStorage.setItem(AREAS_KEY, JSON.stringify([area, ...loadAreas()].slice(0, 5))); } catch { /* ignoré */ }
}

const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Liste des tuiles couvrant un carré de ±radiusKm autour du centre, aux niveaux de zoom donnés. */
export function tilesFor(lat: number, lng: number, radiusKm: number, zooms: number[]) {
  const dLat = radiusKm / 111.32, dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const out: Array<{ z: number; x: number; y: number }> = [];
  for (const z of zooms) {
    const x0 = tileX(lng - dLng, z), x1 = tileX(lng + dLng, z), y0 = tileY(lat + dLat, z), y1 = tileY(lat - dLat, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

// Limites strictes : conditions d'usage des serveurs de tuiles publics (pas de téléchargement massif).
export const DOWNLOAD_LIMITS = {
  vector: { radiusKm: 3, zooms: [10, 11, 12, 13, 14], maxTiles: 60 },
  raster: { radiusKm: 1.5, zooms: [13, 14, 15], maxTiles: 50 },
};

export type DownloadProgress = { done: number; total: number };
export type DownloadResult = { requested: number; cached: number; basemap: "vector" | "raster" };

type StyleJson = { sprite?: string; glyphs?: string; sources?: Record<string, { type?: string; url?: string; tiles?: string[] }>; layers?: Array<{ layout?: { "text-font"?: unknown } }> };

async function vectorUrls(lat: number, lng: number, signal: AbortSignal) {
  const style = (await (await fetch(STYLE_URL, { signal })).json()) as StyleJson;
  const source = Object.values(style.sources ?? {}).find((s) => s.type === "vector");
  let template = source?.tiles?.[0];
  if (!template && source?.url) template = ((await (await fetch(source.url, { signal })).json()) as { tiles?: string[] }).tiles?.[0];
  if (!template) throw new Error("Source de tuiles introuvable");
  const { radiusKm, zooms, maxTiles } = DOWNLOAD_LIMITS.vector;
  const tiles = tilesFor(lat, lng, radiusKm, zooms).slice(0, maxTiles);
  const urls = tiles.map((t) => template!.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y)));
  // Compléments du style (petits fichiers) : sprites et polices pour que les libellés s'affichent hors ligne.
  const extra: string[] = [];
  if (style.sprite) for (const suffix of ["", "@2x"]) extra.push(`${style.sprite}${suffix}.json`, `${style.sprite}${suffix}.png`);
  if (style.glyphs) {
    const fonts = new Set<string>();
    for (const layer of style.layers ?? []) { const f = layer.layout?.["text-font"]; if (Array.isArray(f) && f.every((x) => typeof x === "string")) fonts.add((f as string[]).join(",")); }
    for (const font of [...fonts].slice(0, 6)) extra.push(style.glyphs.replace("{fontstack}", encodeURIComponent(font)).replace("{range}", "0-255"));
  }
  return { urls, extra, styleUrls: [STYLE_URL, ...(source?.url ? [source.url] : [])] };
}

function rasterUrls(lat: number, lng: number) {
  const { radiusKm, zooms, maxTiles } = DOWNLOAD_LIMITS.raster;
  return tilesFor(lat, lng, radiusKm, zooms).slice(0, maxTiles).map((t) => `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`);
}

/** Pré-télécharge les tuiles autour d'un point. Passe par le service worker, qui les met en cache. */
export async function downloadArea(lat: number, lng: number, basemap: "vector" | "raster", onProgress: (p: DownloadProgress) => void, signal: AbortSignal): Promise<DownloadResult> {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) throw new Error("Le mode hors ligne n'est pas encore actif sur cet appareil. Rechargez la page puis réessayez.");
  if (navigator.onLine === false) throw new Error("Connexion indisponible : le téléchargement de zone demande du réseau.");
  let urls: string[], extra: string[] = [], styleUrls: string[] = [];
  if (basemap === "vector") ({ urls, extra, styleUrls } = await vectorUrls(lat, lng, signal)); else urls = rasterUrls(lat, lng);
  const all = [...urls, ...extra];
  let done = 0;
  onProgress({ done, total: all.length });
  const queue = [...all];
  const worker = async () => {
    while (queue.length && !signal.aborted) {
      const url = queue.shift()!;
      // Une seule nouvelle tentative par tuile (le serveur public répond parfois 503), jamais davantage.
      for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
        try { const r = await fetch(url, { signal }); await r.arrayBuffer(); if (r.ok) break; } catch { if (signal.aborted) return; }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      onProgress({ done: ++done, total: all.length });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (signal.aborted) throw new Error("Téléchargement annulé");
  // Vérification réelle : on compte ce qui est vraiment présent dans le cache.
  let cached = 0;
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    for (const url of [...urls, ...styleUrls]) if (await cache.match(url)) cached++;
  } catch { /* cache indisponible */ }
  const tilesCached = Math.max(0, cached - styleUrls.length);
  if (tilesCached > 0) saveArea({ lat, lng, at: Date.now(), tiles: tilesCached, basemap });
  return { requested: urls.length, cached: tilesCached, basemap };
}

/* ---------- Distance à vol d'oiseau (itinéraire indisponible) ---------- */

export function straightLineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return (6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
