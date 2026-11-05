// Onglets par mode de déplacement sur l'écran de trajet : voiture, moto, livraison, vélo (les mêmes types que « Mon véhicule »).
// Fonctions pures (testées dans api/route-modes.test.ts). Aucun trafic : toutes les durées sont « sans traffic ».
//  - Voiture et livraison : même réseau routier (OSRM voiture), même durée. Moto : même réseau, pas de profil propre = estimation.
//  - Vélo : durée du service vélo SEULEMENT si un tracé vélo a déjà été calculé ; sinon estimation « à vol d'oiseau » (route-calc.ts), toujours étiquetée.
import { VEHICLE_CHIP, VEHICLE_TYPES, type VehicleType } from "@contracts/vehicle-types";
import { formatDuration } from "./route-calc";

export type ModeTab = {
  mode: VehicleType;
  label: string;
  /** Secondes, ou null si la durée n'est pas connue (rien n'est inventé). */
  durationS: number | null;
  /** Vrai quand la durée est une estimation (moto, vélo à vol d'oiseau). */
  estimate: boolean;
  /** Texte court de l'onglet : « Voiture 14 min », « Moto ≈ 14 min », « Vélo — » si non connue. */
  text: string;
  /** Explication de l'estimation, affichée sous les onglets quand l'onglet est actif (jamais pour une durée exacte du service). */
  note: string | null;
};

export type ModeInput = {
  /** Durée du réseau routier voiture (meilleure option), ou null si pas encore connue. */
  carDurationS: number | null;
  /** Durée du service vélo si un tracé vélo existe, sinon null. */
  bikeServiceDurationS: number | null;
  /** Durée « à vol d'oiseau » à 15 km/h (route-calc.straightLineEstimate), ou null si pas de trajet. */
  straightDurationS: number | null;
};

const valid = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export function modeTabs(input: ModeInput): ModeTab[] {
  return VEHICLE_TYPES.map((mode) => {
    let durationS: number | null = null, estimate = false, note: string | null = null;
    if (mode === "car" || mode === "delivery") durationS = valid(input.carDurationS) ? input.carDurationS : null;
    else if (mode === "moto") {
      durationS = valid(input.carDurationS) ? input.carDurationS : null; estimate = true;
      note = "Moto : même réseau que la voiture, estimation (aucun profil moto).";
    } else if (valid(input.bikeServiceDurationS)) durationS = input.bikeServiceDurationS;
    else if (valid(input.straightDurationS)) {
      durationS = input.straightDurationS; estimate = true;
      note = "Vélo : à vol d’oiseau, estimation (tracé vélo non calculé).";
    }
    const label = VEHICLE_CHIP[mode];
    const text = durationS === null ? `${label} —` : `${label} ${estimate ? "≈ " : ""}${formatDuration(durationS)}`;
    return { mode, label, durationS, estimate, text, note };
  });
}
