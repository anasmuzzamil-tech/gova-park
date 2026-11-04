import { describe, expect, it } from "vitest";
import { validateListing, type ListingDraft } from "@contracts/listing-validation";

const ok: ListingDraft = { title: "Box sécurisé Bastille", description: "Box fermé, accès par portail, largeur confortable.", address: "12 rue de la Roquette 75011 Paris", approxAddress: "Paris 11e", accessInstructions: "Badge à l'entrée", latitude: 48.8546, longitude: 2.3784, lengthM: 5, widthM: 2.4, heightCm: 200, hourlyCents: 250, dailyCents: 1800, weeklyCents: 9000, photoCount: 2, availability: { days: [1, 2], start: "08:00", end: "20:00" } };

describe("validation d'une annonce avant publication", () => {
  it("accepte une annonce complète", () => { expect(validateListing(ok)).toEqual([]); });
  it("refuse sans position GPS ou hors de France", () => {
    expect(validateListing({ ...ok, latitude: 0, longitude: 0 }).length).toBe(1);
    expect(validateListing({ ...ok, latitude: 40.7, longitude: -74 }).length).toBe(1);
  });
  it("refuse sans photo, dimensions absurdes et prix incohérents", () => {
    expect(validateListing({ ...ok, photoCount: 0 }).length).toBe(1);
    expect(validateListing({ ...ok, lengthM: 30 }).length).toBe(1);
    expect(validateListing({ ...ok, dailyCents: 100 }).length).toBe(1);
    expect(validateListing({ ...ok, weeklyCents: 1000 }).length).toBe(1);
  });
  it("refuse horaires invalides", () => {
    expect(validateListing({ ...ok, availability: { days: [], start: "08:00", end: "20:00" } }).length).toBe(1);
    expect(validateListing({ ...ok, availability: { days: [1], start: "20:00", end: "08:00" } }).length).toBe(1);
  });
});
