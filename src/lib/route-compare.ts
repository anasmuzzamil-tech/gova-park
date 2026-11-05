// Trajets comparés : fonctions pures (testées dans api/route-compare.test.ts).
// Aucune alternative n'est inventée : seules les routes renvoyées par le service d'itinéraire (OSRM) sont comparées, au plus 3.
// Aucune donnée de trafic : toutes les durées sont « sans traffic » (voir NO_TRAFFIC dans route-calc.ts).
import type { RouteStep } from "./guidance";

export const MAX_ROUTE_ALTERNATIVES = 3;
/** Une route doit rester au moins cette distance (m) sur une même voie nommée pour être citée en « via ». */
export const VIA_MIN_METERS = 200;

type Line = Array<[number, number]>; // [lat, lng]
type Ring = Array<[number, number]>; // [lng, lat], comme le fichier de la ZFE

/** Route principale d'un trajet : la voie NOMMÉE la plus longue (distances cumulées des étapes de même nom). `null` si aucun nom n'existe ou si aucune voie n'atteint 200 m : on n'invente rien. */
export function viaRoad(steps: Array<Pick<RouteStep, "distance" | "name">>): string | null {
  const totals = new Map<string, number>();
  for (const s of steps) {
    const name = typeof s.name === "string" ? s.name.replace(/\s+/g, " ").trim() : "";
    if (!name || !(s.distance > 0)) continue;
    totals.set(name, (totals.get(name) ?? 0) + s.distance);
  }
  let best: string | null = null, bestM = 0;
  for (const [name, m] of totals) if (m > bestM) { best = name; bestM = m; }
  return best && bestM >= VIA_MIN_METERS ? best : null;
}

/** Au plus 3 routes, sans doublon strict (mêmes distance, durée et nombre de points). Une seule route reçue = une seule renvoyée. */
export function capAlternatives<T extends { distance: number; duration: number; coordinates: unknown[] }>(routes: T[], max = MAX_ROUTE_ALTERNATIVES): T[] {
  const out: T[] = [];
  for (const r of routes) {
    if (out.length >= max) break;
    if (out.some((o) => o.distance === r.distance && o.duration === r.duration && o.coordinates.length === r.coordinates.length)) continue;
    out.push(r);
  }
  return out;
}

/** Point dans un polygone (tir de rayon). `ring` en [lng, lat]. */
export function pointInRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
function segmentsCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * Le tracé traverse-t-il le périmètre de la ZFE de Paris ? Vrai si un point du tracé est dans le périmètre OU si un segment du tracé coupe la limite
 * (une route qui entre et ressort entre deux points est comptée). Périmètre absent ou invalide, tracé vide : faux (on n'affirme jamais sans donnée).
 * `line` en [lat, lng] (format des itinéraires), `ring` en [lng, lat] (format du fichier).
 */
export function routeCrossesZfe(line: Line, ring: Ring | null | undefined): boolean {
  if (!ring || ring.length < 4 || line.length === 0) return false;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of ring) { w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat); }
  const inBox = (lat: number, lng: number) => lat >= s && lat <= n && lng >= w && lng <= e;
  for (const [lat, lng] of line) if (inBox(lat, lng) && pointInRing(lat, lng, ring)) return true;
  for (let i = 1; i < line.length; i++) {
    const [la, lo] = line[i - 1], [lb, lp] = line[i];
    if (Math.max(la, lb) < s || Math.min(la, lb) > n || Math.max(lo, lp) < w || Math.min(lo, lp) > e) continue;
    for (let k = 0; k < ring.length; k++) if (segmentsCross([lo, la], [lp, lb], ring[(k + ring.length - 1) % ring.length], ring[k])) return true;
  }
  return false;
}

/** Étiquette courte d'une carte de trajet, tirée du libellé calculé (« Le plus rapide », « Le moins cher », « Le plus court »…). `null` pour une simple alternative : pas d'étiquette vide de sens. */
export function tripTag(label: string | undefined): string | null {
  const l = label ?? "";
  if (/rapide/i.test(l)) return "Le plus rapide";
  if (/moins cher/i.test(l)) return "Le moins cher";
  if (/court/i.test(l)) return "Le plus court";
  if (/rapport|compromis/i.test(l)) return "Équilibré";
  return null;
}
