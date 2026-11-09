import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MY_CAR_EVENT, MY_CAR_KEY, loadCar, reminderPhase, reminderTimes, saveCar, type MyCar } from "@/lib/my-car";

/** « Ma voiture » lue sur l'appareil, tenue à jour entre la carte, le compteur et les autres onglets. */
export function useMyCar(): [MyCar | null, (car: MyCar | null) => void] {
  const [car, setCar] = useState<MyCar | null>(() => loadCar());
  useEffect(() => {
    const reload = () => setCar(loadCar());
    const onStorage = (e: StorageEvent) => { if (e.key === MY_CAR_KEY) reload(); };
    window.addEventListener(MY_CAR_EVENT, reload);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(MY_CAR_EVENT, reload); window.removeEventListener("storage", onStorage); };
  }, []);
  return [car, (next) => { saveCar(next); setCar(next); }];
}

export type NotifState = "unsupported" | "default" | "granted" | "denied";
export function notificationState(): NotifState {
  try { return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"; } catch { return "unsupported"; }
}
/** À appeler dans un geste de l'utilisateur (toucher d'un bouton). */
export async function askNotifications(): Promise<NotifState> {
  try { if (!("Notification" in window)) return "unsupported"; return await Notification.requestPermission(); } catch { return notificationState(); }
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

async function notify(title: string, body: string): Promise<void> {
  try {
    if (notificationState() !== "granted") return;
    // Service worker d'abord (seule voie sur iPhone, appli ajoutée à l'écran d'accueil) ; sinon notification de la page.
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) { await reg.showNotification(title, { body, tag: "govapark-parking" }); return; }
    new Notification(title, { body, tag: "govapark-parking" });
  } catch { /* notification refusée par le navigateur : le message dans l'application suffit */ }
}

/**
 * Rappel personnel de fin de stationnement payé (monté une fois dans AppShell). Minuteries de la page : aucun envoi serveur, aucun service externe.
 * Limite assumée : si l'application est fermée ou mise en veille par le système, le rappel peut ne pas partir ; il s'affiche alors au retour.
 */
export function useParkingReminder(): void {
  const [car] = useMyCar();
  const paidUntil = car?.paidUntil ?? null;
  const fired = useRef(new Set<string>());
  useEffect(() => {
    if (paidUntil == null) return;
    const fire = (kind: "soon" | "over") => {
      const key = `${paidUntil}-${kind}`;
      if (fired.current.has(key)) return;
      fired.current.add(key);
      const text = kind === "soon" ? `Votre stationnement payé se termine dans 10 min (à ${hhmm(paidUntil)}).` : `Votre stationnement payé se termine maintenant (${hhmm(paidUntil)}).`;
      toast.warning(`${text} Rappel personnel : GOVAPARK ne paie pas le stationnement.`, { id: "parking-reminder", duration: 15000 });
      void notify("Fin de stationnement", text);
    };
    const now = Date.now();
    const timers = reminderTimes(paidUntil, now).map((r) => window.setTimeout(() => fire(r.kind), r.at - now));
    // Retour dans l'application après une veille (minuteries suspendues) : le rappel dû s'affiche une fois.
    const onVisible = () => { if (document.visibilityState !== "visible") return; const t = Date.now(), phase = reminderPhase(paidUntil, t); if (phase === "soon" || (phase === "over" && t - paidUntil < 2 * 3600000)) fire(phase); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { timers.forEach((t) => window.clearTimeout(t)); document.removeEventListener("visibilitychange", onVisible); };
  }, [paidUntil]);
}
