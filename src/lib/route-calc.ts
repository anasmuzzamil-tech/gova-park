// Calcul de trajet selon « Mon véhicule » : fonctions pures (distance, durée, coût, formats) et choix des serveurs d'itinéraire.
// Aucun trafic en temps réel : toutes les durées sont « sans traffic ».
import type { VehicleType } from "@contracts/vehicle-types";

export type LatLng = { lat: number; lng: number };

/** Consommation par défaut (L/100 km). Voiture et livraison : même valeur que l'ancien réglage ; moto : estimation basse. */
export const DEFAULT_CONSUMPTION: Record<VehicleType, number> = { car: 7.2, delivery: 7.2, moto: 4.5, bike: 0 };
/** Prix supposé quand aucune station n'a de prix près du trajet (affiché comme tel). */
export const DEFAULT_FUEL_PRICE_EUR_L = 1.8;
export const BIKE_SPEED_KMH = 15;
/** Une ligne droite est plus courte qu'un vrai trajet : coefficient de détour de l'estimation « à vol d'oiseau ». */
export const STRAIGHT_LINE_DETOUR = 1.3;
export const SAME_PLACE_METERS = 100;
export const NO_TRAFFIC = "sans traffic";
export const BIKE_ROUTING_HOST = "https://routing.openstreetmap.de/routed-bike";

/** Distance à vol d'oiseau en mètres (formule de Haversine, rayon moyen 6 371 km). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const isSamePlace = (a: LatLng, b: LatLng, thresholdM = SAME_PLACE_METERS) => haversineMeters(a, b) < thresholdM;

/** Durée en secondes à vitesse constante (par défaut : vélo). */
export function durationSeconds(distanceM: number, speedKmh = BIKE_SPEED_KMH): number {
  if (!(distanceM > 0) || !(speedKmh > 0)) return 0;
  return Math.round(distanceM / 1000 / speedKmh * 3600);
}

/** Durée du service vélo si elle est exploitable, sinon 15 km/h. */
export const bikeDurationSeconds = (serviceDurationS: number | undefined, distanceM: number) =>
  serviceDurationS && serviceDurationS > 0 ? serviceDurationS : durationSeconds(distanceM, BIKE_SPEED_KMH);

/** Coût du carburant en euros, arrondi au centime : km × L/100 km ÷ 100 × €/L. Vélo, valeurs invalides ou négatives : 0. */
export function fuelCostEur(distanceKm: number, litersPer100: number, priceEurPerLiter: number): number {
  if (![distanceKm, litersPer100, priceEurPerLiter].every((n) => Number.isFinite(n) && n > 0)) return 0;
  return Math.round(distanceKm * (litersPer100 / 100) * priceEurPerLiter * 100) / 100;
}

/** Coût d'un trajet selon le véhicule : vélo = 0 €, jamais d'autoroute ni de carburant. */
export function tripCostEur(vehicle: VehicleType, distanceM: number, litersPer100: number, priceEurPerLiter: number): number {
  return vehicle === "bike" ? 0 : fuelCostEur(distanceM / 1000, litersPer100, priceEurPerLiter);
}

/** Estimation « à vol d'oiseau » (secours du vélo hors service) : distance × coefficient, 15 km/h. Jamais présentée comme un vrai trajet. */
export function straightLineEstimate(a: LatLng, b: LatLng): { distanceM: number; durationS: number } {
  const distanceM = haversineMeters(a, b) * STRAIGHT_LINE_DETOUR;
  return { distanceM, durationS: durationSeconds(distanceM, BIKE_SPEED_KMH) };
}

/** Adresses à essayer, dans l'ordre. `coords` = « lng,lat;lng,lat ». Le service vélo n'est appelé que pour le profil vélo. */
export function routeEndpoints(vehicle: VehicleType, coords: string): string[] {
  if (vehicle === "bike") {
    return [`${BIKE_ROUTING_HOST}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true`];
  }
  return [
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=3`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true`,
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
  ];
}

const fr = (n: number, digits: number) => n.toFixed(digits).replace(".", ",");

/** « 850 m » sous 1 km, sinon « 10,0 km ». */
export function formatDistance(meters: number): string {
  if (!(meters > 0)) return "0 m";
  return meters < 1000 ? `${Math.round(meters)} m` : `${fr(meters / 1000, 1)} km`;
}

/** « 1 min » au minimum, « 45 min », « 1 h 05 ». */
export function formatDuration(seconds: number): string {
  if (!(seconds > 0)) return "0 min";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** « 1,17 € » ; zéro : « 0 € ». */
export function formatEuro(amount: number): string {
  if (!(amount > 0)) return "0 €";
  return `${fr(amount, 2)} €`;
}

export const PROFILE_LABEL: Record<VehicleType, string> = { car: "Voiture", moto: "Moto", delivery: "Livraison", bike: "Vélo" };

/** Texte de résumé unique du panneau de trajet : « 14 min · 5,2 km · 0,88 € · Moto · estimation · sans traffic ». */
export function summaryLine(p: { vehicle: VehicleType; distanceM: number; durationS: number; costEur: number; costAssumed?: boolean; estimate?: boolean }): string {
  const parts = [formatDuration(p.durationS), formatDistance(p.distanceM), formatEuro(p.costEur) + (p.costAssumed ? " (prix supposé)" : ""), PROFILE_LABEL[p.vehicle]];
  if (p.estimate || p.vehicle === "moto") parts.push("estimation");
  parts.push(NO_TRAFFIC);
  return parts.join(" · ");
}
