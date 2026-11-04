import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, CalendarClock, Check, ChevronRight, CircleAlert, CircleCheck, LockKeyhole, MapPin, ShieldCheck, Timer, Zap, UserCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AuthGate } from "@/components/AuthGate";
import { bookingModeLabel, euros, fullDate, toLocalInput } from "@/lib/format";
import { parseJson, type Schedule } from "@contracts/parking-search";
import "@/styles/booking.css";

type Selection = { start: string; end: string; step: number };
type QuoteLike = { startedHours: number; baseCents: number; feeCents: number; totalCents: number };
type Tariffs = { hourlyCents: number; dailyCents: number; weeklyCents: number };
type Confirmation = { mode: "payment_pending" | "validation"; id: number; quote: QuoteLike; start: string; end: string; exactAddress?: string; accessInstructions?: string };

const DAY_NAMES = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
function scheduleText(raw: string) {
  const s = parseJson<Schedule>(raw, { days: [], start: "", end: "" });
  if (!s.days.length) return "Horaires non précisés";
  const days = s.days.length === 7 ? "Tous les jours" : [1, 2, 3, 4, 5, 6, 0].filter((d) => s.days.includes(d)).map((d) => DAY_NAMES[d]).join(" ");
  return `${days} · ${s.start} – ${s.end} (heure de Paris)`;
}
function durationText(start: Date, end: Date) {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (!(minutes > 0)) return "—";
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  return [d ? `${d} j` : "", h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** Détail du prix : durée commencée × tarif horaire, plafond journée/semaine si appliqué, frais de service (valeurs calculées par le serveur). */
function PriceDetail({ quote, tariffs, title = "Détail du prix" }: { quote: QuoteLike; tariffs: Tariffs; title?: string }) {
  const hourlyTotal = quote.startedHours * tariffs.hourlyCents;
  const capped = quote.baseCents < hourlyTotal;
  const weeklyCap = Math.ceil(quote.startedHours / 168) * tariffs.weeklyCents;
  const cap = capped ? (quote.baseCents === weeklyCap ? "Plafond semaine appliqué" : "Plafond journée appliqué") : null;
  return <div className="bk-price"><h3>{title}</h3>
    <div><span>{quote.startedHours} h commencée{quote.startedHours > 1 ? "s" : ""} × {euros(tariffs.hourlyCents)}<small>Facturation à l’heure commencée</small></span><strong>{euros(hourlyTotal)}</strong></div>
    {cap && <div className="bk-cap"><span>{cap}</span><strong>{euros(quote.baseCents)}</strong></div>}
    <div><span>Stationnement</span><strong>{euros(quote.baseCents)}</strong></div>
    <div><span>Frais de service Govapark (8 %)</span><strong>{euros(quote.feeCents)}</strong></div>
    <div className="bk-total"><span>Total</span><strong>{euros(quote.totalCents)}</strong></div>
  </div>;
}

export default function BookingFlow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const placeQuery = trpc.govapark.listings.byId.useQuery({ id: Number(id) }, { enabled: Boolean(id) });
  const storageKey = `govaparkBooking-${id}`;
  const [selection, setSelection] = useState<Selection>(() => {
    try { const saved = sessionStorage.getItem(storageKey); if (saved) { const parsed = JSON.parse(saved) as Selection; return { ...parsed, step: parsed.step > 3 ? 1 : parsed.step }; } } catch { /* session storage may be unavailable */ }
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(10, 0, 0, 0);
    const end = new Date(start); end.setHours(12, 0, 0, 0);
    return { start: toLocalInput(start), end: toLocalInput(end), step: 1 };
  });
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [processing, setProcessing] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [multiDay, setMultiDay] = useState(() => selection.start.slice(0, 10) !== selection.end.slice(0, 10));
  const startAt = useMemo(() => new Date(selection.start), [selection.start]);
  const endAt = useMemo(() => new Date(selection.end), [selection.end]);
  const validDates = startAt < endAt && !Number.isNaN(startAt.getTime()) && !Number.isNaN(endAt.getTime());
  const quote = trpc.govapark.listings.quote.useQuery({ listingId: Number(id), startAt, endAt }, { enabled: validDates && Boolean(id), retry: false });
  const slot = trpc.govapark.listings.checkSlot.useQuery({ listingId: Number(id), startAt, endAt }, { enabled: validDates && Boolean(id), retry: false });
  const create = trpc.govapark.reservations.create.useMutation();
  const startDate = selection.start.slice(0, 10), startTime = selection.start.slice(11, 16), endDate = selection.end.slice(0, 10), endTime = selection.end.slice(11, 16);
  const setParts = (next: { startDate?: string; startTime?: string; endDate?: string; endTime?: string; multi?: boolean }) => {
    const sd = next.startDate ?? startDate, st = next.startTime ?? startTime, et = next.endTime ?? endTime;
    const multi = next.multi ?? multiDay;
    let ed = next.endDate ?? endDate;
    if (!multi) ed = sd;
    else if (next.multi && ed <= sd) { const d = new Date(`${sd}T12:00`); d.setDate(d.getDate() + 1); ed = toLocalInput(d).slice(0, 10); }
    setMultiDay(multi);
    setSelection((current) => ({ ...current, start: `${sd}T${st}`, end: `${ed}T${et}` }));
  };

  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(selection)); } catch { /* no-op */ } }, [selection, storageKey]);

  if (placeQuery.isLoading) return <div className="page-loading"><span className="loader" />Préparation de votre réservation…</div>;
  if (!placeQuery.data) return <div className="empty-state page-empty"><h1>Place indisponible</h1><button className="btn btn-primary" onClick={() => navigate("/")}>Retour à la carte</button></div>;
  const place = placeQuery.data;
  const tariffs: Tariffs = { hourlyCents: place.hourlyCents, dailyCents: place.dailyCents, weeklyCents: place.weeklyCents };
  const setStep = (step: number) => setSelection((current) => ({ ...current, step }));
  const slotFree = slot.data?.available === true;
  const slotTaken = slot.data?.available === false;
  const today = toLocalInput(new Date()).slice(0, 10);

  const confirmBooking = async () => {
    if (!validDates || !quote.data) return;
    setProcessing(true); setConfirmError(null);
    try {
      const created = await create.mutateAsync({ listingId: place.id, startAt, endAt, vehiclePlate: vehiclePlate.trim() || undefined });
      // A reservation is never confirmed until the payment provider has verified payment.
      setConfirmation({ mode: created.mode === "instant" ? "payment_pending" : "validation", id: created.id, quote: quote.data, start: selection.start, end: selection.end });
      setStep(4); sessionStorage.removeItem(storageKey); sessionStorage.removeItem("govaparkReturn");
    } catch (error) {
      const message = error instanceof Error ? error.message : "La réservation n’a pas pu être confirmée";
      setConfirmError(message); slot.refetch();
      toast.error(message);
    } finally { setProcessing(false); }
  };

  return (
    <div className="booking-page">
      <div className="booking-top"><button className="back-button" onClick={() => selection.step > 1 && selection.step < 4 ? setStep(selection.step - 1) : navigate(`/place/${place.id}`)}><ArrowLeft size={19} />Retour</button><span>Réservation · paiement bientôt disponible</span></div>
      {selection.step < 4 && <div className="stepper">{[{ n: 1, label: "Créneau" }, { n: 2, label: "Récapitulatif" }, { n: 3, label: "Confirmation" }].map((step) => <div key={step.n} className={selection.step >= step.n ? "active" : ""}><span>{selection.step > step.n ? <Check size={14} /> : step.n}</span><small>{step.label}</small></div>)}</div>}

      {selection.step === 1 && <div className="booking-layout">
        <section className="booking-form-section"><span className="eyebrow">Étape 1 · votre créneau</span><h1>Quand souhaitez-vous vous garer&nbsp;?</h1><p className="page-lead">Le prix est calculé à l’heure commencée, puis plafonné au tarif journée et au tarif semaine.</p>
          <div className="bk-fields">
            <label className="bk-wide">Date<input type="date" value={startDate} min={today} onChange={(e) => e.target.value && setParts({ startDate: e.target.value })} /></label>
            <label>Heure d’arrivée<input type="time" step={900} value={startTime} onChange={(e) => e.target.value && setParts({ startTime: e.target.value })} /></label>
            <label>Heure de départ<input type="time" step={900} value={endTime} onChange={(e) => e.target.value && setParts({ endTime: e.target.value })} /></label>
            {multiDay && <label className="bk-wide">Date de départ<input type="date" value={endDate} min={startDate} onChange={(e) => e.target.value && setParts({ endDate: e.target.value })} /></label>}
          </div>
          <label className="bk-check"><input type="checkbox" checked={multiDay} onChange={(e) => setParts({ multi: e.target.checked })} />Je pars un autre jour que mon arrivée</label>
          {!validDates && <p className="form-error">Le départ doit avoir lieu après l’arrivée{multiDay ? "" : " (ou cochez « Je pars un autre jour »)"}.</p>}
          {validDates && <p className="bk-hours">Durée : {durationText(startAt, endAt)} · du {fullDate(startAt)} au {fullDate(endAt)}</p>}
          {validDates && slot.isLoading && <div className="bk-slot" role="status"><Timer size={19} /><div><strong>Vérification de la disponibilité…</strong></div></div>}
          {validDates && slotFree && <div className="bk-slot ok" role="status"><CircleCheck size={19} /><div><strong>Créneau disponible</strong><p>Vérifié à l’instant auprès du serveur. Il sera revérifié au moment de la confirmation.</p></div></div>}
          {validDates && slotTaken && <div className="bk-slot ko" role="alert"><CircleAlert size={19} /><div><strong>Ce créneau n’est pas disponible</strong><p>{slot.data?.message} Choisissez un autre horaire.</p></div></div>}
          {validDates && slot.isError && <div className="bk-slot ko" role="alert"><CircleAlert size={19} /><div><strong>Disponibilité non vérifiable</strong><p>{slot.error.message}</p></div></div>}
          {quote.isError && validDates && !slotTaken && <p className="form-error">{quote.error.message}</p>}
          {quote.data && !slotTaken && <PriceDetail quote={quote.data} tariffs={tariffs} title="Prix calculé en direct" />}
          <button className="btn btn-primary btn-full btn-large" disabled={!quote.data || !slotFree || processing} onClick={() => setStep(2)}>Vérifier le récapitulatif <ChevronRight size={18} /></button>
        </section>
        <BookingPlaceCard place={place} />
      </div>}

      {selection.step === 2 && <div className="booking-layout">
        <section className="booking-form-section"><span className="eyebrow">Étape 2 · avant tout engagement</span><h1>Vérifiez votre réservation</h1>
          {!isAuthenticated && !isLoading ? <AuthGate title="Un compte pour finaliser" /> : <>
            <div className="recap-block"><div><CalendarClock size={20} /><span>Arrivée<strong>{fullDate(startAt)}</strong></span></div><div><CalendarClock size={20} /><span>Départ<strong>{fullDate(endAt)}</strong></span></div><div><MapPin size={20} /><span>Adresse<strong>{place.approxAddress}</strong><small>Exacte après confirmation uniquement</small></span></div></div>
            <label className="vehicle-plate-field">Plaque d’immatriculation (facultatif)<input value={vehiclePlate} onChange={(e)=>setVehiclePlate(e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g,"").slice(0,12))} placeholder="AB-123-CD" autoCapitalize="characters" autoComplete="off" /><small>Visible uniquement par vous et le propriétaire pour identifier le véhicule associé à cette réservation. Elle ne permet pas de localiser la voiture.</small></label>
            <div className={`booking-mode-box ${place.bookingMode}`}>{place.bookingMode === "instant" ? <Zap size={21} /> : <UserCheck size={21} />}<div><strong>{bookingModeLabel(place.bookingMode)}</strong><p>{place.bookingMode === "instant" ? "Le créneau sera confirmé uniquement après paiement sécurisé. Le paiement n’est pas encore activé." : "Le propriétaire peut accepter votre demande. Le paiement sécurisé sera nécessaire avant confirmation définitive."}</p></div></div>
            {quote.data && <PriceDetail quote={quote.data} tariffs={tariffs} />}
            <div className="cancellation-box"><ShieldCheck size={20} /><div><strong>Conditions d’annulation</strong><p>Gratuite jusqu’à 24 h avant l’arrivée. Ensuite, 50 % du stationnement est remboursé. Les frais de service ne sont pas remboursables. Aucun débit pour une demande refusée ou expirée.</p></div></div>
            <button className="btn btn-primary btn-full btn-large" disabled={!slotFree} onClick={() => setStep(3)}>Continuer <ChevronRight size={18} /></button>
          </>}
        </section><BookingPlaceCard place={place} />
      </div>}

      {selection.step === 3 && <div className="payment-layout">
        <section className="booking-form-section"><span className="eyebrow">Étape 3 · confirmation</span><h1>{place.bookingMode === "instant" ? "Enregistrer votre demande" : "Envoyer votre demande"}</h1>
          <div className="bk-soon"><LockKeyhole size={18} />Paiement bientôt disponible. Aucun paiement n’est demandé aujourd’hui et aucune coordonnée bancaire n’est collectée.</div>
          <div className="bk-recap"><div><span>Place</span><strong>{place.title}</strong></div><div><span>Arrivée</span><strong>{fullDate(startAt)}</strong></div><div><span>Départ</span><strong>{fullDate(endAt)}</strong></div><div><span>Durée</span><strong>{durationText(startAt, endAt)}</strong></div></div>
          {quote.data && <PriceDetail quote={quote.data} tariffs={tariffs} title="Montant estimé · aucun débit réel" />}
          {confirmError && <div className="bk-error"><div className="bk-slot ko" role="alert"><CircleAlert size={19} /><div><strong>La réservation n’a pas été enregistrée</strong><p>{confirmError}</p></div></div><button className="btn btn-secondary btn-full" onClick={() => { setConfirmError(null); setStep(1); }}>Modifier mon créneau</button></div>}
          <button className="btn btn-primary btn-full btn-large" disabled={processing || !quote.data} onClick={confirmBooking}>{processing ? <><span className="loader light" />Confirmation…</> : place.bookingMode === "instant" ? "Enregistrer sans paiement" : "Envoyer la demande"}</button>
          <p className="secure-caption"><LockKeyhole size={14} />Le créneau est revérifié par le serveur au moment de la confirmation, ce qui empêche toute double réservation.</p>
        </section>
      </div>}

      {selection.step === 4 && confirmation && <section className="confirmation-screen bk-success">
        <div className={`confirmation-icon ${confirmation.mode}`}>{confirmation.mode === "payment_pending" ? <LockKeyhole size={40} /> : <Send size={40} />}</div>
        <span className="bk-number">Réservation n°{confirmation.id}</span><br />
        <span className="eyebrow">{confirmation.mode === "payment_pending" ? "Paiement non disponible" : "Demande en attente"}</span>
        <h1>{confirmation.mode === "payment_pending" ? "Votre place n’est pas encore réservée." : "Le propriétaire a reçu votre demande."}</h1>
        <p>{confirmation.mode === "payment_pending" ? "Votre demande est enregistrée, mais aucun paiement sécurisé n’est disponible pour le moment (paiement bientôt disponible). Aucun débit n’a été effectué et l’adresse exacte reste masquée." : "La demande attend la réponse du propriétaire. Elle ne sera confirmée qu’après activation et validation du paiement sécurisé."}</p>
        <div className="confirmation-details"><div><CalendarClock size={19} /><span>{fullDate(confirmation.start)}<small>au {fullDate(confirmation.end)} · {durationText(new Date(confirmation.start), new Date(confirmation.end))}</small></span></div><div><MapPin size={19} /><span>{place.title}<small>{confirmation.exactAddress ?? place.approxAddress}</small></span></div></div>
        <PriceDetail quote={confirmation.quote} tariffs={tariffs} title="Détail du prix (aucun débit)" />
        <div className="expiration-box"><Timer size={19} /><span>{confirmation.mode === "payment_pending" ? "Paiement sécurisé indisponible : votre place n’est pas confirmée." : <>Le propriétaire doit répondre sous <strong>24 heures</strong>. Aucun paiement réel n’est encore disponible.</>}</span></div>
        <p className="bk-next">Annulation gratuite jusqu’à 24 h avant l’arrivée depuis « Mes réservations ».</p>
        <button className="btn btn-primary btn-full" onClick={() => navigate("/reservations")}>Voir mes réservations</button><button className="btn btn-ghost btn-full" onClick={() => navigate("/")}>Retour à la carte</button>
      </section>}
    </div>
  );
}

function BookingPlaceCard({ place }: { place: { title: string; approxAddress: string; photos: string[]; mainPhoto: number; bookingMode: string; hourlyCents: number; dailyCents: number; weeklyCents: number; availability: string } }) {
  return <aside className="booking-place-card"><img src={place.photos[place.mainPhoto] || place.photos[0]} alt={`Photo de ${place.title}`} /><div><span className="private-tag"><i className="legend-dot violet" />Place privée</span><h2>{place.title}</h2><p>{place.approxAddress}</p><strong>{bookingModeLabel(place.bookingMode)}</strong>
    <div className="bk-tariffs"><div>À l’heure<strong>{euros(place.hourlyCents)}</strong></div><div>Journée<strong>{euros(place.dailyCents)}</strong></div><div>Semaine<strong>{euros(place.weeklyCents)}</strong></div></div>
    <p className="bk-hours">Horaires d’accès : {scheduleText(place.availability)}</p></div></aside>;
}
