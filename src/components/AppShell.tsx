import { NavLink, Outlet, useLocation, Navigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useDemoMode } from "@/hooks/useDemoMode";
import { Map, History, CirclePlus, UserRound, ParkingSquare, MessageCircle, ShieldCheck, CarFront, Timer } from "lucide-react";

const nav = [
  { to: "/", label: "Carte", icon: Map },
  { to: "/historique", label: "Historique", icon: History },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/compteur", label: "Compteur", icon: Timer },
  { to: "/mobilite", label: "Mobilité", icon: CarFront },
  { to: "/profil", label: "Paramètres", short: "Réglages", icon: UserRound },
];

// Pages consultables sans compte : la carte, la fiche d'une place et l'historique (ses récents sont stockés sur l'appareil ; réservations et signalements y demandent un compte). Les actions (signaler, réserver, publier, messages, compte)
// demandent un compte là où elles se trouvent ; le serveur garde ses contrôles (procédures protégées inchangées).
const PUBLIC_PATHS = [/^\/$/, /^\/place\/[^/]+\/?$/, /^\/historique\/?$/];

export default function AppShell() {
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const demo = useDemoMode();
  const visibleNav = user?.role === "admin" ? [...nav, { to: "/entreprise", label: "Espace société", icon: ParkingSquare }, { to: "/admin", label: "Modération", icon: ShieldCheck }] : user?.role === "owner" ? [...nav, { to: "/proposer", label: "Espace propriétaire", icon: CirclePlus }] : [...nav, { to: "/espace-client", label: "Mon espace", short: "Espace", icon: UserRound }];
  const bottomNav = visibleNav.filter((item) => item.to !== "/mobilite" && !(item.to === "/compteur" && user?.role !== "user"));
  const isMap = location.pathname === "/";
  if (isLoading) return <div className="page-loading"><span className="loader" />Ouverture de votre espace GOVAPARK…</div>;
  if (!isAuthenticated && !PUBLIC_PATHS.some((path) => path.test(location.pathname))) {
    // Retour à cette page après connexion (lu par ResumeAfterLogin dans App.tsx).
    try { sessionStorage.setItem("govaparkReturn", `${location.pathname}${location.search}`); } catch { /* stockage indisponible : retour à la carte */ }
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="app-shell">
      <aside className="desktop-rail">
        <NavLink to="/" className="brand" aria-label="Govapark, accueil"><span className="brand-mark"><ParkingSquare size={22} /></span><span>Govapark</span></NavLink>
        <p className="rail-caption">Le stationnement partagé<br />en Île-de-France.</p>
        <nav className="rail-nav" aria-label="Navigation principale">
          {visibleNav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "active" : ""}><Icon size={19} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="rail-note">{demo ? <><span className="live-dot" />Données de démonstration<br /><small>Paiement désactivé</small></> : <small>Paiement désactivé</small>}</div>
      </aside>
      <main className={`app-main ${isMap ? "map-main" : ""}`}><Outlet /></main>
      <nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${bottomNav.length}, minmax(0, 1fr))` }} aria-label="Navigation principale">
        {bottomNav.map(({ to, label, short, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "active" : ""}><Icon size={21} strokeWidth={isMap && to === "/" ? 2.4 : 2} /><span>{short ?? label}</span></NavLink>)}
      </nav>
    </div>
  );
}
