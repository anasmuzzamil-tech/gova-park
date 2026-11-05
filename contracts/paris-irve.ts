// Bornes de recharge de véhicules électriques (IRVE) : points, SANS disponibilité temps réel et SANS signalement (type « Électrique » du sélecteur : affichage seulement).
// Source : fichier national consolidé « Base nationale des IRVE » (data.gouv.fr, schéma etalab/schema-irve-statique, Licence Ouverte), produit à partir des déclarations des aménageurs
// et opérateurs : les données sont DÉCLARÉES, non garanties, sans état « libre / occupée ».
// Fichier autonome (un seul import voisin) : utilisé par le site, par les tests et par scripts/import-paris-irve.mjs. Fonctions pures, testées dans api/paris-irve.test.ts.
import type { GeoFeature, Prop } from "./geo-layers.ts";

export const IRVE_SOURCE = {
  name: "Base nationale des IRVE (Infrastructures de Recharge pour Véhicules Électriques)",
  producer: "data.gouv.fr (consolidation des données des opérateurs)",
  license: "Licence Ouverte",
  url: "https://www.data.gouv.fr/datasets/base-nationale-des-irve-infrastructures-de-recharge-pour-vehicules-electriques",
} as const;
/** Fichier à télécharger (CSV, schéma etalab/schema-irve-statique, environ 88 Mo d'après la page du jeu) : l'importeur le lit en flux et ne garde que l'Île-de-France. */
export const IRVE_FILE_URL = "https://www.data.gouv.fr/api/1/datasets/r/eb76d20a-8501-400e-b336-d85724de5435";

export const irveAttribution = (dataDate: string | null) =>
  `Bornes de recharge : Base nationale des IRVE (data.gouv.fr), Licence Ouverte, données déclarées par les opérateurs${dataDate ? `, fichier du ${dataDate}` : ""}. Aucune disponibilité en temps réel.`;

/** Cadre de l'Île-de-France (un peu large) : tout point hors de ce cadre est ignoré. */
export const IRVE_BOX = { south: 48.1, north: 49.25, west: 1.4, east: 3.6 } as const;

/** Ordre des attributs d'une entité : [opérateur, nom de la station, adresse, points de charge, puissance max (kW), prises (bits), gratuit (1 / 0 / null)]. */
export const IRVE_PROP = { operator: 0, name: 1, address: 2, pdc: 3, kw: 4, plugs: 5, free: 6 } as const;
export const IRVE_PLUG = { ef: 1, t2: 2, ccs: 4, chademo: 8, other: 16 } as const;
const PLUG_LABEL: Array<[number, string]> = [[IRVE_PLUG.ef, "Prise domestique"], [IRVE_PLUG.t2, "Type 2"], [IRVE_PLUG.ccs, "Combo CCS"], [IRVE_PLUG.chademo, "CHAdeMO"], [IRVE_PLUG.other, "Autre prise"]];

/** Une puissance nominale au-delà de cette valeur (kW) est considérée comme erronée (confusion watts / kilowatts probable) : ignorée, jamais « corrigée ». */
export const IRVE_MAX_KW = 1000;

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const parseBool = (v: unknown): boolean | null => { const t = norm(v); return t === "true" || t === "1" || t === "vrai" || t === "oui" ? true : t === "false" || t === "0" || t === "faux" || t === "non" ? false : null; };
const parseNum = (v: unknown): number | null => { const n = Number(String(v ?? "").replace(",", ".")); return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null; };

