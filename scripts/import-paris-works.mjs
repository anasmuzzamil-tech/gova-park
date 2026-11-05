#!/usr/bin/env node
// Import des CHANTIERS perturbant la circulation à Paris (Ville de Paris, licence ODbL) : polygones des périmètres de chantier.
// Source : jeu « Paris - Chantiers perturbants la circulation » (data.gouv.fr/datasets/paris-chantiers-perturbants-la-circulation).
//
// Usage (Node 22, aucune dépendance, aucun service payant) :
//   node scripts/import-paris-works.mjs <fichier.csv|.json|.geojson> --inspect
//   node scripts/import-paris-works.mjs <fichier> --data-date=AAAA-MM-JJ [--simplify=0.5] [--tile-deg=0.02] [--out=public/data/paris-works]
// --data-date = date de mise à jour AFFICHÉE par la page du jeu (la dernière annoncée : 5 juillet 2026), pas la date du jour : elle est montrée dans le panneau « i ».
// Le fichier source (CSV d'environ 70 Ko) n'est JAMAIS versionné.
//
// NON TESTÉ SUR LES VRAIES DONNÉES (téléchargement bloqué depuis l'environnement de développement). Les ressources de la page sont en RGF93 Lambert 93 selon la fiche :
// choisir l'export en WGS84 (celui d'opendata.paris.fr) ; un fichier Lambert 93 est refusé, jamais « corrigé » au hasard.
// Colonnes lues, si présentes : voie, cp_arrondissement, maitre_ouvrage, objet, date_debut, date_fin, impact_circulation, geo_shape. Lancer --inspect d'abord.
import { geometryParts, looksWgs84 } from "../contracts/geo-layers.ts";
import { WORKS_SOURCE, worksAttribution, worksFeatures, isWorkActive } from "../contracts/paris-works.ts";
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
const features = []; let lambert = 0; const impacts = {};
for (const rec of records) {
  const shape = jsonCell(rec[C.shape]);
  const first = geometryParts(shape)[0]?.coords[0];
  if (first && !looksWgs84(first)) { lambert++; continue; }
  const made = worksFeatures({ shape, voie: C.voie && rec[C.voie], objet: C.objet && rec[C.objet], impact: C.impact && rec[C.impact], debut: C.debut && rec[C.debut], fin: C.fin && rec[C.fin], maitre: C.maitre && rec[C.maitre], arrondissement: C.arr && rec[C.arr] }, simplify, stats);
  if (made.length) { const k = String(made[0].props[2] ?? "(absent)"); impacts[k] = (impacts[k] ?? 0) + 1; }
  features.push(...made);
}
stats.expiredAtImport = features.filter((f) => !isWorkActive(f.props)).length;
console.log(`Lignes ${stats.rows} · contours gardés ${stats.kept} · sans polygone ${stats.noShape} · hors de Paris ${stats.outside} · invalides ${stats.badPart} · non WGS84 ${lambert}`);
console.log(`Valeurs d'impact_circulation : ${Object.entries(impacts).map(([k, v]) => `${k} ${v}`).join(", ") || "aucune"}`);
console.log(`Chantiers déjà terminés ou pas encore commencés selon leurs dates (gardés dans les tuiles, non affichés par le site) : ${stats.expiredAtImport} sur ${features.length}`);
if (lambert && !features.length) { console.error("Coordonnées non WGS84 (Lambert 93 ?) : utiliser l'export WGS84 d'opendata.paris.fr. Rien écrit."); process.exit(1); }
const ok = writeLayer({ features, outDir, layer: "paris-works", source: WORKS_SOURCE, attribution: worksAttribution(dataDate), dataDate, tileDeg, inspect });
process.exit(ok ? 0 : 1);
