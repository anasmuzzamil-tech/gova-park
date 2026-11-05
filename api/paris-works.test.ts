import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeTile, type LayerIndex, type LayerTileFile } from "@contracts/geo-layers";
// @ts-expect-error module .mjs sans types
import { readRecords } from "../scripts/lib/io.mjs";
import { IMPACT_LABELS, WORKS_ALERT_METERS, WORK_PROP, cleanVoie, workAlertText, impactPhrase, isWorkActive, isoDay, parisDay, readable, workCardLine, worksAttribution, worksFeatures, worksNear, type WorksImportStats } from "@contracts/paris-works";

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
    expect(workCardLine(make()[0].props)).toBe("Chantier : Voie partiellement fermée · rue Louis Blanc · jusqu'au 19 février 2027 (date prévue)");
    expect(workCardLine(make({ impact: undefined, voie: null, fin: null })[0].props)).toBe("Chantier : chantier perturbant la circulation");
    expect(impactPhrase("BARREE")).toBe("impact : barree"); // valeur jamais vue dans le fichier réel : texte publié, pas de sens deviné
    expect(impactPhrase("PARTIELLE")).toBe("impact : partielle");
    expect(readable("CREATION_RESEAUX")).toBe("creation reseaux");
  });
  it("les 4 valeurs RÉELLES de impact_circulation (fichier du 05/11/2026) ont leur libellé décidé", () => {
    expect(impactPhrase("RESTREINTE")).toBe("Voie partiellement fermée");
    expect(impactPhrase("SENS_UNIQUE")).toBe("Sens unique");
    expect(impactPhrase("BARRAGE_TOTAL")).toBe("Rue fermée");
    expect(impactPhrase("IMPASSE")).toBe("Impasse");
    expect(Object.keys(IMPACT_LABELS)).toHaveLength(4);
    expect(impactPhrase("")).toBe("chantier perturbant la circulation");
    expect(workCardLine(make({ impact: "BARRAGE_TOTAL", voie: "rue d'Arcole" })[0].props)).toContain("Chantier : Rue fermée · rue d'Arcole");
  });
  it("adresses saisies à la main : bruit de fin retiré (valeurs réelles du fichier), le reste intact", () => {
    expect(cleanVoie("72 boulevard de Strasbourg 75010_")).toBe("72 boulevard de Strasbourg");
    expect(cleanVoie("51 boulevard Brune - 75014 -")).toBe("51 boulevard Brune");
    expect(cleanVoie("178 rue du Faubourg Saint-Martin angle rue du Terrage.")).toBe("178 rue du Faubourg Saint-Martin angle rue du Terrage");
    expect(cleanVoie("boulevard Ney 75018")).toBe("boulevard Ney");
    expect(cleanVoie("rue Lacépède(19-39)")).toBe("rue Lacépède(19-39)");
    expect(cleanVoie("")).toBeNull();
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
    const t = worksAttribution("2026-11-05");
    expect(t).toContain("export reçu le 5 novembre 2026");
    expect(t).toContain("ODbL");
    expect(t).toContain("Non exhaustif");
    expect(t).toContain("peuvent être terminés");
  });
  it("sans date : le dit, n'en invente pas", () => {
    expect(worksAttribution(null)).toContain("date de l'export non renseignée");
  });
  it("fichiers générés du dépôt, s'ils existent : poids conformes", () => {
    const dir = path.join(process.cwd(), "public/data/paris-works");
    if (!fs.existsSync(path.join(dir, "index.json"))) return;
    let total = 0, biggest = 0;
    for (const name of fs.readdirSync(path.join(dir, "tiles"))) { const n = fs.statSync(path.join(dir, "tiles", name)).size; total += n; biggest = Math.max(biggest, n); }
    expect(total).toBeLessThan(6 * 1048576); expect(biggest).toBeLessThan(150 * 1024);
  });
});

describe("chantiers : lecture CSV (format réel : « ; », cellules entre guillemets avec retours à la ligne)", () => {
  it("une cellule multiligne et des guillemets doublés restent dans leur cellule", async () => {
    const file = path.join(os.tmpdir(), `govapark-works-${process.pid}.csv`);
    fs.writeFileSync(file, 'identifiant;voie;impact_circulation_detail;geo_shape\nCP1;rue A;"Impact sur les piétons : déviations -\nImpact sur les vélos : pistes ""provisoires"""; "{""type"": ""Polygon""}"\nCP2;rue B;;\n');
    const { header, records } = await readRecords(file);
    fs.rmSync(file);
    expect(header).toEqual(["identifiant", "voie", "impact_circulation_detail", "geo_shape"]);
    expect(records).toHaveLength(2);
    expect(records[0].impact_circulation_detail).toBe('Impact sur les piétons : déviations -\nImpact sur les vélos : pistes "provisoires"');
    expect(records[1].voie).toBe("rue B");
  });
});

