import { describe, expect, it } from "vitest";
import {
  haversineMeters, durationSeconds, bikeDurationSeconds, fuelCostEur, tripCostEur, straightLineEstimate, routeEndpoints,
  formatDistance, formatDuration, formatEuro, summaryLine, isSamePlace, DEFAULT_CONSUMPTION, STRAIGHT_LINE_DETOUR,
} from "@/lib/route-calc";

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b) <= tol).toBe(true);

describe("distance à vol d'oiseau (Haversine)", () => {
  it("0 si les deux points sont identiques", () => { expect(haversineMeters({ lat: 48.85, lng: 2.35 }, { lat: 48.85, lng: 2.35 })).toBe(0); });
  it("1 degré de latitude = environ 111,19 km", () => { near(haversineMeters({ lat: 48, lng: 2 }, { lat: 49, lng: 2 }), 111195, 100); });
  it("Notre-Dame à la tour Eiffel : environ 4,1 km", () => { near(haversineMeters({ lat: 48.8530, lng: 2.3499 }, { lat: 48.8584, lng: 2.2945 }), 4080, 120); });
  it("symétrique", () => {
    const a = { lat: 48.85, lng: 2.35 }, b = { lat: 48.9, lng: 2.4 };
    expect(haversineMeters(a, b)).toBe(haversineMeters(b, a));
  });
  it("destination = position : même lieu (moins de 100 m)", () => {
    expect(isSamePlace({ lat: 48.85, lng: 2.35 }, { lat: 48.85, lng: 2.35 })).toBe(true);
    expect(isSamePlace({ lat: 48.85, lng: 2.35 }, { lat: 48.8509, lng: 2.35 })).toBe(false);
  });
});

describe("coût du carburant", () => {
  it("cas calculé : 10 km, 6,5 L/100, 1,80 €/L = 1,17 €", () => { expect(fuelCostEur(10, 6.5, 1.8)).toBe(1.17); });
  it("moto 4,5 L/100 sur 20 km à 1,80 €/L = 1,62 €", () => { expect(fuelCostEur(20, 4.5, 1.8)).toBe(1.62); });
  it("arrondi au centime", () => { expect(fuelCostEur(3.3, 7.2, 1.799)).toBe(0.43); });
  it("distance 0, consommation 0, prix absent ou négatif : 0 €", () => {
    expect(fuelCostEur(0, 6.5, 1.8)).toBe(0); expect(fuelCostEur(10, 0, 1.8)).toBe(0);
    expect(fuelCostEur(10, 6.5, NaN)).toBe(0); expect(fuelCostEur(-5, 6.5, 1.8)).toBe(0);
  });
  it("vélo : toujours 0 €, même avec une consommation saisie", () => { expect(tripCostEur("bike", 10000, 6.5, 1.8)).toBe(0); });
  it("voiture et livraison : mètres convertis en km", () => { expect(tripCostEur("car", 10000, 6.5, 1.8)).toBe(1.17); expect(tripCostEur("delivery", 10000, 6.5, 1.8)).toBe(1.17); });
  it("consommations par défaut : moto plus basse que voiture, vélo nulle", () => {
    expect(DEFAULT_CONSUMPTION.moto).toBe(4.5); expect(DEFAULT_CONSUMPTION.moto < DEFAULT_CONSUMPTION.car).toBe(true); expect(DEFAULT_CONSUMPTION.bike).toBe(0);
  });
});

describe("durée et estimation vélo", () => {
  it("15 km à 15 km/h = 1 h", () => { expect(durationSeconds(15000, 15)).toBe(3600); });
  it("distance nulle ou négative : 0", () => { expect(durationSeconds(0)).toBe(0); expect(durationSeconds(-3)).toBe(0); });
  it("durée du service gardée si valide, sinon 15 km/h", () => {
    expect(bikeDurationSeconds(500, 15000)).toBe(500);
    expect(bikeDurationSeconds(0, 15000)).toBe(3600); expect(bikeDurationSeconds(undefined, 7500)).toBe(1800);
  });
  it("à vol d'oiseau : distance x 1,3 et 15 km/h", () => {
    const a = { lat: 48, lng: 2 }, b = { lat: 49, lng: 2 };
    const e = straightLineEstimate(a, b);
    near(e.distanceM, haversineMeters(a, b) * STRAIGHT_LINE_DETOUR, 0.001);
    near(e.durationS, e.distanceM / 1000 / 15 * 3600, 1);
  });
  it("destination = position : estimation nulle, sans erreur", () => {
    const p = { lat: 48.85, lng: 2.35 }; expect(straightLineEstimate(p, p)).toEqual({ distanceM: 0, durationS: 0 });
  });
});

describe("serveurs d'itinéraire par profil", () => {
  const coords = "2.35,48.85;2.36,48.86";
  it("vélo : uniquement le service vélo, profil routed-bike", () => {
    const urls = routeEndpoints("bike", coords);
    expect(urls.length).toBe(1);
    expect(urls[0]).toBe("https://routing.openstreetmap.de/routed-bike/route/v1/driving/2.35,48.85;2.36,48.86?overview=full&geometries=geojson&steps=true&alternatives=true");
  });
  it("voiture, moto, livraison : jamais le service vélo", () => {
    for (const v of ["car", "moto", "delivery"] as const) expect(routeEndpoints(v, coords).some((u) => u.includes("routed-bike"))).toBe(false);
  });
});

describe("formats", () => {
  it("distance", () => { expect(formatDistance(850)).toBe("850 m"); expect(formatDistance(10000)).toBe("10,0 km"); expect(formatDistance(5249)).toBe("5,2 km"); expect(formatDistance(0)).toBe("0 m"); });
  it("durée", () => { expect(formatDuration(10)).toBe("1 min"); expect(formatDuration(2700)).toBe("45 min"); expect(formatDuration(3900)).toBe("1 h 05"); expect(formatDuration(0)).toBe("0 min"); });
  it("euros", () => { expect(formatEuro(1.17)).toBe("1,17 €"); expect(formatEuro(0)).toBe("0 €"); expect(formatEuro(12)).toBe("12,00 €"); });
  it("résumé : véhicule, estimation moto et vélo de secours, sans traffic", () => {
    expect(summaryLine({ vehicle: "car", distanceM: 10000, durationS: 1200, costEur: 1.17 })).toBe("20 min · 10,0 km · 1,17 € · Voiture · sans traffic");
    expect(summaryLine({ vehicle: "moto", distanceM: 10000, durationS: 1200, costEur: 0.81 })).toBe("20 min · 10,0 km · 0,81 € · Moto · estimation · sans traffic");
    expect(summaryLine({ vehicle: "bike", distanceM: 5000, durationS: 1200, costEur: 0, estimate: true })).toBe("20 min · 5,0 km · 0 € · Vélo · estimation · sans traffic");
    expect(summaryLine({ vehicle: "car", distanceM: 10000, durationS: 600, costEur: 1.17, costAssumed: true })).toContain("(prix supposé)");
  });
});
