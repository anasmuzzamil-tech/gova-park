#!/usr/bin/env node
// Contrôle MANUEL de la source Saemes (à lancer depuis un poste qui joint Internet : le bac à sable de développement ne le peut pas).
//   node scripts/check-saemes.mjs
// Affiche le statut HTTP, la date de la mesure la plus récente et les NOMS DE CHAMPS réels : à comparer avec SAEMES_FIELDS (api/providers/saemes.ts).
// N'écrit rien. Si la mesure la plus récente date de plusieurs jours (ou de 2017), la source est morte : ne PAS brancher.
import { SAEMES_ENDPOINT } from "../api/providers/saemes.ts";
const response = await fetch(SAEMES_ENDPOINT, { headers: { Accept: "application/json" } });
console.log("HTTP", response.status, SAEMES_ENDPOINT);
const json = await response.json().catch(() => null);
const rows = Array.isArray(json?.results) ? json.results : Array.isArray(json?.records) ? json.records.map((r) => r.fields ?? {}) : [];
console.log("lignes :", rows.length);
if (rows[0]) { console.log("champs :", Object.keys(rows[0]).join(", ")); console.log("exemple :", JSON.stringify(rows[0]).slice(0, 600)); }
const dates = rows.flatMap((r) => Object.values(r)).filter((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)).sort();
console.log("date la plus récente trouvée :", dates.at(-1) ?? "aucune", "· maintenant :", new Date().toISOString());
