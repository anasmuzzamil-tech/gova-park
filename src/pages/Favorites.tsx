import { Heart, MapPin, Star } from "lucide-react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AuthGate } from "@/components/AuthGate";
import { euros } from "@/lib/format";

export default function Favorites() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const query = trpc.govapark.favorites.list.useQuery(undefined, { enabled: isAuthenticated });
  if (!isAuthenticated && !isLoading) return <div className="standard-page"><div className="page-header"><span className="eyebrow">Mes adresses</span><h1>Mes favoris</h1></div><AuthGate title="Connectez-vous pour retrouver vos favoris" /></div>;
  return <div className="standard-page"><div className="page-header"><span className="eyebrow">Mes adresses</span><h1>Mes favoris</h1><p>Retrouvez rapidement les places que vous avez enregistrées.</p></div>
    {query.isLoading ? <div className="page-loading"><span className="loader" />Chargement…</div> : query.data?.length ? <div className="listing-grid">{query.data.map((place) => <article className="listing-card" key={place.id} onClick={() => navigate(`/place/${place.id}`)}><img src={place.photos[place.mainPhoto] || place.photos[0]} alt=""/><div><div className="listing-card-top"><h2>{place.title}</h2><Heart size={18} fill="currentColor" /></div><p><MapPin size={15}/>{place.approxAddress}</p><span><Star size={15} fill="currentColor"/>{place.rating.toFixed(1)} · {euros(place.hourlyCents)}/h</span></div></article>)}</div> : <div className="empty-state page-empty"><Heart size={32}/><h2>Aucun favori pour le moment</h2><p>Ajoutez une place depuis sa fiche pour la retrouver ici.</p><button className="btn btn-primary" onClick={() => navigate("/")}>Voir la carte</button></div>}
  </div>;
}
