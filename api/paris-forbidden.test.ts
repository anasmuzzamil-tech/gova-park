import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_NEAR_METERS, cleanLabel, forbiddenCardLine, forbiddenFeatures, forbiddenNear, inParisBox, type ForbiddenImportStats } from "@contracts/paris-forbidden";
import { bucketFeatures, decodeTile, originFor } from "@contracts/geo-layers";

const fresh = (): ForbiddenImportStats => ({ parts: 0, kept: 0, noShape: 0, outside: 0, badPart: 0 });
// ÉCHANTILLON FABRIQUÉ À LA MAIN (pas une donnée de la Ville de Paris) : le vrai fichier n'a pas pu être téléchargé.
const SAMPLE_LINE = { type: "LineString", coordinates: [[2.3500, 48.8500], [2.3510, 48.8500]] };
const SAMPLE_MULTI = { type: "MultiLineString", coordinates: [[[2.36, 48.86], [2.361, 48.86]], [[2.37, 48.86], [2.371, 48.86]]] };

describe("stationnement interdit : lecture des tracés (échantillon fabriqué)", () => {
  it("une ligne devient une entité, une multi-ligne en donne deux", () => {
    const s = fresh();
    expect(forbiddenFeatures(SAMPLE_LINE, "Livraisons", 0.3, s)).toHaveLength(1);
    expect(forbiddenFeatures(SAMPLE_MULTI, null, 0.3, s)).toHaveLength(2);
    expect(s.kept).toBe(3);
  });
  it("sans géométrie, hors de Paris ou invalide : rejeté et compté, jamais déplacé", () => {
    const s = fresh();
    expect(forbiddenFeatures(null, null, 0.3, s)).toEqual([]);
    expect(forbiddenFeatures({ type: "LineString", coordinates: [[0, 0], [0.001, 0]] }, null, 0.3, s)).toEqual([]);
    expect(forbiddenFeatures({ type: "LineString", coordinates: [[2.35, 48.85], [2.35, 48.85]] }, null, 0.3, s)).toEqual([]);
    expect(s.noShape).toBe(1); expect(s.outside).toBe(1); expect(s.badPart).toBe(1); expect(s.kept).toBe(0);
  });
  it("le cadre de Paris", () => {
    expect(inParisBox([2.35, 48.85])).toBe(true);
    expect(inParisBox([2.35, 45])).toBe(false);
  });
  it("le motif est nettoyé : texte court seulement", () => {
    expect(cleanLabel("  Arrêt   bus ")).toBe("Arrêt bus");
    expect(cleanLabel("")).toBeNull();
    expect(cleanLabel('{"a":1}')).toBeNull();
    expect(cleanLabel("x".repeat(61))).toBeNull();
    expect(cleanLabel(12)).toBeNull();
  });
});

describe("fiche d'une place proche", () => {
  const features = forbiddenFeatures(SAMPLE_LINE, "Livraisons", 0.3);
  it("ligne seulement si un tracé passe à moins de la distance voulue", () => {
    const hit = forbiddenNear(features, 48.85003, 2.3505);
    expect(hit?.label).toBe("Livraisons");
    expect(forbiddenCardLine(hit!)).toBe("Stationnement interdit à cet endroit (Livraisons)");
    expect(forbiddenNear(features, 48.8505, 2.3505)).toBeNull(); // environ 55 m
    expect(FORBIDDEN_NEAR_METERS).toBe(10);
  });
  it("sans motif : phrase simple ; sans donnée : aucune ligne (jamais « autorisé »)", () => {
    const bare = forbiddenFeatures(SAMPLE_LINE, null, 0.3);
    expect(forbiddenCardLine(forbiddenNear(bare, 48.85, 2.3505)!)).toBe("Stationnement interdit à cet endroit");
    expect(forbiddenNear([], 48.85, 2.3505)).toBeNull();
  });
  it("prend le tracé le plus proche", () => {
    const two = [...forbiddenFeatures(SAMPLE_LINE, "A", 0.3), ...forbiddenFeatures({ type: "LineString", coordinates: [[2.3500, 48.85004], [2.3510, 48.85004]] }, "B", 0.3)];
    expect(forbiddenNear(two, 48.85004, 2.3505)?.label).toBe("B");
  });
});

describe("tuilage des tracés", () => {
  it("les tuiles gardent le motif et la forme", () => {
    const f = [...forbiddenFeatures(SAMPLE_LINE, "Livraisons", 0.3), ...forbiddenFeatures(SAMPLE_MULTI, null, 0.3)];
    const tiles = bucketFeatures(f, originFor(f, 0.02), 0.02);
    const all = [...tiles.values()].flatMap((t) => decodeTile(t));
    expect(all.some((x) => x.props[0] === "Livraisons")).toBe(true);
    expect(all.every((x) => x.kind === "line")).toBe(true);
  });
  it("fichiers générés du dépôt, s'ils existent : conformes aux seuils de poids", () => {
    const dir = path.join(process.cwd(), "public/data/paris-forbidden");
    if (!fs.existsSync(path.join(dir, "index.json"))) return; // données pas encore importées
    let total = 0, biggest = 0;
    for (const name of fs.readdirSync(path.join(dir, "tiles"))) { const n = fs.statSync(path.join(dir, "tiles", name)).size; total += n; biggest = Math.max(biggest, n); }
    expect(total).toBeLessThan(6 * 1048576);
    expect(biggest).toBeLessThan(150 * 1024);
  });
});
