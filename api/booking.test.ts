import { describe, expect, it } from "vitest";
import { checkBooking } from "@contracts/booking";
import { calculatePrice } from "@contracts/pricing";

const listing = { status: "published", availability: JSON.stringify({ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" }), blocked: "[]" };
const now = new Date("2026-11-04T08:00:00Z");
const d = (iso: string) => new Date(iso);

describe("réservation d'une place privée", () => {
  it("accepte un créneau libre et calcule le prix", () => {
    const start = d("2026-11-04T10:00:00Z"), end = d("2026-11-04T12:00:00Z");
    expect(checkBooking(listing, start, end, [], now).ok).toBe(true);
    expect(calculatePrice({ startAt: start, endAt: end, hourlyCents: 250, dailyCents: 1800, weeklyCents: 9000 }).baseCents).toBe(500);
  });
  it("empêche la double réservation de créneaux qui se recoupent", () => {
    const taken = [{ startAt: d("2026-11-04T10:00:00Z"), endAt: d("2026-11-04T12:00:00Z") }];
    const r = checkBooking(listing, d("2026-11-04T11:00:00Z"), d("2026-11-04T13:00:00Z"), taken, now);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("CONFLICT");
  });
  it("autorise un créneau qui commence exactement quand l'autre finit", () => {
    const taken = [{ startAt: d("2026-11-04T10:00:00Z"), endAt: d("2026-11-04T12:00:00Z") }];
    expect(checkBooking(listing, d("2026-11-04T12:00:00Z"), d("2026-11-04T13:00:00Z"), taken, now).ok).toBe(true);
  });
  it("refuse hors horaires du propriétaire (heure de Paris)", () => {
    const office = { ...listing, availability: JSON.stringify({ days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }) };
    expect(checkBooking(office, d("2026-11-04T06:00:00Z"), d("2026-11-04T08:00:00Z"), [], now).ok).toBe(false); // 07h-09h Paris
    expect(checkBooking(office, d("2026-11-04T09:00:00Z"), d("2026-11-04T11:00:00Z"), [], now).ok).toBe(true);
    expect(checkBooking(office, d("2026-11-07T09:00:00Z"), d("2026-11-07T11:00:00Z"), [], now).ok).toBe(false); // samedi : jour non ouvert
  });
  it("refuse période bloquée, passé, durée nulle et annonce non publiée", () => {
    const blocked = { ...listing, blocked: JSON.stringify([{ start: "2026-11-04T10:00:00Z", end: "2026-11-04T11:00:00Z" }]) };
    expect(checkBooking(blocked, d("2026-11-04T09:30:00Z"), d("2026-11-04T10:30:00Z"), [], now).ok).toBe(false);
    expect(checkBooking(listing, d("2026-11-03T10:00:00Z"), d("2026-11-03T11:00:00Z"), [], now).ok).toBe(false);
    expect(checkBooking(listing, d("2026-11-04T10:00:00Z"), d("2026-11-04T10:00:00Z"), [], now).ok).toBe(false);
    expect(checkBooking({ ...listing, status: "pending" }, d("2026-11-04T10:00:00Z"), d("2026-11-04T11:00:00Z"), [], now).ok).toBe(false);
  });
});
