import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cumulativePrices, formatEuros, pointInPolygon, tariffAttribution, tariffCardLine, tariffLineFor, tariffZoneAt, type TariffFile } from "@contracts/paris-tariffs";
// @ts-expect-error module .mjs sans types
import { readDbf, readShpPolygons } from "../scripts/lib/shapefile.mjs";

// Valeurs RÉELLES du fichier reçu le 05/11/2026 (colonnes h1..h6 = prix de chaque heure ; le total pour N heures est la somme).
const VL1 = [6, 6, 12, 15, 18, 18], VL2 = [4, 4, 8, 10, 12, 12], RM1 = [3, 3, 6, 7.5, 9, 9], RM2 = [2, 2, 4, 5, 6, 6], SUV1 = [18, 18, 36, 45, 54, 54], SUV2 = [12, 12, 24, 30, 36, 36];

describe("tarifs : sens des colonnes h1..h6 = prix de chaque heure, total = somme (confirmé par les grilles officielles)", () => {
  it("SUV : cumul officiel de la délibération 2024 DVD 43-1 (zone I puis II)", () => {
    expect(cumulativePrices(SUV1 as never)).toEqual([18, 36, 72, 117, 171, 225]);
    expect(cumulativePrices(SUV2 as never)).toEqual([12, 24, 48, 78, 114, 150]);
  });
  it("deux-roues motorisés : grille de paris.fr (3, 6, 12, 19,50, 28,50, 37,50 € en zone 1 ; 2, 4, 8, 13, 19, 25 € en zone 2)", () => {
    expect(cumulativePrices(RM1 as never)).toEqual([3, 6, 12, 19.5, 28.5, 37.5]);
    expect(cumulativePrices(RM2 as never)).toEqual([2, 4, 8, 13, 19, 25]);
  });
  it("voiture : 6 € et 4 € par heure pour les 2 premières heures (paris.fr) ; cumul 6, 12, 24, 39, 57, 75 / 4, 8, 16, 26, 38, 50", () => {
    expect(cumulativePrices(VL1 as never)).toEqual([6, 12, 24, 39, 57, 75]);
    expect(cumulativePrices(VL2 as never)).toEqual([4, 8, 16, 26, 38, 50]);
  });
  it("proportions du fichier : suv = 3 x vl, vl = 2 x 2rm, dans les 2 zones et pour les 6 heures", () => {
    VL1.forEach((v, k) => { expect(SUV1[k]).toBe(v * 3); expect(RM1[k] * 2).toBe(v); });
    VL2.forEach((v, k) => { expect(SUV2[k]).toBe(v * 3); expect(RM2[k] * 2).toBe(v); });
  });
});

describe("tarifs : formats de prix et ligne de fiche", () => {
  it("euros à la française", () => {
    expect(formatEuros(6)).toBe("6 €");
    expect(formatEuros(19.5)).toBe("19,50 €");
    expect(formatEuros(37.5)).toBe("37,50 €");
    expect(formatEuros(0.1 + 0.2)).toBe("0,30 €");
  });
  it("ligne de fiche : zone, tarif visiteur, 1 h / 2 h / 3 h / 6 h", () => {
    expect(tariffCardLine(1, VL1 as never)).toBe("Zone 1 · tarif visiteur : 6 € pour 1 h · 12 € pour 2 h · 24 € pour 3 h · 75 € pour 6 h");
    expect(tariffCardLine(2, RM2 as never)).toBe("Zone 2 · tarif visiteur : 2 € pour 1 h · 4 € pour 2 h · 8 € pour 3 h · 25 € pour 6 h");
    expect(tariffCardLine(1, RM1 as never)).toContain("37,50 € pour 6 h");
  });
  it("panneau « i » : source, licence, date, visiteur, horaires, SUV et bois non affichés, ancienneté du catalogue", () => {
    const t = tariffAttribution("2026-11-05");
    for (const part of ["ODbL", "fichier reçu le 5 novembre 2026", "24 octobre 2022", "VISITEUR", "9 h à 20 h", "SUV", "bois", "paris.fr"]) expect(t).toContain(part);
    expect(tariffAttribution(null)).toContain("date du fichier non renseignée");
  });
});

