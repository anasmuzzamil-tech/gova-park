import { useRef, useState } from "react";
import { BellRing, MapPin, Smartphone, Radio, Square } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";

export default function NativePushControl() {
  const [busy, setBusy] = useState(false);
  const [backgroundActive, setBackgroundActive] = useState(false);
  const listenersRegistered = useRef(false);
  const register = trpc.govapark.devices.register.useMutation({ onSuccess: () => toast.success("Cet appareil est associé à votre compte GOVAPARK."), onError: (e) => toast.error(e.message) });
  const activate = async () => {
    setBusy(true);
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) { toast.message("Les notifications push natives seront disponibles dans l’application iPhone/Android installée."); return; }
      const { PushNotifications } = await import("@capacitor/push-notifications");
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") { toast.error("Autorisation de notification refusée dans les réglages du téléphone."); return; }
      if (!listenersRegistered.current) {
        await PushNotifications.addListener("registration", (token) => {
          const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
          register.mutate({ token: token.value, platform });
        });
        await PushNotifications.addListener("registrationError", (error) => toast.error(`Inscription push impossible : ${String(error)}`));
        await PushNotifications.addListener("pushNotificationReceived", (notification) => toast.message(notification.title || "Notification GOVAPARK", { description: notification.body }));
        await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
          const destination = notification.data?.path;
          if (typeof destination === "string" && destination.startsWith("/") && !destination.startsWith("//")) window.location.assign(destination);
        });
        listenersRegistered.current = true;
      }
      await PushNotifications.register();
      toast.message("Demande d’inscription envoyée au système de notifications.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Fonction native indisponible."); }
    finally { setBusy(false); }
  };
  const location = async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) { toast.message("Le GPS du navigateur reste disponible avec l’autorisation de localisation."); return; }
      const { Geolocation } = await import("@capacitor/geolocation");
      let permission = await Geolocation.checkPermissions();
      if (permission.location !== "granted") permission = await Geolocation.requestPermissions();
      if (permission.location === "granted") { await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 }); toast.success("Autorisation GPS native accordée."); }
      else toast.error("Autorisation GPS refusée.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "GPS natif indisponible."); }
  };
  const toggleBackground = async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) { toast.message("Installez GOVAPARK sur iPhone ou Android pour le GPS en arrière-plan."); return; }
      if (backgroundActive) {
        const { stopConsentedBackgroundLocation } = await import("@/lib/background-location");
        await stopConsentedBackgroundLocation(); setBackgroundActive(false); toast.success("Suivi GPS en arrière-plan arrêté."); return;
      }
      const accepted = window.confirm("Autorisez-vous GOVAPARK à utiliser votre position même lorsque l’application est en arrière-plan pendant votre trajet ? Le suivi restera actif jusqu’à ce que vous l’arrêtiez ici.");
      if (!accepted) return;
      const { startConsentedBackgroundLocation } = await import("@/lib/background-location");
      await startConsentedBackgroundLocation(() => { /* Position traitée localement ; aucune transmission serveur automatique. */ });
      setBackgroundActive(true); toast.success("Suivi GPS en arrière-plan activé sur cet appareil.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Impossible de démarrer le GPS en arrière-plan."); }
  };
  return <div className="native-control-row"><button className="btn btn-secondary" disabled={busy || register.isPending} onClick={activate}><BellRing size={17}/>Activer les notifications push</button><button className="btn btn-secondary" onClick={location}><MapPin size={17}/>Autoriser le GPS natif</button><button className="btn btn-secondary" onClick={toggleBackground}>{backgroundActive?<Square size={17}/>:<Radio size={17} />}{backgroundActive?"Arrêter GPS arrière-plan":"Activer GPS arrière-plan"}</button><small><Smartphone size={14}/> Le suivi en arrière-plan nécessite votre accord explicite. Les coordonnées ne sont pas envoyées par ce module.</small></div>;
}
