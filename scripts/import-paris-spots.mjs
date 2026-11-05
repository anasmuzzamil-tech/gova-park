#!/usr/bin/env node
// Import des emplacements de stationnement sur voie publique de Paris (Ville de Paris, licence ODbL).
// Source : https://www.data.gouv.fr/datasets/stationnement-sur-voie-publique-emplacements
//
// Usage (Node 22, aucune dépendance, aucun service payant) :
//   1) télécharger le CSV (ou le JSON) depuis la page ci-dessus, décompresser si besoin ;
//   2) node scripts/import-paris-spots.mjs <fichier.csv|.json|.geojson|.ndjson> --inspect     (vérifie les colonnes détectées, n'écrit rien)
//   3) node scripts/import-paris-spots.mjs <fichier> [--out=public/data/paris]
//
// Produit des fichiers statiques à servir tels quels (format version 2) : index.json (dont la liste des couples de régimes),
// overview.json (vue d'ensemble : un point par cellule et par type avec le TOTAL DE PLACES, pour le regroupement) et
// tiles/<ix>_<iy>.json (tronçons détaillés par tuile : position, type, « Nombre places réelles », régime, rue, numéro).
// La carte ne charge JAMAIS tout : vue d'ensemble pour la ville entière, seulement les tuiles visibles (avec limite) au zoom de quartier.
//
// Colonnes lues (noms vérifiés sur le fichier du 31/10/2026) : « Régime prioritaire », « Régime particulier », « Nombre places réelles »,
// « Type voie », « Nom voie », « Numéro voie », « Complément numéro voie », et la position (geo_point_2d). Aucun tarif ni horaire n'est lu.
// L'interprétation des régimes est dans contracts/paris-spots.ts (interpretRegime), jamais devinée : --inspect liste chaque couple.
import fs from "node:fs";
import path from "node:path";
import { GRID, PARIS_ATTRIBUTION, PARIS_SOURCE, SPOT_TYPE_LABEL, aggregateOverview, bucketTiles, encodeNumero, interpretRegime, isExcludedRegime, streetKey } from "../contracts/paris-spots.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const inspect = args.includes("--inspect");
const outDir = flag("out") ?? "public/data/paris";
if (!file) { console.error("Usage : node scripts/import-paris-spots.mjs <fichier.csv|.json|.geojson|.ndjson> [--inspect] [--out=dossier]"); process.exit(2); }
if (/\.zip$/i.test(file)) { console.error("Décompressez d'abord le ZIP, puis passez le fichier CSV ou JSON qu'il contient."); process.exit(2); }

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------- Lecture ----------
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
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
function readRecords(p) {
  const text = fs.readFileSync(p, "utf8");
  if (/\.csv$/i.test(p)) return parseCsv(text);
  if (/\.ndjson$|\.jsonl$/i.test(p)) return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.features)) return data.features.map((f) => ({ ...(f.properties ?? {}), geometry: f.geometry }));
  for (const k of ["records", "results", "data"]) if (Array.isArray(data[k])) return data[k].map((r) => r.fields ?? r.record?.fields ?? r);
  throw new Error("Format JSON non reconnu (tableau, GeoJSON FeatureCollection, ou objet avec records/results/data attendus).");
}

