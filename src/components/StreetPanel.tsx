import { useEffect, useState } from "react";
import { MapPin, LocateFixed, Car, RefreshCw } from "lucide-react";
import { countFreeNearby, STREET_RULES } from "@contracts/street-reports";

type PanelSpot = { status: "free" | "taken"; latitude: number; longitude: number; reportedAt: string; example: boolean };
export type StreetPanelState = "ok" | "loading" | "error" | "offline" | "zoom" | "off";

/**
 * Panneau « Places en rue » de l'écran d'accueil : compteur honnête + accès direct aux deux signalements.
 * Le nombre n'est affiché que si la donnée est réellement connue (jamais de 0 par défaut quand on ne sait pas).
 */
export function StreetPanel({ state, spots, reference, hasPosition, busy, busyLabel, onFree, onTaken, onRetry, onEnableLayer, onLocate }: {
  state: StreetPanelState; spots: PanelSpot[]; reference: { lat: number; lng: number }; hasPosition: boolean;
  busy: boolean; busyLabel: string | null; onFree: () => void; onTaken: () => void; onRetry: () => void; onEnableLayer: () => void; onLocate: () => void;
}) {
  // Horloge locale : un signalement qui passe de 5 min cesse de compter sans attendre le prochain rafraîchissement du serveur.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 10000); return () => window.clearInterval(t); }, []);
  const known = state === "ok";
  const { count, examples } = known ? countFreeNearby(spots, reference, new Date(now)) : { count: 0, examples: 0 };
  const where = hasPosition ? "près de vous" : "près du centre de la carte";
  const minutes = STREET_RULES.greenMinutes;

  let head: JSX.Element;
  if (state === "loading") {
    head = <div className="sp-main" role="status" aria-label="Chargement des signalements"><span className="sp-num sp-skel" /><div className="sp-text"><span className="sp-skel sp-line" /><span className="sp-skel sp-line short" /></div></div>;
  } else if (known) {
    head = <div className="sp-main" role="status" aria-live="polite">
      <span className={`sp-num${count > 0 ? " has" : ""}`} aria-hidden="true">{count}</span>
      <div className="sp-text">
        <strong>{count === 0 ? `Aucune place libre signalée il y a moins de ${minutes} min ${where}`
          : `${count > 1 ? "places libres signalées" : "place libre signalée"} il y a moins de ${minutes} min ${where}`}</strong>
        <span>{count === 0 ? "Vous partez ou vous cherchez ? Un signalement aide tout le monde." : "Signalements d'utilisateurs : rien n'est garanti, la place a pu être prise."}</span>
        {count > 0 && examples > 0 && <span className="sp-example">{examples === count ? "Exemple de démonstration" : `Dont ${examples} exemple${examples > 1 ? "s" : ""} de démonstration`}</span>}
      </div>
    </div>;
  } else {
    const msg = state === "offline" ? "Hors ligne : les signalements ne sont pas affichés (ils changent toutes les minutes)."
      : state === "error" ? "Signalements indisponibles pour le moment."
      : state === "zoom" ? "Zoomez sur la carte pour compter les places en rue."
      : "La couche « Places en rue » est masquée.";
    head = <div className="sp-main" role="status"><span className="sp-num unknown" aria-hidden="true"><MapPin size={22} /></span>
      <div className="sp-text"><strong>{msg}</strong>
        {state === "error" && <button type="button" className="sp-link" onClick={onRetry}><RefreshCw size={15} />Réessayer</button>}
        {state === "off" && <button type="button" className="sp-link" onClick={onEnableLayer}>Afficher les places en rue</button>}
      </div></div>;
  }

  return (
    <section className="m-street-panel" aria-label="Places gratuites en rue">
      {head}
      {known && !hasPosition && <button type="button" className="sp-link" onClick={onLocate}><LocateFixed size={15} />Me localiser pour compter autour de moi</button>}
      <div className="m-street-bar">
        <button type="button" className="m-street-btn free" disabled={busy} onClick={onFree}><MapPin size={19} />{busy && busyLabel ? busyLabel : "Je libère ma place"}</button>
        <button type="button" className="m-street-btn taken" disabled={busy} onClick={onTaken}><Car size={19} />{busy && busyLabel ? busyLabel : "Je me gare"}</button>
      </div>
    </section>
  );
}
