// Aides de la couche « Places en rue » : position de l'appareil (obligatoire pour SIGNALER seulement) et messages courts.
// Chercher des places près d'une adresse n'a besoin d'aucune position ; la règle des 50 m est vérifiée par le serveur.

export type DevicePosition = { latitude: number; longitude: number; accuracy: number };

export type GeolocReason = "unsupported" | "denied" | "unavailable" | "timeout";

/** Messages courts (2 lignes au plus) affichés en toast quand la position manque pour signaler. */
export function geolocMessage(reason: GeolocReason, ios: boolean): string {
  if (reason === "denied") {
    return ios
      ? "Position nécessaire pour signaler votre place. Réglages iPhone > Safari > Localisation (ou Réglages du site), puis réessayez."
      : "Position nécessaire pour signaler votre place. Autorisez la localisation dans le navigateur (cadenas de la barre d'adresse), puis réessayez.";
  }
  if (reason === "timeout") return "Position introuvable à temps. Activez le GPS puis réessayez.";
  if (reason === "unsupported") return "Position indisponible sur cet appareil : impossible de signaler une place.";
  return "Position indisponible. Activez le GPS ou le Wi-Fi, puis réessayez.";
}

const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

export class GeolocError extends Error {
  constructor(public reason: GeolocReason, message: string) { super(message); }
}

/** Demande la position précise de l'appareil. Rejette avec une GeolocError au message court (jamais bloquant pour le reste de l'appli). */
export function getDevicePosition(): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    const fail = (reason: GeolocReason) => reject(new GeolocError(reason, geolocMessage(reason, isIos())));
    if (typeof navigator === "undefined" || !navigator.geolocation) { fail("unsupported"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => fail(e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );
  });
}
