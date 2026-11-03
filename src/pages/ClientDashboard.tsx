import { CalendarDays, Heart, MapPinned, MessageCircle, UserRound } from "lucide-react";
import { Link } from "react-router";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { euros } from "@/lib/format";

export default function ClientDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const bookings = trpc.govapark.reservations.mine.useQuery(undefined, { enabled: isAuthenticated });
  const favorites = trpc.govapark.favorites.list.useQuery(undefined, { enabled: isAuthenticated });
  if (isLoading) return <div className="standard-page">Chargement…</div>;
  if (!isAuthenticated) return <div className="standard-page"><AuthGate title="Connectez-vous à votre espace conducteur" /></div>;
  const rows = bookings.data ?? [];
  return <div className="standard-page client-dashboard"><header className="page-header"><span className="eyebrow">Espace conducteur / locataire</span><h1>Bonjour {user?.name?.split(" ")[0] ?? ""}.</h1><p>Retrouvez vos réservations, vos favoris et vos services GOVAPARK.</p></header><div className="revenue-grid"><div><span>Réservations</span><strong>{rows.length}</strong><small>Toutes vos demandes</small></div><div><span>À venir</span><strong>{rows.filter(r => new Date(r.startAt).getTime() > Date.now() && !["cancelled","refunded"].includes(r.status)).length}</strong><small>Créneaux futurs</small></div><div><span>Favoris</span><strong>{favorites.data?.length ?? 0}</strong><small>Places enregistrées</small></div></div><div className="dashboard-shortcuts"><Link to="/"><MapPinned/><b>Trouver une place</b><span>Carte et prédictions</span></Link><Link to="/reservations"><CalendarDays/><b>Mes réservations</b><span>Historique et suivi</span></Link><Link to="/favoris"><Heart/><b>Mes favoris</b><span>Mes places sauvegardées</span></Link><Link to="/messages"><MessageCircle/><b>Messagerie</b><span>Échanger avec un propriétaire</span></Link><Link to="/profil"><UserRound/><b>Mon profil</b><span>Compte et alertes</span></Link></div><section className="profile-section"><h2>Dernières réservations</h2>{rows.length === 0 ? <p>Vous n'avez pas encore de réservation. Explorez la carte pour trouver votre première place.</p> : <div className="company-table">{rows.slice(0,5).map(r=><div key={r.id}><b>{r.listing.title}</b><span>{new Date(r.startAt).toLocaleString("fr-FR")}</span><small>{r.status} · {euros(r.totalCents)}</small></div>)}</div>}</section></div>;
}
