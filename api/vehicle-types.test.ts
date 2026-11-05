import { describe, expect, it } from "vitest";
import { SPOT_TYPE, interpretRegime, type OfficialSpot } from "@contracts/paris-spots";
import {
  DEFAULT_VEHICLE, HEAVY_VEHICLE_NOTE, VEHICLE_CHIP, VEHICLE_NAME, VEHICLE_PARK_SUFFIX, VEHICLE_SPOT_TYPES, VEHICLE_TYPES, fromProfileVehicle, isVehicleType, mergeByVehicle, spotTypesToShow, toVehicleType, vehicleTypesForSpot,
} from "@contracts/vehicle-types";

// Valeurs réelles « Régime prioritaire | Régime particulier » des types concernés (CSV de la Ville de Paris du 31/10/2026, effectifs en lignes).
const REAL: Array<[string, string, number, string | null]> = [
  ["PAYANT MIXTE", "Mixte", 0, "car"], ["PAYANT ROTATIF", "Rotatif", 0, "car"], ["GRATUIT", "Gratuit", 0, "car"],
  ["2 ROUES", "Motos payant Mixte", 5140, "moto"], ["2 ROUES", "Motos payant Rotatif", 940, "moto"],
  ["AUTOCAR", "Autocar (payant)", 100, "bus"], ["AUTOCAR", "Autocar dépose", 6, "bus"], ["AUTOCAR", "Autocar dépose/reprise", 27, "bus"], ["AUTOCAR", "Autocar reprise", 2, "bus"], ["AUTOCAR", "Autocar stationnement gratuit", 2, "bus"],
  ["LIVRAISON", "ZL permanente", 3698, "utility"], ["LIVRAISON", "ZL périodique", 5593, "utility"],
  ["2 ROUES", "Vélos", 15267, "bike"], ["2 ROUES", "Vélo-cargo", 285, "bike"], ["2 ROUES", "Box à vélos", 37, "bike"],
  // Jamais devinés : aucun type de véhicule.
  ["2 ROUES", "Mixte", 238, null], ["PAYANT MIXTE", "Mixte Marché", 0, null], ["GRATUIT", "Gratuit Bois", 0, null], ["AUTRE REGIME", "Marché", 0, null], ["GIG/GIC", "GIG/GIC Standard", 0, null],
];
const spot = (id: string, lat: number, lng: number, t: number): OfficialSpot => ({ id, lat, lng, t, places: 2, agg: false, g: 0, street: "RUE|A", num: 0 });
const report = (id: number, lat: number, lng: number, color: string, vehicleType?: string) => ({ id, latitude: lat, longitude: lng, color, reportedAt: "2026-11-05T10:00:00Z", vehicleType });

describe("types de véhicule", () => {
  it("cinq types, voiture par défaut, validation stricte", () => {
    expect([...VEHICLE_TYPES]).toEqual(["car", "moto", "utility", "bus", "bike"]);
    expect(DEFAULT_VEHICLE).toBe("car");
    for (const v of VEHICLE_TYPES) { expect(isVehicleType(v)).toBe(true); expect(VEHICLE_CHIP[v]).toBeTruthy(); expect(VEHICLE_NAME[v]).toBeTruthy(); }
    for (const bad of ["truck", "CAR", "", " car", null, undefined, 3, {}, ["car"]]) expect(isVehicleType(bad), String(bad)).toBe(false);
    expect(VEHICLE_CHIP).toEqual({ car: "Voiture", moto: "Moto", utility: "Utilitaire/PL", bus: "Bus", bike: "Vélo" });
  });
  it("chaque valeur réelle du CSV est reliée au bon type de véhicule, les valeurs incertaines à aucun", () => {
    for (const [p, q, , v] of REAL) {
      const t = interpretRegime(p, q).t;
      expect(vehicleTypesForSpot(t), `${p} | ${q}`).toEqual(v ? [v] : []);
    }
  });
  it("les catégories des types sont disjointes (un emplacement ne concerne qu'un seul type de véhicule)", () => {
    const all = VEHICLE_TYPES.flatMap((v) => VEHICLE_SPOT_TYPES[v]);
    expect(new Set(all).size).toBe(all.length);
    expect(VEHICLE_SPOT_TYPES.car).toEqual([SPOT_TYPE.paid, SPOT_TYPE.free]);
    expect(VEHICLE_SPOT_TYPES.utility).toEqual([SPOT_TYPE.delivery]);
    for (const t of [SPOT_TYPE.pmr, SPOT_TYPE.reserved, SPOT_TYPE.other]) expect(vehicleTypesForSpot(t)).toEqual([]);
  });
  it("poids lourd : seulement les zones de livraison, avec la note d'honnêteté", () => {
    expect(VEHICLE_SPOT_TYPES.utility).toEqual([SPOT_TYPE.delivery]);
    expect(interpretRegime("LIVRAISON", "ZL permanente").title).toBe("Zone de livraison");
    expect(HEAVY_VEHICLE_NOTE).toBe("Paris publie des zones de livraison et des places d'autocars ; il n'existe pas de données de stationnement poids lourd");
  });
  it("types affichés : le véhicule choisi seulement, ou tout avec « Tout »", () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect([...spotTypesToShow("moto", false, all)]).toEqual([SPOT_TYPE.moto]);
    expect([...spotTypesToShow("car", false, all)].sort()).toEqual([1, 2]);
    expect(spotTypesToShow("bus", true, all).size).toBe(9);
  });
  it("valeur stockée inconnue : voiture ; ancienne préférence du profil convertie", () => {
    expect(toVehicleType("moto")).toBe("moto"); expect(toVehicleType("tank")).toBe("car"); expect(toVehicleType(null)).toBe("car");
    expect([fromProfileVehicle("car"), fromProfileVehicle("motorcycle"), fromProfileVehicle("van"), fromProfileVehicle("truck"), fromProfileVehicle("bus"), fromProfileVehicle("bike")]).toEqual(["car", "moto", "utility", "utility", "bus", "bike"]);
    expect(fromProfileVehicle("walking")).toBeNull(); expect(fromProfileVehicle("other")).toBeNull(); expect(fromProfileVehicle(undefined)).toBeNull();
  });
  it("bouton « Je me gare » : véhicule entre parenthèses, rien pour la voiture", () => {
    expect(VEHICLE_PARK_SUFFIX.car).toBe(""); expect(`Je me gare${VEHICLE_PARK_SUFFIX.moto}`).toBe("Je me gare (moto)");
    expect(VEHICLE_TYPES.every((v) => `Je me gare${VEHICLE_PARK_SUFFIX[v]}`.length <= 20)).toBe(true);
  });
});

