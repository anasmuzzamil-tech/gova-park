#!/usr/bin/env node
// Import du PÉRIMÈTRE de la ZFE de Paris depuis la base nationale consolidée des ZFE (aires.geojson, 35 entités). Seule l'entité de Paris est gardée ; les autres villes sont ignorées.
// Usage : node scripts/import-paris-zfe.mjs <aires.geojson> --inspect   puis   --data-date=2026-11-05 [--simplify=5] [--out=public/data/paris-zfe]
// Le fichier source (1,7 Mo) n'est JAMAIS versionné. Voir contracts/paris-zfe.ts pour le sens des champs et ce qui n'est volontairement pas affiché.
import fs from "node:fs";
import path from "node:path";
import { geometryParts, looksWgs84, normalizePart, simplifyCoords } from "../contracts/geo-layers.ts";
import { ZFE_SOURCE, safeUrl } from "../contracts/paris-zfe.ts";
import { arg } from "./lib/io.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const inspect = args.includes("--inspect");
const outDir = arg(args, "out") ?? "public/data/paris-zfe";
const simplify = Number(arg(args, "simplify") ?? 5);
const dataDate = arg(args, "data-date") ?? null;
const PARIS_ID = "217500016-ZFE-001"; // SIREN de la Ville de Paris
if (!file) { console.error("Usage : node scripts/import-paris-zfe.mjs <aires.geojson> [--inspect] --data-date=AAAA-MM-JJ"); process.exit(2); }
if (dataDate && !/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) { console.error("--data-date attend AAAA-MM-JJ."); process.exit(2); }

const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) { console.error("GeoJSON FeatureCollection attendu."); process.exit(1); }
const bboxOf = (g) => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of geometryParts(g)) for (const [x, y] of p.coords) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b; };
const overlapsParis = (b) => b[0] < 2.47 && b[2] > 2.22 && b[1] < 48.9 && b[3] > 48.82;
console.log(`${data.features.length} entités. Entités dont le cadre touche Paris : ${data.features.map((f, i) => [i, f.properties?.id, bboxOf(f.geometry)]).filter((x) => overlapsParis(x[2])).map((x) => `#${x[0]} ${x[1]}`).join(", ") || "aucune"}`);
const hits = data.features.filter((f) => f.properties?.id === PARIS_ID);
if (hits.length !== 1) { console.error(`Entité ${PARIS_ID} attendue une seule fois (trouvée ${hits.length}) : import annulé.`); process.exit(1); }
const f = hits[0], p = f.properties;
const parts = geometryParts(f.geometry).filter((x) => x.kind === "poly");
if (parts.length !== 1) { console.error(`Un seul contour attendu (trouvé ${parts.length}).`); process.exit(1); }
if (!looksWgs84(parts[0].coords[0])) { console.error("Coordonnées non WGS84."); process.exit(1); }
const b = bboxOf(f.geometry);
if (!(b[0] > 2.2 && b[2] < 2.5 && b[1] > 48.8 && b[3] < 48.92)) { console.error(`Cadre hors de Paris : ${b}`); process.exit(1); }
const ring = normalizePart({ kind: "poly", coords: simplifyCoords(parts[0].coords, simplify) })?.coords;
if (!ring) { console.error("Contour invalide."); process.exit(1); }
console.log(`Entité ${p.id} · date_debut ${p.date_debut} · date_fin ${p.date_fin} · date_maj ${p.date_maj ?? "(absente)"} · vp_critair ${p.vp_critair} · deux_rm_critair ${p.deux_rm_critair} (NON affichés : voir contracts/paris-zfe.ts)`);
console.log(`Contour : ${parts[0].coords.length} -> ${ring.length} sommets (tolérance ${simplify} m) · cadre ${b.map((x) => x.toFixed(3))}`);
const out = { version: 1, source: ZFE_SOURCE, id: p.id, dataDate, dateDebut: /^\d{4}-\d{2}-\d{2}$/.test(p.date_debut ?? "") ? p.date_debut : null, urlArrete: safeUrl(p.url_arrete), urlSite: safeUrl(p.url_site_information), ring };
const text = JSON.stringify(out);
console.log(`Fichier : ${(Buffer.byteLength(text) / 1024).toFixed(1)} Ko · liens : arrêté ${out.urlArrete ? "oui" : "non"}, site ${out.urlSite ? "oui" : "non"}`);
if (Buffer.byteLength(text) > 150 * 1024) { console.error("Plus de 150 Ko : essayer --simplify=10."); process.exit(1); }
if (inspect) { console.log("--inspect : rien n'a été écrit."); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "zone.json"), text);
console.log(`Écrit dans ${outDir}/zone.json.`);
