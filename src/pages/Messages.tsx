import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { MessageCircle, Send, Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AuthGate } from "@/components/AuthGate";
import { fullDate } from "@/lib/format";

export default function Messages() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState("");
  const threads = trpc.govapark.messaging.threads.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 30000 });
  const notices = trpc.govapark.messaging.notifications.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 30000 });
  const items = useMemo(() => threads.data ?? [], [threads.data]);
  const selectedId = Number(params.get("reservation")) || items[0]?.reservationId || 0;
  const messages = trpc.govapark.messaging.messages.useQuery({ reservationId: selectedId }, { enabled: isAuthenticated && selectedId > 0, refetchInterval: 10000 });
  const utils = trpc.useUtils();
  const send = trpc.govapark.messaging.send.useMutation({ onSuccess: () => { setDraft(""); utils.govapark.messaging.messages.invalidate({ reservationId: selectedId }); utils.govapark.messaging.notifications.invalidate(); }, onError: (error) => toast.error(error.message) });
  const markRead = trpc.govapark.messaging.markNotificationRead.useMutation({ onSuccess: () => utils.govapark.messaging.notifications.invalidate() });
  useEffect(() => { if (!params.get("reservation") && items[0]) setParams({ reservation: String(items[0].reservationId) }, { replace: true }); }, [items, params, setParams]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!draft.trim() || !selectedId) return; send.mutate({ reservationId: selectedId, body: draft.trim() }); };
  if (!isAuthenticated && !isLoading) return <div className="standard-page"><AuthGate title="Connectez-vous pour accéder à vos messages" /></div>;
  const selected = items.find((item) => item.reservationId === selectedId);
  return <div className="standard-page">
    <div className="page-header"><span className="eyebrow">Votre espace</span><h1>Messages & notifications</h1><p>Échangez avec le propriétaire au sujet de votre réservation.</p></div>
    <section className="panel" style={{ marginBottom: 20 }}><h2><Bell size={18} /> Notifications</h2>
      {!notices.data?.length && <p className="muted">Aucune notification pour le moment.</p>}
      {notices.data?.slice(0, 8).map((notice) => <div key={notice.id} className="message-notice"><div><strong>{notice.title}</strong><p>{notice.body}</p><small>{fullDate(notice.createdAt)}</small></div>{!notice.readAt && <button className="btn btn-ghost" onClick={() => markRead.mutate({ id: notice.id })} aria-label="Marquer comme lu"><CheckCheck size={17} /></button>}</div>)}
    </section>
    <section className="panel"><h2><MessageCircle size={18} /> Conversations</h2>
      {!items.length ? <p className="muted">Vos conversations apparaîtront ici après une réservation.</p> : <>
        <label className="field-label" htmlFor="reservation-select">Réservation</label>
        <select id="reservation-select" className="form-input" value={selectedId || ""} onChange={(e) => setParams({ reservation: e.target.value })}>{items.map((item) => <option key={item.reservationId} value={item.reservationId}>{item.listingTitle} — réservation #{item.reservationId}</option>)}</select>
        <div className="message-thread" aria-live="polite">{messages.data?.length ? messages.data.map((message) => <div key={message.id} className={`message-bubble ${message.senderId === user?.id ? "message-mine" : ""}`}><p>{message.body}</p><small>{fullDate(message.createdAt)}</small></div>) : <p className="muted">Aucun message. Vous pouvez commencer la conversation.</p>}</div>
        <form className="message-compose" onSubmit={submit}><textarea className="form-input" rows={2} maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Écrivez votre message…" /><button className="btn btn-primary" disabled={!draft.trim() || send.isPending}><Send size={16} /> Envoyer</button></form>
      </>}
    </section>
  </div>;
}
