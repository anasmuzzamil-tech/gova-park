// Parkings en ouvrage avec disponibilité temps réel (exploitant ou open data) : règles de statut et texte de fiche. Fonctions pures, testées dans api/parking-realtime.test.ts.
// Règle d'Anas : un parking n'est VERT que si la source donne un nombre de places libres SUPÉRIEUR À 0 et daté de MOINS DE 10 MINUTES ; sinon GRIS (jamais de vert par défaut,
// jamais de rouge déduit : « complet » n'est pas annoncé comme une certitude). Le calcul passe par resolveStatus (contracts/parking-status.ts), qui ignore les dates futures.
import { resolveStatus, type ParkingStatus, type StatusColor } from "./parking-status.ts";

export const REALTIME_MAX_AGE_MINUTES = 10;
/** Cache serveur de la source : au plus 60 s (la source change toutes les 1 à 2 minutes d'après sa description). */
export const REALTIME_CACHE_SECONDS = 60;

export type RealtimeParking = {
  id: string; name: string; lat: number; lng: number;
  /** Capacité totale si la source la donne, sinon null (jamais devinée). */
  capacity: number | null;
  /** Places libres annoncées par la source, ou null si absent / illisible. */
  free: number | null;
  /** Date ISO de la mesure, ou null si absente / illisible. */
  observedAt: string | null;
};

export type RealtimeSource = { name: string; producer: string; license: string; url: string };

const hhmm = (d: Date | string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

/** Statut d'un parking : vert seulement avec free > 0 et mesure de moins de 10 min ; sinon gris. */
export function realtimeStatus(p: Pick<RealtimeParking, "free" | "observedAt">, now: Date = new Date()): ParkingStatus {
  if (p.free == null || !Number.isFinite(p.free) || p.free <= 0 || !p.observedAt) return resolveStatus([], now);
  return resolveStatus([{ state: "free", sourceType: "operator", source: "Exploitant (open data)", observedAt: p.observedAt, validForMinutes: REALTIME_MAX_AGE_MINUTES }], now);
}
export const realtimeColor = (p: Pick<RealtimeParking, "free" | "observedAt">, now: Date = new Date()): StatusColor => realtimeStatus(p, now).color;

/** Lignes de la fiche : « Places libres : N · mis à jour à HH:MM » (si la mesure est lisible) et « Capacité : C places ». Une mesure de plus de 10 min est dite périmée, sans nombre mis en avant. */
export function realtimeLines(p: RealtimeParking, now: Date = new Date()): { free: string | null; capacity: string | null } {
  const capacity = p.capacity != null && p.capacity > 0 ? `Capacité : ${p.capacity} places` : null;
  if (p.free == null || !p.observedAt || Number.isNaN(new Date(p.observedAt).getTime())) return { free: null, capacity };
  const age = (now.getTime() - new Date(p.observedAt).getTime()) / 60000;
  if (age > REALTIME_MAX_AGE_MINUTES) return { free: `Mesure de ${hhmm(p.observedAt)} trop ancienne pour être affichée`, capacity };
  return { free: `Places libres : ${p.free} · mis à jour à ${hhmm(p.observedAt)}`, capacity };
}
