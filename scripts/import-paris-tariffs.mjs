#!/usr/bin/env node
// Import des ZONES TARIFAIRES du stationnement payant de Paris (tarif visiteur ; Ville de Paris, licence ODbL) depuis le Shapefile.
// Usage (Node 22, aucune dépendance) :
//   node scripts/import-paris-tariffs.mjs <dossier ou base du Shapefile> --inspect
//   node scripts/import-paris-tariffs.mjs <base> --data-date=2026-11-05 [--simplify=2] [--out=public/data/paris-tariffs]
// <base> = chemin sans extension (…/stationnement-sur-voie-publique-zones-tarifaires) ou dossier qui contient un seul .shp.
// Le DBF est lu PAR POSITION (noms de colonnes tronqués en double). Sens des colonnes : voir contracts/paris-tariffs.ts. Le Shapefile source n'est JAMAIS versionné.
import fs from "node:fs";
import path from "node:path";
import { normalizePart, simplifyCoords } from "../contracts/geo-layers.ts";
import { TARIFF_SOURCE } from "../contracts/paris-tariffs.ts";
import { arg } from "./lib/io.mjs";
import { readShapefile } from "./lib/shapefile.mjs";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
const inspect = args.includes("--inspect");
const outDir = arg(args, "out") ?? "public/data/paris-tariffs";
const simplify = Number(arg(args, "simplify") ?? 2);
const dataDate = arg(args, "data-date") ?? null;
if (!input) { console.error("Usage : node scripts/import-paris-tariffs.mjs <base du Shapefile> [--inspect] --data-date=AAAA-MM-JJ"); process.exit(2); }
if (dataDate && !/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) { console.error("--data-date attend AAAA-MM-JJ."); process.exit(2); }
let base = input.replace(/\.(shp|dbf|shx|prj)$/i, "");
if (fs.existsSync(input) && fs.statSync(input).isDirectory()) {
  const shp = fs.readdirSync(input).filter((f) => f.toLowerCase().endsWith(".shp"));
  if (shp.length !== 1) { console.error(`Un seul .shp attendu dans ${input}.`); process.exit(1); }
  base = path.join(input, shp[0].replace(/\.shp$/i, ""));
}

const { fields, prj, records } = readShapefile(base);
console.log(`Colonnes (${fields.length}, par position) : ${fields.map((f) => `${f.index}:${f.name}`).join(" ")}`);
if (!/GCS_WGS_1984|WGS.?84/i.test(prj ?? "")) { console.error("Projection non WGS84 (.prj) : import refusé, rien écrit."); process.exit(1); }
const zoneCol = fields.find((f) => f.name === "zone")?.index;
if (zoneCol === undefined) { console.error("Colonne « zone » absente."); process.exit(1); }
// Groupes de 6 colonnes par POSITION, d'après les noms de début (le DBF contient 2 jeux vis_2rm_h1_…h6_ aux noms identiques).
const groups = [];
for (let i = 0; i < fields.length; i++) {
  const m = /^vis_(vl|2rm|suv)_h1/.exec(fields[i].name);
  if (!m) continue;
  const six = fields.slice(i, i + 6);
  if (six.length < 6 || !six.every((f, k) => new RegExp(`^vis_${m[1]}_h${k + 1}`).test(f.name))) { console.error(`Groupe ${m[1]} à la position ${i} : 6 colonnes h1..h6 consécutives attendues.`); process.exit(1); }
  groups.push({ kind: m[1], suffix: fields[i].name.replace(/^vis_(vl|2rm|suv)_h1/, ""), at: i });
}
console.log(`Groupes de colonnes : ${groups.map((g) => `${g.kind}${g.suffix ? `[${g.suffix}]` : ""}@${g.at}`).join(", ")}`);
const price = (rec, g) => Array.from({ length: 6 }, (_, k) => rec.values[g.at + k]);
const hourly = {}, zones = [];
let problems = 0;
for (const rec of records) {
  const zone = Number(rec.values[zoneCol]);
  if (zone !== 1 && zone !== 2) { console.error(`Zone inattendue : ${rec.values[zoneCol]}`); process.exit(1); }
  const byKind = {};
  for (const g of groups) {
    const p = price(rec, g);
    if (!p.every((v) => typeof v === "number" && v >= 0)) { console.error(`Zone ${zone} ${g.kind} : prix illisibles ${p}`); process.exit(1); }
    if (byKind[g.kind] && JSON.stringify(byKind[g.kind]) !== JSON.stringify(p)) { console.error(`Zone ${zone} : deux jeux « ${g.kind} » ont des valeurs DIFFÉRENTES (${byKind[g.kind]} / ${p}) : leur sens n'est pas documenté, import refusé.`); problems++; }
    byKind[g.kind] ??= p;
  }
  if (!byKind.vl || !byKind["2rm"]) { console.error(`Zone ${zone} : colonnes vl ou 2rm absentes.`); process.exit(1); }
  hourly[zone] = { vl: byKind.vl, rm2: byKind["2rm"] };
  console.log(`Zone ${zone} : vl ${byKind.vl} · 2rm ${byKind["2rm"]} · suv ${byKind.suv ?? "(absent)"} · ${rec.parts.length} anneau(x) de ${rec.parts.map((r) => r.length).join("+")} sommets`);
  if (byKind.suv && !byKind.vl.every((v, k) => Math.abs(v * 3 - byKind.suv[k]) < 1e-9)) console.warn(`  Attention : suv n'est pas égal à 3 x vl en zone ${zone}.`);
  if (!byKind["2rm"].every((v, k) => Math.abs(v * 2 - byKind.vl[k]) < 1e-9)) console.warn(`  Attention : vl n'est pas égal à 2 x 2rm en zone ${zone}.`);
  const rings = rec.parts.map((ring) => normalizePart({ kind: "poly", coords: simplifyCoords(ring, simplify) })?.coords).filter(Boolean);
  if (!rings.length) { console.error(`Zone ${zone} : contour vide.`); process.exit(1); }
  for (const ring of rings) for (const [lng, lat] of ring) if (lng < 2.2 || lng > 2.5 || lat < 48.8 || lat > 48.92) { console.error(`Zone ${zone} : sommet hors de Paris (${lng}, ${lat}).`); process.exit(1); }
  zones.push({ zone, rings });
}
if (problems || zones.length !== 2) process.exit(1);
const file = { version: 1, source: TARIFF_SOURCE, dataDate, zones, hourly, maxHours: 6 };
const text = JSON.stringify(file);
console.log(`Fichier : ${(Buffer.byteLength(text) / 1024).toFixed(1)} Ko · sommets ${zones.map((z) => z.rings.map((r) => r.length).join("+")).join(" / ")} · tolérance ${simplify} m · date des données : ${dataDate ?? "non renseignée"}`);
if (Buffer.byteLength(text) > 150 * 1024) { console.error("Plus de 150 Ko : essayer --simplify=5."); process.exit(1); }
if (inspect) { console.log("--inspect : rien n'a été écrit."); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "zones.json"), text);
console.log(`Écrit dans ${outDir}/zones.json.`);
