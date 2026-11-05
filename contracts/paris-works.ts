// Chantiers perturbant la circulation à Paris (Ville de Paris, licence ODbL).
// Source : jeu « Paris - Chantiers perturbants la circulation » (data.gouv.fr, diffusé par la Région Île-de-France ; original data.iledefrance.fr).
// Ce que dit la donnée : des POLYGONES (saisis à la main) des périmètres où la circulation est perturbée par un chantier principal. NON EXHAUSTIF.
// Mise à jour « quotidienne » annoncée mais NON TENUE (dernière : 5 juillet 2026) : la donnée peut être PÉRIMÉE. Aucune promesse d'exhaustivité ni d'actualité :
// la date des données est toujours affichée dans le panneau « i », et un chantier dont la date de fin prévue est passée n'est ni dessiné ni cité dans une fiche.
// Colonnes lues, VÉRIFIÉES sur le fichier réel reçu le 05/11/2026 (CSV « ; », 106 lignes, 19 colonnes) : voie, cp_arrondissement, maitre_ouvrage, objet, date_debut, date_fin, impact_circulation, geo_shape.
// Valeurs réelles de impact_circulation : RESTREINTE 83, SENS_UNIQUE 8, BARRAGE_TOTAL 3, IMPASSE 2, vide 10 (voir impactPhrase). Dates au format AAAA-MM-JJ.
// Rien n'est lu comme une disponibilité : la couleur d'une place ne dépend jamais de ce fichier.
//
// Fonctions pures, testées dans api/paris-works.test.ts ; utilisées par le site et par `scripts/import-paris-works.mjs`.
import { distanceToFeatureMeters, formatDataDate, geometryParts, normalizePart, simplifyCoords, type GeoFeature, type Prop } from "./geo-layers.ts";
import { inParisBox } from "./paris-forbidden.ts";

export const WORKS_SOURCE = {
  name: "Paris - Chantiers perturbants la circulation",
  producer: "Ville de Paris",
  license: "ODbL",
  url: "https://www.data.gouv.fr/datasets/paris-chantiers-perturbants-la-circulation",
} as const;

/** Ordre des attributs d'une entité dans les tuiles. */
export const WORK_PROP = { voie: 0, objet: 1, impact: 2, debut: 3, fin: 4, maitre: 5, arrondissement: 6 } as const;

/** Mention du panneau « i » : source, licence, date de réception de l'export (le fichier ne donne pas sa date d'export), non-exhaustivité, péremption possible. Jamais en bandeau sur la carte. */
export function worksAttribution(dataDate: string | null | undefined): string {
  const d = formatDataDate(dataDate);
  return `Chantiers : Ville de Paris, « Paris - Chantiers perturbants la circulation », licence ODbL, ${d ? `export reçu le ${d}` : "date de l'export non renseignée"} (le fichier ne donne pas sa date d'export). Non exhaustif ; ces chantiers peuvent être terminés, prolongés ou manquer.`;
}

/** Distance (mètres) sous laquelle une place est dite « près d'un chantier » (à l'intérieur du périmètre : 0). */
export const WORKS_NEAR_METERS = 15;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
/** Jour AAAA-MM-JJ d'une date de la donnée (ISO ou JJ/MM/AAAA), ou null si illisible. */
export function isoDay(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  let y: string, m: string, d: string;
  const iso = ISO_DAY.exec(t), fr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  if (iso) [, y, m, d] = iso; else if (fr) [, d, m, y] = fr; else return null;
  const date = new Date(`${y}-${m}-${d}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${m}-${d}` ? null : `${y}-${m}-${d}`;
}

const clean = (raw: unknown, max = 80): string | null => {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim();
  return t && t.length <= max && !/^[[{]/.test(t) ? t : null;
};

/** Adresse saisie à la main : retire le bruit de fin réel du fichier (« 75010_ », « - 75014 - », point final), sans toucher au reste. « 75010_ » devient rien, « rue X 75018 » devient « rue X ». */
export function cleanVoie(raw: unknown): string | null {
  const t = clean(raw);
  if (!t) return null;
  const v = t.replace(/[\s\-_.]*(?:\b75\d{3})?[\s\-_.]*$/, "").trim();
  return v || null;
}

/** Texte publié rendu lisible : « CREATION_RESEAUX » devient « creation reseaux » (minuscules, tirets bas retirés). Aucune traduction ni accent n'est deviné. */
export function readable(code: string | null): string | null {
  if (!code) return null;
  return code.replace(/_/g, " ").toLowerCase();
}

/** Libellés lisibles des valeurs RÉELLES de impact_circulation (fichier du 05/11/2026), formulation décidée par Anas. */
export const IMPACT_LABELS: Readonly<Record<string, string>> = {
  RESTREINTE: "Voie partiellement fermée",
  SENS_UNIQUE: "Sens unique",
  BARRAGE_TOTAL: "Rue fermée",
  IMPASSE: "Impasse",
};

/** Phrase d'impact d'après la colonne impact_circulation ; valeur absente : phrase générale ; valeur jamais vue : texte publié (« impact : … »), jamais une promesse sur la voie. */
export function impactPhrase(impact: string | null): string {
  if (!impact) return "chantier perturbant la circulation";
  const k = impact.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]+/g, "_");
  return IMPACT_LABELS[k] ?? `impact : ${readable(impact)}`;
}

export type WorksImportStats = { rows: number; noShape: number; outside: number; badPart: number; kept: number; parts: number; expiredAtImport: number };

/** Entités d'un enregistrement : un contour par partie de la géométrie ; attributs dans l'ordre de WORK_PROP. */
export function worksFeatures(rec: { shape: unknown; voie?: unknown; objet?: unknown; impact?: unknown; debut?: unknown; fin?: unknown; maitre?: unknown; arrondissement?: unknown }, simplifyMeters: number, stats?: WorksImportStats): GeoFeature[] {
  const parts = geometryParts(rec.shape).filter((p) => p.kind === "poly");
  if (!parts.length) { if (stats) stats.noShape++; return []; }
  const props: Prop[] = [cleanVoie(rec.voie), clean(rec.objet), clean(rec.impact, 40), isoDay(rec.debut), isoDay(rec.fin), clean(rec.maitre), clean(rec.arrondissement, 10)];
  const out: GeoFeature[] = [];
  for (const part of parts) {
    if (stats) stats.parts++;
    if (part.coords.some((p) => !inParisBox(p))) { if (stats) stats.outside++; continue; }
    const norm = normalizePart({ kind: "poly", coords: simplifyCoords(part.coords, simplifyMeters) });
    if (!norm) { if (stats) stats.badPart++; continue; }
    out.push({ kind: "poly", coords: norm.coords, props });
    if (stats) stats.kept++;
  }
  return out;
}

/** Jour (AAAA-MM-JJ) à Paris d'un instant. */
export const parisDay = (now: Date): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now);

