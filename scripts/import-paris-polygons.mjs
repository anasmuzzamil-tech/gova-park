#!/usr/bin/env node
// Import des EMPRISES de stationnement sur voie publique de Paris (Ville de Paris, licence ODbL) : contour de chaque zone.
// Source : jeu « Stationnement sur voie publique - emprises » (data.gouv.fr / Paris Data), même relevé que les emplacements.
//
// Usage (Node 22, aucune dépendance, aucun service payant) :
//   node scripts/import-paris-polygons.mjs <fichier.csv> --inspect          (statistiques, n'écrit rien)
//   node scripts/import-paris-polygons.mjs <fichier.csv> [--out=public/data/paris]
// Le CSV source (37 Mo) n'est JAMAIS versionné : seuls les fichiers générés le sont.
//
// Produit <out>/polygons/index.json et <out>/polygons/tiles/<ix>_<iy>.json (format version 1, voir contracts/paris-polygons.ts).
// - Seules les emprises où une VOITURE ordinaire peut se garer sont gardées (même règle que l'affichage par défaut des emplacements :
//   interpretRegime(...).cars === true, c'est-à-dire PAYANT MIXTE, PAYANT ROTATIF, GRATUIT). Les autres régimes ne sont pas importés.
// - Grille : MÊME origine, MÊME taille (0,02 degré) et mêmes clés que les tuiles des emplacements (origine lue dans <out>/index.json).
// - Chaque emprise garde : contour (sommets arrondis au millionième de degré, doublons retirés), « Nombre places réelles », type (payant/gratuit),
//   forme (rectangle ou autre) et un point d'ancrage = le point geo_point_2d, identique (au 1e-5 degré) à celui de l'emplacement correspondant.
// - Les lignes des deux CSV ne sont PAS dans le même ordre et « Nouvel identifiant » n'est pas unique : on relie par la POSITION (ancrage), jamais par l'ordre.
// Aucune géométrie n'est inventée : un contour invalide (moins de 3 sommets, hors de Paris) est rejeté et compté.
import fs from "node:fs";
import path from "node:path";
import { GRID, interpretRegime, toE5 } from "../contracts/paris-spots.ts";
import { PARIS_POLYGONS_ATTRIBUTION, PARIS_POLYGONS_SOURCE, POLY, POLY_KIND, anchorKey, bucketPolygons, classifyRing, isCarRegime, normalizeRing, outerRings } from "../contracts/paris-polygons.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const inspect = args.includes("--inspect");
const outDir = flag("out") ?? "public/data/paris";
if (!file) { console.error("Usage : node scripts/import-paris-polygons.mjs <fichier.csv> [--inspect] [--out=dossier]"); process.exit(2); }
if (!/\.csv$/i.test(file)) { console.error("Fichier CSV attendu (séparateur « ; », UTF-8)."); process.exit(2); }

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function parseCsv(text) {
  const firstLine = text.slice(0, text.indexOf("\n") >= 0 ? text.indexOf("\n") : text.length);
  const delim = (firstLine.match(/;/g) ?? []).length >= (firstLine.match(/,/g) ?? []).length ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const header = rows.shift().map((h) => h.replace(/^﻿/, "").trim());
  return { header, rows: rows.filter((r) => r.length > 1) };
}

const { header, rows } = parseCsv(fs.readFileSync(file, "utf8"));
const keyMap = Object.fromEntries(header.map((h, i) => [norm(h), i]));
const col = (name) => keyMap[norm(name)];
const C = { prio: col("Régime prioritaire"), part: col("Régime particulier"), places: col("Nombre places réelles"), shape: col("geo_shape"), point: col("geo_point_2d") };
const missing = Object.entries(C).filter(([, v]) => v === undefined).map(([k]) => k);
if (missing.length) { console.error(`Colonnes absentes : ${missing.join(", ")} : import annulé, rien écrit.`); process.exit(1); }

