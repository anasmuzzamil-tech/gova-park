#!/usr/bin/env node
// Import des CHANTIERS perturbant la circulation à Paris (Ville de Paris, licence ODbL) : polygones des périmètres de chantier.
// Source : jeu « Paris - Chantiers perturbants la circulation » (data.gouv.fr/datasets/paris-chantiers-perturbants-la-circulation).
//
// Usage (Node 22, aucune dépendance, aucun service payant) :
//   node scripts/import-paris-works.mjs <fichier.csv|.json|.geojson> --inspect
//   node scripts/import-paris-works.mjs <fichier> --data-date=AAAA-MM-JJ [--simplify=0.5] [--tile-deg=0.02] [--out=public/data/paris-works]
// --data-date = date des données : le fichier ne donne pas sa date d'export, on met la date de RÉCEPTION de l'export (ex. 2026-11-05) ; elle est montrée dans le panneau « i ».
// Le fichier source (CSV d'environ 70 Ko) n'est JAMAIS versionné.
//
// Testé sur le vrai fichier reçu le 05/11/2026 (106 lignes, « ; », UTF-8, 19 colonnes, geo_shape Polygon/MultiPolygon WGS84). Un fichier Lambert 93 est refusé, jamais « corrigé » au hasard.
// Colonnes lues : voie, cp_arrondissement, maitre_ouvrage, objet, date_debut, date_fin, impact_circulation, geo_shape. Les chantiers dont date_fin est PASSÉE sont écartés à l'import
// (les « à venir », début futur, sont gardés : le site ne les affiche qu'à partir de leur début).
import { geometryParts, looksWgs84 } from "../contracts/geo-layers.ts";
import { WORKS_SOURCE, parisDay, worksAttribution, worksFeatures, isWorkActive, WORK_PROP } from "../contracts/paris-works.ts";
import { arg, jsonCell, pickColumn, readRecords, writeLayer } from "./lib/io.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const inspect = args.includes("--inspect");
const outDir = arg(args, "out") ?? "public/data/paris-works";
const simplify = Number(arg(args, "simplify") ?? 0.5);
const tileDeg = Number(arg(args, "tile-deg") ?? 0.02);
const dataDate = arg(args, "data-date") ?? null;
if (!file) { console.error("Usage : node scripts/import-paris-works.mjs <fichier.csv|json|geojson> [--inspect] --data-date=AAAA-MM-JJ"); process.exit(2); }
if (dataDate && !/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) { console.error("--data-date attend AAAA-MM-JJ."); process.exit(2); }
if (!dataDate && !inspect) console.warn("ATTENTION : --data-date absent, le panneau « i » dira « date des données non renseignée ».");

const { header, records } = await readRecords(file);
const col = (...n) => pickColumn(header, ...n);
const C = { shape: col("geo_shape", "geometry", "geom"), voie: col("voie"), objet: col("objet"), impact: col("impact_circulation", "impact"), debut: col("date_debut"), fin: col("date_fin"), maitre: col("maitre_ouvrage"), arr: col("cp_arrondissement", "arrondissement") };
console.log(`Fichier : ${file} · ${records.length} lignes · colonnes (${header.length}) : ${header.join(" | ")}`);
console.log(`Colonnes reconnues : ${Object.entries(C).map(([k, v]) => `${k}=${v ?? "ABSENTE"}`).join(", ")}`);
if (!C.shape) { console.error("Colonne de géométrie (geo_shape) absente : import annulé, rien écrit."); process.exit(1); }

const stats = { rows: records.length, noShape: 0, outside: 0, badPart: 0, kept: 0, parts: 0, expiredAtImport: 0 };
const today = parisDay(new Date());
const features = []; let lambert = 0; const impacts = {};
for (const rec of records) {
  const shape = jsonCell(rec[C.shape]);
  const first = geometryParts(shape)[0]?.coords[0];
  if (first && !looksWgs84(first)) { lambert++; continue; }
  const made = worksFeatures({ shape, voie: C.voie && rec[C.voie], objet: C.objet && rec[C.objet], impact: C.impact && rec[C.impact], debut: C.debut && rec[C.debut], fin: C.fin && rec[C.fin], maitre: C.maitre && rec[C.maitre], arrondissement: C.arr && rec[C.arr] }, simplify, stats);
  if (made.length) { const k = String(made[0].props[2] ?? "(absent)"); impacts[k] = (impacts[k] ?? 0) + 1; }
  features.push(...made);
}
const all = features.length;
const live = features.filter((f) => !(typeof f.props[WORK_PROP.fin] === "string" && f.props[WORK_PROP.fin] < today));
stats.expiredAtImport = all - live.length;
const notStarted = live.filter((f) => !isWorkActive(f.props)).length;
features.length = 0; features.push(...live);
console.log(`Lignes ${stats.rows} · parties de contour ${stats.parts} · contours gardés avant filtre ${all} · sans polygone ${stats.noShape} · hors de Paris ${stats.outside} · micro-contours dégénérés écartés (moins de ~1 m) ${stats.badPart} · non WGS84 ${lambert}`);
console.log(`Valeurs d'impact_circulation (par ligne) : ${Object.entries(impacts).map(([k, v]) => `${k} ${v}`).join(", ") || "aucune"}`);
console.log(`Jour de l'import (Paris) : ${today} · contours dont date_fin est passée, ÉCARTÉS : ${stats.expiredAtImport} · gardés : ${features.length} dont ${notStarted} à venir (début futur, non affichés avant leur début)`);
if (lambert && !features.length) { console.error("Coordonnées non WGS84 (Lambert 93 ?) : utiliser l'export WGS84 d'opendata.paris.fr. Rien écrit."); process.exit(1); }
const ok = writeLayer({ features, outDir, layer: "paris-works", source: WORKS_SOURCE, attribution: worksAttribution(dataDate), dataDate, tileDeg, inspect });
process.exit(ok ? 0 : 1);
