import { describe, expect, it } from "vitest";
import { bboxAround, hasConflict, isOpenAt, matchesFilters, scheduleAllows, type SearchListing } from "@contracts/parking-search";

const week = JSON.stringify({ days: [1, 2, 3, 4, 5], start: "08:00", end: "20:00" });
const base: SearchListing = { latitude: 48.85, longitude: 2.35, hourlyCents: 250, placeType: "garage", covered: true, lengthM: 5, widthM: 2.4, heightCm: 200, accessible: false, availability: week, blocked: "[]", parkingStatus: { availability: "available" } };
// 2026-11-04 est un mercredi ; Paris = UTC+1 en novembre.
const d = (iso: string) => new Date(iso);

describe("recherche de places", () => {
  it("horaires évalués à l'heure de Paris", () => {
    const schedule = JSON.parse(week);
    expect(isOpenAt(schedule, [], d("2026-11-04T08:30:00Z"))).toBe(true);   // 09h30 Paris
    expect(isOpenAt(schedule, [], d("2026-11-04T06:30:00Z"))).toBe(false);  // 07h30 Paris
    expect(isOpenAt(schedule, [], d("2026-11-08T10:00:00Z"))).toBe(false);  // dimanche
  });
  it("créneau couvert par les horaires, ou non", () => {
    const schedule = JSON.parse(week);
    expect(scheduleAllows(schedule, [], d("2026-11-04T09:00:00Z"), d("2026-11-04T12:00:00Z"))).toBe(true);
    expect(scheduleAllows(schedule, [], d("2026-11-04T17:00:00Z"), d("2026-11-04T20:00:00Z"))).toBe(false);
    expect(scheduleAllows(schedule, [{ start: "2026-11-04T10:00:00Z", end: "2026-11-04T11:00:00Z" }], d("2026-11-04T09:00:00Z"), d("2026-11-04T12:00:00Z"))).toBe(false);
  });
  it("conflit de réservation", () => {
    const b = [{ startAt: d("2026-11-04T10:00:00Z"), endAt: d("2026-11-04T12:00:00Z") }];
    expect(hasConflict(b, d("2026-11-04T11:00:00Z"), d("2026-11-04T13:00:00Z"))).toBe(true);
    expect(hasConflict(b, d("2026-11-04T12:00:00Z"), d("2026-11-04T13:00:00Z"))).toBe(false);
  });
  it("chaque filtre modifie réellement les résultats", () => {
    expect(matchesFilters(base, { maxHourlyCents: 200 })).toBe(false);
    expect(matchesFilters(base, { maxHourlyCents: 300 })).toBe(true);
    expect(matchesFilters(base, { placeType: "residence" })).toBe(false);
    expect(matchesFilters(base, { covered: false })).toBe(false);
    expect(matchesFilters(base, { accessible: true })).toBe(false);
    expect(matchesFilters({ ...base, accessible: true }, { accessible: true })).toBe(true);
    expect(matchesFilters(base, { priceMode: "free" })).toBe(false);
    expect(matchesFilters(base, { priceMode: "paid" })).toBe(true);
    expect(matchesFilters(base, { minLengthM: 5.5 })).toBe(false);
    expect(matchesFilters(base, { minWidthM: 2.6 })).toBe(false);
    expect(matchesFilters(base, { minHeightCm: 210 })).toBe(false);
    expect(matchesFilters({ ...base, parkingStatus: { availability: "unknown" } }, { onlyAvailable: true })).toBe(false);
  });
  it("zone affichée (bbox) : hors zone exclu", () => {
    const near = bboxAround(48.85, 2.35, 2);
    expect(matchesFilters(base, { bbox: near })).toBe(true);
    expect(matchesFilters({ ...base, latitude: 49.5 }, { bbox: near })).toBe(false);
  });
  it("disponibilité horaire : horaires et réservations pris en compte", () => {
    const from = d("2026-11-04T09:00:00Z"), to = d("2026-11-04T11:00:00Z");
    expect(matchesFilters(base, { from, to })).toBe(true);
    expect(matchesFilters(base, { from, to }, [{ startAt: d("2026-11-04T10:00:00Z"), endAt: d("2026-11-04T12:00:00Z") }])).toBe(false);
    expect(matchesFilters(base, { from: d("2026-11-08T09:00:00Z"), to: d("2026-11-08T11:00:00Z") })).toBe(false);
  });
});