const BOX = { south: 48.7, north: 49.0, west: 2.1, east: 2.6 };
const stat = { lines: rows.length, notCar: 0, noShape: 0, badRing: 0, outside: 0, noPoint: 0, kept: 0, parts: 0, multi: 0, rect: 0, shape: 0, split: 0, placesZero: 0, placesOver: 0 };
const items = []; const vertexHist = {}; let placesSplit = 0;
for (const r of rows) {
  if (!isCarRegime(r[C.prio], r[C.part])) { stat.notCar++; continue; }
  const t = interpretRegime(r[C.prio], r[C.part]).t;
  let geometry = null; try { geometry = JSON.parse(r[C.shape]); } catch { /* traité plus bas */ }
  const rings = outerRings(geometry);
  if (!rings.length) { stat.noShape++; continue; }
  const m = String(r[C.point] ?? "").split(/[,;\s]+/).filter(Boolean).map(Number);
  if (m.length !== 2 || !m.every(Number.isFinite)) { stat.noPoint++; continue; }
  const [lat, lng] = m;
  if (lat < BOX.south || lat > BOX.north || lng < BOX.west || lng > BOX.east) { stat.outside++; continue; }
  const placesRaw = Number(String(r[C.places]).replace(",", "."));
  const places = Number.isFinite(placesRaw) && placesRaw > 0 ? Math.round(placesRaw) : 0;
  if (!places) stat.placesZero++;
  if (places > POLY.splitMax) stat.placesOver++;
  if (rings.length > 1) stat.multi++;
  let any = false;
  for (const ring of rings) {
    const pts = normalizeRing(ring);
    if (!pts) { stat.badRing++; continue; }
    // Tous les sommets doivent rester dans le cadre de Paris : sinon rejet (jamais de déplacement).
    if (pts.some(([x, y]) => y < BOX.south || y > BOX.north || x < BOX.west || x > BOX.east)) { stat.outside++; continue; }
    const kind = rings.length === 1 ? classifyRing(pts) : POLY_KIND.shape; // MultiPolygon : contour seul
    if (kind === POLY_KIND.rect) { stat.rect++; if (places >= POLY.splitMin && places <= POLY.splitMax) { stat.split++; placesSplit += places; } } else stat.shape++;
    vertexHist[pts.length] = (vertexHist[pts.length] ?? 0) + 1;
    items.push({ latE5: toE5(lat), lngE5: toE5(lng), t, places, kind, ring: pts });
    stat.parts++; any = true;
  }
  if (any) stat.kept++;
}
console.log(`Fichier : ${file}`);
console.log(`Lignes : ${stat.lines} · emprises voitures gardées : ${stat.kept} (${stat.parts} contours, dont ${stat.multi} multi-parties) · non voitures ignorées : ${stat.notCar}`);
console.log(`Rejets : ${stat.noShape} sans contour, ${stat.noPoint} sans point, ${stat.badRing} contours invalides, ${stat.outside} hors de Paris`);
console.log(`Formes : ${stat.rect} rectangles (dont ${stat.split} avec 2 à ${POLY.splitMax} places : découpe indicative), ${stat.shape} autres formes (contour seul) · places réelles à 0/absent : ${stat.placesZero} · plus de ${POLY.splitMax} places : ${stat.placesOver}`);
console.log(`Sommets par contour (nombre : contours) : ${Object.entries(vertexHist).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(" ")} …`);
if (!items.length) { console.error("Aucune emprise retenue : import annulé, rien écrit."); process.exit(1); }

// Même origine que les emplacements : lue dans <out>/index.json (sinon calculée comme l'importeur des emplacements).
let origin;
try { origin = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf8")).origin; } catch { /* repli ci-dessous */ }
if (!origin || !Number.isFinite(origin.south) || !Number.isFinite(origin.west)) {
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  origin = { south: r5(Math.floor(Math.min(...items.map((p) => p.latE5)) / 1e5 / GRID.tileDeg) * GRID.tileDeg), west: r5(Math.floor(Math.min(...items.map((p) => p.lngE5)) / 1e5 / GRID.tileDeg) * GRID.tileDeg) };
  console.warn(`Index des emplacements introuvable : origine recalculée ${JSON.stringify(origin)}.`);
}
const tiles = bucketPolygons(items, origin, POLY.tileDeg);
let bytes = 0, biggest = { key: "", size: 0 }; const tileCounts = {}; const sizes = new Map();
for (const [key, tile] of tiles) { const s = JSON.stringify(tile); sizes.set(key, s); const n = Buffer.byteLength(s); bytes += n; if (n > biggest.size) biggest = { key, size: n }; tileCounts[key] = tile.rows.length; }
const index = { version: 1, source: PARIS_POLYGONS_SOURCE, attribution: PARIS_POLYGONS_ATTRIBUTION, generatedAt: new Date().toISOString(), count: items.length, rectangles: stat.rect, origin, tileDeg: POLY.tileDeg, tiles: tileCounts };
const indexText = JSON.stringify(index); bytes += Buffer.byteLength(indexText);
console.log(`Tuiles : ${tiles.size} · total ${(bytes / 1048576).toFixed(2)} Mo non compressé · plus grosse tuile ${biggest.key} = ${(biggest.size / 1024).toFixed(1)} Ko`);

// Lien avec les emplacements déjà importés : un contour est colorable seulement si un emplacement a le même point d'ancrage (E5).
try {
  const spotIndex = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf8"));
  const anchors = new Set();
  for (const key of Object.keys(spotIndex.tiles)) for (const row of JSON.parse(fs.readFileSync(path.join(outDir, "tiles", `${key}.json`), "utf8")).rows) anchors.add(anchorKey(row[0], row[1]));
  const linked = items.filter((p) => anchors.has(anchorKey(p.latE5, p.lngE5))).length;
  console.log(`Lien avec les emplacements importés (même point E5) : ${linked} contours sur ${items.length} (${((100 * linked) / items.length).toFixed(2)} %).`);
} catch { console.log("Lien avec les emplacements : non vérifié (fichiers des emplacements absents)."); }

if (inspect) { console.log("--inspect : rien n'a été écrit."); process.exit(0); }
if (biggest.size > 150 * 1024) console.warn("ATTENTION : une tuile dépasse 150 Ko.");
if (bytes > 5 * 1048576) console.warn("ATTENTION : plus de 5 Mo au total.");
const dir = path.join(outDir, "polygons");
fs.mkdirSync(path.join(dir, "tiles"), { recursive: true });
for (const [key, s] of sizes) fs.writeFileSync(path.join(dir, "tiles", `${key}.json`), s);
fs.writeFileSync(path.join(dir, "index.json"), indexText);
console.log(`Écrit dans ${dir}.`);
