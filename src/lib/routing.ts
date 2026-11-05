// Recalcul d'un itinéraire pendant le guidage : serveurs OSRM publics gratuits, essayés l'un après l'autre.
import { mapOsrmSteps, type NavRoute } from "./guidance";

type OsrmRoute = { geometry: { coordinates: [number, number][] }; distance: number; duration: number; legs?: Array<{ steps?: Array<Parameters<typeof mapOsrmSteps>[0][number]> }> };

/** Itinéraire en voiture entre deux points, ou null si tous les serveurs sont injoignables (jamais d'itinéraire inventé). */
export async function fetchOsrmRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<NavRoute | null> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const endpoints = [
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
  ];
  for (const url of endpoints) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;
      const data = await response.json() as { routes?: OsrmRoute[] };
      const route = data.routes?.[0];
      if (!route) continue;
      return {
        coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
        distance: route.distance, duration: route.duration,
        steps: mapOsrmSteps(route.legs?.flatMap((leg) => leg.steps ?? []) ?? [], [to.lat, to.lng]),
      };
    } catch { /* serveur suivant */ }
  }
  return null;
}
