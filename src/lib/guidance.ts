// Moteur de guidage « façon Waze » (fonctions pures, sans dépendance, testées dans api/guidance.test.ts).
// Source des itinéraires : OSRM public (gratuit). Aucune donnée de trafic : l'heure d'arrivée est une estimation.
import { metersBetween } from "./heading";

export type LatLngTuple = [number, number]; // [lat, lng]
export type Direction = "left" | "right" | "slight-left" | "slight-right" | "sharp-left" | "sharp-right" | "straight" | "uturn" | "roundabout" | "arrive" | "depart";
export type RouteStep = { instruction: string; distance: number; location: LatLngTuple; dir?: Direction; name?: string };
export type NavDest = { lat: number; lng: number; label: string; kind: "street" | "listing" | "address"; reportedAt?: string; status?: "free" | "taken"; example?: boolean };
export type NavRoute = { coordinates: LatLngTuple[]; distance: number; duration: number; steps: RouteStep[] };

export const GUIDANCE = {
  /** Distance au-delà de laquelle on considère l'utilisateur hors itinéraire (en plus de la précision GPS). */
  offRouteMeters: 60,
  /** Nombre de positions consécutives hors itinéraire avant de recalculer. */
  offRouteFixes: 3,
  /** Délai minimal entre deux recalculs. */
  rerouteCooldownMs: 15000,
  /** Distance restante sous laquelle on est arrivé. */
  arriveMeters: 25,
  /** Annonces vocales (mètres avant la manœuvre), de la plus lointaine à la plus proche. */
  bands: [500, 200, 50],
} as const;

const DIRS: Record<string, Direction> = { left: "left", right: "right", "slight left": "slight-left", "slight right": "slight-right", "sharp left": "sharp-left", "sharp right": "sharp-right", straight: "straight", uturn: "uturn" };
const SIDE_FR: Record<Direction, string> = {
  left: "à gauche", right: "à droite", "slight-left": "légèrement à gauche", "slight-right": "légèrement à droite", "sharp-left": "franchement à gauche", "sharp-right": "franchement à droite",
  straight: "tout droit", uturn: "demi-tour", roundabout: "", arrive: "", depart: "",
};
const ordinal = (n: number) => (n === 1 ? "première" : `${n}ᵉ`);

/** Instruction française d'une manœuvre OSRM (type, modificateur, nom de rue, numéro de sortie de rond-point). */
export function maneuverText(type: string | undefined, modifier: string | undefined, name?: string, exit?: number): { text: string; dir: Direction } {
  const dir = modifier ? DIRS[modifier] : undefined;
  const road = name ? ` sur ${name}` : "";
  switch (type) {
    case "depart": return { text: `Démarrez${road}`, dir: "depart" };
    case "arrive": return { text: dir === "left" ? "Vous êtes arrivé, destination sur votre gauche" : dir === "right" ? "Vous êtes arrivé, destination sur votre droite" : "Vous êtes arrivé à destination", dir: "arrive" };
    case "roundabout": case "rotary": case "roundabout turn":
      return { text: exit ? `Au rond-point, prenez la ${ordinal(exit)} sortie${road}` : `Prenez le rond-point${road}`, dir: "roundabout" };
    case "fork": return { text: `À la bifurcation, restez ${SIDE_FR[dir ?? "straight"] || "tout droit"}${road}`.replace("restez tout droit", "continuez tout droit"), dir: dir ?? "straight" };
    case "merge": return { text: `Insérez-vous${road}`, dir: dir ?? "straight" };
    case "on ramp": case "off ramp": return { text: `Prenez la bretelle${dir && dir !== "straight" ? ` ${SIDE_FR[dir]}` : ""}${road}`, dir: dir ?? "straight" };
    case "end of road": return { text: `Au bout de la route, tournez ${SIDE_FR[dir ?? "straight"] || "à droite"}${road}`, dir: dir ?? "right" };
    case "continue": case "new name": return { text: dir && dir !== "straight" ? `Continuez ${SIDE_FR[dir]}${road}` : `Continuez tout droit${road}`, dir: dir ?? "straight" };
    default:
      if (dir === "uturn") return { text: "Faites demi-tour", dir };
      if (dir === "straight" || !dir) return { text: `Continuez tout droit${road}`, dir: "straight" };
      return { text: `Tournez ${SIDE_FR[dir]}${road}`, dir };
  }
}

type RawStep = { distance: number; name?: string; maneuver?: { type?: string; modifier?: string; exit?: number; location?: [number, number] } };
/** Convertit les étapes OSRM (lng,lat) en étapes françaises (lat,lng). `fallback` sert si une étape n'a pas de position. */
export function mapOsrmSteps(raw: RawStep[], fallback: LatLngTuple): RouteStep[] {
  return raw.map((s) => {
    const m = maneuverText(s.maneuver?.type, s.maneuver?.modifier, s.name, s.maneuver?.exit);
    const loc = s.maneuver?.location;
    return { instruction: m.text, distance: s.distance, location: loc ? [loc[1], loc[0]] : fallback, dir: m.dir, name: s.name };
  });
}

// ---------- Projection sur l'itinéraire ----------

export type NavPlan = { coords: LatLngTuple[]; cum: number[]; total: number; stepAlong: number[] };

const toPoint = (c: LatLngTuple) => ({ lat: c[0], lng: c[1] });

function projectToSegment(p: { lat: number; lng: number }, a: LatLngTuple, b: LatLngTuple, segLen: number, cumStart: number) {
  const mx = 111320, k = Math.cos((p.lat * Math.PI) / 180);
  const ax = (a[1] - p.lng) * mx * k, ay = (a[0] - p.lat) * mx, bx = (b[1] - p.lng) * mx * k, by = (b[0] - p.lat) * mx;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return { off: Math.hypot(ax + t * dx, ay + t * dy), along: cumStart + t * segLen };
}

