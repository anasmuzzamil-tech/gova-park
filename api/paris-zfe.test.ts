import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZFE_SOURCE, safeUrl, zfeAttribution, zfeLine, type ZfeFile } from "@contracts/paris-zfe";
import { pointInPolygon } from "@contracts/paris-tariffs";

describe("ZFE de Paris : périmètre seulement", () => {
  it("mention du panneau « i » : source, licence, dates, A86, aucune vignette ni horaire", () => {
    const t = zfeAttribution("2026-11-05");
    for (const part of ["ODbL", "fichier reçu le 5 novembre 2026", "26 mars 2026", "A86", "voir l'arrêté"]) expect(t).toContain(part);
    expect(/Crit.Air [0-9]|V4|8 h|lundi/i.test(t)).toBe(false);
    expect(zfeAttribution(null)).toContain("date du fichier non renseignée");
  });
  it("liens : https seulement", () => {
    expect(safeUrl("https://cdn.paris.fr/paris/2021/05/28/23fb2b69cfa451a4e517f1bc6e3001b7.pdf")).not.toBeNull();
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("http://exemple.fr")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
  it("ligne fermée ; fichier absent ou trop court : rien à dessiner", () => {
    expect(zfeLine(null).features).toHaveLength(0);
    expect(zfeLine({ ring: [[2, 48], [2, 49]] }).features).toHaveLength(0);
    const g = zfeLine({ ring: [[2, 48], [3, 48], [3, 49], [2, 49]] }).features[0].geometry as GeoJSON.LineString;
    expect(g.coordinates).toHaveLength(5);
    expect(g.coordinates[4]).toEqual([2, 48]);
  });
});

describe("ZFE de Paris : fichier généré à partir de aires.geojson (35 entités, une seule gardée)", () => {
  const file = path.join(process.cwd(), "public/data/paris-zfe/zone.json");
  const exists = fs.existsSync(file);
  const data = () => JSON.parse(fs.readFileSync(file, "utf8")) as ZfeFile;
  it("une seule entité (Paris), licence, date, liens https, poids", () => {
    if (!exists) return;
    const z = data();
    expect(z.id).toBe("217500016-ZFE-001");
    expect(z.source.license).toBe(ZFE_SOURCE.license);
    expect(z.dataDate).toBe("2026-11-05");
    expect(z.dateDebut).toBe("2021-06-01");
    expect(z.urlArrete?.startsWith("https://")).toBe(true);
    expect(z.urlSite?.startsWith("https://")).toBe(true);
    expect(fs.statSync(file).size < 20 * 1024).toBe(true);
    expect(/V4|critair/i.test(JSON.stringify(z))).toBe(false); // aucune règle de circulation dans le fichier
  });
  it("le contour est celui de Paris : Notre-Dame dedans, La Défense et Versailles dehors", () => {
    if (!exists) return;
    const { ring } = data();
    expect(pointInPolygon(2.3499, 48.853, [ring])).toBe(true);
    expect(pointInPolygon(2.2385, 48.8924, [ring])).toBe(false);
    expect(pointInPolygon(2.1301, 48.8049, [ring])).toBe(false);
    for (const [lng, lat] of ring) { expect(lng > 2.2 && lng < 2.5 && lat > 48.8 && lat < 48.92).toBe(true); }
  });
});
