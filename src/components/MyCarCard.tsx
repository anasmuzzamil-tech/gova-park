import { useEffect, useState } from "react";
import { BellRing, CarFront, Footprints, X } from "lucide-react";
import { durationText, parkedText, paidUntilFromClock, paidUntilFromDuration, reminderPhase, withNote, withPaidUntil, type MyCar } from "@/lib/my-car";
import { askNotifications, notificationState, type NotifState } from "@/hooks/useMyCar";

const hhmm = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const isIos = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
const DURATIONS = [30, 60, 90, 120, 180];

/**
 * Carte « Ma voiture » (une seule, utilisée sur la carte et dans le compteur) : où elle est, depuis quand, note libre,
 * rappel personnel « J'ai payé jusqu'à », « J'ai repris ma voiture ». Aucun signalement de place n'est créé ici.
 */
export function MyCarCard({ car, onChange, onGo, walk, onClose }: {
  car: MyCar;
  onChange: (car: MyCar | null) => void;
  /** Carte seulement : centre la carte sur la voiture. */
  onGo?: () => void;
  /** Texte d'estimation à pied (à vol d'oiseau), ou null si la position de l'appareil n'est pas connue. */
  walk?: string | null;
  onClose?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState(car.note);
  const [clock, setClock] = useState("");
  const [notif, setNotif] = useState<NotifState>(() => notificationState());
  const [error, setError] = useState<string | null>(null);
  // Compte à rebours : une fois par seconde quand une échéance existe, sinon par minute.
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), car.paidUntil ? 1000 : 30000); return () => window.clearInterval(t); }, [car.paidUntil]);
  useEffect(() => setNote(car.note), [car.note]);
  const phase = reminderPhase(car.paidUntil, now);
  const setPaid = (t: number | null) => { if (t == null) { setError("Heure ou durée invalide."); return; } setError(null); onChange(withPaidUntil(car, t)); };

  return <section className="mycar-card" aria-label="Ma voiture">
    <div className="mycar-head"><span className="mycar-badge" aria-hidden="true"><CarFront size={18} /></span><div><b>Ma voiture</b><span>{parkedText(car.at, now)} · {hhmm(car.at)}</span></div>
      {onClose && <button type="button" className="mycar-close" onClick={onClose} aria-label="Fermer Ma voiture"><X size={20} /></button>}</div>
    {car.approx && <p className="mycar-note">Position approximative : centre de la carte au moment de l’enregistrement (GPS absent ou moins précis que 50 m).</p>}
    {onGo && <><button type="button" className="btn btn-primary mycar-btn" onClick={onGo}><Footprints size={17} />Y aller à pied</button>
      <p className="mycar-note">{walk ?? "Touchez « Ma position » pour voir la distance."} Aucun itinéraire piéton dans GOVAPARK : estimation à vol d’oiseau.</p></>}
    <label className="mycar-field">Note (niveau, rue, place)<input maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== car.note) onChange(withNote(car, note)); }} placeholder="Ex. rue de Rivoli, devant le n° 12" /></label>

    <div className="mycar-reminder">
      <b>Rappel de fin de stationnement</b>
      {car.paidUntil && phase !== "none" ? <>
        <p className={`mycar-banner mycar-${phase}`} role="status">{phase === "over" ? `Échéance passée depuis ${durationText(now - car.paidUntil)} (${hhmm(car.paidUntil)}).` : `Payé jusqu’à ${hhmm(car.paidUntil)} · reste ${durationText(car.paidUntil - now)}`}</p>
        <button type="button" className="btn btn-ghost mycar-btn" onClick={() => onChange(withPaidUntil(car, null))}>Retirer le rappel</button>
      </> : <>
        <div className="mycar-row"><label className="mycar-field">J’ai payé jusqu’à<input type="time" value={clock} onChange={(e) => setClock(e.target.value)} /></label><button type="button" className="btn btn-secondary mycar-btn" disabled={!clock} onClick={() => setPaid(paidUntilFromClock(clock, Date.now()))}>Valider</button></div>
        <div className="mycar-durations" role="group" aria-label="Ou une durée">{DURATIONS.map((m) => <button type="button" key={m} className="m-chip mycar-btn" onClick={() => setPaid(paidUntilFromDuration(m, Date.now()))}>{durationText(m * 60000)}</button>)}</div>
        {error && <p className="mycar-note" role="alert">{error}</p>}
      </>}
      <p className="mycar-note">Rappel personnel 10 min avant et à l’échéance. GOVAPARK ne paie pas le stationnement.</p>
      {notif === "default" && <button type="button" className="btn btn-ghost mycar-btn" onClick={() => void askNotifications().then(setNotif)}><BellRing size={17} />Recevoir une notification</button>}
      {notif === "denied" && <p className="mycar-note">Notifications refusées dans le navigateur : le rappel s’affiche seulement dans l’application.</p>}
      {notif === "unsupported" && <p className="mycar-note">Notifications indisponibles ici : le rappel s’affiche seulement dans l’application.{isIos() ? " Sur iPhone, il faut ajouter GOVAPARK à l’écran d’accueil (iOS 16.4 ou plus)." : ""}</p>}
      {notif !== "unsupported" && <p className="mycar-note">Le rappel part seulement si GOVAPARK est ouvert ou encore actif en arrière-plan.{isIos() ? " Sur iPhone : appli ajoutée à l’écran d’accueil, iOS 16.4 ou plus." : ""}</p>}
    </div>
    <button type="button" className="btn btn-secondary mycar-btn" onClick={() => onChange(null)}>J’ai repris ma voiture</button>
  </section>;
}