describe("tarifs : point dans polygone (avec trou)", () => {
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][], hole = [[4, 4], [6, 4], [6, 6], [4, 6]] as [number, number][];
  it("dans le contour, hors du trou", () => {
    expect(pointInPolygon(2, 2, [outer, hole])).toBe(true);
    expect(pointInPolygon(5, 5, [outer, hole])).toBe(false); // dans le trou
    expect(pointInPolygon(11, 5, [outer, hole])).toBe(false);
    expect(pointInPolygon(5, 5, [hole])).toBe(true);
  });
  const file: TariffFile = { version: 1, source: {} as never, dataDate: "2026-11-05", maxHours: 6,
    zones: [{ zone: 1, rings: [hole] }, { zone: 2, rings: [outer, hole] }], hourly: { 1: { vl: VL1 as never, rm2: RM1 as never }, 2: { vl: VL2 as never, rm2: RM2 as never } } };
  it("zone d'un point : la zone 2 exclut la zone 1 ; hors des deux : null", () => {
    expect(tariffZoneAt(file, 5, 5)).toBe(1); // lat, lng
    expect(tariffZoneAt(file, 2, 2)).toBe(2);
    expect(tariffZoneAt(file, 20, 20)).toBeNull();
  });
  it("prix seulement pour une place payante : voiture (type 1) -> vl, moto (type 5) -> 2rm ; gratuit, livraison, vélo, PMR, hors zone ou sans fichier : rien", () => {
    expect(tariffLineFor(file, 1, 5, 5)).toBe("Zone 1 · tarif visiteur : 6 € pour 1 h · 12 € pour 2 h · 24 € pour 3 h · 75 € pour 6 h");
    expect(tariffLineFor(file, 5, 2, 2)).toBe("Zone 2 · tarif visiteur : 2 € pour 1 h · 4 € pour 2 h · 8 € pour 3 h · 25 € pour 6 h");
    for (const t of [0, 2, 3, 4, 6, 7, 8]) expect(tariffLineFor(file, t, 5, 5)).toBeNull();
    expect(tariffLineFor(file, 1, 20, 20)).toBeNull();
    expect(tariffLineFor(null, 1, 5, 5)).toBeNull();
  });
});

