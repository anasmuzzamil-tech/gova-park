// Types de véhicule (« Mon véhicule ») : voiture, moto / scooter, utilitaire / poids lourd, bus / autocar, vélo.
// Décision d'Anas : chaque signalement porte un type de véhicule ; le statut d'une place et le compteur ne tiennent compte que des signalements du même type.
// Chaque type est relié aux catégories du jeu de données de Paris déjà classées (contracts/paris-spots.ts, interpretRegime), jamais devinées :
//   voiture = payant / mixte / gratuit · moto = « 2 ROUES | Motos payant Mixte / Rotatif » · bus = « AUTOCAR » · utilitaire / PL = « LIVRAISON » (zones de livraison)
//   vélo = « 2 ROUES | Vélos / Vélo-cargo / Box à vélos » (et Vélib', classé « Vélos »).
// HONNÊTETÉ : le jeu de Paris ne contient pas de stationnement poids lourd, seulement des zones de livraison et des places d'autocars.
// Fonctions pures, testées dans api/vehicle-types.test.ts.
import { SPOT_TYPE, mergeWithReports, type OfficialSpot, type ParisSpot, type ReportLite } from "./paris-spots.ts";

export const VEHICLE_TYPES = ["car", "moto", "utility", "bus", "bike"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
/** Type choisi par défaut, et type des anciens signalements (colonne `vehicleType` de la migration 0017). */
export const DEFAULT_VEHICLE: VehicleType = "car";

/** Texte court des puces de la carte. */
export const VEHICLE_CHIP: Record<VehicleType, string> = { car: "Voiture", moto: "Moto", utility: "Utilitaire/PL", bus: "Bus", bike: "Vélo" };
/** Précision pour les puces et les confirmations (jamais plus qu'une étiquette). */
/** Nom court pour les confirmations (« place moto signalée libre »). */
export const VEHICLE_SHORT: Record<VehicleType, string> = { car: "voiture", moto: "moto", utility: "utilitaire/PL", bus: "bus", bike: "vélo" };
export const VEHICLE_NAME: Record<VehicleType, string> = { car: "voiture", moto: "moto ou scooter", utility: "utilitaire ou poids lourd", bus: "bus ou autocar", bike: "vélo" };
/** Texte du bouton « Je me gare » : le véhicule entre parenthèses, sauf pour la voiture (cas courant). */
export const VEHICLE_PARK_SUFFIX: Record<VehicleType, string> = { car: "", moto: " (moto)", utility: " (PL)", bus: " (bus)", bike: " (vélo)" };

/** Codes de type d'emplacement Paris (SPOT_TYPE) propres à chaque type de véhicule. Les types sont disjoints. */
export const VEHICLE_SPOT_TYPES: Record<VehicleType, number[]> = {
  car: [SPOT_TYPE.paid, SPOT_TYPE.free],
  moto: [SPOT_TYPE.moto],
  utility: [SPOT_TYPE.delivery],
  bus: [SPOT_TYPE.coach],
  bike: [SPOT_TYPE.bike],
};

/** Note du panneau « i » : ce que les données de Paris permettent pour les poids lourds. */
export const HEAVY_VEHICLE_NOTE = "Paris publie des zones de livraison et des places d'autocars ; il n'existe pas de données de stationnement poids lourd";

export const isVehicleType = (v: unknown): v is VehicleType => typeof v === "string" && (VEHICLE_TYPES as readonly string[]).includes(v);

/** Type de véhicule d'une valeur lue (stockage local, ancienne ligne) : valeur inconnue = voiture. */
export const toVehicleType = (v: unknown): VehicleType => (isVehicleType(v) ? v : DEFAULT_VEHICLE);

/** Ancienne préférence du profil (« vehicle » : car, motorcycle, bus, van, truck, bike…) vers les types de la carte, ou null (à pied, autre : pas de choix déduit). */
export function fromProfileVehicle(v: unknown): VehicleType | null {
  switch (v) {
    case "car": return "car";
    case "motorcycle": return "moto";
    case "van": case "truck": return "utility";
    case "bus": return "bus";
    case "bike": return "bike";
    default: return null;
  }
}

/** Types de véhicule concernés par un type d'emplacement (0 ou 1 type : vide = régime autre/incertain, aucun signalement possible). */
export function vehicleTypesForSpot(spotType: number): VehicleType[] {
  return VEHICLE_TYPES.filter((v) => VEHICLE_SPOT_TYPES[v].includes(spotType));
}

/** Codes de type d'emplacement à afficher : ceux du véhicule choisi, ou tous si « Tout » est actif (`allCodes` = tous les codes connus). */
export function spotTypesToShow(vehicle: VehicleType, showAll: boolean, allCodes: number[]): Set<number> {
  return new Set(showAll ? allCodes : VEHICLE_SPOT_TYPES[vehicle]);
}

/** Signalement avec son type de véhicule (un signalement sans type est une voiture). */
export type VehicleReportLite = ReportLite & { vehicleType?: VehicleType | string | null };

/**
 * Fusion par type : un signalement ne colore que les emplacements du MÊME type de véhicule, à moins de 15 m (mergeWithReports).
 * Un signalement moto ne colore jamais une place voiture, et inversement. Les emplacements sans type de véhicule (régime autre ou incertain)
 * et les totaux de la vue d'ensemble restent gris. `matchedReportIds` = signalements absorbés par un emplacement (à ne plus dessiner à part).
 */
export function mergeByVehicle(officials: OfficialSpot[], reports: VehicleReportLite[]): { spots: ParisSpot[]; matchedReportIds: Set<number> } {
  const spots: ParisSpot[] = [], matched = new Set<number>();
  const taken = new Set<OfficialSpot>();
  for (const v of VEHICLE_TYPES) {
    const group = officials.filter((s) => !s.agg && VEHICLE_SPOT_TYPES[v].includes(s.t));
    group.forEach((s) => taken.add(s));
    const merged = mergeWithReports(group, reports.filter((r) => toVehicleType(r.vehicleType) === v));
    spots.push(...merged.spots);
    merged.matchedReportIds.forEach((id) => matched.add(id));
  }
  for (const s of officials) if (!taken.has(s)) spots.push({ ...s, color: "gray", reportId: 0 });
  return { spots, matchedReportIds: matched };
}
