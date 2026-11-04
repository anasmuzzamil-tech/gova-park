import "@/lib/logger";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'
import { initialiseNativeLifecycle } from "@/lib/native-lifecycle"

void initialiseNativeLifecycle();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Enregistrement PWA : l'application s'ouvre hors ligne (shell + tuiles déjà vues). Le fichier /sw.js est servi à la racine.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(async (registration) => {
      // Une fois le worker actif, on lui indique les fichiers /assets/ chargés par la page (noms hachés par Vite) pour le shell hors ligne.
      const worker = (await navigator.serviceWorker.ready).active ?? registration.active;
      window.setTimeout(() => {
        const urls = performance.getEntriesByType("resource").map((entry) => new URL(entry.name, location.href)).filter((url) => url.origin === location.origin && url.pathname.startsWith("/assets/")).map((url) => url.pathname);
        worker?.postMessage({ type: "GOVAPARK_PRECACHE", urls: [...new Set(urls)] });
      }, 4000);
    }).catch((error) => {
      console.error("Impossible d'activer le mode application GOVAPARK", error);
    });
  });
}
