#!/usr/bin/env node
// Import des BORNES DE RECHARGE (IRVE) d'Île-de-France depuis le fichier national consolidé (schéma etalab/schema-irve-statique, Licence Ouverte).
// Fichier à télécharger (CSV, environ 88 Mo, NON versionné) : voir IRVE_FILE_URL dans contracts/paris-irve.ts
//   https://www.data.gouv.fr/api/1/datasets/r/eb76d20a-8501-400e-b336-d85724de5435
// Usage (Node 22, aucune dépendance, aucun service payant) :
//   node scripts/import-paris-irve.mjs <fichier.csv> --inspect
//   node scripts/import-paris-irve.mjs <fichier.csv> --data-date=AAAA-MM-JJ [--tile-deg=0.02] [--out=public/data/paris-irve]
// Lecture en FLUX (le fichier entier n'est jamais chargé) ; seules les lignes dans le cadre de l'Île-de-France sont gardées, regroupées par station.
// Colonnes lues (schéma 2.1.0, 40 champs) : id_station_itinerance, nom_operateur, nom_enseigne, nom_station, adresse_station, coordonneesXY (ou consolidated_longitude / consolidated_latitude),
// nbre_pdc, id_pdc_itinerance, puissance_nominale, prise_type_*, gratuit. Aucune disponibilité, aucun tarif, aucune horaire n'est lu.
// ÉTAT : écrit sur le schéma documenté, NON TESTÉ sur le vrai fichier (le bac à sable ne peut pas le télécharger).
import { streamCsv, writeLayer, arg, norm } from "./lib/io.mjs";
import { IRVE_SOURCE, irveAdd, irveAttribution, irveFeature } from "../contracts/paris-irve.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const inspect = args.includes("--inspect");
const outDir = arg(args, "out") ?? "public/data/paris-irve";
const tileDeg = Number(arg(args, "tile-deg") ?? 0.02);
const dataDate = arg(args, "data-date") ?? null;
if (!file) { console.error("Usage : node scripts/import-paris-irve.mjs <fichier.csv> [--inspect] --data-date=AAAA-MM-JJ"); process.exit(2); }
if (dataDate && !/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) { console.error("--data-date attend AAAA-MM-JJ."); process.exit(2); }
if (!dataDate && !inspect) console.warn("ATTENTION : --data-date absent, le panneau « i » dira « fichier du … » sans date.");

let header = null, rows = 0, noPos = 0, kept = 0; const stations = new Map();
const REQUIRED = ["id_station_itinerance", "adresse_station", "puissance_nominale"];
await streamCsv(file, (cells) => {
  if (!header) {
    header = cells.map((h) => h.trim());
    const have = new Set(header.map(norm));
    const missing = REQUIRED.filter((c) => !have.has(norm(c)));
    if (missing.length || !(have.has("coordonneesxy") || (have.has("consolidated_longitude") && have.has("consolidated_latitude")))) {
      console.error(`Colonnes absentes : ${[...missing, ...(have.has("coordonneesxy") || have.has("consolidated_longitude") ? [] : ["coordonneesXY ou consolidated_longitude/latitude"])].join(", ")} : ce n'est pas le schéma etalab/schema-irve-statique. Rien écrit.`);
      process.exit(1);
    }
    return;
  }
  if (cells.length < 2) return;
  rows++;
  const row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  const r = irveAdd(stations, row);
  if (r === "noPosition") noPos++; else kept++;
});
const features = [...stations.values()].map(irveFeature);
const pdc = features.reduce((s, f) => s + (f.props[3] ?? 0), 0);
const power = features.filter((f) => f.props[4] != null).length;
console.log(`Lignes lues ${rows} (points de charge) · gardées dans le cadre de l'Île-de-France ${kept} · hors cadre ou sans position ${noPos}`);
console.log(`Stations : ${features.length} · points de charge cumulés ${pdc} · stations avec puissance renseignée ${power} · opérateurs distincts ${new Set([...stations.values()].map((s) => s.operator)).size}`);
const ok = writeLayer({ features, outDir, layer: "paris-irve", source: IRVE_SOURCE, attribution: irveAttribution(dataDate), dataDate, tileDeg, inspect });
process.exit(ok ? 0 : 1);
