import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "fr.govapark.app",
  appName: "GOVAPARK",
  webDir: "dist/public",
  bundledWebRuntime: false,
  android: { useLegacyBridge: true },
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchShowDuration: 1800, backgroundColor: "#101820", showSpinner: false },
    StatusBar: { style: "DARK", backgroundColor: "#101820" },
    Geolocation: { enableHighAccuracy: true },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    LocalNotifications: { smallIcon: "ic_stat_govapark", iconColor: "#D8A94A" }
  }
};
export default config;
