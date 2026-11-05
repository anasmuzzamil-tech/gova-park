// Géolocalisation de l'appareil : une seule logique pour le bouton « Ma position », les signalements et le stationnement.
// Pensée pour Safari / PWA iPhone : appel dans le geste de l'utilisateur, essai précis puis essai réseau (basse précision),
// aucune promesse sans fin, aucune erreur avalée, aucun état « refusé » mémorisé (chaque toucher redemande).

export type DevicePosition = { latitude: number; longitude: number; accuracy: number };
export type GeolocReason = "unsupported" | "denied" | "unavailable" | "timeout";

/** Texte exact demandé pour iPhone quand la localisation est refusée. */
export const IOS_DENIED_HELP = "Réglages > Confidentialité et sécurité > Service de localisation > activé, puis Safari (Sites web) > Lors de l'utilisation. Dans Safari : icône aA > Réglages du site web > Position > Autoriser.";

/** Messages courts selon le code d'erreur (1 refusée, 2 indisponible, 3 délai dépassé). */
export function geolocMessage(reason: GeolocReason, ios: boolean): string {
  if (reason === "denied") {
    return ios
      ? `Position refusée. ${IOS_DENIED_HELP}`
      : "Position refusée. Autorisez la localisation dans le navigateur (cadenas de la barre d'adresse), puis réessayez.";
  }
  if (reason === "timeout") return "Position introuvable à temps. Vérifiez que le GPS est activé et que vous avez du réseau, puis touchez Ma position.";
  if (reason === "unsupported") return "Position indisponible : ce navigateur ne gère pas la géolocalisation.";
  return "Position indisponible. Activez le service de localisation et le Wi-Fi ou les données mobiles, puis réessayez.";
}

export const reasonOfCode = (code: number): GeolocReason => code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable";

export class GeolocError extends Error {
  constructor(public reason: GeolocReason, message: string, public code: number | null = null) { super(message); }
}

// ----- Diagnostic (affiché dans le panneau « i », pour qu'une capture d'écran suffise à comprendre) -----
export type GeolocDiag = { permission: string; lastCode: number | null; lastReason: GeolocReason | null; accuracy: number | null; attempt: string | null; at: number | null };
let diag: GeolocDiag = { permission: "inconnue", lastCode: null, lastReason: null, accuracy: null, attempt: null, at: null };
const listeners = new Set<() => void>();
const setDiag = (patch: Partial<GeolocDiag>) => { diag = { ...diag, ...patch }; listeners.forEach((l) => l()); };
export const getGeolocDiag = () => diag;
export const subscribeGeolocDiag = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const noteGeolocError = (code: number) => setDiag({ lastCode: code, lastReason: reasonOfCode(code), at: Date.now() });
export const noteGeolocFix = (accuracy: number, attempt: string) => setDiag({ accuracy: Math.round(accuracy), attempt, at: Date.now() });

/** Lecture seule de l'état d'autorisation, à titre d'information : n'empêche jamais une demande (Safari ancien : « inconnue »). */
export async function refreshPermissionState(): Promise<void> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (status) setDiag({ permission: ({ granted: "autorisée", denied: "refusée", prompt: "à demander" } as Record<string, string>)[status.state] ?? status.state });
  } catch { setDiag({ permission: "inconnue" }); }
}

// ----- Acquisition -----
type GeoLike = { getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void, err: (e: { code: number }) => void, o?: PositionOptions) => void };

export const PRECISE_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 };
export const COARSE_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 };
/** Garde-fou : sur iPhone le délai ne démarre qu'après la réponse à la fenêtre d'autorisation ; on ne reste jamais sans réponse. */
export const HARD_LIMIT_MS = 30000;

/** Essai précis, puis (sauf refus) essai basse précision avec position récente acceptée. Rejette toujours avec une GeolocError. */
export function acquirePosition(geo: GeoLike | undefined, ios: boolean, hardLimitMs = HARD_LIMIT_MS): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(guard); fn(); };
    const fail = (reason: GeolocReason, code: number | null) => finish(() => { if (code != null) noteGeolocError(code); else setDiag({ lastCode: null, lastReason: reason, at: Date.now() }); reject(new GeolocError(reason, geolocMessage(reason, ios), code)); });
    const guard = setTimeout(() => fail("timeout", 3), hardLimitMs);
    if (!geo) { fail("unsupported", null); return; }
    const ok = (attempt: string) => (p: { coords: { latitude: number; longitude: number; accuracy: number } }) =>
      finish(() => { noteGeolocFix(p.coords.accuracy, attempt); resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }); });
    try {
      geo.getCurrentPosition(ok("précise"), (e) => {
        if (e.code === 1) { fail("denied", 1); return; }
        try {
          geo.getCurrentPosition(ok("réseau"), (e2) => fail(reasonOfCode(e2.code), e2.code), COARSE_OPTIONS);
        } catch { fail("unavailable", 2); }
      }, PRECISE_OPTIONS);
    } catch { fail("unavailable", 2); }
  });
}

const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** À appeler directement depuis un toucher (geste utilisateur), jamais après un await long. */
export function getDevicePosition(): Promise<DevicePosition> {
  void refreshPermissionState();
  return acquirePosition(typeof navigator === "undefined" ? undefined : navigator.geolocation, isIos());
}
