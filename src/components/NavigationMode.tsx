import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Flag, LocateFixed, Map as MapIcon, RefreshCw, RotateCw, Undo2, Volume2, VolumeX, X, CloudOff, MapPin } from "lucide-react";
import { agoText, maxMinutesFor } from "@contracts/street-reports";
import { GUIDANCE, buildPlan, formatDistance, formatDuration, formatEta, navProgress, pickAnnouncement, shouldReroute, type Direction, type NavDest, type NavRoute } from "@/lib/guidance";

const DIR_ICON: Record<Direction, typeof ArrowUp> = {
  left: CornerUpLeft, right: CornerUpRight, "slight-left": ArrowUpLeft, "slight-right": ArrowUpRight, "sharp-left": CornerUpLeft, "sharp-right": CornerUpRight,
  straight: ArrowUp, uturn: Undo2, roundabout: RotateCw, arrive: Flag, depart: ArrowUp,
};

/** Rappel affiché pendant le trajet et à l'arrivée : un signalement n'est jamais une garantie. */
export function spotReminder(dest: NavDest, nowMs: number): string | null {
  if (dest.kind === "street" && dest.reportedAt && dest.status) {
    const age = Math.max(0, Math.floor((nowMs - new Date(dest.reportedAt).getTime()) / 60000));
    const example = dest.example ? " (exemple de démonstration)" : "";
    if (age >= maxMinutesFor(dest.status)) return `Signalement de plus de ${maxMinutesFor(dest.status)} min : plus aucune information récente sur cette place${example}.`;
    return dest.status === "free"
      ? `Place signalée libre ${agoText(age)}, elle peut être prise${example}.`
      : `Place signalée prise ${agoText(age)}, l'information a peut-être changé${example}.`;
  }
  if (dest.kind === "street") return "Emplacement de voirie : disponibilité inconnue, il peut être pris.";
  if (dest.kind === "listing") return "Place privée : vérifiez sa disponibilité sur la fiche, rien n'est garanti à l'arrivée.";
  return null;
}

function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR"; u.rate = 0.97;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* voix indisponible : le guidage visuel continue */ }
}

