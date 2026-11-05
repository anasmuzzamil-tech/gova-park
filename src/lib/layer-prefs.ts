// Mémorisation des couches de la carte (feuille « Couches ») dans le navigateur de l'appareil. Rien n'est envoyé au serveur.
// localStorage peut être absent ou bloqué (navigation privée, stockage plein) : toute lecture ou écriture est protégée, l'écran fonctionne sans.
export type LayerPrefs = { street: boolean; paris: boolean; forbidden: boolean; works: boolean; zfe: boolean };
export const LAYER_DEFAULTS: LayerPrefs = { street: true, paris: true, forbidden: true, works: false, zfe: false };
export const LAYER_KEY = "govapark.layers.v1";

/** Lecture tolérante : valeurs manquantes ou mal typées = valeurs par défaut. */
export function parseLayerPrefs(raw: unknown): LayerPrefs {
  let data: unknown = raw;
  if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { data = null; } }
  const out: LayerPrefs = { ...LAYER_DEFAULTS };
  if (data && typeof data === "object") for (const k of Object.keys(LAYER_DEFAULTS) as Array<keyof LayerPrefs>) { const v = (data as Record<string, unknown>)[k]; if (typeof v === "boolean") out[k] = v; }
  return out;
}

export function loadLayerPrefs(storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : safeStorage()): LayerPrefs {
  try { return parseLayerPrefs(storage?.getItem(LAYER_KEY) ?? null); } catch { return { ...LAYER_DEFAULTS }; }
}
export function saveLayerPrefs(prefs: LayerPrefs, storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : safeStorage()): void {
  try { storage?.setItem(LAYER_KEY, JSON.stringify(prefs)); } catch { /* stockage indisponible : le choix ne sera pas mémorisé */ }
}
function safeStorage(): Storage | null { try { return window.localStorage; } catch { return null; } }
