// Outils communs des importeurs de couches géographiques (stationnement interdit, chantiers, bornes de recharge).
// Node 22, aucune dépendance, aucun service externe. Le fichier source n'est JAMAIS versionné : seules les tuiles générées le sont.
import fs from "node:fs";
import path from "node:path";
import { LAYER, bucketFeatures, originFor, sizeProblems } from "../../contracts/geo-layers.ts";

export const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function detectDelimiter(firstLine) {
  const c = { ";": 0, ",": 0, "\t": 0 };
  let q = false;
  for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && ch in c) c[ch]++; }
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

/** Lecteur CSV par morceaux (guillemets, retours à la ligne dans une cellule, BOM) : appelle onRow(cells) pour chaque ligne, sans charger le fichier entier. */
export async function streamCsv(file, onRow) {
  const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 1 << 20 });
  let delim = null, row = [], cell = "", q = false, pendingQuote = false, first = true, pendingCR = false;
  const endRow = () => { row.push(cell); cell = ""; onRow(row); row = []; };
  for await (let chunk of stream) {
    if (first) { chunk = chunk.replace(/^﻿/, ""); const nl = chunk.indexOf("\n"); delim = detectDelimiter(nl >= 0 ? chunk.slice(0, nl) : chunk); first = false; }
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (pendingQuote) { pendingQuote = false; if (c === '"') { cell += '"'; continue; } q = false; }
      if (q) { if (c === '"') pendingQuote = true; else cell += c; continue; }
      if (pendingCR) { pendingCR = false; if (c === "\n") continue; }
      if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\r") { endRow(); pendingCR = true; }
      else if (c === "\n") endRow();
      else cell += c;
    }
  }
  if (pendingQuote) q = false;
  if (cell !== "" || row.length) endRow();
}

/** Lit un petit fichier (CSV, JSON de Paris Data, GeoJSON) et renvoie { header, records } : chaque enregistrement est un objet colonne -> valeur (texte ; geo_shape en objet si JSON/GeoJSON). */
export async function readRecords(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".csv") {
    const rows = [];
    await streamCsv(file, (r) => { if (r.length > 1 || r[0] !== "") rows.push(r); });
    const header = (rows.shift() ?? []).map((h) => h.trim());
    return { header, records: rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))) };
  }
  if (ext === ".json" || ext === ".geojson") {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    let records;
    if (Array.isArray(data)) records = data.map((x) => (x && typeof x === "object" && x.fields ? { ...x.fields, geo_shape: x.fields.geo_shape ?? x.geometry } : x));
    else if (data && Array.isArray(data.features)) records = data.features.map((f) => ({ ...(f.properties ?? {}), geo_shape: f.geometry }));
    else if (data && Array.isArray(data.records)) records = data.records.map((x) => ({ ...(x.fields ?? {}), geo_shape: x.fields?.geo_shape ?? x.geometry }));
    else if (data && Array.isArray(data.results)) records = data.results;
    else throw new Error("JSON non reconnu : tableau d'enregistrements, GeoJSON (features) ou réponse Opendatasoft attendus.");
    const header = [...new Set(records.flatMap((r) => Object.keys(r ?? {})))];
    return { header, records };
  }
  throw new Error("Format non pris en charge : .csv, .json ou .geojson attendu.");
}

/** Valeur JSON d'une cellule (texte JSON du CSV ou objet déjà lu), sinon null. */
export function jsonCell(v) {
  if (v && typeof v === "object") return v;
  if (typeof v !== "string" || !v.trim()) return null;
  try { return JSON.parse(v); } catch { return null; }
}

/** Colonne d'après ses noms possibles (insensible à la casse et aux accents). */
export function pickColumn(header, ...names) {
  const wanted = names.map(norm);
  return header.find((h) => wanted.includes(norm(h))) ?? null;
}

export function arg(args, name) { return args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("="); }

/**
 * Écrit les tuiles <out>/index.json et <out>/tiles/<ix>_<iy>.json après contrôle du poids.
 * Retourne false (rien d'écrit) si un seuil est dépassé : le dossier de sortie n'est alors pas touché.
 */
export function writeLayer({ features, outDir, layer, source, attribution, dataDate, tileDeg = LAYER.tileDeg, inspect = false, origin: fixedOrigin = null }) {
  if (!features.length) { console.error("Aucune entité retenue : import annulé, rien écrit."); return false; }
  const origin = fixedOrigin ?? originFor(features, tileDeg);
  const tiles = bucketFeatures(features, origin, tileDeg);
  let bytes = 0, biggest = { key: "", size: 0 }; const counts = {}; const texts = new Map();
  for (const [key, tile] of tiles) {
    const s = JSON.stringify(tile); const n = Buffer.byteLength(s);
    texts.set(key, s); bytes += n; counts[key] = tile.rows.length;
    if (n > biggest.size) biggest = { key, size: n };
  }
  const index = { version: 1, layer, source, attribution, generatedAt: new Date().toISOString(), dataDate: dataDate ?? null, count: features.length, origin, tileDeg, tiles: counts };
  const indexText = JSON.stringify(index); bytes += Buffer.byteLength(indexText);
  console.log(`Tuiles : ${tiles.size} · total ${(bytes / 1048576).toFixed(2)} Mo non compressé · plus grosse tuile ${biggest.key} = ${(biggest.size / 1024).toFixed(1)} Ko · date des données : ${dataDate ?? "non renseignée"}`);
  const problems = sizeProblems(bytes, biggest.size);
  if (problems.length) { console.error(`Poids hors limites (${problems.join(" ; ")}) : rien n'a été écrit. Essayer --tile-deg=0.01 (tuiles plus petites) ou --simplify=1 (moins de sommets).`); return false; }
  if (inspect) { console.log("--inspect : rien n'a été écrit."); return true; }
  fs.rmSync(path.join(outDir, "tiles"), { recursive: true, force: true }); // dossier entièrement généré par cet importeur
  fs.mkdirSync(path.join(outDir, "tiles"), { recursive: true });
  for (const [key, s] of texts) fs.writeFileSync(path.join(outDir, "tiles", `${key}.json`), s);
  fs.writeFileSync(path.join(outDir, "index.json"), indexText);
  console.log(`Écrit dans ${outDir}.`);
  return true;
}
