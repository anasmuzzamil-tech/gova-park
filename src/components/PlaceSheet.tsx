import { Loader2, Navigation, X } from "lucide-react";
import { alertTone } from "@/lib/place-sheet";

export type PlaceSheetAction = { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };

/**
 * UNE SEULE fiche de place, en feuille basse, même structure pour tous les types :
 * titre (type + rue) · puces d'info (nombre de places, véhicule…) · précision · une ligne de statut seulement si signalement récent · tarif si confirmé ·
 * alertes proches en puces sobres · « Y aller » (plein) · actions secondaires (Je me gare / Je libère) seulement si la position est proche.
 * La source et la licence sont dans le panneau « i », jamais ici.
 */
export function PlaceSheet({ title, chips = [], note = null, status = null, tariff = null, alerts = [], warning = null, onGo, actions = [], onClose }: {
  title: string; chips?: string[]; note?: string | null; status?: { text: string; color: string } | null; tariff?: string | null; alerts?: string[]; warning?: string | null;
  onGo: () => void; actions?: PlaceSheetAction[]; onClose: () => void;
}) {
  return (
    <section className="gp-sheet" role="dialog" aria-label={title}>
      <i className="m-grip" aria-hidden="true" />
      <button type="button" className="gp-sheet-close" onClick={onClose} aria-label="Fermer la fiche"><X size={20} /></button>
      <h2 className="gp-sheet-title">{title}</h2>
      {(chips.length > 0 || alerts.length > 0) && <div className="gp-chips">
        {chips.map((chip) => <span key={chip} className="gp-chip-info">{chip}</span>)}
        {alerts.map((alert) => <span key={alert} className={`gp-chip-info ${alertTone(alert)}`}>{alert}</span>)}
      </div>}
      {note && <p className="gp-note">{note}</p>}
      {status && <p className="gp-status"><span className="gp-dot" style={{ background: status.color }} aria-hidden="true" />{status.text}</p>}
      {tariff && <p className="gp-tariff">{tariff}</p>}
      {warning && <p className="gp-warning">{warning}</p>}
      <button type="button" className="btn btn-primary btn-full gp-go" onClick={onGo}><Navigation size={18} />Y aller</button>
      {actions.length > 0 && <div className="gp-actions">
        {actions.map((action) => <button key={action.label} type="button" className="btn btn-secondary gp-action" disabled={action.disabled || action.busy} onClick={action.onClick}>{action.busy && <Loader2 size={16} className="gp-spin" aria-hidden="true" />}{action.label}</button>)}
      </div>}
    </section>
  );
}
