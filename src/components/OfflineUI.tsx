import { useEffect, useRef, useState } from "react";
import { CloudOff, Download, Wifi } from "lucide-react";
import { Modal } from "@/components/Modal";
import { DOWNLOAD_LIMITS, downloadArea, loadAreas, type DownloadResult } from "@/lib/offline";

const fmt = (ms: number) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(ms));

/** Bandeau en haut de l'écran : hors ligne (permanent) ou connexion rétablie (3 s). */
export function OfflineBanner({ online, savedAt }: { online: boolean; savedAt: number }) {
  const [backOnline, setBackOnline] = useState(false);
  const wasOffline = useRef(!online);
  useEffect(() => {
    if (!online) { wasOffline.current = true; setBackOnline(false); return; }
    if (!wasOffline.current) return;
    wasOffline.current = false; setBackOnline(true);
    const timer = window.setTimeout(() => setBackOnline(false), 3000);
    return () => window.clearTimeout(timer);
  }, [online]);
  if (online && !backOnline) return null;
  return online
    ? <div className="offline-banner online" role="status"><Wifi size={14} />Connexion rétablie</div>
    : <div className="offline-banner" role="status"><CloudOff size={14} /><span><b>Hors ligne – disponibilité non actualisée</b>{savedAt ? ` · places du ${fmt(savedAt)}` : " · aucune place enregistrée"}</span></div>;
}

/** Fenêtre « Télécharger cette zone » : périmètre annoncé clairement, limite stricte de tuiles. */
export function OfflineDownloadModal({ center, basemap, onClose }: { center: { lat: number; lng: number }; basemap: "vector" | "raster"; onClose: () => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const limits = DOWNLOAD_LIMITS[basemap];
  const areas = loadAreas();
  useEffect(() => () => controller.current?.abort(), []);
  const start = async () => {
    setError(null); setResult(null);
    const ctl = new AbortController(); controller.current = ctl;
    try { setResult(await downloadArea(center.lat, center.lng, basemap, setProgress, ctl.signal)); }
    catch (e) { setError(e instanceof Error ? e.message : "Téléchargement impossible"); }
    finally { setProgress(null); }
  };
  return (
    <Modal title="Carte hors ligne" onClose={onClose}>
      <div className="offline-modal">
        <p><b>Ce que fait le mode hors ligne.</b> Govapark s’ouvre sans réseau, affiche votre position GPS, les cartes déjà consultées ou téléchargées, et les dernières places chargées <b>sans disponibilité actualisée</b>.</p>
        <p><b>Ce qu’il ne fait pas.</b> Pas de calcul d’itinéraire ni de guidage hors ligne (une ligne droite et la distance à vol d’oiseau sont affichées), pas de disponibilité en temps réel, pas de réservation.</p>
        <p>« Télécharger cette zone » enregistre la carte autour du centre de l’écran (environ {limits.radiusKm} km de rayon, zooms {limits.zooms[0]} à {limits.zooms[limits.zooms.length - 1]}, {limits.maxTiles} tuiles au maximum). Ce n’est pas une carte complète d’une région.</p>
        {progress && <p role="status">Téléchargement… {progress.done} / {progress.total}</p>}
        {result && <p role="status" className="offline-ok">{result.cached} tuile{result.cached > 1 ? "s" : ""} enregistrée{result.cached > 1 ? "s" : ""} sur {result.requested} demandées.{result.cached < result.requested ? " Certaines n’ont pas pu être récupérées." : ""}</p>}
        {error && <p role="alert" className="offline-err">{error}</p>}
        {areas.length > 0 && <small>Dernière zone enregistrée : {fmt(areas[0].at)} ({areas[0].tiles} tuiles).</small>}
        <button className="btn btn-primary" disabled={!!progress} onClick={() => void start()}><Download size={16} /> Télécharger cette zone</button>
      </div>
    </Modal>
  );
}
