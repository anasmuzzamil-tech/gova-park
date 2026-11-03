import { useNavigate } from "react-router";
import { LockKeyhole, ArrowRight } from "lucide-react";

export function AuthGate({ title = "Connectez-vous pour continuer", compact = false }: { title?: string; compact?: boolean }) {
  const navigate = useNavigate();
  const login = (mode: "login" | "register" = "login") => {
    sessionStorage.setItem("govaparkReturn", window.location.pathname);
    navigate(mode === "register" ? "/login?mode=register" : "/login");
  };
  return (
    <div className={`auth-gate ${compact ? "compact" : ""}`}>
      <LockKeyhole size={24} />
      <div><h3>{title}</h3><p>Votre sélection et vos horaires sont conservés. Vous reprendrez exactement ici après connexion.</p></div>
      <button className="btn btn-primary" onClick={login}>Se connecter <ArrowRight size={17} /></button>
      <button className="btn btn-secondary" onClick={() => login("register")}>Créer un compte</button>
      <small>Un compte est nécessaire pour accéder à l’application GOVAPARK.</small>
    </div>
  );
}
