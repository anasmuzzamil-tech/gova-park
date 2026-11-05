// Aides de la couche « Places en rue » : position de l'appareil (obligatoire pour signaler) et messages.

export type DevicePosition = { latitude: number; longitude: number; accuracy: number };

export const GEOLOC_WHY = "La position de votre appareil est obligatoire pour signaler une place : elle sert à vérifier que vous êtes bien à côté (moins de 50 m) et évite les faux signalements. Elle n'est pas affichée aux autres utilisateurs. Le reste de l'application fonctionne sans.";

export class GeolocError extends Error {
  constructor(public reason: "unsupported" | "denied" | "unavailable" | "timeout", message: string) { super(message); }
}

/** Demande la position précise de l'appareil. Rejette avec une GeolocError au message explicite (jamais bloquant pour le reste de l'appli). */
export function getDevicePosition(): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { reject(new GeolocError("unsupported", "La géolocalisation n'est pas disponible sur cet appareil. " + GEOLOC_WHY)); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) reject(new GeolocError("denied", "Localisation refusée. " + GEOLOC_WHY + " Autorisez la localisation dans les réglages de votre navigateur puis réessayez."));
        else if (e.code === e.TIMEOUT) reject(new GeolocError("timeout", "Position introuvable à temps. Vérifiez que le GPS est activé et réessayez."));
        else reject(new GeolocError("unavailable", "Position indisponible. Activez le GPS ou le Wi-Fi de votre appareil et réessayez."));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );
  });
}
