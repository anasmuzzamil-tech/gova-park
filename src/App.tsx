import { useEffect } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router";
import { Toaster } from "sonner";
import AppShell from "@/components/AppShell";
import Home from "@/pages/Home";
import PlaceDetail from "@/pages/PlaceDetail";
import BookingFlow from "@/pages/BookingFlow";
import Reservations from "@/pages/Reservations";
import Owner from "@/pages/Owner";
import Profile from "@/pages/Profile";
import Favorites from "@/pages/Favorites";
import Admin from "@/pages/Admin";
import Company from "@/pages/Company";
import ClientDashboard from "@/pages/ClientDashboard";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Messages from "@/pages/Messages";
import Mobility from "@/pages/Mobility";
import Meter from "@/pages/Meter";
import { useAuth } from "@/hooks/useAuth";

function ResumeAfterLogin() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isLoading && isAuthenticated && window.location.pathname === "/") {
      const destination = sessionStorage.getItem("govaparkReturn");
      if (destination) { sessionStorage.removeItem("govaparkReturn"); navigate(destination, { replace: true }); }
    }
  }, [isAuthenticated, isLoading, navigate]);
  return null;
}

// Les messages (toasts) ont UN seul emplacement : en haut, centrés, sous la rangée de puces de la carte (et à 16 px du haut des autres pages).
const MAP_TOAST_TOP = "calc(env(safe-area-inset-top, 0px) + 138px)";
export default function App() {
  const onMap = useLocation().pathname === "/";
  return <><ResumeAfterLogin /><Routes>
    <Route element={<AppShell />}>
      <Route path="/" element={<Home />} />
      <Route path="/espace-client" element={<ClientDashboard />} />
      <Route path="/place/:id" element={<PlaceDetail />} />
      <Route path="/reserver/:id" element={<BookingFlow />} />
      <Route path="/reservations" element={<Reservations />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/compteur" element={<Meter />} />
      <Route path="/mobilite" element={<Mobility />} />
      <Route path="/proposer" element={<Owner />} />
      <Route path="/profil" element={<Profile />} />
      <Route path="/favoris" element={<Favorites />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/entreprise" element={<Company />} />
    </Route>
    <Route path="/login" element={<Login />} />
    <Route path="*" element={<NotFound />} />
  </Routes><Toaster position="top-center" richColors closeButton duration={4000} visibleToasts={1} className="gp-toaster" offset={{ top: onMap ? MAP_TOAST_TOP : 16 }} mobileOffset={{ top: onMap ? MAP_TOAST_TOP : 16 }} /></>;
}
