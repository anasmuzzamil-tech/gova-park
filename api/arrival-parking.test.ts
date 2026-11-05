import { describe, expect, it } from "vitest";
import { ARRIVAL_RADIUS_M, arrivalBounds, arrivalReports, arrivalSentence, countStreetPlaces, placesSentence, reportsSentence, type ArrivalReport, type ArrivalSpot } from "../src/lib/arrival-parking";

const DEST = { lat: 48.8566, lng: 2.3522 };
// 1 m en latitude ≈ 1/111320 degré.
const at = (northM: number, eastM = 0) => ({ lat: DEST.lat + northM / 111320, lng: DEST.lng + eastM / (111320 * Math.cos((DEST.lat * Math.PI) / 180)) });
const spot = (northM: number, t: number, places: number, extra: Partial<ArrivalSpot> = {}): ArrivalSpot => ({ ...at(northM), t, places, ...extra });
const NOW = new Date(2026, 10, 5, 17, 45, 0); // 17:45 locale
const ago = (min: number) => new Date(NOW.getTime() - min * 60000).toISOString();
const rep = (id: number, northM: number, status: "free" | "taken", min: number, extra: Partial<ArrivalReport> = {}): ArrivalReport => ({ id, latitude: at(northM).lat, longitude: at(northM).lng, status, reportedAt: ago(min), ...extra });

describe("places en rue autour de l'arrivée", () => {
  it("additionne les places des tronçons voiture (payant + gratuit) à moins de 200 m", () => {
    const c = countStreetPlaces([spot(10, 1, 12), spot(150, 2, 30), spot(199, 1, 5)], DEST, "car");
    expect(c).toMatchObject({ places: 47, sections: 3, withoutCount: 0, paidSections: 2 });
  });
  it("exclut au-delà de 200 m, les autres types de véhicule et la vue d'ensemble agrégée", () => {
    const c = countStreetPlaces([spot(250, 1, 99), spot(20, 5, 7), spot(20, 3, 4), spot(20, 4, 6), spot(30, 1, 1000, { agg: true }), spot(40, 1, 3)], DEST, "car");
    expect(c).toMatchObject({ places: 3, sections: 1 });
  });
  it("le type suit le véhicule : moto, livraison, vélo ont chacun leurs tronçons", () => {
    const spots = [spot(10, 1, 10), spot(10, 5, 7), spot(10, 3, 4), spot(10, 4, 6)];
    expect(countStreetPlaces(spots, DEST, "moto").places).toBe(7);
    expect(countStreetPlaces(spots, DEST, "delivery").places).toBe(4);
    expect(countStreetPlaces(spots, DEST, "bike").places).toBe(6);
  });
  it("tronçon sans nombre de places (0) : compté à part, le total devient un minimum", () => {
    const c = countStreetPlaces([spot(10, 1, 0), spot(10, 1, 8)], DEST, "car");
    expect(c).toMatchObject({ places: 8, sections: 2, withoutCount: 1 });
    expect(placesSentence(c, "car")).toBe("Au moins 8 places en rue dans 200 m");
  });
  it("rayon personnalisable ; coordonnées invalides écartées", () => {
    expect(countStreetPlaces([spot(80, 1, 5)], DEST, "car", 50).sections).toBe(0);
    expect(countStreetPlaces([{ lat: NaN, lng: 2, t: 1, places: 5 }], DEST, "car").sections).toBe(0);
  });
  it("paidSections : seulement les types payants (voiture 1, moto 5), pas le gratuit", () => {
    expect(countStreetPlaces([spot(10, 2, 9)], DEST, "car").paidSections).toBe(0);
    expect(countStreetPlaces([spot(10, 5, 9)], DEST, "moto").paidSections).toBe(1);
  });
});

