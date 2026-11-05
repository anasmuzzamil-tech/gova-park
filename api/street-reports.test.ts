import { describe, expect, it } from "vitest";
import {
  STREET_RULES, checkDeviceDistance, countFreeNearby, checkReportRate, distanceMeters, expiresAtFor, parseStreetListInput, parseStreetReportInput,
  prepareStreetReport, reportSuccessText, resolveStreetSpots, type StreetReportRow,
} from "@contracts/street-reports";
import { geolocMessage } from "@/lib/street";

const now = new Date("2026-11-05T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000);
const bbox = { south: 48.8, north: 48.9, west: 2.3, east: 2.4 };
const P = { latitude: 48.8566, longitude: 2.3522 };
const report = (over: Partial<StreetReportRow>): StreetReportRow => ({ id: 1, ...P, status: "free", userId: 1, createdAt: minutesAgo(1), ...over });
const spots = (rows: StreetReportRow[]) => resolveStreetSpots(rows, bbox, 200, now);
// Environ 0,00001 degré de latitude = 1,1 m.
const metersNorth = (m: number) => ({ latitude: P.latitude + m / 111320, longitude: P.longitude });

describe("places en rue : couleur selon l'âge du signalement", () => {
  it("sans signalement : aucune place, donc jamais de vert inventé", () => {
    expect(spots([])).toEqual([]);
  });
  it("libre depuis moins de 5 min : vert, avec « il y a X min » et la source utilisateur", () => {
    const [s] = spots([report({ createdAt: minutesAgo(3) })]);
    expect(s.color).toBe("green"); expect(s.status).toBe("free"); expect(s.ageMinutes).toBe(3);
    expect(s.label).toBe("Signalée libre il y a 3 min"); expect(s.source).toBe("Signalé par un utilisateur");
  });
  it("libre à l'instant : « à l'instant »", () => {
    expect(spots([report({ createdAt: now })])[0].agoText).toBe("à l'instant");
  });
  it("libre à 4 min 59 s : encore vert ; à 5 min pile : orange", () => {
    expect(spots([report({ createdAt: new Date(now.getTime() - 299000) })])[0].color).toBe("green");
    expect(spots([report({ createdAt: minutesAgo(5) })])[0].color).toBe("orange");
  });
  it("libre entre 5 et 10 min : orange", () => {
    const [s] = spots([report({ createdAt: minutesAgo(8) })]);
    expect(s.color).toBe("orange"); expect(s.label).toBe("Signalée libre il y a 8 min");
  });
  it("libre à 10 min ou plus : la place disparaît", () => {
    expect(spots([report({ createdAt: minutesAgo(10) })])).toEqual([]);
    expect(spots([report({ createdAt: minutesAgo(25) })])).toEqual([]);
  });
  it("prise : rouge pendant 10 min puis expirée", () => {
    expect(spots([report({ status: "taken", createdAt: minutesAgo(9) })])[0].color).toBe("red");
    expect(spots([report({ status: "taken", createdAt: minutesAgo(10) })])).toEqual([]);
  });
  it("une date d'expiration serveur déjà passée fait disparaître la place", () => {
    expect(spots([report({ createdAt: minutesAgo(2), expiresAt: minutesAgo(1) })])).toEqual([]);
  });
  it("signalement daté du futur : ignoré", () => {
    expect(spots([report({ createdAt: new Date(now.getTime() + 10 * 60000) })])).toEqual([]);
  });
  it("expiration calculée à la création : +10 min", () => {
    expect(expiresAtFor("free", now).getTime() - now.getTime()).toBe(10 * 60000);
    expect(expiresAtFor("taken", now).getTime() - now.getTime()).toBe(10 * 60000);
  });
  it("la place n'est jamais présentée comme garantie", () => {
    const [s] = spots([report({})]);
    expect(s.detail).toContain("rien n'est garanti"); expect(s.example).toBe(false);
  });
  it("démo : un signalement est étiqueté exemple", () => {
    expect(resolveStreetSpots([report({})], bbox, 10, now, true)[0].example).toBe(true);
  });
});

describe("places en rue : concordance et contradiction", () => {
  it("un seul signalement : fiabilité 50 %", () => {
    expect(spots([report({})])[0].reliabilityPct).toBe(50);
  });
  it("deux utilisateurs concordants rapprochés relèvent la fiabilité", () => {
    const [s] = spots([report({ id: 2, userId: 2, createdAt: minutesAgo(1) }), report({ id: 1, userId: 1, createdAt: minutesAgo(3) })]);
    expect(s.reliabilityPct).toBe(65); expect(s.agreeing).toBe(2);
    expect(spots([report({ id: 3, userId: 3, createdAt: minutesAgo(0.5) }), report({ id: 2, userId: 2, createdAt: minutesAgo(1) }), report({ id: 1, userId: 1, createdAt: minutesAgo(2) })])[0].reliabilityPct).toBe(80);
  });
  it("le même utilisateur qui répète ne relève pas la fiabilité", () => {
    expect(spots([report({ id: 2, userId: 1, createdAt: minutesAgo(1) }), report({ id: 1, userId: 1, createdAt: minutesAgo(2) })])[0].reliabilityPct).toBe(50);
  });
  it("un signalement concordant trop ancien (plus de 5 min avant le plus récent) ne compte pas", () => {
    expect(spots([report({ id: 2, userId: 2, status: "taken", createdAt: minutesAgo(1) }), report({ id: 1, userId: 1, status: "taken", createdAt: minutesAgo(8) })])[0].reliabilityPct).toBe(50);
  });
  it("la fiabilité est plafonnée à 95 %", () => {
    const many = Array.from({ length: 12 }, (_, i) => report({ id: i + 1, userId: i + 1, createdAt: minutesAgo(1 + i * 0.1) }));
    expect(spots(many)[0].reliabilityPct).toBe(95);
  });
  it("un signalement contradictoire plus récent l'emporte : libre puis prise = rouge, fiabilité abaissée", () => {
    const out = spots([report({ id: 2, userId: 2, status: "taken", createdAt: minutesAgo(1) }), report({ id: 1, userId: 1, status: "free", createdAt: minutesAgo(3) })]);
    expect(out).toHaveLength(1); expect(out[0].color).toBe("red"); expect(out[0].reliabilityPct).toBe(30);
  });
  it("prise puis libre plus récent : vert", () => {
    const out = spots([report({ id: 2, userId: 2, status: "free", createdAt: minutesAgo(1) }), report({ id: 1, userId: 1, status: "taken", createdAt: minutesAgo(4) })]);
    expect(out[0].color).toBe("green");
  });
  it("une même personne qui change d'avis n'est pas comptée comme contradiction", () => {
    expect(spots([report({ id: 2, userId: 1, status: "taken", createdAt: minutesAgo(1) }), report({ id: 1, userId: 1, status: "free", createdAt: minutesAgo(3) })])[0].reliabilityPct).toBe(50);
  });
  it("deux places éloignées de plus de 15 m restent deux places", () => {
    const far = metersNorth(40);
    expect(spots([report({ id: 1 }), report({ id: 2, userId: 2, ...far })])).toHaveLength(2);
    expect(spots([report({ id: 1 }), report({ id: 2, userId: 2, ...metersNorth(8) })])).toHaveLength(1);
  });
  it("aucun identifiant d'utilisateur n'est exposé", () => {
    const json = JSON.stringify(spots([report({ userId: 4242 })]));
    expect(json).not.toContain("4242"); expect(json).not.toContain("userId");
  });
});

describe("places en rue : zone affichée et limite", () => {
  it("seules les places de la zone demandée sont renvoyées", () => {
    expect(resolveStreetSpots([report({ latitude: 48.95 })], bbox, 10, now)).toEqual([]);
  });
  it("la limite est respectée, les plus récentes d'abord", () => {
    const rows = [1, 2, 3, 4].map((i) => report({ id: i, userId: i, ...metersNorth(i * 100), createdAt: minutesAgo(i) }));
    const out = resolveStreetSpots(rows, bbox, 2, now);
    expect(out.map((s) => s.id)).toEqual([1, 2]);
  });
});

describe("places en rue : distance à l'appareil", () => {
  it("distance de Haversine plausible (1 degré de latitude = environ 111 km)", () => {
    expect(Math.round(distanceMeters(48, 2, 49, 2) / 1000)).toBe(111);
  });
  it("à 30 m : accepté ; à 50 m : accepté ; à 80 m : refusé", () => {
    expect(checkDeviceDistance(P, metersNorth(30)).ok).toBe(true);
    expect(checkDeviceDistance(P, metersNorth(49)).ok).toBe(true);
    expect(checkDeviceDistance(P, metersNorth(80)).ok).toBe(false);
  });
});

describe("places en rue : anti-spam", () => {
  it("un second signalement dans la même zone moins d'une minute après est refusé", () => {
    const r = checkReportRate([{ ...P, createdAt: new Date(now.getTime() - 20000) }], metersNorth(50), now);
    expect(r.ok).toBe(false); expect(r.retryAfterSeconds).toBe(40);
  });
  it("après une minute : accepté", () => {
    expect(checkReportRate([{ ...P, createdAt: new Date(now.getTime() - 60000) }], P, now).ok).toBe(true);
  });
  it("dans une autre zone (plus de 100 m) : accepté même moins d'une minute après", () => {
    expect(checkReportRate([{ ...P, createdAt: new Date(now.getTime() - 5000) }], metersNorth(300), now).ok).toBe(true);
  });
  it("aucun signalement récent : accepté", () => {
    expect(checkReportRate([], P, now)).toEqual({ ok: true, retryAfterSeconds: 0 });
  });
});

describe("signalements par type de véhicule", () => {
  const rows = [report({ id: 1, vehicleType: "car", status: "free", createdAt: minutesAgo(1) }), report({ id: 2, vehicleType: "moto", status: "taken", createdAt: minutesAgo(2) })];
  it("un signalement moto et un signalement voiture au même endroit sont deux places distinctes, chacune avec son statut", () => {
    const list = spots(rows);
    expect(list).toHaveLength(2);
    expect(list.find((x) => x.vehicleType === "car")).toMatchObject({ color: "green", status: "free" });
    expect(list.find((x) => x.vehicleType === "moto")).toMatchObject({ color: "red", status: "taken" });
  });
  it("sans type, un signalement est une voiture (anciennes lignes)", () => {
    const [s] = spots([report({})]);
    expect(s.vehicleType).toBe("car");
  });
  it("la fiabilité ne compte que les signalements du même type", () => {
    const list = spots([report({ id: 1, userId: 1, vehicleType: "moto" }), report({ id: 2, userId: 2, vehicleType: "car" })]);
    expect(list.every((x) => x.agreeing === 1 && x.reliabilityPct === 50)).toBe(true);
  });
  it("les règles de couleur restent celles de la voiture pour tous les types : vert 5 min, orange jusqu'à 10 min, puis disparition", () => {
    for (const v of ["car", "moto", "delivery", "bike"] as const) {
      expect(spots([report({ vehicleType: v, createdAt: minutesAgo(4) })])[0].color).toBe("green");
      expect(spots([report({ vehicleType: v, createdAt: minutesAgo(7) })])[0].color).toBe("orange");
      expect(spots([report({ vehicleType: v, createdAt: minutesAgo(10) })])).toEqual([]);
      expect(spots([report({ vehicleType: v, status: "taken", createdAt: minutesAgo(9) })])[0].color).toBe("red");
    }
  });
  it("compteur : seuls les signalements libres du type choisi comptent", () => {
    const list = [
      { status: "free" as const, ...P, reportedAt: minutesAgo(1).toISOString(), vehicleType: "moto" as const },
      { status: "free" as const, ...P, reportedAt: minutesAgo(1).toISOString(), vehicleType: "car" as const },
      { status: "free" as const, ...P, reportedAt: minutesAgo(2).toISOString() },
      { status: "taken" as const, ...P, reportedAt: minutesAgo(1).toISOString(), vehicleType: "moto" as const },
    ];
    expect(countFreeNearby(list, { lat: P.latitude, lng: P.longitude }, now, 500, "moto").count).toBe(1);
    expect(countFreeNearby(list, { lat: P.latitude, lng: P.longitude }, now, 500, "car").count).toBe(2);
    expect(countFreeNearby(list, { lat: P.latitude, lng: P.longitude }, now, 500, "delivery").count).toBe(0);
    expect(countFreeNearby(list, { lat: P.latitude, lng: P.longitude }, now).count).toBe(3);
  });
  it("validation stricte : les cinq types sont acceptés, tout le reste refusé, absent = voiture", () => {
    const base = { status: "free", ...P, deviceLatitude: P.latitude, deviceLongitude: P.longitude };
    for (const v of ["car", "moto", "delivery", "bike"]) expect(parseStreetReportInput({ ...base, vehicleType: v }).vehicleType).toBe(v);
    expect(parseStreetReportInput(base).vehicleType).toBe("car");
    for (const bad of ["bus", "utility", "truck", "CAR", "", null, 1, {}, ["car"], "car "]) expect(() => parseStreetReportInput({ ...base, vehicleType: bad }), String(bad)).toThrow();
  });
  it("le type est enregistré dans la ligne préparée et sert au calcul de fiabilité (voisins d'un autre type ignorés)", () => {
    const input = { status: "free" as const, vehicleType: "moto" as const, ...P, deviceLatitude: P.latitude, deviceLongitude: P.longitude };
    const p = prepareStreetReport(input, 7, [], [report({ id: 5, userId: 9, vehicleType: "car", createdAt: minutesAgo(2) })], now);
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.row.vehicleType).toBe("moto"); expect(p.row.reliability).toBe(50); }
  });
  it("anti-abus inchangé : même limite d'une fois par minute quel que soit le type", () => {
    const input = { status: "free" as const, vehicleType: "delivery" as const, ...P, deviceLatitude: P.latitude, deviceLongitude: P.longitude };
    expect(prepareStreetReport(input, 7, [{ ...P, createdAt: new Date(now.getTime() - 10000) }], [], now).ok).toBe(false);
    expect(prepareStreetReport({ ...input, ...metersNorth(200), deviceLatitude: P.latitude + 200 / 111320 }, 7, [{ ...P, createdAt: new Date(now.getTime() - 10000) }], [], now).ok).toBe(true);
  });
  it("confirmations : la voiture garde son texte, les autres types sont nommés", () => {
    expect(reportSuccessText("free", false, "moto")).toBe("Merci, place moto signalée libre : verte 5 min, puis orange jusqu'à 10 min.");
    expect(reportSuccessText("taken", false, "delivery")).toBe("Merci, place livraison signalée prise : rouge 10 min.");
    expect(reportSuccessText("free", true, "bike")).toContain("place vélo signalée libre");
    expect(reportSuccessText("free", false)).toBe("Merci, place signalée libre : verte 5 min, puis orange jusqu'à 10 min.");
  });
});