describe("Shapefile : lecteur sans dépendance", () => {
  // DBF fabriqué : 3 colonnes dont 2 de même nom tronqué (cas réel vis_2rm_h1_), valeurs différentes pour prouver la lecture PAR POSITION.
  const dbf = (() => {
    const fields = [["zone", "C", 5], ["vis_2rm_h1_", "F", 8], ["vis_2rm_h1_", "F", 8]] as const;
    const recLen = 1 + fields.reduce((a, f) => a + f[2], 0), headLen = 32 + 32 * fields.length + 1;
    const b = Buffer.alloc(headLen + recLen * 2, 0x20);
    b.writeUInt32LE(2, 4); b.writeUInt16LE(headLen, 8); b.writeUInt16LE(recLen, 10);
    fields.forEach((f, i) => { const p = 32 + 32 * i; b.fill(0, p, p + 32); b.write(f[0], p, "latin1"); b.write(f[1], p + 11, "latin1"); b[p + 16] = f[2]; });
    b[32 + 32 * fields.length] = 0x0d;
    const rows = [["1", "3", "9.5"], ["2", "2", "7"]];
    rows.forEach((r, i) => { let p = headLen + i * recLen; b[p++] = 0x20; fields.forEach((f, k) => { b.fill(0x20, p, p + f[2]); b.write(r[k].padStart(f[2]), p, "latin1"); p += f[2]; }); });
    return b;
  })();
  it("DBF : colonnes dans l'ordre, valeurs par position même si les noms sont identiques", () => {
    const { fields, rows } = readDbf(dbf);
    expect(fields.map((f: { name: string }) => f.name)).toEqual(["zone", "vis_2rm_h1_", "vis_2rm_h1_"]);
    expect(rows).toEqual([["1", 3, 9.5], ["2", 2, 7]]);
  });
  it("DBF : refuse un fichier incohérent ou tronqué", () => {
    expect(() => readDbf(dbf.subarray(0, 20))).toThrow();
    expect(() => readDbf(dbf.subarray(0, dbf.length - 5))).toThrow();
  });
  it("SHP : un polygone à deux anneaux (contour + trou), types non polygones refusés", () => {
    const ring = (pts: number[][]) => pts;
    const rings = [ring([[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]]), ring([[1, 1], [2, 1], [2, 2], [1, 1]])];
    const nPoints = rings.reduce((a, r) => a + r.length, 0);
    const content = Buffer.alloc(44 + 4 * 2 + 16 * nPoints);
    content.writeInt32LE(5, 0); content.writeInt32LE(2, 36); content.writeInt32LE(nPoints, 40); content.writeInt32LE(0, 44); content.writeInt32LE(rings[0].length, 48);
    let p = 52; for (const r of rings) for (const [x, y] of r) { content.writeDoubleLE(x, p); content.writeDoubleLE(y, p + 8); p += 16; }
    const head = Buffer.alloc(100); head.writeInt32BE(9994, 0); head.writeInt32LE(5, 32);
    const rec = Buffer.alloc(8); rec.writeInt32BE(1, 0); rec.writeInt32BE(content.length / 2, 4);
    const shp = Buffer.concat([head, rec, content]);
    const out = readShpPolygons(shp);
    expect(out).toHaveLength(1);
    expect(out[0].parts.map((r: unknown[]) => r.length)).toEqual([5, 4]);
    expect(out[0].parts[0][2]).toEqual([4, 4]);
    const point = Buffer.from(shp); point.writeInt32LE(1, 32);
    expect(() => readShpPolygons(point)).toThrow();
    expect(() => readShpPolygons(Buffer.alloc(120))).toThrow();
  });
});

describe("tarifs : fichier généré à partir du vrai Shapefile du 05/11/2026", () => {
  const file = path.join(process.cwd(), "public/data/paris-tariffs/zones.json");
  const exists = fs.existsSync(file);
  const data = () => JSON.parse(fs.readFileSync(file, "utf8")) as TariffFile;
  it("tarifs réels des deux zones, date et poids", () => {
    if (!exists) return;
    const f = data();
    expect(f.dataDate).toBe("2026-11-05");
    expect(f.hourly[1].vl).toEqual(VL1); expect(f.hourly[1].rm2).toEqual(RM1);
    expect(f.hourly[2].vl).toEqual(VL2); expect(f.hourly[2].rm2).toEqual(RM2);
    expect(fs.statSync(file).size < 150 * 1024).toBe(true);
    expect(f.zones.map((z) => z.zone)).toEqual([1, 2]);
  });
  it("lieux connus : Louvre et Bastille = zone 1 ; place d'Italie, Montmartre, Bercy = zone 2 ; bois et hors de Paris = aucune", () => {
    if (!exists) return;
    const f = data();
    expect(tariffZoneAt(f, 48.861, 2.336)).toBe(1);
    expect(tariffZoneAt(f, 48.853, 2.369)).toBe(1);
    expect(tariffZoneAt(f, 48.831, 2.355)).toBe(2);
    expect(tariffZoneAt(f, 48.886, 2.343)).toBe(2);
    expect(tariffZoneAt(f, 48.8386, 2.3826)).toBe(2);
    expect(tariffZoneAt(f, 48.865, 2.25)).toBeNull(); // bois de Boulogne
    expect(tariffZoneAt(f, 48.83, 2.44)).toBeNull(); // bois de Vincennes
    expect(tariffZoneAt(f, 48.95, 2.35)).toBeNull();
    expect(tariffLineFor(f, 1, 48.861, 2.336)).toBe("Zone 1 · tarif visiteur : 6 € pour 1 h · 12 € pour 2 h · 24 € pour 3 h · 75 € pour 6 h");
  });
});
