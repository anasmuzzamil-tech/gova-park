import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CalendarDays, MapPin, Clock3, AlertCircle, RotateCcw, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useDemoMode } from "@/hooks/useDemoMode";
import { AuthGate } from "@/components/AuthGate";
import { Modal } from "@/components/Modal";
import { bookingModeLabel, euros, fullDate, statusLabel } from "@/lib/format";
import "@/styles/booking.css";

const durationLabel = (start: Date | string, end: Date | string) => {
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (!(minutes > 0)) return "—";
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  return [d ? `${d} j` : "", h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
};

type Tab = "upcoming" | "current" | "past";

export default function Reservations() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [refundId, setRefundId] = useState<number | null>(null);
  const [refundReason, setRefundReason] = useState("");
  // « Signaler un problème » : confirmation avec motif obligatoire (5 à 1000 caractères, envoyé au serveur avec la demande).
  const [disputeId, setDisputeId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const demo = useDemoMode();
  const query = trpc.govapark.reservations.mine.useQuery(undefined, { enabled: isAuthenticated });
  const utils = trpc.useUtils();
  const cancel = trpc.govapark.reservations.cancel.useMutation({ onSuccess: (result) => { toast.success(result.status === "refund_pending" ? "Annulation enregistrée, remboursement en cours" : "Réservation annulée"); setCancelId(null); utils.govapark.reservations.mine.invalidate(); }, onError: (e) => toast.error(e.message) });
  const requestRefund = trpc.govapark.reservations.requestRefund.useMutation({ onSuccess: () => { toast.success("Demande de remboursement transmise au support GOVAPARK"); setRefundId(null); setRefundReason(""); utils.govapark.reservations.mine.invalidate(); }, onError: e => toast.error(e.message) });
  const dispute = trpc.govapark.reservations.markDispute.useMutation({ onSuccess: () => { toast.success(demo ? "Litige ouvert (mode démo : support simulé)" : "Litige ouvert : l’équipe GOVAPARK va examiner votre demande"); setDisputeId(null); setDisputeReason(""); utils.govapark.reservations.mine.invalidate(); }, onError: (e) => toast.error(e.message) });
  const items = useMemo(() => query.data ?? [], [query.data]);
  const filtered = items.filter((item) => {
    const now = Date.now(), start = new Date(item.startAt).getTime(), end = new Date(item.endAt).getTime();
    const current = start <= now && end > now && ["confirmed", "in_progress"].includes(item.status);
    if (tab === "current") return current;
    if (tab === "upcoming") return !current && end > now && !["completed", "cancelled", "refunded", "dispute"].includes(item.status);
    return end <= now || ["completed", "cancelled", "refunded", "dispute"].includes(item.status);
  });

  return <div className="standard-page reservations-page">
    <div className="page-header"><span className="eyebrow">Votre espace</span><h1>Mes réservations</h1><p>Retrouvez vos créneaux, vos accès et vos remboursements.</p></div>
    {!isAuthenticated && !isLoading ? <AuthGate title="Connectez-vous pour voir vos réservations" /> : <>
      <div className="tabs" role="tablist">{([{ id: "upcoming", label: "À venir" }, { id: "current", label: "En cours" }, { id: "past", label: "Terminées" }] as const).map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}<span>{items.filter((r) => {
        const now = Date.now(), start = new Date(r.startAt).getTime(), end = new Date(r.endAt).getTime();
        return item.id === "current" ? start <= now && end > now && ["confirmed", "in_progress"].includes(r.status) : item.id === "upcoming" ? !(start <= now && end > now) && end > now && !["completed", "cancelled", "refunded", "dispute"].includes(r.status) : end <= now || ["completed", "cancelled", "refunded", "dispute"].includes(r.status);
      }).length}</span></button>)}</div>
      {query.isLoading && <div className="page-loading"><span className="loader" />Chargement…</div>}
      {!query.isLoading && filtered.length === 0 && <div className="empty-state"><CalendarDays size={28} /><h2>Aucune réservation ici</h2><p>Les places privées disponibles vous attendent sur la carte.</p><button className="btn btn-primary" onClick={() => navigate("/")}>Trouver une place</button></div>}
      <div className="reservation-list">{filtered.map((item) => {
        const effectiveStatus = item.status === "confirmed" && new Date(item.startAt).getTime() <= Date.now() && new Date(item.endAt).getTime() > Date.now() ? "in_progress" : item.status;
        const exact: string | null = "exactAddress" in item.listing ? String(item.listing.exactAddress) : null;
        const access: string = "accessInstructions" in item.listing ? String(item.listing.accessInstructions) : "";
        return <article className="reservation-card" key={item.id}>
          <img src={item.listing.photos[item.listing.mainPhoto] || item.listing.photos[0]} alt="" />
          <div className="reservation-content"><div className="reservation-title"><div><span className={`status-badge status-${effectiveStatus}`}>{effectiveStatus === "payment_pending" ? "Paiement bientôt disponible" : statusLabel(effectiveStatus)}</span> <span className="bk-res-num">Réservation n°{item.id}</span><h2>{item.listing.title}</h2></div><strong>{euros(item.totalCents)}</strong></div>
            <div className="reservation-info"><span><CalendarDays size={16} />{fullDate(item.startAt)}</span><span><Clock3 size={16} />Départ : {fullDate(item.endAt)}</span><span><MapPin size={16} />{exact ?? item.listing.approxAddress}</span></div>
            <div className="bk-res-detail"><div><span>Durée</span><strong>{durationLabel(item.startAt, item.endAt)}</strong></div><div><span>Stationnement</span><strong>{euros(item.baseCents)}</strong></div><div><span>Frais de service (8 %)</span><strong>{euros(item.feeCents)}</strong></div><div className="bk-res-total"><span>Total</span><strong>{euros(item.totalCents)}</strong></div></div>
            {item.status === "payment_pending" && <p className="bk-res-note">Votre place n’est pas confirmée : le paiement sécurisé n’est pas encore disponible. Aucun débit n’a été effectué.</p>}
            <p className="reservation-mode">{bookingModeLabel(item.listing.bookingMode)}{item.status === "pending" && item.expiresAt ? ` · expire ${new Date(item.expiresAt).toLocaleString("fr-FR")}` : ""}</p>
            {exact && <div className="access-inline"><strong>Accès révélé</strong><p>{access}</p></div>}
            <div className="reservation-actions"><button className="btn btn-ghost" onClick={() => navigate(`/place/${item.listingId}`)}>Voir l’annonce <ChevronRight size={15} /></button><button className="btn btn-ghost" onClick={() => navigate(`/messages?reservation=${item.id}`)}>Écrire au propriétaire</button>{["pending", "payment_pending", "confirmed"].includes(item.status) && <button className="btn btn-secondary" onClick={() => setCancelId(item.id)}>Annuler</button>}{["completed", "confirmed", "in_progress"].includes(item.status) && <button className="btn btn-secondary" onClick={() => { setRefundId(item.id); setRefundReason(""); }}><RotateCcw size={15}/>Demander un remboursement</button>}{["completed", "confirmed", "in_progress"].includes(item.status) && <button className="btn btn-ghost" onClick={() => { setDisputeId(item.id); setDisputeReason(""); }}><AlertCircle size={15} />Signaler un problème</button>}</div>
          </div>
        </article>;
      })}</div>
    </>}
    {refundId && <Modal title="Demander un remboursement" onClose={() => setRefundId(null)}><div className="confirmation-modal"><RotateCcw size={27}/><p>Votre demande sera examinée par l’équipe GOVAPARK. Aucun remboursement bancaire n’est déclenché automatiquement.</p><label>Motif de la demande<textarea minLength={5} maxLength={1000} required value={refundReason} onChange={e=>setRefundReason(e.target.value)} placeholder="Expliquez votre demande…"/></label><div className="modal-actions"><button className="btn btn-ghost" onClick={()=>setRefundId(null)}>Retour</button><button className="btn btn-primary" disabled={requestRefund.isPending || refundReason.trim().length<5} onClick={()=>requestRefund.mutate({reservationId:refundId,reason:refundReason})}>Envoyer la demande</button></div></div></Modal>}
    {disputeId && <Modal title="Signaler un problème" onClose={() => setDisputeId(null)}><div className="confirmation-modal"><AlertCircle size={27} /><p>Un litige sera ouvert sur la réservation n°{disputeId}{demo ? " (mode démo : support simulé)" : " et examiné par l’équipe GOVAPARK"}. Aucun remboursement n’est déclenché automatiquement.</p><label>Motif du problème<textarea minLength={5} maxLength={1000} required value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="Décrivez le problème…" /></label><div className="modal-actions"><button className="btn btn-ghost" onClick={() => setDisputeId(null)}>Retour</button><button className="btn btn-primary" disabled={dispute.isPending || disputeReason.trim().length < 5} onClick={() => dispute.mutate({ id: disputeId, reason: disputeReason.trim() })}>Ouvrir le litige</button></div></div></Modal>}
    {cancelId && <Modal title="Annuler cette réservation ?" onClose={() => setCancelId(null)}><div className="confirmation-modal"><RotateCcw size={27} />{(() => { const target = items.find((r) => r.id === cancelId); const hours = target ? (new Date(target.startAt).getTime() - Date.now()) / 3600000 : 0; return <p className="bk-cancel-rule">{hours >= 24 ? "Plus de 24 h avant l’arrivée : annulation gratuite." : "Moins de 24 h avant l’arrivée : 50 % du stationnement est remboursé (frais de service non remboursables)."} Aucun débit n’a été effectué à ce jour.</p>; })()}<p>Les conditions affichées avant la réservation s’appliquent. Pour une réservation confirmée, le statut passera à « remboursement en cours ».</p><div className="modal-actions"><button className="btn btn-ghost" onClick={() => setCancelId(null)}>Garder ma réservation</button><button className="btn btn-danger" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: cancelId })}>Confirmer l’annulation</button></div></div></Modal>}
  </div>;
}
