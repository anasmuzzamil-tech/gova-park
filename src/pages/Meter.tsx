import { useEffect, useRef, useState, type FormEvent } from "react";
import { Timer, Play, Square, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AuthGate } from "@/components/AuthGate";
import { euros, shortDate } from "@/lib/format";
import { meterCostCents } from "@contracts/meter";
import { GeolocError, getDevicePosition } from "@/lib/street";

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function Meter() {
  const { isAuthenticated, isLoading } = useAuth();
  const utils = trpc.useUtils();
  const current = trpc.govapark.meter.current.useQuery(undefined, { enabled: isAuthenticated });
  const history = trpc.govapark.meter.history.useQuery(undefined, { enabled: isAuthenticated });
  const [label, setLabel] = useState(""); const [address, setAddress] = useState(""); const [rate, setRate] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Ecart entre l'horloge du serveur et celle de l'appareil : le temps affiche suit toujours le serveur.
  const offset = useRef(0);
  useEffect(() => { if (current.data) offset.current = new Date(current.data.serverNow).getTime() - Date.now(); }, [current.data]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const refresh = () => { utils.govapark.meter.current.invalidate(); utils.govapark.meter.history.invalidate(); };
  const start = trpc.govapark.meter.start.useMutation({ onSuccess: () => { toast.success("Stationnement démarré"); refresh(); }, onError: (e) => toast.error(e.message) });
  // Fin de session : on PROPOSE de libérer la place pour les autres, jamais automatiquement.
  const [offerRelease, setOfferRelease] = useState<{ latitude: number | null; longitude: number | null } | null>(null);
  const [releaseNote, setReleaseNote] = useState<string | null>(null);
  const stop = trpc.govapark.meter.stop.useMutation({ onSuccess: (r) => { toast.success(r.totalCents != null ? `Stationnement terminé · ${euros(r.totalCents)}` : "Stationnement terminé"); setReleaseNote(null); setOfferRelease({ latitude: r.latitude ?? null, longitude: r.longitude ?? null }); refresh(); }, onError: (e) => toast.error(e.message) });
  const release = trpc.govapark.street.create.useMutation({
    onSuccess: (r) => { toast.success(r.example ? "Signalement d’exemple enregistré (mode démo)" : "Merci ! Place signalée libre pour les autres (10 min au maximum)."); setOfferRelease(null); setReleaseNote(null); },
    onError: (e) => setReleaseNote(e.message),
  });
  const confirmRelease = async () => {
    try {
      const device = await getDevicePosition();
      const place = offerRelease?.latitude != null && offerRelease?.longitude != null ? { latitude: offerRelease.latitude, longitude: offerRelease.longitude } : { latitude: device.latitude, longitude: device.longitude };
      release.mutate({ status: "free", ...place, deviceLatitude: device.latitude, deviceLongitude: device.longitude });
    } catch (e) { setReleaseNote(e instanceof GeolocError ? e.message : "Signalement impossible pour le moment."); }
  };

  if (isLoading) return <div className="standard-page">Chargement…</div>;
  if (!isAuthenticated) return <div className="standard-page"><AuthGate title="Connectez-vous pour utiliser le compteur" /></div>;

  const session = current.data?.session ?? null;
  const elapsed = session ? now + offset.current - new Date(session.startedAt).getTime() : 0;
  const cost = session ? meterCostCents(session.hourlyCents, new Date(session.startedAt), new Date(now + offset.current)) : null;
  const locate = () => {
    if (!navigator.geolocation) { toast.error("Géolocalisation indisponible sur cet appareil."); return; }
    navigator.geolocation.getCurrentPosition((p) => { setCoords({ latitude: p.coords.latitude, longitude: p.coords.longitude }); toast.success("Position enregistrée pour ce stationnement"); }, () => toast.error("Position refusée ou indisponible."), { enableHighAccuracy: true, timeout: 10000 });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const euro = rate.trim() ? Number(rate.replace(",", ".")) : 0;
    if (!Number.isFinite(euro) || euro < 0 || euro > 100) { toast.error("Tarif horaire invalide."); return; }
    start.mutate({ label: label.trim(), address: address.trim() || undefined, ...(coords ?? {}), hourlyCents: Math.round(euro * 100) });
  };

  return <div className="standard-page meter-page">
    <header className="page-header"><span className="eyebrow">Suivi de stationnement</span><h1>Compteur</h1><p>Démarrez le compteur en vous garant : la durée reste exacte même si vous fermez la page.</p></header>
    {offerRelease && !session && <section className="profile-section meter-release" role="status">
      <h2><LocateFixed size={20} /> Libérer la place pour les autres ?</h2>
      <p>Votre stationnement est terminé. Si vous quittez la place, vous pouvez la signaler libre sur la carte (vert 5 min, orange jusqu’à 10 min). Rien n’est envoyé sans votre accord ; votre position GPS doit être à moins de 50 m de la place.</p>
      {releaseNote && <p className="field-help">{releaseNote}</p>}
      <button className="btn btn-primary" disabled={release.isPending} onClick={() => void confirmRelease()}>Oui, libérer la place</button>
      <button className="btn btn-ghost" onClick={() => { setOfferRelease(null); setReleaseNote(null); }}>Non merci</button>
    </section>}
    {session ? <section className="profile-section meter-live">
      <div className="meter-clock" aria-live="off">{clock(elapsed)}</div>
      <p><b>{session.label}</b>{session.address ? ` · ${session.address}` : ""}</p>
      <p className="meter-sub">Démarré {shortDate(session.startedAt)}{session.hourlyCents ? ` · ${euros(session.hourlyCents)}/h` : " · sans tarif renseigné"}</p>
      {cost != null && <p className="meter-cost">{euros(cost)} <small>estimation au prorata de la minute</small></p>}
      <button className="btn btn-primary btn-large" disabled={stop.isPending} onClick={() => stop.mutate()}><Square size={17} />Arrêter le compteur</button>
    </section> : <section className="profile-section">
      <form className="form-stack" onSubmit={submit}>
        <label>Lieu ou nom du stationnement<input required maxLength={160} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Rue de Rivoli" /></label>
        <label>Adresse (facultatif)<input maxLength={255} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        <label>Tarif horaire en € (facultatif)<input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ex. 2,40" /><small>Sans tarif, seule la durée est suivie. Le montant affiché est une estimation, jamais un paiement.</small></label>
        <button type="button" className="btn btn-secondary" onClick={locate}><LocateFixed size={17} />{coords ? "Position enregistrée" : "Utiliser ma position"}</button>
        <button className="btn btn-primary btn-large" disabled={start.isPending}><Play size={17} />Démarrer le compteur</button>
      </form>
    </section>}
    <section className="profile-section"><h2><Timer size={20} /> Historique</h2>
      {(history.data ?? []).length === 0 ? <p>Aucun stationnement terminé pour l’instant.</p> : <div className="company-table">{(history.data ?? []).map((s) => <div key={s.id}><b>{s.label}</b><span>{s.endedAt ? clock(new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) : ""}</span><small>{shortDate(s.startedAt)}{s.totalCents != null ? ` · ${euros(s.totalCents)}` : " · sans tarif"}</small></div>)}</div>}
    </section>
  </div>;
}
