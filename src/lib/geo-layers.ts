// Chargement des couches géographiques statiques (stationnement interdit, chantiers, bornes de recharge) produites par scripts/import-*.mjs.
// Jamais tout d'un coup : seulement les tuiles de la zone visible, au bon zoom, avec une limite d'entités dessinées.
import { LAYER, decodeTile, layerTilesForBounds, limitFeaturesNearCenter, type DecodedFeature, type LayerIndex, type LayerTileFile } from "@contracts/geo-layers";
import type { Bounds } from "@contracts/paris-spots";

export type LayerLoad =
  | { status: "missing" }                                  // fichiers absents : l'import n'a pas été exécuté (ou serveur sans ces fichiers)
  | { status: "error"; message: string }                   // réseau
  | { status: "ok"; features: DecodedFeature[]; truncated: boolean; index: LayerIndex };

async function getJson<T>(base: string, path: string): Promise<T | null> {
  const response = await fetch(`${base}/${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  // Le serveur renvoie la page d'accueil (HTML) pour une adresse inconnue : ce n'est pas une donnée.
  if (!(response.headers.get("content-type") ?? "").includes("json")) return null;
  try { return await response.json() as T; } catch { return null; }
}

const indexes = new Map<string, Promise<LayerIndex | null>>();
const tiles = new Map<string, DecodedFeature[]>();

export function loadLayerIndex(base: string): Promise<LayerIndex | null> {
  let p = indexes.get(base);
  if (!p) {
    p = getJson<LayerIndex>(base, "index.json").then((i) => (i && i.version === 1 && i.tiles && i.origin ? i : null)).catch((e) => { indexes.delete(base); throw e; });
    indexes.set(base, p);
  }
  return p;
}

/** Entités à dessiner pour la zone visible (au plus `limit`, les plus proches du centre). Une entité répétée dans deux tuiles n'est gardée qu'une fois. */
export async function loadLayer(base: string, bounds: Bounds, center: { lat: number; lng: number }, limit: number = LAYER.drawLimit): Promise<LayerLoad> {
  try {
    const index = await loadLayerIndex(base);
    if (!index) return { status: "missing" };
    const { keys, truncated: tooManyTiles } = layerTilesForBounds(bounds, index, LAYER.maxTiles);
    const loaded = await Promise.all(keys.map(async (key) => {
      const id = `${base}/${key}`;
      const hit = tiles.get(id); if (hit) return hit;
      const file = await getJson<LayerTileFile>(base, `tiles/${key}.json`);
      if (!file || !Array.isArray(file.rows)) throw new Error(`tuile ${key} indisponible`);
      const decoded = decodeTile(file); tiles.set(id, decoded); return decoded;
    }));
    const unique = new Map<string, DecodedFeature>();
    for (const f of loaded.flat()) unique.set(f.id, f);
    const limited = limitFeaturesNearCenter([...unique.values()], center, limit);
    return { status: "ok", features: limited.list, truncated: tooManyTiles || limited.truncated, index };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Chargement impossible" };
  }
}
