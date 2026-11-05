import { useEffect, useState } from "react";
import { MapPin, Car, RefreshCw, WifiOff, ZoomIn, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { countFreeNearby, STREET_RULES } from "@contracts/street-reports";
import { VEHICLE_NAME, VEHICLE_PARK_SUFFIX, type VehicleType } from "@contracts/vehicle-types";

type PanelSpot = { status: "free" | "taken"; latitude: number; longitude: number; reportedAt: string; example: boolean };
export type StreetPanelState = "ok" | "loading" | "error" | "offline" | "zoom" | "off";

/**
 * Barre d'action « Places en rue » de l'écran d'accueil : UNE ligne = pastille du compteur + « Je libère ma place » + « Je me gare ».
 * Le nombre n'est affiché que si la donnée est réellement connue (jamais de 0 par défaut quand on ne sait pas) ;
 * un toucher sur la pastille donne la phrase complète (rayon, délai, mention « exemple », aucune garantie).
 */
/** Icône du véhicule sur « Je me gare » (le libellé complet, « Je me gare (moto) », est dans l'aria-label : il ne tient pas sur une ligne à 390 px). */
const VEHICLE_ICON: Record<VehicleType, string> = { car: "🚗", moto: "🏍️", delivery: "📦", bike: "🚲" };
export function StreetPanel({ vehicle, state, spots, reference, hasPosition, busy, busyLabel, done = null, onFree, onTaken, onRetry, onEnableLayer }: {
  /** Type de véhicule choisi : `spots` ne contient déjà que ses signalements ; il nomme le bouton « Je me gare » et le texte du compteur. */
  vehicle: VehicleType; state: StreetPanelState; spots: PanelSpot[]; reference: { lat: number; lng: number }; hasPosition: boolean;
  busy: boolean; busyLabel: string | null; /** Dernier signalement réussi (coche affichée quelques secondes sur le bouton concerné). */ done?: "free" | "taken" | null; onFree: () => void; onTaken: () => void; onRetry: () => void; onEnableLayer: () => void;
}) {
  // Horloge locale : un signalement qui passe de 5 min cesse de compter sans attendre le prochain rafraîchissement du serveur.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 10000); return () => window.clearInterval(t); }, []);
  const [last, setLast] = useState<"free" | "taken">("free");
  const known = state === "ok";
  const { count, examples } = known ? countFreeNearby(spots, reference, new Date(now)) : { count: 0, examples: 0 };
  const where = `${vehicle === "car" ? "" : `(${VEHICLE_NAME[vehicle]}) `}${hasPosition ? "près de vous" : "près du centre de la carte"}`;
  const minutes = STREET_RULES.greenMinutes;

  let pill: JSX.Element;
  if (state === "loading") {
    pill = <div className="sp-pill sp-skel" role="status" aria-label="Chargement des signalements" />;
  } else if (known) {
    const full = count === 0 ? `Aucune place libre signalée il y a moins de ${minutes} min ${where}. Vous partez ou vous cherchez ? Un signalement aide tout le monde.`
      : `${count} ${count > 1 ? "places libres signalées" : "place libre signalée"} il y a moins de ${minutes} min ${where}. Signalements d'utilisateurs : rien n'est garanti, la place a pu être prise.`
        + (examples > 0 ? (examples === count ? " Exemple de démonstration." : ` Dont ${examples} exemple${examples > 1 ? "s" : ""} de démonstration.`) : "");
    const cap = examples > 0 ? (examples === count ? "exemple" : "dont ex.") : count > 1 ? "libres" : "libre";
    pill = <button type="button" className={`sp-pill${count > 0 ? " has" : ""}`} aria-label={full} title={full} onClick={() => toast.message(full)}>
      <b key={count} className="gp-count">{count}</b><span>{cap}</span></button>;
  } else if (state === "error") {
    pill = <button type="button" className="sp-pill unknown" aria-label="Signalements indisponibles pour le moment. Réessayer." title="Signalements indisponibles pour le moment" onClick={onRetry}><RefreshCw size={17} /><span>Réessayer</span></button>;
  } else if (state === "off") {
    pill = <button type="button" className="sp-pill unknown" aria-label="La couche « Places en rue » est masquée. Afficher les places en rue." title="La couche « Places en rue » est masquée" onClick={onEnableLayer}><MapPin size={17} /><span>Masquée</span></button>;
  } else if (state === "offline") {
    const msg = "Hors ligne : les signalements ne sont pas affichés (ils changent toutes les minutes).";
    pill = <button type="button" className="sp-pill unknown" aria-label={msg} title={msg} onClick={() => toast.message(msg)}><WifiOff size={17} /><span>Hors ligne</span></button>;
  } else {
    const msg = "Zoomez sur la carte pour compter les places en rue.";
    pill = <button type="button" className="sp-pill unknown" aria-label={msg} title={msg} onClick={() => toast.message(msg)}><ZoomIn size={17} /><span>Zoomer</span></button>;
  }

  return (
    <section className="m-street-bar" aria-label="Places gratuites en rue : signaler">
      {pill}
      <button type="button" className="m-street-btn free" aria-label="Je libère ma place" disabled={busy} onClick={() => { setLast("free"); onFree(); }}>{busy && last === "free" ? <Loader2 size={18} className="gp-spin" aria-hidden="true" /> : done === "free" ? <Check size={18} className="gp-check" aria-hidden="true" /> : <MapPin size={18} />}<span>{busy && busyLabel ? busyLabel : "Je libère"}</span></button>
      <button type="button" className="m-street-btn taken" aria-label={`Je me gare${VEHICLE_PARK_SUFFIX[vehicle]}`} disabled={busy} onClick={() => { setLast("taken"); onTaken(); }}>{busy && last === "taken" ? <Loader2 size={18} className="gp-spin" aria-hidden="true" /> : done === "taken" ? <Check size={18} className="gp-check" aria-hidden="true" /> : vehicle === "car" ? <Car size={18} /> : <span aria-hidden="true">{VEHICLE_ICON[vehicle]}</span>}<span>{busy && busyLabel ? busyLabel : "Je me gare"}</span></button>
    </section>
  );
}
