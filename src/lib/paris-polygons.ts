// Chargement des contours des emprises de Paris (fichiers statiques produits par scripts/import-paris-polygons.mjs).
// Jamais tout d'un coup : seulement les tuiles de la zone visible, au zoom rue, avec une limite de contours dessinés.
import { POLY, decodePolygonTile, limitPolygonsNearCenter, type ParisPolygon, type PolygonIndex, type PolygonTileFile } from "@contracts/paris-polygons";
import { tilesForBounds, type Bounds } from "@contracts/paris-spots";

const BASE = "/data/paris/polygons";
export type PolygonLoad =
  | { status: "missing" }                                  // fichiers absents : l'import n'a pas été exécuté
  | { status: "error"; message: string }                   // réseau
  | { status: "ok"; polys: ParisPolygon[]; truncated: boolean };

async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${BASE}/${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  // Le serveur renvoie la page d'accueil (HTML) pour une adresse inconnue : ce n'est pas une donnée.
  if (!(response.headers.get("content-type") ?? "").includes("json")) return null;
  try { return await response.json() as T; } catch { return null; }
}

let indexPromise: Promise<PolygonIndex | null> | null = null;
const tileCache = new Map<string, ParisPolygon[]>();

function loadIndex(): Promise<PolygonIndex | null> {
  if (!indexPromise) indexPromise = getJson<PolygonIndex>("index.json").then((i) => (i && i.version === 1 && i.tiles && i.origin ? i : null)).catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

/** Contours à dessiner pour la zone visible (au plus POLY.drawLimit, les plus proches du centre). Le filtre de types est appliqué au dessin. */
export async function loadParisPolygons(bounds: Bounds, center: { lat: number; lng: number }): Promise<PolygonLoad> {
  try {
    const index = await loadIndex();
    if (!index) return { status: "missing" };
    const { keys, truncated: tooManyTiles } = tilesForBounds(bounds, index, POLY.maxTiles);
    const loaded = await Promise.all(keys.map(async (key) => {
      const hit = tileCache.get(key); if (hit) return hit;
      const file = await getJson<PolygonTileFile>(`tiles/${key}.json`); if (!file || !Array.isArray(file.rows)) throw new Error(`tuile de contours ${key} indisponible`);
      const decoded = decodePolygonTile(key, file); tileCache.set(key, decoded); return decoded;
    }));
    const limited = limitPolygonsNearCenter(loaded.flat(), center, POLY.drawLimit);
    return { status: "ok", polys: limited.polys, truncated: tooManyTiles || limited.truncated };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Chargement impossible" };
  }
}