export function NavigationMode({ route, dest, position, speedKmh, online, voiceOn, voiceSupported, onToggleVoice, follow, onToggleFollow, originNote, tracking, onRequestLocation, onStop, onReroute }: {
  route: NavRoute & { id: string }; dest: NavDest; position: { lat: number; lng: number; accuracy?: number } | null; speedKmh: number | null; online: boolean;
  voiceOn: boolean; voiceSupported: boolean; onToggleVoice: () => void; follow: boolean; onToggleFollow: () => void;
  originNote: string | null; tracking: boolean; onRequestLocation: () => void; onStop: () => void; onReroute: (position: { lat: number; lng: number }) => Promise<boolean>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [rerouting, setRerouting] = useState(false);
  const [rerouteMsg, setRerouteMsg] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const hint = useRef(0), offFixes = useRef(0), lastReroute = useRef(0), spoken = useRef(new Set<string>());
  const plan = useMemo(() => buildPlan(route), [route]);
  const progress = useMemo(() => navProgress(plan, route, position, hint.current), [plan, route, position]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(t); }, []);
  useEffect(() => { hint.current = progress.seg; }, [progress.seg]);
  // Nouvel itinéraire (recalcul) : on repart de zéro.
  useEffect(() => { hint.current = 0; offFixes.current = 0; spoken.current = new Set(); }, [route.id]);

  // Écart par rapport au tracé : recalcul après plusieurs positions consécutives hors itinéraire.
  useEffect(() => {
    if (!position || arrived) return;
    const limit = Math.max(GUIDANCE.offRouteMeters, (position.accuracy ?? 0) * 1.5);
    offFixes.current = progress.off > limit ? offFixes.current + 1 : 0;
    if (offFixes.current === 0) { setRerouteMsg(null); return; }
    if (!shouldReroute(progress.off, position.accuracy, offFixes.current, lastReroute.current, Date.now()) || rerouting) return;
    if (!online) { setRerouteMsg("Vous vous êtes écarté de l'itinéraire. Recalcul impossible hors connexion : revenez sur le tracé ou reconnectez-vous."); return; }
    lastReroute.current = Date.now(); setRerouting(true); setRerouteMsg(null);
    if (voiceOn) speak("Recalcul de l'itinéraire");
    void onReroute({ lat: position.lat, lng: position.lng }).then((ok) => { if (!ok) setRerouteMsg("Recalcul impossible pour le moment (service d'itinéraire injoignable). L'ancien tracé reste affiché."); }).finally(() => setRerouting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  // Guidage vocal (navigateur, gratuit, désactivable).
  useEffect(() => {
    if (!voiceOn || !progress.located || arrived || !progress.next) return;
    const { step, index, distance } = progress.next;
    const text = step.dir === "arrive" ? "Vous arrivez à destination" : step.instruction;
    const line = pickAnnouncement(index, text, distance, spoken.current);
    if (line) speak(line);
  }, [voiceOn, progress, arrived]);

  // Arrivée.
  useEffect(() => {
    if (arrived || !progress.arrived) return;
    setArrived(true);
    const reminder = spotReminder(dest, Date.now());
    if (voiceOn) speak(`Vous êtes arrivé. ${reminder ?? ""}`);
  }, [progress.arrived, arrived, dest, voiceOn]);

  const next = progress.next;
  const Icon = DIR_ICON[next?.step.dir ?? "straight"];
  const reminder = spotReminder(dest, now);
  const eta = formatEta(now, progress.remainingSec);

  if (arrived) {
    return <div className="nav-hud" role="dialog" aria-label="Arrivée">
      <div className="nav-arrived"><span className="nav-arrived-icon"><Flag size={34} /></span>
        <h2>Vous êtes arrivé</h2><p className="nav-dest">{dest.label}</p>
        {reminder && <p className="nav-reminder strong">{reminder}</p>}
        <button type="button" className="nav-end" onClick={onStop}>Terminer</button></div>
    </div>;
  }

  return <div className="nav-hud" aria-label="Navigation en cours">
    <div className="nav-top" role="status" aria-live="polite">
      <span className="nav-arrow" aria-hidden="true"><Icon size={46} strokeWidth={2.6} /></span>
      <div className="nav-top-text">
        {next ? <><strong className="nav-dist">{formatDistance(next.distance)}</strong><span className="nav-instr">{next.step.instruction}</span></>
          : <span className="nav-instr">Suivez l'itinéraire jusqu'à la destination</span>}
        {progress.then && next && next.step.dir !== "arrive" && <span className="nav-then">Puis : {progress.then.instruction}</span>}
      </div>
    </div>
    <div className="nav-notes">
      {!progress.located && <div className="nav-note"><MapPin size={16} /><span>{originNote ?? "Départ : centre de la carte."} Position non disponible : l'itinéraire est affiché depuis ce départ.</span>
        {!tracking && <button type="button" onClick={onRequestLocation}>Activer la position</button>}</div>}
      {rerouting && <div className="nav-note"><RefreshCw size={16} className="spinning" /><span>Recalcul de l'itinéraire…</span></div>}
      {!online && <div className="nav-note warn"><CloudOff size={16} /><span>Hors ligne : le guidage continue sur l'itinéraire déjà calculé, sans recalcul ni mise à jour.</span></div>}
      {rerouteMsg && <div className="nav-note warn" role="alert"><span>{rerouteMsg}</span></div>}
    </div>
    <div className="nav-side">
      <button type="button" className="nav-round" onClick={onToggleVoice} disabled={!voiceSupported} aria-pressed={voiceOn} aria-label={voiceOn ? "Couper le guidage vocal" : "Activer le guidage vocal"} title={voiceSupported ? undefined : "Voix indisponible sur cet appareil"}>{voiceOn ? <Volume2 size={24} /> : <VolumeX size={24} />}</button>
      <button type="button" className="nav-round" onClick={onToggleFollow} aria-pressed={follow} aria-label={follow ? "Vue d'ensemble de l'itinéraire" : "Recentrer sur ma position"}>{follow ? <MapIcon size={24} /> : <LocateFixed size={24} />}</button>
    </div>
    <div className="nav-bottom">
      {reminder && <p className="nav-reminder">{reminder}</p>}
      <div className="nav-stats">
        <div><strong>{eta}</strong><span>Arrivée</span></div>
        <div><strong>{formatDuration(progress.remainingSec)}</strong><span>Restant</span></div>
        <div><strong>{formatDistance(progress.remaining)}</strong><span>Distance</span></div>
        <div><strong>{speedKmh != null ? speedKmh : "—"}</strong><span>km/h</span></div>
        <button type="button" className="nav-stop" onClick={onStop} aria-label="Arrêter la navigation"><X size={22} /></button>
      </div>
      <small className="nav-foot">Heure d'arrivée estimée sans trafic en temps réel.</small>
    </div>
  </div>;
}
