// Contexte d'une fiche de place : tarif visiteur et alertes proches lus dans les couches statiques (stationnement interdit, chantiers, ZFE).
// Une ligne n'apparaît QUE si la donnée la justifie ; aucune donnée ou fichiers absents = rien (jamais « autorisé »).
import { FORBIDDEN_NEAR_METERS, forbiddenCardLine, forbiddenNear } from "@contracts/paris-forbidden";
import { WORKS_ALERT_METERS, workAlertText, worksNear } from "@contracts/paris-works";
import { tariffLineFor, pointInPolygon } from "@contracts/paris-tariffs";
import { loadLayer } from "@/lib/geo-layers";
import { loadTariffs } from "@/lib/paris-tariffs";
import { loadZfe } from "@/lib/paris-zfe";

const FORBIDDEN_BASE = "/data/paris-forbidden";
const WORKS_BASE = "/data/paris-works";
const around = (lat: number, lng: number, meters: number) => {
  const dLat = meters / 111320, dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
};

export type SpotContext = { tariff: string | null; alerts: string[] };

/** Tarif (place payante confirmée seulement) et alertes à ajouter à la fiche d'une place de Paris. Ne lève jamais d'erreur : une couche indisponible n'ajoute simplement rien. */
export async function spotContext(lat: number, lng: number, spotType: number = 0): Promise<SpotContext> {
  const out: SpotContext = { tariff: null, alerts: [] };
  try { out.tariff = tariffLineFor(await loadTariffs(), spotType, lat, lng); } catch { /* tarifs indisponibles */ }
  try {
    const result = await loadLayer(FORBIDDEN_BASE, around(lat, lng, FORBIDDEN_NEAR_METERS + 5), { lat, lng }, 500);
    if (result.status === "ok") { const hit = forbiddenNear(result.features, lat, lng); if (hit) out.alerts.push(forbiddenCardLine(hit)); }
  } catch { /* couche indisponible */ }
  try {
    const result = await loadLayer(WORKS_BASE, around(lat, lng, WORKS_ALERT_METERS + 5), { lat, lng }, 500);
    if (result.status === "ok") { const hit = worksNear(result.features, lat, lng, new Date(), WORKS_ALERT_METERS); if (hit) out.alerts.push(workAlertText(hit.props, hit.meters)); }
  } catch { /* couche indisponible */ }
  try {
    // La limite du fichier est celle de Paris : Paris est bien dans la ZFE (la ZFE métropolitaine est plus grande). Vignettes et horaires : voir l'arrêté, jamais affichés ici.
    const zfe = await loadZfe();
    if (zfe && pointInPolygon(lng, lat, [zfe.ring])) out.alerts.push("Zone à faibles émissions");
  } catch { /* couche indisponible */ }
  return out;
}
