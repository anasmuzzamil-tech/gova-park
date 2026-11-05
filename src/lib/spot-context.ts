// Lignes de contexte d'une fiche de place : informations des couches statiques (stationnement interdit) lues autour de la place.
// Une ligne n'apparaît QUE si la donnée la justifie ; aucune donnée ou fichiers absents = aucune ligne (jamais « autorisé »).
import { FORBIDDEN_NEAR_METERS, forbiddenCardLine, forbiddenNear } from "@contracts/paris-forbidden";
import { loadLayer } from "@/lib/geo-layers";

const FORBIDDEN_BASE = "/data/paris-forbidden";
const around = (lat: number, lng: number, meters: number) => {
  const dLat = meters / 111320, dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
};

/** Lignes à ajouter à la fiche d'une place de Paris. Ne lève jamais d'erreur : une couche indisponible n'ajoute simplement aucune ligne. */
export async function spotContextLines(lat: number, lng: number): Promise<string[]> {
  const lines: string[] = [];
  try {
    const result = await loadLayer(FORBIDDEN_BASE, around(lat, lng, FORBIDDEN_NEAR_METERS + 5), { lat, lng }, 500);
    if (result.status === "ok") {
      const hit = forbiddenNear(result.features, lat, lng);
      if (hit) lines.push(forbiddenCardLine(hit));
    }
  } catch { /* couche indisponible : pas de ligne */ }
  return lines;
}