describe("places en rue : création d'un signalement", () => {
  const input = { status: "free" as const, vehicleType: "car" as const, ...P, deviceLatitude: P.latitude, deviceLongitude: P.longitude };
  it("signalement valide : dates et expiration calculées côté serveur, fiabilité 50", () => {
    const p = prepareStreetReport(input, 7, [], [], now);
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.row.createdAt).toEqual(now); expect(p.row.expiresAt.getTime() - now.getTime()).toBe(10 * 60000); expect(p.row.reliability).toBe(50); }
  });
  it("appareil trop loin de la place : refusé (BAD_REQUEST)", () => {
    const p = prepareStreetReport({ ...input, ...metersNorth(200) }, 7, [], [], now);
    expect(p.ok).toBe(false); if (!p.ok) { expect(p.code).toBe("BAD_REQUEST"); expect(p.message).toContain("50 m"); }
  });
  it("deuxième signalement dans la minute : refusé (TOO_MANY_REQUESTS)", () => {
    const p = prepareStreetReport(input, 7, [{ ...P, createdAt: new Date(now.getTime() - 10000) }], [], now);
    expect(p.ok).toBe(false); if (!p.ok) expect(p.code).toBe("TOO_MANY_REQUESTS");
  });
  it("un autre utilisateur ayant signalé la même chose juste avant relève la fiabilité", () => {
    const p = prepareStreetReport(input, 7, [], [report({ id: 5, userId: 9, createdAt: minutesAgo(2) })], now);
    expect(p.ok && p.row.reliability).toBe(65);
  });
  it("ses propres signalements précédents ne relèvent pas la fiabilité", () => {
    const p = prepareStreetReport(input, 7, [], [report({ id: 5, userId: 7, createdAt: minutesAgo(2) })], now);
    expect(p.ok && p.row.reliability).toBe(50);
  });
});

