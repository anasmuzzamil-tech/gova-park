// Règles de réservation d'une place privée (logique serveur, fonction pure testée dans api/booking.test.ts).
// Les places publiques ne sont jamais réservables ici : seules les annonces privées publiées le sont.
import { hasConflict, parseJson, scheduleAllows, type Period, type Schedule, type Slot } from "./parking-search";

export type BookingCheck = { ok: true } | { ok: false; code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT"; message: string };

export function checkBooking(
  listing: { status: string; availability: string; blocked: string },
  startAt: Date, endAt: Date, activeBookings: Slot[], now: Date = new Date(),
): BookingCheck {
  if (listing.status !== "published") return { ok: false, code: "NOT_FOUND", message: "Cette annonce n’est pas publiée." };
  if (!(startAt < endAt)) return { ok: false, code: "BAD_REQUEST", message: "Le départ doit être postérieur à l’arrivée." };
  if (startAt.getTime() < now.getTime() - 300000) return { ok: false, code: "BAD_REQUEST", message: "Choisissez un créneau à venir." };
  if (endAt.getTime() - startAt.getTime() > 31 * 24 * 3600000) return { ok: false, code: "BAD_REQUEST", message: "Durée maximale : 31 jours." };
  const blocked = parseJson<Period[]>(listing.blocked, []);
  if (blocked.some((p) => startAt < new Date(p.end) && new Date(p.start) < endAt)) return { ok: false, code: "CONFLICT", message: "Ce créneau est bloqué par le propriétaire." };
  const schedule = parseJson<Schedule>(listing.availability, { days: [], start: "00:00", end: "00:00" });
  if (!scheduleAllows(schedule, [], startAt, endAt, 31)) return { ok: false, code: "CONFLICT", message: `Accès proposé de ${schedule.start} à ${schedule.end} (heure de Paris) les jours indiqués par le propriétaire.` };
  if (hasConflict(activeBookings, startAt, endAt)) return { ok: false, code: "CONFLICT", message: "Ce créneau vient d’être réservé ou est en cours de paiement." };
  return { ok: true };
}