/**
 * Un chantier est affiché si ses dates PRÉVUES ne l'excluent pas : début déjà passé (ou absent) ET fin non dépassée (ou absente).
 * Sans dates, il reste affiché (la donnée ne dit pas qu'il est fini) ; la mention de péremption possible est dans le panneau « i ».
 */
export function isWorkActive(props: ReadonlyArray<Prop>, now: Date = new Date()): boolean {
  const today = parisDay(now);
  const debut = typeof props[WORK_PROP.debut] === "string" ? (props[WORK_PROP.debut] as string) : null;
  const fin = typeof props[WORK_PROP.fin] === "string" ? (props[WORK_PROP.fin] as string) : null;
  if (debut && debut > today) return false;
  if (fin && fin < today) return false;
  return true;
}

/** Ligne de fiche : « Chantier : circulation restreinte · rue X · jusqu'au 19 février 2027 (date prévue) ». Seulement les champs présents. */
export function workCardLine(props: ReadonlyArray<Prop>): string {
  const parts = [impactPhrase(typeof props[WORK_PROP.impact] === "string" ? (props[WORK_PROP.impact] as string) : null)];
  const voie = props[WORK_PROP.voie];
  if (typeof voie === "string") parts.push(voie);
  const fin = formatDataDate(typeof props[WORK_PROP.fin] === "string" ? (props[WORK_PROP.fin] as string) : null);
  if (fin) parts.push(`jusqu'au ${fin} (date prévue)`);
  return `Chantier : ${parts.join(" · ")}`;
}

/** Distance (mètres) sous laquelle un chantier est signalé en alerte sur une fiche (chip « Chantier à 80 m »). */
export const WORKS_ALERT_METERS = 100;

/** Chip de la fiche : « Chantier à 80 m · Voie partiellement fermée · jusqu'au 19 février 2027 (date prévue) » ; à l'intérieur du périmètre : « Chantier ici · … ». */
export function workAlertText(props: ReadonlyArray<Prop>, meters: number): string {
  const detail = workCardLine(props).replace(/^Chantier : /, "");
  const where = meters <= 1 ? "Chantier ici" : `Chantier à ${Math.max(5, Math.round(meters / 5) * 5)} m`;
  return `${where} · ${detail}`;
}

/** Chantier actif le plus proche d'une place (à l'intérieur du périmètre ou à moins de `maxMeters`), ou null : la fiche ne dit rien. */
export function worksNear(list: ReadonlyArray<Pick<GeoFeature, "kind" | "coords" | "props">>, lat: number, lng: number, now: Date = new Date(), maxMeters: number = WORKS_NEAR_METERS): { meters: number; props: ReadonlyArray<Prop> } | null {
  let best: { meters: number; props: ReadonlyArray<Prop> } | null = null;
  for (const f of list) {
    if (!isWorkActive(f.props, now)) continue;
    const meters = distanceToFeatureMeters(f, lat, lng);
    if (meters <= maxMeters && (!best || meters < best.meters)) best = { meters, props: f.props };
  }
  return best;
}
