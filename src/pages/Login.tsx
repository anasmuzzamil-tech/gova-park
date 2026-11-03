import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";

function getOAuthUrl() {
  const authUrl = import.meta.env.VITE_KIMI_AUTH_URL; const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`; const state = btoa(redirectUri);
  const url = new URL(`${authUrl}/api/oauth/authorize`); url.searchParams.set("client_id", appId); url.searchParams.set("redirect_uri", redirectUri); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", "profile"); url.searchParams.set("state", state); return url.toString();
}

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">(() => new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login");
  const [accountType, setAccountType] = useState<"user" | "owner">("user");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const navigate = useNavigate(); const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); toast.success("Connexion réussie"); navigate("/"); }, onError: e => toast.error(e.message) });
  const register = trpc.auth.register.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); toast.success("Votre compte GOVAPARK est créé"); navigate("/"); }, onError: e => toast.error(e.message) });
  const submit = (e: FormEvent) => { e.preventDefault(); if (mode === "login") login.mutate({ email, password }); else register.mutate({ name, email, password, accountType }); };
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">GOVAPARK · ESPACE SÉCURISÉ</span><h1>{mode === "login" ? "Heureux de vous revoir." : "Créer votre compte."}</h1><p>Un seul compte, un espace adapté à votre rôle : conducteur, propriétaire ou équipe GOVAPARK.</p><div className="auth-switch"><button className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>Se connecter</button><button className={mode === "register" ? "selected" : ""} onClick={() => setMode("register")}>Créer un compte</button></div><form onSubmit={submit} className="form-stack">{mode === "register" && <><label>Nom et prénom<input required minLength={2} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label><label>Type de compte<select value={accountType} onChange={e => setAccountType(e.target.value as "user" | "owner")}><option value="user">Conducteur / locataire</option><option value="owner">Propriétaire d’une place</option></select></label></>}<label>Adresse e-mail<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label><label>Mot de passe<input required type="password" minLength={mode === "register" ? 10 : 1} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />{mode === "register" && <small>10 caractères minimum. Votre mot de passe est stocké sous forme de hash sécurisé.</small>}</label><button className="btn btn-primary btn-full btn-large" disabled={login.isPending || register.isPending}>{login.isPending || register.isPending ? "Patientez…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button></form>{import.meta.env.VITE_KIMI_AUTH_URL && import.meta.env.VITE_APP_ID && <button className="btn btn-secondary btn-full" type="button" onClick={() => { window.location.href = getOAuthUrl(); }}>Continuer avec Kimi (compte existant)</button>}<small className="auth-footnote">L’espace société est réservé aux comptes administrateurs créés par GOVAPARK. Il n’est pas possible de s’attribuer soi-même ce rôle.</small></section></main>;
}