describe("signalements d'utilisateurs à l'arrivée", () => {
  it("couleur et mot selon l'âge : libre < 5 min vert, 5 à 10 min orange (Peut-être libre), au-delà disparu", () => {
    const v = arrivalReports([rep(1, 10, "free", 2), rep(2, 20, "free", 7), rep(3, 30, "free", 11)], DEST, "car", NOW);
    expect(v.map((x) => [x.id, x.color, x.word])).toEqual([[1, "green", "Libre"], [2, "orange", "Peut-être libre"]]);
  });
  it("prise : rouge jusqu'à 10 min, puis disparue", () => {
    const v = arrivalReports([rep(1, 10, "taken", 9), rep(2, 10, "taken", 10)], DEST, "car", NOW);
    expect(v.map((x) => [x.id, x.color, x.word])).toEqual([[1, "red", "Prise"]]);
  });
  it("seulement le même type de véhicule : un signalement moto n'apparaît pas pour une voiture ; un signalement sans type est une voiture", () => {
    const list = [rep(1, 10, "free", 1, { vehicleType: "moto" }), rep(2, 10, "free", 1, { vehicleType: "car" }), rep(3, 10, "free", 1)];
    expect(arrivalReports(list, DEST, "car", NOW).map((x) => x.id).sort()).toEqual([2, 3]);
    expect(arrivalReports(list, DEST, "moto", NOW).map((x) => x.id)).toEqual([1]);
    expect(arrivalReports(list, DEST, "bike", NOW)).toEqual([]);
  });
  it("hors rayon, daté du futur ou illisible : écartés", () => {
    const list = [rep(1, 250, "free", 1), rep(2, 10, "free", -5), rep(3, 10, "free", 1, { reportedAt: "pas une date" })];
    expect(arrivalReports(list, DEST, "car", NOW)).toEqual([]);
  });
  it("le plus récent d'abord, heure locale HH:MM, exemple conservé", () => {
    const v = arrivalReports([rep(1, 10, "free", 4), rep(2, 10, "free", 1, { example: true })], DEST, "car", NOW);
    expect(v.map((x) => x.id)).toEqual([2, 1]);
    expect(v[0].time).toBe("17:44"); expect(v[1].time).toBe("17:41"); expect(v[0].example).toBe(true); expect(v[1].example).toBe(false);
  });
});

describe("phrases factuelles", () => {
  const count = { places: 142, sections: 20, withoutCount: 0, paidSections: 12 };
  it("exemple du cahier des charges : « 142 places en rue dans 200 m · 1 signalée libre à 17:40 »", () => {
    const r = arrivalReports([rep(1, 10, "free", 4.9)], DEST, "car", NOW);
    expect(r).toHaveLength(1);
    const s = arrivalSentence(count, r, "car");
    expect(s).toBe("142 places en rue dans 200 m · 1 signalée libre à 17:40");
  });
  it("plusieurs libres + prises", () => {
    const v = arrivalReports([rep(1, 10, "free", 1), rep(2, 10, "free", 3), rep(3, 10, "taken", 2)], DEST, "car", NOW);
    expect(reportsSentence(v)).toBe("2 signalées libres, la plus récente à 17:44 · 1 signalée prise à 17:43");
  });
  it("aucun signalement : phrase explicite, jamais un signal « difficile » ou « facile »", () => {
    const s = arrivalSentence(count, [], "car");
    expect(s).toBe("142 places en rue dans 200 m · aucun signalement récent");
    expect(/facile|difficile|probab|chance|inconnu/i.test(s)).toBe(false);
  });
  it("signalements illisibles (null) : la partie est omise, pas remplacée par « aucun »", () => {
    expect(arrivalSentence(count, null, "car")).toBe("142 places en rue dans 200 m");
  });
  it("aucune place recensée / une place / noms par véhicule", () => {
    expect(placesSentence({ places: 0, sections: 0, withoutCount: 0, paidSections: 0 }, "car")).toBe("Aucune place en rue recensée dans 200 m");
    expect(placesSentence({ places: 1, sections: 1, withoutCount: 0, paidSections: 0 }, "car")).toBe("1 place en rue dans 200 m");
    expect(placesSentence({ places: 6, sections: 1, withoutCount: 0, paidSections: 0 }, "moto")).toBe("6 places moto dans 200 m");
    expect(placesSentence({ places: 6, sections: 1, withoutCount: 0, paidSections: 0 }, "bike")).toBe("6 places vélo dans 200 m");
    expect(placesSentence({ places: 0, sections: 3, withoutCount: 3, paidSections: 0 }, "car")).toBe("3 tronçons sans nombre de places renseigné dans 200 m");
  });
  it("cadre de chargement : contient tout le disque de 200 m", () => {
    const b = arrivalBounds(DEST);
    expect(ARRIVAL_RADIUS_M).toBe(200);
    for (const p of [at(200), at(-200), at(0, 200), at(0, -200)]) { expect(p.lat <= b.north && p.lat >= b.south && p.lng <= b.east && p.lng >= b.west).toBe(true); }
  });
});
