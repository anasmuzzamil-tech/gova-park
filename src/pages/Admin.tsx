import { useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const utils = trpc.useUtils();
  const overview = trpc.govapark.admin.overview.useQuery(undefined, { enabled: user?.role === "admin", retry: false });
  const pending = trpc.govapark.admin.pendingListings.useQuery(undefined, { enabled: user?.role === "admin", retry: false });
  const readiness = trpc.govapark.admin.paymentReadiness.useQuery(undefined, { enabled: user?.role === "admin", retry: false });
  const usersQuery = trpc.govapark.admin.users.useQuery(undefined, { enabled: user?.role === "admin", retry: false });
  const reservationsQuery = trpc.govapark.admin.reservations.useQuery(undefined, { enabled: user?.role === "admin", retry: false });
  const reportsQuery = trpc.govapark.admin.reports.useQuery(undefined, { enabled: user?.role === "admin", retry: false });
  const closeReport = trpc.govapark.admin.closeReport.useMutation({ onSuccess: () => { toast.success("Signalement clôturé"); utils.govapark.admin.reports.invalidate(); utils.govapark.admin.overview.invalidate(); }, onError: (error) => toast.error(error.message) });
  const review = trpc.govapark.admin.reviewListing.useMutation({ onSuccess: async (_data, variables) => { toast.success(variables.decision === "approve" ? "Annonce publiée" : "Annonce mise à jour"); await Promise.all([utils.govapark.admin.overview.invalidate(), utils.govapark.admin.pendingListings.invalidate()]); }, onError: (error) => toast.error(error.message) });
  const [reasons, setReasons] = useState<Record<number, string>>({});
  if (isLoading) return <div className="page-loading">Vérification des accès…</div>;
  if (!isAuthenticated) return <section className="standard-page"><h1>Administration</h1><p>Connectez-vous avec un compte administrateur.</p></section>;
  if (user?.role !== "admin") return <section className="standard-page"><h1>Accès réservé</h1><p>Cette page est réservée à l’équipe GOVAPARK.</p></section>;
  const kpis = overview.data;
  return <section className="standard-page owner-page">
    <div className="page-header"><div><span className="eyebrow">Console interne</span><h1>Administration GOVAPARK</h1><p>Modération des annonces et suivi de la plateforme.</p></div><ShieldCheck size={34} /></div>
    <div className="revenue-grid owner-kpi-grid">
      <div><span>Utilisateurs</span><strong>{kpis?.usersTotal ?? "—"}</strong></div>
      <div><span>Annonces publiées</span><strong>{kpis?.listingsPublished ?? "—"}</strong><small>{kpis?.listingsPending ?? 0} à vérifier</small></div>
      <div><span>Réservations</span><strong>{kpis?.reservationsTotal ?? "—"}</strong><small>{kpis?.reservationsDisputed ?? 0} litiges</small></div>
      <div><span>Signalements actifs</span><strong>{kpis?.reportsActive ?? "—"}</strong></div>
    </div>
    <div className="owner-section"><div className="section-title-row"><h2>Annonces à vérifier</h2><button className="btn btn-secondary" onClick={() => pending.refetch()}><RefreshCw size={15}/>Actualiser</button></div>
      {pending.isLoading && <p>Chargement des annonces…</p>}
      {pending.data?.length === 0 && <p>Aucune annonce en attente de modération.</p>}
      {pending.data?.map((listing) => <article className="request-card" key={listing.id} style={{display:"flex",gap:16,alignItems:"flex-start",padding:"16px 0",borderBottom:"1px solid var(--border, #ddd)"}}>
        <img src={listing.photos[listing.mainPhoto] || listing.photos[0]} alt="" style={{width:112,height:84,objectFit:"cover",borderRadius:12}}/>
        <div style={{flex:1,minWidth:0}}><strong>{listing.title}</strong><p>{listing.approxAddress} · {listing.placeType}</p><p>{listing.description}</p><label>Motif (facultatif)<input value={reasons[listing.id] ?? ""} onChange={(event) => setReasons((old) => ({...old,[listing.id]:event.target.value}))} maxLength={500} /></label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}><button className="btn btn-primary" disabled={review.isPending} onClick={() => review.mutate({id:listing.id,decision:"approve"})}><CheckCircle2 size={16}/>Publier</button><button className="btn btn-secondary" disabled={review.isPending} onClick={() => review.mutate({id:listing.id,decision:"reject",reason:reasons[listing.id]})}><XCircle size={16}/>Refuser</button><button className="btn btn-ghost" disabled={review.isPending} onClick={() => review.mutate({id:listing.id,decision:"suspend",reason:reasons[listing.id]})}><AlertTriangle size={16}/>Suspendre</button></div>
        </div>
      </article>)}
    </div>
    <div className="owner-section"><h2>Signalements communautaires</h2>
      {reportsQuery.data?.filter((report) => !report.expiresAt || report.expiresAt.getTime() > Date.now()).length === 0 && <p>Aucun signalement actif.</p>}
      {reportsQuery.data?.filter((report) => !report.expiresAt || report.expiresAt.getTime() > Date.now()).map((report) => <article key={report.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"12px 0",borderBottom:"1px solid var(--border, #ddd)"}}><div><strong>{report.kind === "free" ? "Place signalée libre" : report.kind === "occupied" ? "Place occupée" : "Départ annoncé"}</strong><p>{report.address} · confiance {report.confidence}%</p></div><button className="btn btn-secondary" disabled={closeReport.isPending} onClick={() => closeReport.mutate({id:report.id})}>Clôturer</button></article>)}
    </div>
    <div className="owner-section"><h2>Réservations récentes</h2><div className="revenue-table">{reservationsQuery.data?.slice(0,30).map((reservation) => <div key={reservation.id}><span>Réservation #{reservation.id}<small>{reservation.startAt.toLocaleString("fr-FR")} · utilisateur #{reservation.userId}</small></span><span>{reservation.status}</span><strong>{(reservation.totalCents/100).toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</strong></div>)}</div></div>
    <div className="owner-section"><h2>Comptes utilisateurs récents</h2><div className="revenue-table">{usersQuery.data?.slice(0,30).map((account) => <div key={account.id}><span>{account.name || `Utilisateur #${account.id}`}<small>{account.email || "Adresse e-mail non renseignée"}</small></span><span>{account.role}</span><small>{account.createdAt.toLocaleDateString("fr-FR")}</small></div>)}</div></div>
    <div className="owner-section"><h2>Paiements marketplace</h2><div className="verification-note"><AlertTriangle size={17}/><span>{readiness.data?.reason ?? "Vérification de la configuration…"}</span></div><p>Fournisseur prévu : Stripe Connect. Les clés doivent rester côté serveur. Aucun paiement ou reversement n’est activé dans cette version.</p></div>
  </section>;
}
