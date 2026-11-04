// Regroupement de marqueurs par grille quand la carte est trop chargée (zoom faible).
// En dessous du zoom CLUSTER_MAX_ZOOM, les places proches sont regroupées en une bulle avec leur nombre.
export const CLUSTER_MAX_ZOOM = 13;

export type Cluster<T> = { lat: number; lng: number; items: T[] };

export function clusterPoints<T extends { latitude: number; longitude: number }>(items: T[], zoom: number, cellPx = 56): Cluster<T>[] {
  if (zoom >= CLUSTER_MAX_ZOOM || items.length < 2) return items.map((item) => ({ lat: item.latitude, lng: item.longitude, items: [item] }));
  const cell = (360 / (256 * Math.pow(2, Math.floor(zoom)))) * cellPx;
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const key = `${Math.floor(item.longitude / cell)}:${Math.floor(item.latitude / cell)}`;
    const list = cells.get(key); if (list) list.push(item); else cells.set(key, [item]);
  }
  return [...cells.values()].map((group) => ({
    lat: group.reduce((a, i) => a + i.latitude, 0) / group.length,
    lng: group.reduce((a, i) => a + i.longitude, 0) / group.length,
    items: group,
  }));
}