/** Plus proche point de l'itinéraire : distance parcourue (`along`), écart (`off`) et segment. `hint` limite la recherche autour du dernier segment connu. */
export function projectOnRoute(plan: Pick<NavPlan, "coords" | "cum">, p: { lat: number; lng: number }, hint = 0): { along: number; off: number; seg: number } {
  const n = plan.coords.length - 1;
  if (n < 1) return { along: 0, off: plan.coords[0] ? metersBetween(p, toPoint(plan.coords[0])) : 0, seg: 0 };
  const scan = (from: number, to: number) => {
    let best = { along: 0, off: Infinity, seg: from };
    for (let i = from; i < to; i++) {
      const r = projectToSegment(p, plan.coords[i], plan.coords[i + 1], plan.cum[i + 1] - plan.cum[i], plan.cum[i]);
      if (r.off < best.off) best = { ...r, seg: i };
    }
    return best;
  };
  const windowed = scan(Math.max(0, hint - 3), Math.min(n, hint + 80));
  return windowed.off <= 40 ? windowed : scan(0, n);
}

/** Prépare l'itinéraire : distances cumulées et position de chaque manœuvre le long du tracé. */
export function buildPlan(route: Pick<NavRoute, "coordinates" | "steps">): NavPlan {
  const coords = route.coordinates;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + metersBetween(toPoint(coords[i - 1]), toPoint(coords[i])));
  const total = cum[cum.length - 1] || 0;
  const base = { coords, cum };
  const stepAlong: number[] = [];
  let hint = 0;
  for (const s of route.steps) {
    const r = projectOnRoute(base, toPoint(s.location), hint);
    // Les manœuvres sont dans l'ordre du trajet : jamais en arrière de la précédente.
    stepAlong.push(Math.max(r.along, stepAlong.length ? stepAlong[stepAlong.length - 1] : 0));
    hint = r.seg;
  }
  return { coords, cum, total, stepAlong };
}

export type NavProgress = {
  along: number; off: number; seg: number; remaining: number; remainingSec: number;
  next: { index: number; step: RouteStep; distance: number } | null; then: RouteStep | null; arrived: boolean; located: boolean;
};

/** État du guidage pour une position (ou sans position : tout l'itinéraire reste devant soi). */
export function navProgress(plan: NavPlan, route: Pick<NavRoute, "steps" | "duration">, pos: { lat: number; lng: number } | null, hint = 0): NavProgress {
  const r = pos ? projectOnRoute(plan, pos, hint) : { along: 0, off: 0, seg: 0 };
  const remaining = Math.max(0, plan.total - r.along);
  const remainingSec = plan.total > 0 ? route.duration * (remaining / plan.total) : route.duration;
  const last = plan.coords[plan.coords.length - 1];
  const nearEnd = !!pos && !!last && metersBetween(pos, toPoint(last)) <= GUIDANCE.arriveMeters;
  const arrived = !!pos && (nearEnd || (remaining <= GUIDANCE.arriveMeters && r.off <= GUIDANCE.offRouteMeters));
  let idx = -1;
  for (let i = 1; i < route.steps.length; i++) if (plan.stepAlong[i] > r.along + 15) { idx = i; break; }
  if (idx === -1 && route.steps.length === 1) idx = 0;
  const next = idx >= 0 ? { index: idx, step: route.steps[idx], distance: Math.max(0, plan.stepAlong[idx] - r.along) } : null;
  const then = idx >= 0 && idx + 1 < route.steps.length ? route.steps[idx + 1] : null;
  return { ...r, remaining, remainingSec, next, then, arrived, located: !!pos };
}

/** Faut-il recalculer ? `fixes` = nombre de positions consécutives hors itinéraire. */
export function shouldReroute(off: number, accuracy: number | undefined, fixes: number, lastRerouteAt: number, now: number): boolean {
  const limit = Math.max(GUIDANCE.offRouteMeters, (accuracy ?? 0) * 1.5);
  return off > limit && fixes >= GUIDANCE.offRouteFixes && now - lastRerouteAt >= GUIDANCE.rerouteCooldownMs;
}

// ---------- Annonces vocales ----------

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const speakDist = (m: number) => (m >= 1000 ? `${(m / 1000).toString().replace(".", ",")} kilomètre${m >= 2000 ? "s" : ""}` : `${m} mètres`);

/**
 * Annonce à prononcer pour la manœuvre `index` à `distance` m, ou null. `spoken` mémorise ce qui a déjà été dit
 * (une annonce par palier, jamais deux fois). Si plusieurs paliers sont franchis d'un coup, seul le plus proche est dit.
 */
export function pickAnnouncement(index: number, text: string, distance: number, spoken: Set<string>): string | null {
  const bands = GUIDANCE.bands;
  let chosen = -1;
  for (let b = 0; b < bands.length; b++) if (distance <= bands[b] && !spoken.has(`${index}:${b}`)) chosen = b;
  if (chosen === -1) return null;
  for (let b = 0; b <= chosen; b++) spoken.add(`${index}:${b}`);
  const last = chosen === bands.length - 1;
  return last ? text : `Dans ${speakDist(bands[chosen])}, ${lowerFirst(text)}`;
}

// ---------- Affichage ----------

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10 || Math.round(m))} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",")} km`;
}

export function formatEta(nowMs: number, remainingSec: number): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(nowMs + remainingSec * 1000));
}

export function formatDuration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}
