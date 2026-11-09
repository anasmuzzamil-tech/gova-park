import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Navigation } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useDemoMode } from "@/hooks/useDemoMode";
import { AuthGate } from "@/components/AuthGate";
import { ago, euros, fullDate, statusLabel } from "@/lib/format";
import { loadPlaces } from "@/lib/saved-places";
import { isActive } from "@contracts/street-reports";
import { VEHICLE_CHIP, toVehicleType } from "@contracts/vehicle-types";

// Statut en clair d'une réservation : « Expirée », « En cours » et « Terminée » se déduisent des dates ; le reste vient de statusLabel.
function reservationStatus(r: { status: string; startAt: string | Date; endAt: string | Date; expiresAt?: string | Date | null }, now: number): string {
  const start = new Date(r.startAt).getTime(), end = new Date(r.endAt).getTime();
  if (r.status === "pending" && r.expiresAt && new Date(r.expiresAt).getTime() <= now) return "Expirée";
  if (r.status === "confirmed" && start <= now && end > now) return "En cours";
  if (r.status === "confirmed" && end <= now) return "Terminée";
  return statusLabel(r.status);
}

const clock = (date: string | Date) => new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function Historique() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const demo = useDemoMode();
  // Récents : lus dans le stockage de l'appareil (src/lib/saved-places.ts), visibles même sans connexion.
  const [recents] = useState(() => loadPlaces().recents);
  const reservations = trpc.govapark.reservations.mine.useQuery(undefined, { enabled: isAuthenticated });
  const reports = trpc.govapark.street.mine.useQuery(undefined, { enabled: isAuthenticated });
  const now = Date.now();
  const rows = reservations.data ?? [];
  const reportRows = reports.data?.reports ?? [];

  return <div className="standard-page hist-page">
    <div className="page-header"><span className="eyebrow">Votre espace</span><h1>Historique</h1><p>Ce que vous avez fait dans GOVAPARK.</p></div>
    {!isAuthenticated && !isLoading && <AuthGate title="Connectez-vous pour voir votre historique" />}

    <section className="hist-section" aria-labelledby="hist-res">
      <h2 id="hist-res">Réservations</h2>
      <p className="hist-help">Vos créneaux de places privées et leur statut. Les annulations et remboursements se gèrent dans Réservations.</p>
      {isAuthenticated && (reservations.isLoading ? <p className="hist-muted">Chargement…</p> : rows.length === 0 ? <div className="hist-empty"><p>Aucune réservation pour l’instant.</p><button className="btn btn-primary hist-btn" onClick={() => navigate("/")}>Trouver une place</button></div> : <ul className="hist-list">{rows.map((r) => <li key={r.id} className="hist-item">
        <div className="hist-item-line"><span className="hist-pill">{reservationStatus(r, now)}</span><span>{fullDate(r.startAt)}</span>{demo && <span className="hist-tag">exemple</span>}</div>
        <strong>{r.listing.title}</strong>
        <div className="hist-item-line"><span>{r.listing.approxAddress}</span><span>{euros(r.totalCents)}</span></div>
        <Link className="hist-link" to={`/place/${r.listingId}`}>Voir la fiche</Link>
      </li>)}</ul>)}
      {isAuthenticated && <Link className="hist-link" to="/reservations">Gérer mes réservations</Link>}
    </section>

    <section className="hist-section" aria-labelledby="hist-sig">
      <h2 id="hist-sig">Signalements</h2>
      <p className="hist-help">Les places en rue que vous avez signalées. Un signalement disparaît de la carte après 10 minutes. C’est ce que vous avez déclaré, pas une disponibilité garantie.</p>
      {isAuthenticated && (reports.isLoading ? <p className="hist-muted">Chargement…</p> : reportRows.length === 0 ? <p className="hist-muted">Aucun signalement pour l’instant.</p> : <ul className="hist-list">{reportRows.map((s) => <li key={s.id} className="hist-item">
        <div className="hist-item-line"><span className={`hist-pill ${s.status === "free" ? "hist-pill-free" : "hist-pill-taken"}`}>{s.status === "free" ? "Libre" : "Prise"}</span><span>{VEHICLE_CHIP[toVehicleType(s.vehicleType)]}</span>{s.example && <span className="hist-tag">exemple</span>}</div>
        <div className="hist-item-line"><span>Signalé par vous · {clock(s.createdAt)} ({ago(s.createdAt)})</span></div>
        <span className="hist-muted">{isActive(s, new Date(now)) ? "Encore affiché sur la carte" : "Plus affiché sur la carte"}</span>
      </li>)}</ul>)}
    </section>

    <section className="hist-section" aria-labelledby="hist-rec">
      <h2 id="hist-rec">Récents</h2>
      <p className="hist-help">Vos dernières destinations cherchées sur la carte. Enregistrées sur cet appareil seulement.</p>
      {recents.length === 0 ? <p className="hist-muted">Aucun lieu récent pour l’instant.</p> : <ul className="hist-list">{recents.map((p, i) => <li key={`${p.lat}-${p.lng}-${i}`} className="hist-item hist-item-row">
        <div><strong>{p.label}</strong>{p.subtitle && <span className="hist-muted">{p.subtitle}</span>}</div>
        <button className="btn btn-secondary hist-btn" onClick={() => navigate("/", { state: { focus: { lat: p.lat, lng: p.lng, label: p.label } } })}><Navigation size={16} />Y aller</button>
      </li>)}</ul>}
    </section>
  </div>;
}
