import { Navigation } from "lucide-react";
import { Modal } from "@/components/Modal";
import { STATUS_COLORS } from "@contracts/parking-status";
import { describeParisSpot, interpretRegime } from "@contracts/paris-spots";
import { vehicleTypesForSpot } from "@contracts/vehicle-types";
import { STREET_RULES, distanceMeters } from "@contracts/street-reports";

export type ParisSpotInfo = { lat: number; lng: number; t: number; places: number; regime: number; street: string; num: number; color: string; reportId: number };
export type ParisSpotReport = { status: "free" | "taken"; reportedAt: string; example: boolean };

/**
 * Fiche d'une place de Paris, en langage clair, 4 lignes au plus :
 * titre (type + rue), nombre de places, précision de régime, et une ligne de statut SEULEMENT si un utilisateur l'a signalée (place grise : aucun texte de statut).
 * La source, la licence et la mention « à titre indicatif » sont dans le panneau « i », pas ici.
 * Aucune promesse « vous pouvez vous garer » : seul le régime décide (voir interpretRegime), jamais la couleur.
 * Les boutons de signalement n'apparaissent que si le GPS de l'appareil est déjà à portée de la place ET si la place correspond à un type de véhicule (voiture, moto, utilitaire/PL, bus, vélo) : le signalement porte alors ce type.
 */
export function ParisSpotCard({ spot, regimes, report, device, extra = [], onGo, onReport, onClose }: {
  spot: ParisSpotInfo; regimes: Array<[string, string]>; report: ParisSpotReport | null; device: { lat: number; lng: number } | null;
  /** Lignes de contexte issues des couches de données (ex. « Stationnement interdit à cet endroit »), seulement si la donnée le dit. */
  extra?: string[];
  onGo: () => void; onReport: (status: "free" | "taken") => void; onClose: () => void;
}) {
  const [prio, part] = regimes[spot.regime] ?? ["", ""];
  const regime = interpretRegime(prio, part);
  const minutes = report ? Math.max(0, Math.floor((Date.now() - new Date(report.reportedAt).getTime()) / 60000)) : 0;
  const card = describeParisSpot({
    regime, places: spot.places, street: spot.street, numeroCode: spot.num,
    report: report ? { status: report.status, minutes, stale: report.status === "free" && minutes >= STREET_RULES.greenMinutes, example: report.example } : null,
  });
  const dot = report ? (STATUS_COLORS as Record<string, string>)[spot.color] ?? STATUS_COLORS.gray : STATUS_COLORS.gray;
  const near = !!device && distanceMeters(device.lat, device.lng, spot.lat, spot.lng) <= STREET_RULES.deviceMaxMeters;
  return (
    <Modal title={card.title} onClose={onClose}>
      <div className="pf">
        <p className="pf-places">{card.places}</p>
        {card.note && <p className="pf-note">{card.note}</p>}
        {extra.map((line) => <p key={line} className="pf-note">{line}</p>)}
        {card.status && <p className="pf-status"><span className="report-status-dot" style={{ background: dot }} />{card.status}</p>}
        <button className="btn btn-secondary btn-full" onClick={onGo}><Navigation size={18} />Y aller</button>
        {vehicleTypesForSpot(spot.t).length > 0 && near && <div className="pf-report">
          <button className="btn btn-secondary" onClick={() => onReport("free")}>Je libère cette place</button>
          <button className="btn btn-secondary" onClick={() => onReport("taken")}>Je m'y gare</button>
        </div>}
      </div>
    </Modal>
  );
}
