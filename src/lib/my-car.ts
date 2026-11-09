// « Où est ma voiture ? » et rappel personnel de fin de stationnement payé.
// 100 % local : stockage dans le navigateur de l'appareil (localStorage protégé par try/catch), aucun compte requis, rien n'est envoyé au serveur.
// Aucun signalement de place n'est créé ici. Le rappel est un rappel PERSONNEL : l'application ne paie jamais le stationnement.
// Fonctions pures testées dans api/my-car.test.ts ; l'écran fait seul la lecture et l'écriture.
export const MY_CAR_KEY = "govapark.myCar.v1";
/** Événement émis à chaque écriture, pour que la carte, le compteur et le rappel restent d'accord dans le même onglet. */
export const MY_CAR_EVENT = "govapark:mycar";
/** Position de l'appareil retenue seulement si sa précision est de 50 m au plus ; sinon le centre de la carte, signalé comme approximatif. */
export const CAR_PRECISE_M = 50;
/** Premier rappel : 10 min avant l'échéance. */
export const REMIND_BEFORE_MIN = 10;
export const MAX_NOTE = 120;
/** Vitesse de marche de l'estimation à vol d'oiseau (4,5 km/h). */
export const WALK_M_PER_MIN = 75;
const DAY_MS = 24 * 3600 * 1000;

export type MyCar = {
  lat: number; lng: number;
  /** Vrai si la position est le centre de la carte (GPS absent ou imprécis) : toujours dit à l'écran. */
  approx: boolean;
  accuracy: number | null;
  at: number;
  note: string;
  /** Session du compteur liée (compte connecté), sinon null. */
  sessionId: number | null;
  /** Fin du stationnement payé déclarée par l'utilisateur (ms), sinon null. */
  paidUntil: number | null;
};

const validPoint = (lat: unknown, lng: unknown): boolean => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const cleanNote = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) : "");
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Position de la voiture : l'appareil si précis (≤ 50 m), sinon le centre de la carte (approximatif), sinon rien. */
export function makeCar(input: { device?: { latitude: number; longitude: number; accuracy?: number | null } | null; mapCenter?: { lat: number; lng: number } | null; at: number; note?: string; sessionId?: number | null }): MyCar | null {
  const d = input.device;
  const base = { at: input.at, note: cleanNote(input.note), sessionId: finite(input.sessionId) ? input.sessionId : null, paidUntil: null };
  if (d && validPoint(d.latitude, d.longitude) && finite(d.accuracy) && d.accuracy <= CAR_PRECISE_M) return { lat: d.latitude, lng: d.longitude, approx: false, accuracy: d.accuracy, ...base };
  const c = input.mapCenter;
  if (c && validPoint(c.lat, c.lng)) return { lat: c.lat, lng: c.lng, approx: true, accuracy: null, ...base };
  return null;
}

/** Lecture tolérante : texte illisible ou entrée mal formée = null, jamais d'exception. */
export function parseCar(raw: unknown): MyCar | null {
  let data: unknown = raw;
  if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { return null; } }
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  if (!validPoint(r.lat, r.lng) || !finite(r.at)) return null;
  return { lat: r.lat as number, lng: r.lng as number, approx: r.approx === true, accuracy: finite(r.accuracy) ? r.accuracy : null, at: r.at, note: cleanNote(r.note), sessionId: finite(r.sessionId) ? r.sessionId : null, paidUntil: finite(r.paidUntil) ? r.paidUntil : null };
}

export const withNote = (car: MyCar, note: string): MyCar => ({ ...car, note: cleanNote(note) });
export const withSession = (car: MyCar, sessionId: number | null): MyCar => ({ ...car, sessionId: finite(sessionId) ? sessionId : null });
export const withPaidUntil = (car: MyCar, paidUntil: number | null): MyCar => ({ ...car, paidUntil: finite(paidUntil) ? paidUntil : null });

/** « HH:MM » saisi : aujourd'hui, ou demain si l'heure est déjà passée. Saisie invalide : null. */
export function paidUntilFromClock(hhmm: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(now); d.setHours(h, min, 0, 0);
  let t = d.getTime();
  if (t <= now) t += DAY_MS;
  return t;
}

/** Durée en minutes (1 min à 24 h). Invalide : null. */
export function paidUntilFromDuration(minutes: number, now: number): number | null {
  if (!finite(minutes) || minutes < 1 || minutes > 24 * 60) return null;
  return now + Math.round(minutes) * 60000;
}

export type ReminderPhase = "none" | "running" | "soon" | "over";
/** running : plus de 10 min ; soon : 10 min ou moins ; over : échéance passée. */
export function reminderPhase(paidUntil: number | null, now: number): ReminderPhase {
  if (!finite(paidUntil)) return "none";
  const left = paidUntil - now;
  if (left <= 0) return "over";
  return left <= REMIND_BEFORE_MIN * 60000 ? "soon" : "running";
}

/** Instants des deux rappels encore à venir (10 min avant, puis échéance). */
export function reminderTimes(paidUntil: number | null, now: number): Array<{ kind: "soon" | "over"; at: number }> {
  if (!finite(paidUntil)) return [];
  return [{ kind: "soon" as const, at: paidUntil - REMIND_BEFORE_MIN * 60000 }, { kind: "over" as const, at: paidUntil }].filter((r) => r.at > now);
}

/** « 1 h 05 », « 12 min », « moins d'une minute ». */
export function durationText(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return "moins d’une minute";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

/** « Garée à l'instant », « Garée il y a 1 h 12 ». */
export function parkedText(at: number, now: number): string {
  return now - at < 60000 ? "Garée à l’instant" : `Garée il y a ${durationText(now - at)}`;
}

function meters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimation à pied À VOL D'OISEAU (aucun itinéraire piéton dans l'application) : toujours étiquetée comme telle à l'écran. */
export function walkEstimate(from: { lat: number; lng: number }, to: { lat: number; lng: number }): { meters: number; minutes: number } {
  const m = meters(from.lat, from.lng, to.lat, to.lng);
  return { meters: Math.round(m), minutes: Math.max(1, Math.round(m / WALK_M_PER_MIN)) };
}

function safeStorage(): Storage | null { try { return window.localStorage; } catch { return null; } }
export function loadCar(storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : safeStorage()): MyCar | null {
  try { return parseCar(storage?.getItem(MY_CAR_KEY) ?? null); } catch { return null; }
}
/** Écrit (ou efface avec null) et prévient les autres écrans de l'onglet. Renvoie false si l'écriture a échoué (navigation privée, stockage plein). */
export function saveCar(car: MyCar | null, storage: Pick<Storage, "setItem" | "removeItem"> | null = typeof window === "undefined" ? null : safeStorage()): boolean {
  let ok = false;
  try { if (storage) { if (car) storage.setItem(MY_CAR_KEY, JSON.stringify(car)); else storage.removeItem(MY_CAR_KEY); ok = true; } } catch { ok = false; }
  try { if (typeof window !== "undefined") window.dispatchEvent(new Event(MY_CAR_EVENT)); } catch { /* sans événement : relu au prochain affichage */ }
  return ok;
}
