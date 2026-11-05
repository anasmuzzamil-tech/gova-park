// Chargement des contours des emprises de Paris (fichiers statiques produits par scripts/import-paris-polygons.mjs).
// Jamais tout d'un coup : seulement les tuiles de la zone visible, au zoom rue, avec une limite de contours dessinés.
import { POLY, decodePolygonTile, limitPolygonsNearCenter, type ParisPolygon, type PolygonIndex, type PolygonTileFile } from "@contracts/paris-polygons";
import { tilesForBounds, type Bounds } from "@contracts/paris-spots";
import type { VehicleType } from "@contracts/vehicle-types";

/** Jeu de contours : un type de véhicule, ou « pmr » (affichage seulement). */
export type PolygonGroup = VehicleType | "pmr";

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
  if (!indexPromise) indexPromise = getJson<PolygonIndex>("index.json").then((i) => (i && i.version === 2 && i.tiles && i.origin ? i : null)).catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

/** Contours à dessiner pour la zone visible (au plus POLY.drawLimit, les plus proches du centre), SEULEMENT pour les types de véhicule demandés : les fichiers des autres types ne sont jamais téléchargés. */
export async function loadParisPolygons(bounds: Bounds, center: { lat: number; lng: number }, vehicles: readonly PolygonGroup[]): Promise<PolygonLoad> {
  try {
    const index = await loadIndex();
    if (!index) return { status: "missing" };
    let tooManyTiles = false;
    const perType = await Promise.all(vehicles.map(async (vehicle) => {
      const found = tilesForBounds(bounds, { origin: index.origin, tileDeg: index.tileDeg, tiles: index.tiles[vehicle] ?? {} }, POLY.maxTiles);
      tooManyTiles ||= found.truncated;
      return Promise.all(found.keys.map(async (key) => {
        const id = `${vehicle}/${key}`;
        const hit = tileCache.get(id); if (hit) return hit;
        const file = await getJson<PolygonTileFile>(`tiles/${id}.json`); if (!file || !Array.isArray(file.rows)) throw new Error(`tuile de contours ${id} indisponible`);
        const decoded = decodePolygonTile(id, file); tileCache.set(id, decoded); return decoded;
      }));
    }));
    const loaded = perType.flat();
    const limited = limitPolygonsNearCenter(loaded.flat(), center, POLY.drawLimit);
    return { status: "ok", polys: limited.polys, truncated: tooManyTiles || limited.truncated };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Chargement impossible" };
  }
}
