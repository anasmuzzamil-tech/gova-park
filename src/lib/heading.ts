// Cap (direction) du véhicule calculé depuis deux positions GPS successives, partagé par les cartes 3D et Leaflet.
type Point = { lat: number; lng: number };

export function bearingBetween(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

export function metersBetween(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dx = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad) * 6371000;
  const dy = (b.lat - a.lat) * rad * 6371000;
  return Math.hypot(dx, dy);
}

// L'emoji voiture regarde vers la gauche : on le retourne côté est pour qu'il ne soit jamais à l'envers.
export function carBadgeTransform(heading: number | null) {
  const h = heading ?? 0;
  return h < 180 ? `rotate(${h - 90}deg) scaleX(-1)` : `rotate(${h - 270}deg)`;
}
