// Types de véhicule (« Mon véhicule ») : voiture, moto / scooter, livraison, vélo (pas de poids lourd ni de bus : décisions d'Anas).
// Décision d'Anas : chaque signalement porte un type de véhicule ; le statut d'une place et le compteur ne tiennent compte que des signalements du même type.
// Chaque type est relié aux catégories du jeu de données de Paris déjà classées (contracts/paris-spots.ts, interpretRegime), jamais devinées :
//   voiture = payant / mixte / gratuit · moto = « 2 ROUES | Motos payant Mixte / Rotatif » · livraison = « LIVRAISON | ZL permanente / ZL périodique » · vélo = « 2 ROUES | Vélos / Vélo-cargo / Box à vélos » (et Vélib', classé « Vélos »).
// Fonctions pures, testées dans api/vehicle-types.test.ts.
import { SPOT_TYPE, mergeWithReports, type OfficialSpot, type ParisSpot, type ReportLite } from "./paris-spots.ts";

export const VEHICLE_TYPES = ["car", "moto", "delivery", "bike"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
/** Type choisi par défaut, et type des anciens signalements (colonne `vehicleType` de la migration 0017). */
export const DEFAULT_VEHICLE: VehicleType = "car";

/** Texte court des puces de la carte. */
export const VEHICLE_CHIP: Record<VehicleType, string> = { car: "Voiture", moto: "Moto", delivery: "Livraison", bike: "Vélo" };
/** Précision pour les puces et les confirmations (jamais plus qu'une étiquette). */
/** Nom court pour les confirmations (« place moto signalée libre »). */
export const VEHICLE_SHORT: Record<VehicleType, string> = { car: "voiture", moto: "moto", delivery: "livraison", bike: "vélo" };
export const VEHICLE_NAME: Record<VehicleType, string> = { car: "voiture", moto: "moto ou scooter", delivery: "zone de livraison", bike: "vélo" };
/** Texte du bouton « Je me gare » : le véhicule entre parenthèses, sauf pour la voiture (cas courant). */
export const VEHICLE_PARK_SUFFIX: Record<VehicleType, string> = { car: "", moto: " (moto)", delivery: " (livraison)", bike: " (vélo)" };

/**
 * Couleur de chaque type (décision d'Anas) : puces, regroupements et pictogrammes de la carte. Source unique : les mêmes valeurs sont les jetons CSS `--gp-v-*` de src/styles/tokens.css (test de cohérence).
 * Elles évitent exprès le vert, l'orange, le rouge et le gris, réservés aux STATUTS (contracts/parking-status.ts). Texte blanc dessus : contraste >= 4,5:1 (testé).
 * Vélo : le cyan demandé (#0891B2) n'atteint que 3,7:1 avec du texte blanc ; nuance assombrie à #0E7490 (5,4:1).
 */
export const VEHICLE_COLORS: Record<VehicleType, string> = { car: "#2563EB", moto: "#7C3AED", delivery: "#DB2777", bike: "#0E7490" };
/** « Tout » : ardoise foncée. */
export const ALL_TYPES_COLOR = "#1F2937";

/**
 * Types d'AFFICHAGE SEULEMENT (décision d'Anas) : « PMR » (places réservées GIG/GIC de la Ville de Paris) et « Électrique » (bornes de recharge).
 * Ils sont dans le sélecteur « Mon véhicule » mais ne sont PAS des types de signalement : aucun « Je libère » / « Je me gare » (VEHICLE_TYPES, l'enum du serveur et la migration restent à 4 types).
 * Couleurs distinctes des 5 ci-dessus, du violet d'accent et des statuts (écart de couleur testé) : PMR brun, Électrique fuchsia. Texte blanc dessus >= 4,5:1.
 */
export const DISPLAY_TYPES = ["pmr", "ev"] as const;
export type DisplayType = (typeof DISPLAY_TYPES)[number];
export const DISPLAY_COLORS: Record<DisplayType, string> = { pmr: "#78350F", ev: "#A21CAF" };
export const DISPLAY_CHIP: Record<DisplayType, string> = { pmr: "PMR", ev: "Électrique" };
export const isDisplayType = (v: unknown): v is DisplayType => typeof v === "string" && (DISPLAY_TYPES as readonly string[]).includes(v);

export type TypeColorKey = VehicleType | DisplayType | "all";
export const typeColor = (key: TypeColorKey): string => (key === "all" ? ALL_TYPES_COLOR : key === "pmr" || key === "ev" ? DISPLAY_COLORS[key] : VEHICLE_COLORS[key]);

/** Couleur du type d'un emplacement (voiture, moto, livraison, vélo, PMR), ou null (autocar, réservé, autre : pas de couleur de type). */
export function spotTypeColor(spotType: number): string | null {
  if (spotType === SPOT_TYPE.pmr) return DISPLAY_COLORS.pmr;
  const v = vehicleTypesForSpot(spotType)[0];
  return v ? VEHICLE_COLORS[v] : null;
}

/** « #7C3AED » -> « rgba(124, 58, 237, 0.9) ». */
export function hexToRgba(hex: string, alpha: number): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, ${alpha})`;
}

/** Codes de type d'emplacement Paris (SPOT_TYPE) propres à chaque type de véhicule. Les types sont disjoints. */
export const VEHICLE_SPOT_TYPES: Record<VehicleType, number[]> = {
  car: [SPOT_TYPE.paid, SPOT_TYPE.free],
  moto: [SPOT_TYPE.moto],
  delivery: [SPOT_TYPE.delivery],
  bike: [SPOT_TYPE.bike],
};

export const isVehicleType = (v: unknown): v is VehicleType => typeof v === "string" && (VEHICLE_TYPES as readonly string[]).includes(v);

/** Type de véhicule d'une valeur lue (stockage local, ancienne ligne) : valeur inconnue = voiture. */
export const toVehicleType = (v: unknown): VehicleType => (isVehicleType(v) ? v : DEFAULT_VEHICLE);

/** Ancienne préférence du profil (« vehicle » : car, motorcycle, van, truck, bike…) vers les types de la carte, ou null (à pied, autre : pas de choix déduit). */
export function fromProfileVehicle(v: unknown): VehicleType | null {
  switch (v) {
    case "car": return "car";
    case "motorcycle": return "moto";
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
