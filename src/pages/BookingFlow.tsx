import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, CalendarClock, Check, ChevronRight, LockKeyhole, MapPin, ShieldCheck, Timer, Zap, UserCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AuthGate } from "@/components/AuthGate";
import { bookingModeLabel, euros, fullDate, toLocalInput } from "@/lib/format";

type Selection = { start: string; end: string; step: number };
type Confirmation = { mode: "payment_pending" | "validation"; exactAddress?: string; accessInstructions?: string };

export default function BookingFlow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const placeQuery = trpc.govapark.listings.byId.useQuery({ id: Number(id) }, { enabled: Boolean(id) });
  const storageKey = `govaparkBooking-${id}`;
  const [selection, setSelection] = useState<Selection>(() => {
    try { const saved = sessionStorage.getItem(storageKey); if (saved) return JSON.parse(saved); } catch { /* session storage may be unavailable */ }
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(10, 0, 0, 0);
    const end = new Date(start); end.setHours(12, 0, 0, 0);
    return { start: toLocalInput(start), end: toLocalInput(end), step: 1 };
  });
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [processing, setProcessing] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const startAt = useMemo(() => new Date(selection.start), [selection.start]);
  const endAt = useMemo(() => new Date(selection.end), [selection.end]);
  const validDates = startAt < endAt && !Number.isNaN(startAt.getTime()) && !Number.isNaN(endAt.getTime());
  const quote = trpc.govapark.listings.quote.useQuery({ listingId: Number(id), startAt, endAt }, { enabled: validDates && Boolean(id), retry: false });
  const create = trpc.govapark.reservations.create.useMutation();

  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(selection)); } catch { /* no-op */ } }, [selection, storageKey]);
  useEffect(() => { if (isAuthenticated && selection.step === 2 && !quote.isError) { /* choice is intentionally retained */ } }, [isAuthenticated, selection.step, quote.isError]);

  if (placeQuery.isLoading) return <div className="page-loading"><span className="loader" />Préparation de votre réservation…</div>;
  if (!placeQuery.data) return <div className="empty-state page-empty"><h1>Place indisponible</h1><button className="btn btn-primary" onClick={() => navigate("/")}>Retour à la carte</button></div>;
  const place = placeQuery.data;
  const setStep = (step: number) => setSelection((current) => ({ ...current, step }));

  const confirmBooking = async () => {
    if (!validDates || !quote.data) return;
    setProcessing(true);
    try {
      const created = await create.mutateAsync({ listingId: place.id, startAt, endAt, vehiclePlate: vehiclePlate.trim() || undefined });
      if (created.mode === "instant") {
        // A reservation is never confirmed until the payment provider has verified payment.
        setConfirmation({ mode: "payment_pending" });
      } else {
        setConfirmation({ mode: "validation" });
      }
      setStep(4); sessionStorage.removeItem(storageKey); sessionStorage.removeItem("govaparkReturn");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La réservation n’a pas pu être confirmée");
    } finally { setProcessing(false); }
  };

  return (
    <div className="booking-page">
      <div className="booking-top"><button className="back-button" onClick={() => selection.step > 1 && selection.step < 4 ? setStep(selection.step - 1) : navigate(`/place/${place.id}`)}><ArrowLeft size={19} />Retour</button><span>Réservation · paiement désactivé</span></div>
      {selection.step < 4 && <div className="stepper">{[{ n: 1, label: "Horaires" }, { n: 2, label: "Récapitulatif" }, { n: 3, label: "Confirmation" }].map((step) => <div key={step.n} className={selection.step >= step.n ? "active" : ""}><span>{selection.step > step.n ? <Check size={14} /> : step.n}</span><small>{step.label}</small></div>)}</div>}

      {selection.step === 1 && <div className="booking-layout">
        <section className="booking-form-section"><span className="eyebrow">Étape 1 · votre créneau</span><h1>Quand souhaitez-vous vous garer&nbsp;?</h1><p className="page-lead">Le prix est calculé à l’heure commencée, puis plafonné au tarif journée et au tarif semaine.</p>
          <div className="form-stack booking-fields"><label>Date et heure d’arrivée<input type="datetime-local" value={selection.start} onChange={(e) => setSelection({ ...selection, start: e.target.value })} /></label><label>Date et heure de départ<input type="datetime-local" value={selection.end} min={selection.start} onChange={(e) => setSelection({ ...selection, end: e.target.value })} /></label></div>
          {!validDates && <p className="form-error">Le départ doit avoir lieu après l’arrivée.</p>}
          {quote.isError && validDates && <p className="form-error">{quote.error.message}</p>}
          {quote.data && <div className="live-price"><div><span>{quote.data.startedHours} h commencée{quote.data.startedHours > 1 ? "s" : ""}</span><strong>{euros(quote.data.baseCents)}</strong></div><p>Frais de service de {euros(quote.data.feeCents)} ajoutés au récapitulatif.</p><span className="price-total-line">Total estimé <strong>{euros(quote.data.totalCents)}</strong></span></div>}
          <button className="btn btn-primary btn-full btn-large" disabled={!quote.data || processing} onClick={() => setStep(2)}>Vérifier le récapitulatif <ChevronRight size={18} /></button>
        </section>
        <BookingPlaceCard place={place} />
      </div>}

      {selection.step === 2 && <div className="booking-layout">
        <section className="booking-form-section"><span className="eyebrow">Étape 2 · avant tout engagement</span><h1>Vérifiez votre réservation</h1>
          {!isAuthenticated && !isLoading ? <AuthGate title="Un compte pour finaliser" /> : <>
            <div className="recap-block"><div><CalendarClock size={20} /><span>Arrivée<strong>{fullDate(startAt)}</strong></span></div><div><CalendarClock size={20} /><span>Départ<strong>{fullDate(endAt)}</strong></span></div><div><MapPin size={20} /><span>Adresse<strong>{place.approxAddress}</strong><small>Exacte après confirmation uniquement</small></span></div></div>
            <label className="vehicle-plate-field">Plaque d’immatriculation (facultatif)<input value={vehiclePlate} onChange={(e)=>setVehiclePlate(e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g,"").slice(0,12))} placeholder="AB-123-CD" autoCapitalize="characters" autoComplete="off" /><small>Visible uniquement par vous et le propriétaire pour identifier le véhicule associé à cette réservation. Elle ne permet pas de localiser la voiture.</small></label>
            <div className={`booking-mode-box ${place.bookingMode}`}>{place.bookingMode === "instant" ? <Zap size={21} /> : <UserCheck size={21} />}<div><strong>{bookingModeLabel(place.bookingMode)}</strong><p>{place.bookingMode === "instant" ? "Le créneau sera confirmé uniquement après paiement sécurisé. Le paiement n’est pas encore activé." : "Le propriétaire peut accepter votre demande. Le paiement sécurisé sera nécessaire avant confirmation définitive."}</p></div></div>
            {quote.data && <div className="price-breakdown"><div><span>Stationnement</span><strong>{euros(quote.data.baseCents)}</strong></div><div><span>Frais de service Govapark (8 %)</span><strong>{euros(quote.data.feeCents)}</strong></div><div className="total"><span>Total</span><strong>{euros(quote.data.totalCents)}</strong></div></div>}
            <div className="cancellation-box"><ShieldCheck size={20} /><div><strong>Conditions d’annulation</strong><p>Gratuite jusqu’à 24 h avant l’arrivée. Ensuite, 50 % du stationnement est remboursé. Les frais de service ne sont pas remboursables. Aucun débit pour une demande refusée ou expirée.</p></div></div>
            <button className="btn btn-primary btn-full btn-large" onClick={() => setStep(3)}>Continuer <ChevronRight size={18} /></button>
          </>}
        </section><BookingPlaceCard place={place} />
      </div>}

      {selection.step === 3 && <div className="payment-layout">
        <section className="booking-form-section"><span className="eyebrow">Étape 3 · paiement sécurisé non activé</span><h1>{place.bookingMode === "instant" ? "Enregistrer votre demande" : "Envoyer votre demande"}</h1><div className="simulation-note"><LockKeyhole size={18} />Version de démonstration : aucun paiement réel n’est intégré. Aucune coordonnée bancaire ne vous sera demandée.</div>
          {quote.data && <div className="payment-total"><span>Montant estimé · aucun débit réel</span><strong>{euros(quote.data.totalCents)}</strong></div>}
          <button className="btn btn-primary btn-full btn-large" disabled={processing} onClick={confirmBooking}>{processing ? <><span className="loader light" />Confirmation…</> : place.bookingMode === "instant" ? "Enregistrer sans paiement" : "Envoyer la demande"}</button>
          <p className="secure-caption"><LockKeyhole size={14} />Les chevauchements sont revérifiés. Aucun paiement ni débit bancaire n’est effectué.</p>
        </section>
      </div>}

      {selection.step === 4 && confirmation && <section className="confirmation-screen">
        <div className={`confirmation-icon ${confirmation.mode}`}>{confirmation.mode === "payment_pending" ? <LockKeyhole size={40} /> : <Send size={40} />}</div>
        <span className="eyebrow">{confirmation.mode === "payment_pending" ? "Paiement non disponible" : "Demande en attente"}</span>
        <h1>{confirmation.mode === "payment_pending" ? "Votre place n’est pas encore réservée." : "Le propriétaire a reçu votre demande."}</h1>
        <p>{confirmation.mode === "payment_pending" ? "Votre demande est enregistrée, mais aucun paiement sécurisé n’est disponible pour le moment. Aucun débit n’a été effectué et l’adresse exacte reste masquée." : "La demande attend la réponse du propriétaire. Elle ne sera confirmée qu’après activation et validation du paiement sécurisé."}</p>
        <div className="confirmation-details"><div><CalendarClock size={19} /><span>{fullDate(startAt)}<small>au {fullDate(endAt)}</small></span></div><div><MapPin size={19} /><span>{place.title}<small>{confirmation.exactAddress ?? place.approxAddress}</small></span></div></div>
        {<div className="expiration-box"><Timer size={19} /><span>{confirmation.mode === "payment_pending" ? "Paiement sécurisé indisponible : votre place n’est pas confirmée." : <>Le propriétaire doit répondre sous <strong>24 heures</strong>. Aucun paiement réel n’est encore disponible.</>}</span></div>}
        <button className="btn btn-primary btn-full" onClick={() => navigate("/reservations")}>Voir mes réservations</button><button className="btn btn-ghost btn-full" onClick={() => navigate("/")}>Retour à la carte</button>
      </section>}
    </div>
  );
}

function BookingPlaceCard({ place }: { place: { title: string; approxAddress: string; photos: string[]; mainPhoto: number; bookingMode: string } }) {
  return <aside className="booking-place-card"><img src={place.photos[place.mainPhoto] || place.photos[0]} alt="" /><div><span className="private-tag"><i className="legend-dot violet" />Place privée</span><h2>{place.title}</h2><p>{place.approxAddress}</p><strong>{bookingModeLabel(place.bookingMode)}</strong></div></aside>;
}
