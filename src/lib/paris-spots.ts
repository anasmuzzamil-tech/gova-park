// Chargement des emplacements officiels de Paris (fichiers statiques produits par scripts/import-paris-spots.mjs).
// Jamais tout d'un coup : vue d'ensemble agrégée pour la ville, tuiles visibles seulement au zoom de quartier, avec limite.
import { GRID, decodeOverview, decodeTile, displayMode, limitNearCenter, tilesForBounds, type Bounds, type OfficialSpot, type TileFile, type TileIndex } from "@contracts/paris-spots";

const BASE = "/data/paris";
export type ParisLoad =
  | { status: "missing" }                                  // fichiers absents : l'import n'a pas été exécuté
  | { status: "error"; message: string }                   // réseau
  | { status: "ok"; mode: "overview" | "detail"; spots: OfficialSpot[]; truncated: boolean; /** couples de régimes du fichier (rang = OfficialSpot.g) */ regimes: Array<[string, string]> };

async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${BASE}/${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  // Le serveur renvoie la page d'accueil (HTML) pour une adresse inconnue : ce n'est pas une donnée.
  if (!(response.headers.get("content-type") ?? "").includes("json")) return null;
  try { return await response.json() as T; } catch { return null; }
}

let indexPromise: Promise<TileIndex | null> | null = null;
let overviewCache: OfficialSpot[] | null = null;
const tileCache = new Map<string, OfficialSpot[]>();

export function loadParisIndex(): Promise<TileIndex | null> {
  if (!indexPromise) indexPromise = getJson<TileIndex>("index.json").then((i) => (i && i.version === 2 && i.tiles && i.origin && Array.isArray(i.regimes) ? i : null)).catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

/** Emplacements à dessiner pour la zone visible. `types` : codes de type à garder (vide = aucun). */
export async function loadParisSpots(bounds: Bounds, center: { lat: number; lng: number }, types: Set<number>): Promise<ParisLoad> {
  try {
    const index = await loadParisIndex();
    if (!index) return { status: "missing" };
    const mode = displayMode(bounds);
    let spots: OfficialSpot[]; let truncated = false;
    if (mode === "overview") {
      if (!overviewCache) { const rows = await getJson<number[][]>("overview.json"); if (!rows) return { status: "missing" }; overviewCache = decodeOverview(rows); }
      spots = overviewCache;
    } else {
      const { keys, truncated: tooManyTiles } = tilesForBounds(bounds, index, GRID.maxTiles);
      const loaded = await Promise.all(keys.map(async (key) => {
        const hit = tileCache.get(key); if (hit) return hit;
        const file = await getJson<TileFile>(`tiles/${key}.json`); if (!file || !Array.isArray(file.rows)) throw new Error(`tuile ${key} indisponible`);
        const decoded = decodeTile(key, file); tileCache.set(key, decoded); return decoded;
      }));
      const limited = limitNearCenter(loaded.flat().filter((s) => types.has(s.t)), center, GRID.detailLimit);
      return { status: "ok", mode, spots: limited.spots, truncated: tooManyTiles || limited.truncated, regimes: index.regimes };
    }
    return { status: "ok", mode, spots: spots.filter((s) => types.has(s.t)), truncated, regimes: index.regimes };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Chargement impossible" };
  }
}
