import { Capacitor } from "@capacitor/core";

/** Initialise uniquement les comportements natifs sûrs. Aucun suivi GPS permanent n'est lancé ici. */
export async function initialiseNativeLifecycle() {
  if (!Capacitor.isNativePlatform()) return;
  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import("@capacitor/app"), import("@capacitor/status-bar"), import("@capacitor/splash-screen"),
  ]);
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);
  App.addListener("appUrlOpen", ({ url }) => {
    // Les liens GOVAPARK sont transmis à la route web sans ouvrir une URL arbitraire.
    try { const parsed = new URL(url); if (parsed.protocol === "govapark:" || parsed.hostname.endsWith("govapark.fr")) window.location.href = parsed.pathname + parsed.search; } catch { /* lien invalide ignoré */ }
  });
}
