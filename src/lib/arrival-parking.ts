// Stationnement à l'arrivée d'un trajet : ce que les données de Govapark disent autour de la destination, rien d'autre.
// Sources : emplacements officiels de la Ville de Paris (nombre de places par tronçon, ODbL) et signalements récents d'utilisateurs du MÊME type de véhicule.
// Jamais de note « facile / difficile », jamais de probabilité, jamais de disponibilité déduite. Fonctions pures, testées dans api/arrival-parking.test.ts.
import { STREET_RULES } from "@contracts/street-reports";
import { VEHICLE_SPOT_TYPES, toVehicleType, type VehicleType } from "@contracts/vehicle-types";

/** Rayon autour de la destination. */
export const ARRIVAL_RADIUS_M = 200;
const MINUTE = 60000;

export type ArrivalSpot = { lat: number; lng: number; t: number; places: number; agg?: boolean };
export type ArrivalReport = { id: number; latitude: number; longitude: number; status: "free" | "taken"; reportedAt: string; example?: boolean; vehicleType?: VehicleType | string | null };
export type Point = { lat: number; lng: number };

function meters(a: Point, b: Point): number {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cadre qui contient le disque de rayon `radiusM` autour d'un point (avec une marge de 10 %). */
export function arrivalBounds(p: Point, radiusM: number = ARRIVAL_RADIUS_M) {
  const dLat = (radiusM * 1.1) / 111320, dLng = (radiusM * 1.1) / (111320 * Math.cos((p.lat * Math.PI) / 180));
  return { south: p.lat - dLat, north: p.lat + dLat, west: p.lng - dLng, east: p.lng + dLng };
}

export type StreetCount = {
  /** Somme des « Nombre places réelles » des tronçons du type de véhicule dans le rayon. */
  places: number;
  /** Tronçons trouvés dans le rayon. */
  sections: number;
  /** Tronçons dont le nombre de places n'est pas renseigné (0 dans le fichier) : le total est alors un minimum. */
  withoutCount: number;
  /** Tronçons de places payantes (voiture ou moto) : conditionne l'affichage du tarif visiteur. */
  paidSections: number;
};

/** Places en rue officielles du type de véhicule choisi, à moins de `radiusM` de la destination (vue d'ensemble agrégée exclue). */
export function countStreetPlaces(spots: ArrivalSpot[], dest: Point, vehicle: VehicleType, radiusM: number = ARRIVAL_RADIUS_M): StreetCount {
  const types = VEHICLE_SPOT_TYPES[vehicle];
  const out: StreetCount = { places: 0, sections: 0, withoutCount: 0, paidSections: 0 };
  for (const s of spots) {
    if (s.agg || !types.includes(s.t)) continue;
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng) || meters(dest, s) > radiusM) continue;
    out.sections += 1;
    if (s.places > 0) out.places += s.places; else out.withoutCount += 1;
    if (s.t === 1 || s.t === 5) out.paidSections += 1;
  }
  return out;
}

export type ArrivalReportView = { id: number; status: "free" | "taken"; color: "green" | "orange" | "red"; word: "Libre" | "Peut-être libre" | "Prise"; time: string; reportedAt: string; meters: number; example: boolean };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Signalements d'utilisateurs récents, du même type de véhicule, à moins de `radiusM` : mêmes règles de durée que partout (STREET_RULES) —
 * libre < 5 min = vert, de 5 à 10 min = orange, au-delà disparu ; prise < 10 min = rouge, au-delà disparu. Le plus récent d'abord.
 * Un signalement daté du futur (plus d'une minute) ou illisible est écarté.
 */
export function arrivalReports(reports: ArrivalReport[], dest: Point, vehicle: VehicleType, now: Date, radiusM: number = ARRIVAL_RADIUS_M): ArrivalReportView[] {
  const out: ArrivalReportView[] = [];
  for (const r of reports) {
    if (toVehicleType(r.vehicleType) !== vehicle) continue;
    const at = new Date(r.reportedAt).getTime();
    if (!Number.isFinite(at) || at > now.getTime() + MINUTE) continue;
    const away = meters(dest, { lat: r.latitude, lng: r.longitude });
    if (!(away <= radiusM)) continue;
    const age = (now.getTime() - at) / MINUTE;
    let color: ArrivalReportView["color"], word: ArrivalReportView["word"];
    if (r.status === "taken") { if (age >= STREET_RULES.takenMaxMinutes) continue; color = "red"; word = "Prise"; }
    else if (age < STREET_RULES.greenMinutes) { color = "green"; word = "Libre"; }
    else if (age < STREET_RULES.freeMaxMinutes) { color = "orange"; word = "Peut-être libre"; }
    else continue;
    out.push({ id: r.id, status: r.status, color, word, time: hhmm(new Date(at)), reportedAt: r.reportedAt, meters: Math.round(away), example: !!r.example });
  }
  return out.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
}

const NOUN: Record<VehicleType, [string, string]> = { car: ["place en rue", "places en rue"], moto: ["place moto", "places moto"], delivery: ["place de livraison", "places de livraison"], bike: ["place vélo", "places vélo"] };

/** « 142 places en rue dans 200 m », « au moins 142 places… » si des tronçons n'ont pas de nombre de places, « Aucune place en rue recensée dans 200 m ». */
export function placesSentence(count: StreetCount, vehicle: VehicleType, radiusM: number = ARRIVAL_RADIUS_M): string {
  const [one, many] = NOUN[vehicle];
  if (count.places === 0) return count.sections > 0 ? `${count.sections} ${count.sections > 1 ? "tronçons" : "tronçon"} sans nombre de places renseigné dans ${radiusM} m` : `Aucune ${one} recensée dans ${radiusM} m`;
  return `${count.withoutCount > 0 ? "au moins " : ""}${count.places} ${count.places > 1 ? many : one} dans ${radiusM} m`.replace(/^./, (c) => c.toUpperCase());
}

/** « aucun signalement récent », « 1 signalée libre à 17:40 », « 2 signalées libres, la plus récente à 17:40 », + « 1 signalée prise ». Libres = vertes et orange. */
export function reportsSentence(reports: ArrivalReportView[]): string {
  const free = reports.filter((r) => r.status === "free"), taken = reports.filter((r) => r.status === "taken");
  if (reports.length === 0) return "aucun signalement récent";
  const parts: string[] = [];
  if (free.length === 1) parts.push(`1 signalée libre à ${free[0].time}`);
  else if (free.length > 1) parts.push(`${free.length} signalées libres, la plus récente à ${free[0].time}`);
  if (taken.length === 1) parts.push(`1 signalée prise à ${taken[0].time}`);
  else if (taken.length > 1) parts.push(`${taken.length} signalées prises, la plus récente à ${taken[0].time}`);
  return parts.join(" · ");
}

/** Phrase factuelle complète. `reports` = null quand les signalements n'ont pas pu être lus (hors ligne, erreur) : la partie est omise, jamais remplacée par « aucun ». */
export function arrivalSentence(count: StreetCount, reports: ArrivalReportView[] | null, vehicle: VehicleType, radiusM: number = ARRIVAL_RADIUS_M): string {
  const first = placesSentence(count, vehicle, radiusM);
  return reports === null ? first : `${first} · ${reportsSentence(reports)}`;
}