describe("places en rue : validation stricte des entrées", () => {
  const ok = { status: "taken", latitude: 48.85, longitude: 2.35, deviceLatitude: 48.85, deviceLongitude: 2.35 };
  it("entrée valide acceptée", () => { expect(parseStreetReportInput(ok).status).toBe("taken"); });
  it("bornes GPS", () => {
    expect(() => parseStreetReportInput({ ...ok, latitude: 91 })).toThrow();
    expect(() => parseStreetReportInput({ ...ok, longitude: -181 })).toThrow();
    expect(() => parseStreetReportInput({ ...ok, deviceLatitude: -90.1 })).toThrow();
    expect(() => parseStreetReportInput({ ...ok, deviceLongitude: 180.5 })).toThrow();
  });
  it("types et valeurs non numériques refusés", () => {
    expect(() => parseStreetReportInput({ ...ok, latitude: "48.85" })).toThrow();
    expect(() => parseStreetReportInput({ ...ok, latitude: NaN })).toThrow();
    expect(() => parseStreetReportInput({ ...ok, longitude: Infinity })).toThrow();
    expect(() => parseStreetReportInput({ ...ok, deviceLatitude: undefined })).toThrow();
  });
  it("statut inconnu, champs en trop et corps absent refusés (pas de date ni d'utilisateur fournis par le client)", () => {
    expect(() => parseStreetReportInput({ ...ok, status: "occupied" })).toThrow();
    expect(() => parseStreetReportInput({ ...ok, createdAt: new Date() })).toThrow();
    expect(() => parseStreetReportInput({ ...ok, userId: 1 })).toThrow();
    expect(() => parseStreetReportInput(null)).toThrow();
    expect(() => parseStreetReportInput([])).toThrow();
  });
  it("zone de liste : valide, limite par défaut 200", () => {
    expect(parseStreetListInput({ south: 48.8, north: 48.9, west: 2.3, east: 2.4 }).limit).toBe(200);
  });
  it("zone de liste : inversée, trop grande, hors bornes ou limite excessive refusées", () => {
    expect(() => parseStreetListInput({ south: 48.9, north: 48.8, west: 2.3, east: 2.4 })).toThrow();
    expect(() => parseStreetListInput({ south: 40, north: 50, west: 0, east: 5 })).toThrow();
    expect(() => parseStreetListInput({ south: 48.8, north: 95, west: 2.3, east: 2.4 })).toThrow();
    expect(() => parseStreetListInput({ south: 48.8, north: 48.9, west: 2.3, east: 2.4, limit: STREET_RULES.maxLimit + 1 })).toThrow();
    expect(() => parseStreetListInput({ south: 48.8, north: 48.9, west: 2.3, east: 2.4, limit: 1.5 })).toThrow();
  });
});

