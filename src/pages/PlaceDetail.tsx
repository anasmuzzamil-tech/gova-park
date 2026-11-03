import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Star, MapPin, LockKeyhole, Ruler, ArrowUpFromLine, ShieldCheck, Zap, UserCheck, Check, CarFront, Heart } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { bookingModeLabel, euros, placeTypeLabel } from "@/lib/format";

const reviews = [
  { name: "Camille L.", date: "Octobre 2026", text: "Accès très simple et place conforme aux dimensions. Le propriétaire a répondu rapidement." },
  { name: "Nicolas B.", date: "Septembre 2026", text: "Emplacement pratique pour la journée. Les consignes reçues après confirmation étaient précises." },
  { name: "Sarah M.", date: "Septembre 2026", text: "Garage propre et sécurisé. Je recommande pour une citadine." },
];

export default function PlaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState(0);
  const { isAuthenticated } = useAuth();
  const favoriteIds = trpc.govapark.favorites.ids.useQuery(undefined, { enabled: isAuthenticated });
  const toggleFavorite = trpc.govapark.favorites.toggle.useMutation({ onSuccess: () => favoriteIds.refetch() });
  const query = trpc.govapark.listings.byId.useQuery({ id: Number(id) }, { enabled: Boolean(id) });
  if (query.isLoading) return <div className="page-loading"><span className="loader" />Chargement de la place…</div>;
  if (query.error || !query.data) return <div className="empty-state page-empty"><h1>Annonce introuvable</h1><button className="btn btn-primary" onClick={() => navigate("/")}>Retour à la carte</button></div>;
  const place = query.data;
  const isFavorite = favoriteIds.data?.includes(place.id) ?? false;
  const handleFavorite = () => { if (!isAuthenticated) { toast.info("Connectez-vous pour enregistrer vos favoris"); navigate("/login"); return; } toggleFavorite.mutate({ listingId: place.id }, { onSuccess: (r) => toast.success(r.favorite ? "Ajouté aux favoris" : "Retiré des favoris") }); };
  return (
    <div className="detail-page">
      <div className="detail-topbar"><button className="back-button" onClick={() => navigate(-1)}><ArrowLeft size={19} />Retour</button><button className={`icon-btn ${isFavorite ? "active" : ""}`} onClick={handleFavorite} aria-label="Ajouter aux favoris"><Heart size={19} fill={isFavorite ? "currentColor" : "none"} /></button><span className="private-tag"><i className="legend-dot violet" />Place privée</span></div>
      <div className="detail-grid">
        <div>
          <div className="photo-gallery">
            <img className="main-photo" src={place.photos[photo] || place.photos[0]} alt={`Vue de ${place.title}`} />
            <div className="photo-thumbs">{place.photos.map((url, index) => <button key={url + index} className={photo === index ? "active" : ""} onClick={() => setPhoto(index)} aria-label={`Voir la photo ${index + 1}`}><img src={url} alt="" /></button>)}</div>
          </div>
          <section className="detail-section"><h2>Ce qu’il faut savoir</h2><p className="detail-description">{place.description}</p>
            <div className="feature-grid"><div><CarFront size={19} /><span>Type<strong>{placeTypeLabel(place.placeType)}</strong></span></div><div><Ruler size={19} /><span>Dimensions<strong>{place.lengthM.toFixed(1)} × {place.widthM.toFixed(1)} m</strong></span></div><div><ArrowUpFromLine size={19} /><span>Hauteur maximale<strong>{place.heightCm} cm</strong></span></div><div><ShieldCheck size={19} /><span>Environnement<strong>{place.covered ? "Couvert et protégé" : "Extérieur"}</strong></span></div></div>
          </section>
          <section className="detail-section"><div className="section-title-row"><h2>Avis</h2><span><Star size={16} fill="currentColor" />{place.rating.toFixed(1)} · {place.reviewCount} avis</span></div>
            <div className="reviews-list">{reviews.map((review) => <article key={review.name}><div><strong>{review.name}</strong><span>{review.date}</span></div><div className="stars">★★★★★</div><p>{review.text}</p></article>)}</div>
          </section>
        </div>
        <aside className="booking-summary-card">
          <span className="eyebrow">Annonce vérifiée</span><h1>{place.title}</h1>
          <div className="rating-line"><Star size={16} fill="currentColor" /><strong>{place.rating.toFixed(1)}</strong><span>({place.reviewCount} avis)</span></div>
          <div className="approx-address"><MapPin size={19} /><div><strong>{place.approxAddress}</strong><span>Adresse approximative</span></div></div>
          <div className="privacy-note"><LockKeyhole size={18} /><p>L’adresse exacte et les consignes d’accès ne seront révélées qu’après validation effective du paiement sécurisé.</p></div>
          <div className="price-table"><div><span>À l’heure</span><strong>{euros(place.hourlyCents)}</strong></div><div><span>À la journée</span><strong>{euros(place.dailyCents)}</strong></div><div><span>À la semaine</span><strong>{euros(place.weeklyCents)}</strong></div></div>
          <div className={`booking-mode-box ${place.bookingMode}`}>
            {place.bookingMode === "instant" ? <Zap size={21} /> : <UserCheck size={21} />}
            <div><strong>{bookingModeLabel(place.bookingMode)}</strong><p>{place.bookingMode === "instant" ? "Le créneau ne sera confirmé qu’après paiement sécurisé. Cette fonction n’est pas encore activée." : "Le propriétaire dispose de 24 h pour répondre. La réservation ne sera définitive qu’après activation et validation du paiement sécurisé."}</p></div>
          </div>
          <button className="btn btn-primary btn-full btn-large" onClick={() => navigate(`/reserver/${place.id}`)}>Choisir mes horaires</button>
          <p className="summary-foot"><Check size={15} />Prix calculé avant tout paiement · annulation selon conditions</p>
        </aside>
      </div>
    </div>
  );
}