describe("séparation des statuts par type de véhicule", () => {
  const car = spot("c", 48.85, 2.35, SPOT_TYPE.paid), moto = spot("m", 48.85001, 2.35001, SPOT_TYPE.moto), bus = spot("b", 48.8502, 2.3502, SPOT_TYPE.coach), other = spot("o", 48.8503, 2.3503, SPOT_TYPE.pmr);
  const color = (r: { spots: { id: string; color: string }[] }, id: string) => r.spots.find((s) => s.id === id)!.color;
  it("un signalement moto colore la place moto, jamais la place voiture voisine (à 1 m)", () => {
    const r = mergeByVehicle([car, moto], [report(1, 48.85, 2.35, "green", "moto")]);
    expect(color(r, "m")).toBe("green"); expect(color(r, "c")).toBe("gray");
    expect(r.matchedReportIds.has(1)).toBe(true);
  });
  it("un signalement voiture ne colore jamais la place moto, et un signalement sans type est une voiture", () => {
    const r = mergeByVehicle([car, moto], [report(1, 48.85001, 2.35001, "red", "car"), report(2, 48.85001, 2.35001, "orange")]);
    expect(color(r, "m")).toBe("gray");
    expect(["red", "orange"]).toContain(color(r, "c")); // les deux signalements (voiture explicite et sans type) colorent la voiture
  });
  it("un signalement d'un type qui n'a aucune place à proximité n'est pas absorbé (reste une place en rue à part)", () => {
    const r = mergeByVehicle([car, moto], [report(7, 48.85, 2.35, "green", "bus")]);
    expect(r.matchedReportIds.size).toBe(0); expect(r.spots.every((s) => s.color === "gray")).toBe(true);
  });
  it("chaque type colore ses propres places ; régime autre ou incertain : toujours gris", () => {
    const r = mergeByVehicle([car, moto, bus, other], [report(1, 48.85, 2.35, "green", "car"), report(2, 48.85001, 2.35001, "red", "moto"), report(3, 48.8502, 2.3502, "orange", "bus"), report(4, 48.8503, 2.3503, "green", "car")]);
    expect([color(r, "c"), color(r, "m"), color(r, "b"), color(r, "o")]).toEqual(["green", "red", "orange", "gray"]);
    expect(r.spots).toHaveLength(4);
  });
  it("les totaux de la vue d'ensemble ne sont jamais colorés ; aucune place perdue ni dupliquée", () => {
    const agg: OfficialSpot = { ...car, id: "o:1", agg: true };
    const r = mergeByVehicle([agg, car, moto], [report(1, 48.85, 2.35, "green", "car")]);
    expect(r.spots).toHaveLength(3); expect(color(r, "o:1")).toBe("gray");
  });
  it("type de signalement inconnu : traité comme voiture (jamais une place d'un autre type)", () => {
    const r = mergeByVehicle([car, moto], [report(1, 48.85001, 2.35001, "green", "tank")]);
    expect(color(r, "m")).toBe("gray");
  });
});