// ---------- Position ----------
const LAT_KEYS = ["latitude", "lat", "y"], LNG_KEYS = ["longitude", "lon", "lng", "long", "x"];
const maybeJson = (v) => { if (typeof v !== "string") return v; const t = v.trim(); if (!t.startsWith("{") && !t.startsWith("[")) return v; try { return JSON.parse(t); } catch { return v; } };
function firstCoord(geom) {
  const g = maybeJson(geom);
  if (!g || typeof g !== "object") return null;
  let c = g.coordinates ?? g.geometry?.coordinates;
  if (!Array.isArray(c)) return null;
  // Point [lng, lat] ; ligne / polygone : on prend le centre des premiers points.
  const pts = []; const walk = (a) => { if (typeof a[0] === "number") pts.push(a); else a.forEach(walk); }; walk(c);
  if (!pts.length) return null;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length, lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { lat, lng };
}
function position(rec, keyMap) {
  const num = (v) => { const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const latKey = LAT_KEYS.find((k) => keyMap[k]), lngKey = LNG_KEYS.find((k) => keyMap[k]);
  if (latKey && lngKey) { const lat = num(rec[keyMap[latKey]]), lng = num(rec[keyMap[lngKey]]); if (lat != null && lng != null) return { lat, lng, how: `${keyMap[latKey]}/${keyMap[lngKey]}` }; }
  for (const k of ["geo_point_2d", "geopoint", "geo_point", "coordonnees", "coordinates"]) {
    if (!keyMap[k]) continue;
    const v = maybeJson(rec[keyMap[k]]);
    if (v && typeof v === "object" && !Array.isArray(v) && (v.lat != null || v.latitude != null)) { const lat = num(v.lat ?? v.latitude), lng = num(v.lon ?? v.lng ?? v.longitude); if (lat != null && lng != null) return { lat, lng, how: keyMap[k] }; }
    if (Array.isArray(v) && v.length === 2) { const lat = num(v[0]), lng = num(v[1]); if (lat != null && lng != null) return { lat, lng, how: `${keyMap[k]} (lat, lng)` }; }
    if (typeof v === "string") { const m = v.split(/[,;\s]+/).filter(Boolean).map(num); if (m.length === 2 && m[0] != null && m[1] != null) return { lat: m[0], lng: m[1], how: `${keyMap[k]} (lat, lng)` }; }
  }
  for (const k of ["geometry", "geo_shape", "geom", "shape"]) {
    if (!keyMap[k]) continue;
    const c = firstCoord(rec[keyMap[k]]);
    if (c) return { ...c, how: `${keyMap[k]} (GeoJSON)` };
  }
  return null;
}

// ---------- Traitement ----------
const records = readRecords(file);
if (!records.length) { console.error("Aucune ligne lue."); process.exit(1); }
const columns = Object.keys(records[0]);
const keyMap = Object.fromEntries(columns.map((c) => [norm(c), c]));
const col = (...names) => names.map((n) => keyMap[norm(n)]).find(Boolean);
const C = {
  prio: col("Régime prioritaire"), part: col("Régime particulier"), places: col("Nombre places réelles"),
  voieType: col("Type voie"), voieName: col("Nom voie"), numero: col("Numéro voie"), complement: col("Complément numéro voie"),
};
const missing = Object.entries(C).filter(([, v]) => !v).map(([k]) => k);

// Cadre large autour de Paris : une ligne hors cadre est rejetée et comptée (jamais corrigée ni déplacée).
const BOX = { south: 48.7, north: 49.0, west: 2.1, east: 2.6 };
const points = []; const rejected = { noPosition: 0, outside: 0 }; const how = new Map();
const regimes = []; const regimeIds = new Map(); // couples [prioritaire, particulier] -> rang
let totalPlaces = 0, zeroPlaces = 0, excluded = 0;
const combos = new Map();
for (const rec of records) {
  const pos = position(rec, keyMap);
  if (!pos) { rejected.noPosition++; continue; }
  if (pos.lat < BOX.south || pos.lat > BOX.north || pos.lng < BOX.west || pos.lng > BOX.east) { rejected.outside++; continue; }
  how.set(pos.how, (how.get(pos.how) ?? 0) + 1);
  const prio = String(C.prio ? rec[C.prio] : "").trim(), part = String(C.part ? rec[C.part] : "").trim();
  if (isExcludedRegime(prio, part)) { excluded++; continue; }
  const rk = `${prio}\u0001${part}`;
  let g = regimeIds.get(rk);
  if (g === undefined) { g = regimes.length; regimes.push([prio, part]); regimeIds.set(rk, g); }
  const t = interpretRegime(prio, part).t;
  const placesRaw = Number(String(C.places ? rec[C.places] : "").replace(",", "."));
  const places = Number.isFinite(placesRaw) && placesRaw > 0 ? Math.round(placesRaw) : 0;
  totalPlaces += places; if (!places) zeroPlaces++;
  combos.set(g, (combos.get(g) ?? 0) + 1);
  points.push({
    lat: pos.lat, lng: pos.lng, t, places, g,
    street: streetKey(String(C.voieType ? rec[C.voieType] : ""), String(C.voieName ? rec[C.voieName] : "")),
    num: encodeNumero(C.numero ? rec[C.numero] : "", C.complement ? rec[C.complement] : ""),
  });
}
const byType = {}; for (const p of points) byType[p.t] = (byType[p.t] ?? 0) + 1;

console.log(`Fichier : ${file}`);
console.log(`Lignes lues : ${records.length} · emplacements retenus : ${points.length} · rejetés : ${rejected.noPosition} sans position, ${rejected.outside} hors de Paris`);
console.log(`Colonnes (${columns.length}) : ${columns.join(", ")}`);
console.log(`Position lue depuis : ${[...how].map(([k, v]) => `${k} (${v})`).join(" ; ") || "AUCUNE"}`);
console.log(`Colonnes utilisées : ${Object.entries(C).map(([k, v]) => `${k}=${v ?? "ABSENTE"}`).join(" · ")}`);
if (missing.length) console.warn(`ATTENTION : colonnes absentes (${missing.join(", ")}) : régimes, places ou rues manquants dans la sortie.`);
console.log(`Exclus (stations Vélib') : ${excluded}`);
console.log(`Places réelles : ${totalPlaces} au total · ${zeroPlaces} tronçons sans nombre de places (0 ou vide)`);
console.log("Répartition par type :", Object.entries(byType).map(([t, n]) => `${SPOT_TYPE_LABEL[t]} ${n}`).join(" · "));
if (inspect) {
  console.log("Régimes (prioritaire | particulier -> type, voiture, titre) :");
  for (const [g, n] of [...combos].sort((a, b) => b[1] - a[1])) { const [p, q] = regimes[g]; const r = interpretRegime(p, q); console.log(`  ${n}\t${p} | ${q} -> ${SPOT_TYPE_LABEL[r.t]} · voiture=${r.cars} · ${r.title}`); }
}
if (inspect) { console.log("Exemple (3 premières lignes) :"); records.slice(0, 3).forEach((r) => console.log(JSON.stringify(r).slice(0, 600))); console.log("--inspect : rien n'a été écrit."); process.exit(0); }
if (!points.length) { console.error("Aucun emplacement retenu : import annulé, rien écrit."); process.exit(1); }

const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const origin = { south: r5(Math.floor(Math.min(...lats) / GRID.tileDeg) * GRID.tileDeg), west: r5(Math.floor(Math.min(...lngs) / GRID.tileDeg) * GRID.tileDeg) };
const tiles = bucketTiles(points, origin, GRID.tileDeg);
const overview = aggregateOverview(points, origin, GRID.overviewDeg);

fs.mkdirSync(path.join(outDir, "tiles"), { recursive: true });
let bytes = 0;
const write = (p, data) => { const s = JSON.stringify(data); fs.writeFileSync(p, s); bytes += Buffer.byteLength(s); };
const tileCounts = {};
for (const [key, file] of tiles) { write(path.join(outDir, "tiles", `${key}.json`), file); tileCounts[key] = file.rows.length; }
write(path.join(outDir, "overview.json"), overview);
write(path.join(outDir, "index.json"), { version: 2, source: PARIS_SOURCE, attribution: PARIS_ATTRIBUTION, generatedAt: new Date().toISOString(), count: points.length, places: totalPlaces, origin, tileDeg: GRID.tileDeg, overviewDeg: GRID.overviewDeg, tiles: tileCounts, regimes });
console.log(`Écrit dans ${outDir} : ${tiles.size} tuiles, vue d'ensemble de ${overview.length} points, ${(bytes / 1048576).toFixed(2)} Mo au total (non compressé).`);
if (bytes > 8 * 1048576) console.warn("ATTENTION : plus de 8 Mo au total, trop lourd pour un fichier statique versionné.");
