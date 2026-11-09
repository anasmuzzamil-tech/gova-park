import { describe, expect, it } from "vitest";
import { MY_CAR_KEY, durationText, loadCar, makeCar, paidUntilFromClock, paidUntilFromDuration, parkedText, parseCar, reminderPhase, reminderTimes, saveCar, walkEstimate, withNote } from "../src/lib/my-car";

const fakeStorage = () => { const m: Record<string, string> = {}; return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; }, removeItem: (k: string) => { delete m[k]; }, dump: m }; };
const center = { lat: 48.85, lng: 2.35 };

describe("position de la voiture", () => {
  it("GPS précis (≤ 50 m) : position de l'appareil", () => {
    const car = makeCar({ device: { latitude: 48.86, longitude: 2.36, accuracy: 20 }, mapCenter: center, at: 1 });
    expect(car).toMatchObject({ lat: 48.86, lng: 2.36, approx: false, accuracy: 20 });
  });
  it("GPS imprécis ou absent : centre de la carte, marqué approximatif", () => {
    expect(makeCar({ device: { latitude: 48.86, longitude: 2.36, accuracy: 80 }, mapCenter: center, at: 1 })).toMatchObject({ lat: 48.85, approx: true, accuracy: null });
    expect(makeCar({ device: null, mapCenter: center, at: 1 })?.approx).toBe(true);
    expect(makeCar({ device: null, mapCenter: null, at: 1 })).toBeNull();
  });
  it("note nettoyée et bornée à 120 caractères", () => {
    const car = makeCar({ device: null, mapCenter: center, at: 1, note: "  niveau -2   place 14 " })!;
    expect(car.note).toBe("niveau -2 place 14");
    expect(withNote(car, "x".repeat(200)).note.length).toBe(120);
  });
  it("lecture tolérante et aller-retour dans le stockage", () => {
    expect(parseCar("{pas du json")).toBeNull();
    expect(parseCar({ lat: 200, lng: 2, at: 1 })).toBeNull();
    const s = fakeStorage();
    const car = makeCar({ device: null, mapCenter: center, at: 5 })!;
    expect(saveCar(car, s)).toBe(true);
    expect(loadCar(s)).toEqual(car);
    saveCar(null, s);
    expect(s.dump[MY_CAR_KEY]).toBeUndefined();
  });
});

describe("rappel de fin de stationnement", () => {
  const now = new Date(2026, 10, 9, 14, 0, 0).getTime();
  it("heure saisie : aujourd'hui, ou demain si déjà passée", () => {
    expect(paidUntilFromClock("15:30", now)).toBe(new Date(2026, 10, 9, 15, 30).getTime());
    expect(paidUntilFromClock("13:00", now)).toBe(new Date(2026, 10, 10, 13, 0).getTime());
    expect(paidUntilFromClock("25:00", now)).toBeNull();
  });
  it("durée bornée de 1 min à 24 h", () => {
    expect(paidUntilFromDuration(90, now)).toBe(now + 90 * 60000);
    expect(paidUntilFromDuration(0, now)).toBeNull();
    expect(paidUntilFromDuration(24 * 60 + 1, now)).toBeNull();
  });
  it("phases et instants des deux rappels", () => {
    const end = now + 30 * 60000;
    expect(reminderPhase(null, now)).toBe("none");
    expect(reminderPhase(end, now)).toBe("running");
    expect(reminderPhase(end, end - 5 * 60000)).toBe("soon");
    expect(reminderPhase(end, end)).toBe("over");
    expect(reminderTimes(end, now).map((r) => r.kind)).toEqual(["soon", "over"]);
    expect(reminderTimes(end, end - 5 * 60000).map((r) => r.kind)).toEqual(["over"]);
  });
  it("textes de durée", () => {
    expect(durationText(72 * 60000)).toBe("1 h 12");
    expect(durationText(12 * 60000)).toBe("12 min");
    expect(parkedText(now, now + 30000)).toBe("Garée à l’instant");
    expect(parkedText(now, now + 72 * 60000)).toBe("Garée il y a 1 h 12");
  });
  it("estimation à pied à vol d'oiseau (≈ 75 m/min)", () => {
    const w = walkEstimate({ lat: 48.85, lng: 2.35 }, { lat: 48.859, lng: 2.35 });
    expect(w.meters).toBeGreaterThan(990); expect(w.meters).toBeLessThan(1010);
    expect(w.minutes).toBe(13);
  });
});
