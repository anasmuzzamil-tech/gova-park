import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WORK_PROP, impactPhrase, isWorkActive, isoDay, parisDay, readable, workCardLine, worksAttribution, worksFeatures, worksNear, type WorksImportStats } from "@contracts/paris-works";

const stats = (): WorksImportStats => ({ rows: 0, noShape: 0, outside: 0, badPart: 0, kept: 0, parts: 0, expiredAtImport: 0 });
// ÉCHANTILLON FABRIQUÉ À LA MAIN (pas une donnée de la Ville de Paris) : le vrai fichier n'a pas pu être téléchargé.
const SQUARE = { type: "Polygon", coordinates: [[[2.3500, 48.8500], [2.3510, 48.8500], [2.3510, 48.8508], [2.3500, 48.8508], [2.3500, 48.8500]]] };
const NOW = new Date("2026-11-05T10:00:00Z");
const make = (extra: object = {}) => worksFeatures({ shape: SQUARE, voie: "rue Louis Blanc", objet: "REAMENAGEMENT_VOIRIE", impact: "RESTREINTE", debut: "2026-10-01", fin: "2027-02-19", maitre: "SEP Enedis", arrondissement: "10", ...extra }, 0.5);

describe("chantiers : lecture", () => {
  it("un polygone donne une entité avec ses attributs dans l'ordre", () => {
    const [f] = make();
    expect(f.kind).toBe("poly");
    expect(f.props[WORK_PROP.voie]).toBe("rue Louis Blanc");
    expect(f.props[WORK_PROP.debut]).toBe("2026-10-01");
    expect(f.props[WORK_PROP.fin]).toBe("2027-02-19");
  });
  it("une ligne ou un point ne sont pas des chantiers (polygones seulement) ; hors de Paris rejeté", () => {
    const s = stats();
    expect(worksFeatures({ shape: { type: "LineString", coordinates: [[2.35, 48.85], [2.36, 48.85]] } }, 0.5, s)).toEqual([]);
    expect(worksFeatures({ shape: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] } }, 0.5, s)).toEqual([]);
    expect(s.noShape).toBe(1); expect(s.outside).toBe(1);
  });
  it("dates : ISO, JJ/MM/AAAA, sinon null ; jamais de date inventée", () => {
    expect(isoDay("2026-07-05T00:00:00+02:00")).toBe("2026-07-05");
    expect(isoDay("05/07/2026")).toBe("2026-07-05");
    expect(isoDay("31/02/2026")).toBeNull();
    expect(isoDay("bientôt")).toBeNull();
    expect(isoDay(undefined)).toBeNull();
  });
  it("valeurs absentes ou illisibles : null", () => {
    const [f] = make({ voie: "", impact: undefined, debut: "?", fin: null, maitre: "{x}" });
    expect(f.props[WORK_PROP.voie]).toBeNull();
    expect(f.props[WORK_PROP.impact]).toBeNull();
    expect(f.props[WORK_PROP.fin]).toBeNull();
    expect(f.props[WORK_PROP.maitre]).toBeNull();
  });
});

describe("chantiers : période de validité", () => {
  it("affiché pendant ses dates prévues", () => { expect(isWorkActive(make()[0].props, NOW)).toBe(true); });
  it("terminé (fin dépassée) : non affiché, jamais de chantier fantôme", () => { expect(isWorkActive(make({ fin: "2026-11-04" })[0].props, NOW)).toBe(false); });
  it("le jour de fin compris, le jour de début compris", () => {
    expect(isWorkActive(make({ fin: "2026-11-05" })[0].props, NOW)).toBe(true);
    expect(isWorkActive(make({ debut: "2026-11-05" })[0].props, NOW)).toBe(true);
  });
  it("pas encore commencé : non affiché", () => { expect(isWorkActive(make({ debut: "2026-11-06" })[0].props, NOW)).toBe(false); });
  it("sans dates : affiché (la donnée ne dit pas qu'il est fini)", () => { expect(isWorkActive(make({ debut: null, fin: null })[0].props, NOW)).toBe(true); });
  it("le jour est celui de Paris, pas celui du serveur", () => {
    expect(parisDay(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-06");
    expect(isWorkActive(make({ fin: "2026-11-05" })[0].props, new Date("2026-11-05T23:30:00Z"))).toBe(false);
  });
});

describe("chantiers : fiche", () => {
  it("phrase d'après les colonnes réelles seulement", () => {
    expect(workCardLine(make()[0].props)).toBe("Chantier : circulation restreinte · rue Louis Blanc · jusqu'au 19 février 2027 (date prévue)");
    expect(workCardLine(make({ impact: undefined, voie: null, fin: null })[0].props)).toBe("Chantier : chantier perturbant la circulation");
    expect(impactPhrase("BARREE")).toBe("voie barrée");
    expect(impactPhrase("PARTIELLE")).toBe("impact : partielle");
    expect(readable("CREATION_RESEAUX")).toBe("creation reseaux");
  });
  it("seulement à l'intérieur du périmètre ou à moins de 15 m ; sinon aucune ligne", () => {
    const list = make();
    expect(worksNear(list, 48.8504, 2.3505, NOW)?.meters).toBe(0);
    const near = worksNear(list, 48.8504, 2.35112, NOW); // environ 8 m à l'est
    expect(near === null).toBe(false);
    expect(worksNear(list, 48.8504, 2.3520, NOW)).toBeNull(); // environ 70 m
    expect(worksNear([], 48.8504, 2.3505, NOW)).toBeNull();
  });
  it("un chantier terminé n'apparaît pas dans la fiche", () => {
    expect(worksNear(make({ fin: "2026-07-01" }), 48.8504, 2.3505, NOW)).toBeNull();
  });
});

describe("chantiers : panneau « i »", () => {
  it("cite la date des données, la non-exhaustivité et la péremption possible", () => {
    const t = worksAttribution("2026-07-05");
    expect(t).toContain("données du 5 juillet 2026");
    expect(t).toContain("ODbL");
    expect(t).toContain("Non exhaustif");
    expect(t).toContain("peuvent être terminés");
  });
  it("sans date : le dit, n'en invente pas", () => {
    expect(worksAttribution(null)).toContain("date des données non renseignée");
  });
  it("fichiers générés du dépôt, s'ils existent : poids conformes", () => {
    const dir = path.join(process.cwd(), "public/data/paris-works");
    if (!fs.existsSync(path.join(dir, "index.json"))) return;
    let total = 0, biggest = 0;
    for (const name of fs.readdirSync(path.join(dir, "tiles"))) { const n = fs.statSync(path.join(dir, "tiles", name)).size; total += n; biggest = Math.max(biggest, n); }
    expect(total).toBeLessThan(6 * 1048576); expect(biggest).toBeLessThan(150 * 1024);
  });
});