describe("compteur d'accueil (places libres signalées il y a moins de 5 min près de vous)", () => {
  const ref = { lat: P.latitude, lng: P.longitude };
  const spot = (over: Record<string, unknown>) => ({ status: "free" as const, ...P, reportedAt: minutesAgo(1).toISOString(), ...over });
  it("0 s'il n'y a aucun signalement", () => {
    expect(countFreeNearby([], ref, now)).toEqual({ count: 0, examples: 0 });
  });
  it("compte les places libres vertes proches, pas les prises, les orange ni les lointaines", () => {
    const list = [
      spot({}), spot({ reportedAt: minutesAgo(4.9).toISOString() }),
      spot({ reportedAt: minutesAgo(5).toISOString() }), spot({ status: "taken" }),
      spot({ latitude: P.latitude + 0.01 }),
    ];
    expect(countFreeNearby(list, ref, now).count).toBe(2);
  });
  it("compte les exemples de démo à part et ignore les dates du futur", () => {
    const list = [spot({ example: true }), spot({ reportedAt: new Date(now.getTime() + 600000).toISOString() })];
    expect(countFreeNearby(list, ref, now)).toEqual({ count: 1, examples: 1 });
  });
});

describe("retour visible après un signalement", () => {
  it("confirme libre (vert 5 min puis orange) et prise (rouge 10 min), sans promesse de garantie", () => {
    expect(reportSuccessText("free", false)).toBe("Merci, place signalée libre : verte 5 min, puis orange jusqu'à 10 min.");
    expect(reportSuccessText("taken", false)).toBe("Merci, place signalée prise : rouge 10 min.");
  });
  it("en démo, la confirmation dit « exemple » et que ce n'est pas un vrai signalement", () => {
    expect(reportSuccessText("free", true)).toContain("Exemple (mode démo)");
    expect(reportSuccessText("taken", true)).toContain("Ce n'est pas un vrai signalement");
  });
});

describe("message de position refusée (court, 2 lignes au plus)", () => {
  it("iPhone : texte demandé, sans règle des 50 m ni long paragraphe", () => {
    const m = geolocMessage("denied", true);
    expect(m).toBe("Position nécessaire pour signaler votre place. Réglages iPhone > Safari > Localisation (ou Réglages du site), puis réessayez.");
    expect(m.length).toBeLessThan(140);
    expect(m.includes("50 m")).toBe(false);
  });
  it("autres navigateurs et autres causes : courts, sans la règle des 50 m", () => {
    for (const reason of ["denied", "timeout", "unsupported", "unavailable"] as const) {
      for (const ios of [true, false]) { const m = geolocMessage(reason, ios); expect(m.length).toBeLessThan(150); expect(m.includes("50 m")).toBe(false); }
    }
  });
});
