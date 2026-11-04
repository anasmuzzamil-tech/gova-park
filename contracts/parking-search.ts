// Recherche de places : filtres, zone affichée (bbox) et disponibilité sur un créneau.
// Fonctions pures, partagées par le serveur (requête réelle et mode démo) et testées dans api/parking-search.test.ts.
import { overlaps } from "./pricing";

export type Schedule = { days: number[]; start: string; end: string };
export type Period = { start: string | Date; end: string | Date };
export type Slot = { startAt: Date; endAt: Date };
export type Bbox = { south: number; west: number; north: number; east: number };

const parisFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** Jour (0 = dimanche) et minute de la journée à l'heure de Paris, quel que soit le fuseau du serveur. */
export function parisParts(date: Date) {
  const parts = parisFormat.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return { day: WEEKDAYS[get("weekday")] ?? 0, minute: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}
const toMinute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/** Le propriétaire accepte-t-il ce moment précis (horaires hebdomadaires, hors périodes bloquées) ? */
export function isOpenAt(schedule: Schedule, blocked: Period[], at: Date): boolean {
  const { day, minute } = parisParts(at);
  if (!schedule.days.includes(day) || minute < toMinute(schedule.start) || minute > toMinute(schedule.end)) return false;
  return !blocked.some((p) => new Date(p.start) <= at && new Date(p.end) > at);
}

/** Créneau entièrement couvert par les horaires du propriétaire (échantillonné toutes les 15 min, 7 jours max). */
export function scheduleAllows(schedule: Schedule, blocked: Period[], start: Date, end: Date, maxDays = 7): boolean {
  if (end <= start || end.getTime() - start.getTime() > maxDays * 24 * 3600000) return false;
  for (let t = start.getTime(); t < end.getTime(); t += 15 * 60000) if (!isOpenAt(schedule, blocked, new Date(t))) return false;
  return isOpenAt(schedule, blocked, new Date(end.getTime() - 60000));
}

/** Une réservation existante recoupe-t-elle le créneau demandé ? (deux créneaux qui se suivent exactement ne se recoupent pas) */
export function hasConflict(bookings: Slot[], startAt: Date, endAt: Date): boolean {
  return bookings.some((b) => overlaps(startAt, endAt, b.startAt, b.endAt));
}

export type SearchListing = {
  latitude: number; longitude: number; hourlyCents: number; placeType: string; covered: boolean;
  lengthM: number; widthM: number; heightCm: number; accessible?: boolean;
  availability: string; blocked: string;
  parkingStatus?: { availability: string };
};
export type SearchFilters = {
  bbox?: Bbox; maxHourlyCents?: number; placeType?: string; covered?: boolean; accessible?: boolean;
  priceMode?: "free" | "paid"; minLengthM?: number; minWidthM?: number; minHeightCm?: number;
  onlyAvailable?: boolean; from?: Date; to?: Date;
};

export function inBbox(lat: number, lng: number, b: Bbox) { return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east; }

/** Zone carrée autour d'un point (pour « distance maximale »). */
export function bboxAround(lat: number, lng: number, km: number): Bbox {
  const dLat = km / 111.32, dLng = km / (111.32 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

/** Applique TOUS les filtres. `bookings` = réservations actives de cette place (pour le créneau demandé). */
export function matchesFilters(l: SearchListing, f: SearchFilters, bookings: Slot[] = []): boolean {
  if (f.bbox && !inBbox(l.latitude, l.longitude, f.bbox)) return false;
  if (f.maxHourlyCents != null && l.hourlyCents > f.maxHourlyCents) return false;
  if (f.placeType && l.placeType !== f.placeType) return false;
  if (f.covered != null && l.covered !== f.covered) return false;
  if (f.accessible && !l.accessible) return false;
  if (f.priceMode === "free" && l.hourlyCents > 0) return false;
  if (f.priceMode === "paid" && l.hourlyCents <= 0) return false;
  if (f.minLengthM != null && l.lengthM < f.minLengthM) return false;
  if (f.minWidthM != null && l.widthM < f.minWidthM) return false;
  if (f.minHeightCm != null && l.heightCm < f.minHeightCm) return false;
  if (f.onlyAvailable && l.parkingStatus?.availability !== "available") return false;
  if (f.from && f.to) {
    const schedule = parseJson<Schedule>(l.availability, { days: [], start: "00:00", end: "00:00" });
    const blocked = parseJson<Period[]>(l.blocked, []);
    if (!scheduleAllows(schedule, blocked, f.from, f.to) || hasConflict(bookings, f.from, f.to)) return false;
  }
  return true;
}