/** Position d'une ligne : consolidated_longitude/latitude si présentes, sinon coordonneesXY (« [lng, lat] » ou « lng, lat »). null si absente ou hors du cadre. */
export function irvePosition(row: Record<string, string>): [number, number] | null {
  let lng = parseNum(row.consolidated_longitude), lat = parseNum(row.consolidated_latitude);
  if (lng == null || lat == null) {
    const m = String(row.coordonneesXY ?? "").replace(/[[\]()"]/g, "").split(/[,;\s]+/).filter(Boolean).map(Number);
    if (m.length !== 2 || !m.every(Number.isFinite)) return null;
    [lng, lat] = m;
  }
  if (lat < IRVE_BOX.south || lat > IRVE_BOX.north || lng < IRVE_BOX.west || lng > IRVE_BOX.east) return null;
  return [lng, lat];
}

/** Station = tous les points de charge d'une même `id_station_itinerance` (à défaut `id_station_local`, à défaut la position). Agrège sans rien inventer. */
export type IrveAgg = { key: string; pos: [number, number]; operator: string; name: string; address: string; pdcIds: Set<string>; declaredPdc: number; kw: number | null; plugs: number; freeYes: number; freeNo: number };
export function irveAdd(map: Map<string, IrveAgg>, row: Record<string, string>): "added" | "noPosition" {
  const pos = irvePosition(row);
  if (!pos) return "noPosition";
  const key = (row.id_station_itinerance || "").trim() || (row.id_station_local || "").trim() || `${pos[0].toFixed(5)},${pos[1].toFixed(5)}`;
  let a = map.get(key);
  if (!a) { a = { key, pos, operator: "", name: "", address: "", pdcIds: new Set(), declaredPdc: 0, kw: null, plugs: 0, freeYes: 0, freeNo: 0 }; map.set(key, a); }
  a.operator ||= (row.nom_operateur || row.nom_enseigne || row.nom_amenageur || "").trim();
  a.name ||= (row.nom_station || row.nom_enseigne || "").trim();
  a.address ||= (row.adresse_station || "").trim();
  a.pdcIds.add((row.id_pdc_itinerance || row.id_pdc_local || `#${a.pdcIds.size}`).trim());
  const declared = parseNum(row.nbre_pdc); if (declared != null && declared > a.declaredPdc) a.declaredPdc = Math.round(declared);
  const kw = parseNum(row.puissance_nominale); if (kw != null && kw > 0 && kw <= IRVE_MAX_KW && (a.kw == null || kw > a.kw)) a.kw = kw;
  if (parseBool(row.prise_type_ef)) a.plugs |= IRVE_PLUG.ef;
  if (parseBool(row.prise_type_2)) a.plugs |= IRVE_PLUG.t2;
  if (parseBool(row.prise_type_combo_ccs)) a.plugs |= IRVE_PLUG.ccs;
  if (parseBool(row.prise_type_chademo)) a.plugs |= IRVE_PLUG.chademo;
  if (parseBool(row.prise_type_autre)) a.plugs |= IRVE_PLUG.other;
  const g = parseBool(row.gratuit); if (g === true) a.freeYes++; else if (g === false) a.freeNo++;
  return "added";
}
export function irveFeature(a: IrveAgg): GeoFeature {
  const pdc = Math.max(a.declaredPdc, a.pdcIds.size);
  const free: Prop = a.freeYes > 0 && a.freeNo === 0 ? 1 : a.freeNo > 0 && a.freeYes === 0 ? 0 : null;
  return { kind: "pt", coords: [[Math.round(a.pos[0] * 1e6) / 1e6, Math.round(a.pos[1] * 1e6) / 1e6]], props: [a.operator || null, a.name || null, a.address || null, pdc || null, a.kw, a.plugs || null, free] };
}

const kwText = (kw: number) => `${String(Math.round(kw * 10) / 10).replace(".", ",")} kW`;
/** Contenu de la fiche d'une borne : uniquement ce que la source déclare ; une valeur absente n'est pas affichée (jamais « inconnu »). */
export function irveSheet(props: Prop[]): { title: string; chips: string[]; note: string | null } {
  const op = props[IRVE_PROP.operator], name = props[IRVE_PROP.name], addr = props[IRVE_PROP.address];
  const pdc = Number(props[IRVE_PROP.pdc]), kw = props[IRVE_PROP.kw], plugs = Number(props[IRVE_PROP.plugs] ?? 0), free = props[IRVE_PROP.free];
  const chips: string[] = [];
  if (Number.isFinite(pdc) && pdc > 0) chips.push(`${pdc} point${pdc > 1 ? "s" : ""} de charge`);
  if (typeof kw === "number") chips.push(kw >= 1 ? `jusqu'à ${kwText(kw)}` : kwText(kw));
  for (const [bit, label] of PLUG_LABEL) if (plugs & bit) chips.push(label);
  if (free === 1) chips.push("Gratuit (déclaré)");
  const note = [typeof op === "string" ? op : null, typeof name === "string" && name !== op ? name : null, typeof addr === "string" ? addr : null].filter(Boolean).join(" · ") || null;
  return { title: "Borne de recharge", chips, note };
}