describe("chantiers : fichiers générés à partir du vrai export du 05/11/2026", () => {
  const dir = path.join(process.cwd(), "public/data/paris-works");
  const exists = fs.existsSync(path.join(dir, "index.json"));
  const load = () => {
    const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")) as LayerIndex;
    const seen = new Map<string, ReturnType<typeof decodeTile>[number]>();
    for (const key of Object.keys(index.tiles)) for (const f of decodeTile(JSON.parse(fs.readFileSync(path.join(dir, "tiles", `${key}.json`), "utf8")) as LayerTileFile)) seen.set(f.id, f);
    return { index, features: [...seen.values()] };
  };
  it("date de l'export et licence", () => {
    if (!exists) return;
    const { index } = load();
    expect(index.dataDate).toBe("2026-11-05");
    expect(index.source.license).toBe("ODbL");
  });
  it("aucun chantier à date de fin passée dans les fichiers ; impacts = les 4 valeurs réelles ou absent ; tout est dans Paris", () => {
    if (!exists) return;
    const { index, features } = load();
    expect(features.length).toBeGreaterThan(50);
    expect(features.length).toBeLessThanOrEqual(index.count);
    const day = parisDay(new Date(index.generatedAt));
    for (const f of features) {
      const fin = f.props[WORK_PROP.fin];
      if (typeof fin === "string") expect(fin >= day).toBe(true);
      const impact = f.props[WORK_PROP.impact];
      if (impact !== null) expect(Object.keys(IMPACT_LABELS)).toContain(impact);
      for (const [lng, lat] of f.coords) { expect(lat).toBeGreaterThan(48.8); expect(lat).toBeLessThan(48.92); expect(lng).toBeGreaterThan(2.2); expect(lng).toBeLessThan(2.5); }
      expect(f.coords.length >= 3).toBe(true);
    }
  });
  it("le site masque encore, au chargement, un chantier dont la fin est passée ou le début futur", () => {
    if (!exists) return;
    const { features } = load();
    const later = new Date("2031-04-01T10:00:00Z"); // après la dernière date_fin du fichier (2031-03-31)
    expect(features.filter((f) => isWorkActive(f.props, later))).toHaveLength(0);
    const active = features.filter((f) => isWorkActive(f.props, new Date("2026-11-05T10:00:00Z")));
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThan(features.length); // les « à venir » (début futur) sont écartés
  });
  it("un point à l'intérieur d'un vrai périmètre donne la ligne de fiche, un point loin n'en donne aucune", () => {
    if (!exists) return;
    const { features } = load();
    const now = new Date("2026-11-05T10:00:00Z");
    const f = features.find((x) => isWorkActive(x.props, now))!;
    const lat = f.coords.reduce((a, c) => a + c[1], 0) / f.coords.length, lng = f.coords.reduce((a, c) => a + c[0], 0) / f.coords.length;
    const near = worksNear(features, lat + 0.0002, lng + 0.0002, now, 40);
    expect(near).not.toBeNull();
    expect(workCardLine(near!.props).startsWith("Chantier : ")).toBe(true);
    expect(worksNear(features, 48.9, 2.45, now)).toBeNull();
  });
});

describe("chantiers : alerte de fiche à moins de 100 m", () => {
  it("texte avec distance arrondie à 5 m, ou « ici » dans le périmètre", () => {
    const props = make()[0].props;
    expect(workAlertText(props, 0)).toBe("Chantier ici · Voie partiellement fermée · rue Louis Blanc · jusqu'au 19 février 2027 (date prévue)");
    expect(workAlertText(props, 82)).toBe("Chantier à 80 m · Voie partiellement fermée · rue Louis Blanc · jusqu'au 19 février 2027 (date prévue)");
    expect(workAlertText(props, 2).startsWith("Chantier à 5 m")).toBe(true);
    expect(WORKS_ALERT_METERS).toBe(100);
  });
});
