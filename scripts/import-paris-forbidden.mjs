#!/usr/bin/env node
// Import du STATIONNEMENT INTERDIT de Paris (Ville de Paris, licence ODbL) : tracés des emplacements où le stationnement est interdit.
// Source : jeu « Stationnement sur voie publique - Stationnement interdit » (data.gouv.fr / opendata.paris.fr), lié aux jeux « emplacements » et « emprises ».
//
// Usage (Node 22, aucune dépendance, aucun service payant) :
//   node scripts/import-paris-forbidden.mjs <fichier.csv|.json|.geojson> --inspect       (colonnes, géométries, poids ; n'écrit rien)
//   node scripts/import-paris-forbidden.mjs <fichier> [--label=<colonne>] [--data-date=AAAA-MM-JJ] [--simplify=0.3] [--tile-deg=0.02] [--out=public/data/paris-forbidden]
// Le fichier source n'est JAMAIS versionné : seules les tuiles générées (public/data/paris-forbidden/) le sont.
//
// NON TESTÉ SUR LES VRAIES DONNÉES : le fichier n'a pas pu être téléchargé depuis l'environnement de développement (proxy sortant). Les colonnes du jeu ne sont pas
// documentées sur data.gouv.fr ; l'importeur lit la géométrie dans « geo_shape » (ou « geometry »), sinon un point dans « geo_point_2d », et refuse
// tout fichier dont les coordonnées ne sont pas en WGS84. Lancer d'abord --inspect, puis choisir --label=<colonne du motif> si une colonne décrit le motif.
// Aucune géométrie n'est inventée : une partie invalide ou hors de Paris est rejetée et comptée.
import { geometryParts, looksWgs84 } from "../contracts/geo-layers.ts";
import { FORBIDDEN_SOURCE, FORBIDDEN_ATTRIBUTION, forbiddenFeatures } from "../contracts/paris-forbidden.ts";
import { arg, jsonCell, pickColumn, readRecords, writeLayer } from "./lib/io.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const inspect = args.includes("--inspect");
const outDir = arg(args, "out") ?? "public/data/paris-forbidden";
const simplify = Number(arg(args, "simplify") ?? 0.3);
const tileDeg = Number(arg(args, "tile-deg") ?? 0.02);
const dataDate = arg(args, "data-date") ?? null;
if (!file) { console.error("Usage : node scripts/import-paris-forbidden.mjs <fichier.csv|json|geojson> [--inspect] [--label=colonne] [--data-date=AAAA-MM-JJ]"); process.exit(2); }
if (dataDate && !/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) { console.error("--data-date attend AAAA-MM-JJ."); process.exit(2); }

const { header, records } = await readRecords(file);
const shapeCol = pickColumn(header, "geo_shape", "geometry", "geom");
const pointCol = pickColumn(header, "geo_point_2d");
const labelName = arg(args, "label");
const labelCol = labelName ? pickColumn(header, labelName) : null;
console.log(`Fichier : ${file} · ${records.length} lignes · colonnes (${header.length}) : ${header.join(" | ")}`);
if (labelName && !labelCol) { console.error(`Colonne --label=${labelName} absente : import annulé, rien écrit.`); process.exit(1); }
if (!shapeCol && !pointCol) { console.error("Aucune colonne de géométrie (geo_shape, geometry ou geo_point_2d) : import annulé, rien écrit."); process.exit(1); }

const stats = { parts: 0, kept: 0, noShape: 0, outside: 0, badPart: 0 };
const features = []; let lambert = 0; const types = {};
for (const rec of records) {
  let shape = shapeCol ? jsonCell(rec[shapeCol]) : null;
  if (!geometryParts(shape).length && pointCol) {
    const m = String(rec[pointCol] ?? "").split(/[,;\s]+/).filter(Boolean).map(Number); // geo_point_2d : « lat, lng »
    if (m.length === 2 && m.every(Number.isFinite)) shape = { type: "Point", coordinates: [m[1], m[0]] };
  }
  const t = shape?.type === "Feature" ? shape.geometry?.type : shape?.type;
  if (t) types[t] = (types[t] ?? 0) + 1;
  const first = geometryParts(shape)[0]?.coords[0];
  if (first && !looksWgs84(first)) { lambert++; continue; }
  features.push(...forbiddenFeatures(shape, labelCol ? rec[labelCol] : null, simplify, stats));
}
console.log(`Types de géométrie : ${Object.entries(types).map(([k, v]) => `${k} ${v}`).join(", ") || "aucun"}`);
console.log(`Parties : ${stats.parts} · gardées ${stats.kept} · sans géométrie ${stats.noShape} · hors de Paris ${stats.outside} · invalides ${stats.badPart} · coordonnées non WGS84 ${lambert}`);
if (lambert && !features.length) { console.error("Les coordonnées ne sont pas en WGS84 (Lambert 93 ?) : exporter le fichier en WGS84 depuis Paris Data. Rien écrit."); process.exit(1); }
const ok = writeLayer({ features, outDir, layer: "paris-forbidden", source: FORBIDDEN_SOURCE, attribution: FORBIDDEN_ATTRIBUTION, dataDate, tileDeg, inspect });
process.exit(ok ? 0 : 1);
