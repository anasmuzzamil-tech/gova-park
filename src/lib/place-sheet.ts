// Contenu de la fiche de place unique (même structure pour tous les types), construit à partir des données existantes. Fonctions pures, testées dans api/place-sheet.test.ts.
import { STATUS_COLORS } from "@contracts/parking-status";
import { describeParisSpot, interpretRegime } from "@contracts/paris-spots";
import { vehicleTypesForSpot } from "@contracts/vehicle-types";
import { STREET_RULES, distanceMeters } from "@contracts/street-reports";

export type ParisSpotInfo = { lat: number; lng: number; t: number; places: number; regime: number; street: string; num: number; color: string; reportId: number };
export type ParisSpotReport = { status: "free" | "taken"; reportedAt: string; example: boolean };
export type SheetContent = { title: string; places: string | null; note: string | null; status: { text: string; color: string } | null; canReport: boolean };

/** Fiche d'un emplacement officiel de Paris : titre (type + rue), nombre de places, précision de régime, une ligne de statut SEULEMENT si un utilisateur l'a signalée récemment. */
export function parisSheetContent(spot: ParisSpotInfo, regimes: Array<[string, string]>, report: ParisSpotReport | null, device: { lat: number; lng: number } | null, now: number = Date.now()): SheetContent {
  const [prio, part] = regimes[spot.regime] ?? ["", ""];
  const regime = interpretRegime(prio, part);
  const minutes = report ? Math.max(0, Math.floor((now - new Date(report.reportedAt).getTime()) / 60000)) : 0;
  const card = describeParisSpot({
    regime, places: spot.places, street: spot.street, numeroCode: spot.num,
    report: report ? { status: report.status, minutes, stale: report.status === "free" && minutes >= STREET_RULES.greenMinutes, example: report.example } : null,
  });
  const color = report ? (STATUS_COLORS as Record<string, string>)[spot.color] ?? STATUS_COLORS.gray : STATUS_COLORS.gray;
  const near = !!device && distanceMeters(device.lat, device.lng, spot.lat, spot.lng) <= STREET_RULES.deviceMaxMeters;
  return { title: card.title, places: card.places, note: card.note, status: card.status ? { text: card.status, color } : null, canReport: near && vehicleTypesForSpot(spot.t).length > 0 };
}

/** Teinte d'une puce d'alerte d'après son texte : interdiction = rouge, chantier = orange, le reste = neutre. */
export function alertTone(text: string): "red" | "orange" | "neutral" {
  return /interdit/i.test(text) ? "red" : /^chantier/i.test(text) ? "orange" : "neutral";
}
