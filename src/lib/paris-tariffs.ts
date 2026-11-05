// Chargement des zones tarifaires de Paris (un seul petit fichier généré par scripts/import-paris-tariffs.mjs). Fichier absent ou illisible : null (aucun prix affiché).
import type { TariffFile } from "@contracts/paris-tariffs";

const URL_ZONES = "/data/paris-tariffs/zones.json";
let cached: Promise<TariffFile | null> | null = null;

export function loadTariffs(): Promise<TariffFile | null> {
  cached ??= fetch(URL_ZONES, { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null; // le serveur renvoie la page d'accueil pour une adresse inconnue
      const file = (await response.json()) as TariffFile;
      return file && file.version === 1 && Array.isArray(file.zones) && file.hourly ? file : null;
    })
    .catch(() => { cached = null; return null; });
  return cached;
}
