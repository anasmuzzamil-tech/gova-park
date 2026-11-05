// Stationnement INTERDIT sur la voie publique de Paris (Ville de Paris, licence ODbL).
// Source : jeu « Stationnement sur voie publique - Stationnement interdit » (data.gouv.fr / Paris Data), lié aux jeux « emplacements » et « emprises ».
// Ce que dit la donnée : « les emplacements de stationnement interdit » (description du jeu). La Ville ne garantit pas l'exhaustivité (les données changent vite).
// Ce que GOVAPARK en fait : un trait rouge FIN au zoom rue (jamais de plein écran rouge) et UNE ligne dans la fiche d'une place proche,
// seulement si un tracé du jeu passe à moins de FORBIDDEN_NEAR_METERS de cette place. Aucun horaire ni motif n'est lu ou inventé :
// le motif affiché est, au mieux, le texte de la colonne choisie à l'import (--label), tel que publié.
// Ne dit rien de la disponibilité : la couleur d'une place ne dépend jamais de ce fichier.
//
// Fonctions pures, testées dans api/paris-forbidden.test.ts ; utilisées par le site et par `scripts/import-paris-forbidden.mjs`.
import { distanceToFeatureMeters, geometryParts, normalizePart, simplifyCoords, type GeoFeature, type LngLat, type Prop } from "./geo-layers.ts";

export const FORBIDDEN_SOURCE = {
  name: "Stationnement sur voie publique - Stationnement interdit",
  producer: "Ville de Paris",
  license: "ODbL",
  url: "https://www.data.gouv.fr/datasets/stationnement-sur-voie-publique-stationnement-interdit",
} as const;

/** Mention du panneau « i » (jamais en bandeau sur la carte). */
export const FORBIDDEN_ATTRIBUTION = "Stationnement interdit : Ville de Paris, « Stationnement sur voie publique - Stationnement interdit », licence ODbL, données non exhaustives. Se fier à la signalisation sur place.";

/** Une place est « concernée » si un tracé du jeu passe à moins de cette distance (mètres). */
export const FORBIDDEN_NEAR_METERS = 10;

/** Cadre de Paris : un tracé qui en sort est rejeté, jamais déplacé. */
export const PARIS_BOX = { south: 48.7, north: 49.0, west: 2.1, east: 2.6 } as const;
export const inParisBox = ([lng, lat]: LngLat): boolean => lat >= PARIS_BOX.south && lat <= PARIS_BOX.north && lng >= PARIS_BOX.west && lng <= PARIS_BOX.east;

/** Motif affichable : texte de la colonne choisie, nettoyé, 60 caractères au plus ; une valeur vide ou qui ressemble à du JSON n'est pas affichée. */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || t.length > 60 || /^[[{]/.test(t)) return null;
  return t;
}

export type ForbiddenImportStats = { parts: number; kept: number; noShape: number; outside: number; badPart: number };

/**
 * Entités d'un enregistrement du jeu : une par partie de la géométrie `shape` (objet GeoJSON ou Feature).
 * Rejets comptés : sans géométrie lisible, hors de Paris, partie invalide. `simplifyMeters` retire les sommets superflus (poids).
 */
export function forbiddenFeatures(shape: unknown, label: unknown, simplifyMeters: number, stats?: ForbiddenImportStats): GeoFeature[] {
  const parts = geometryParts(shape);
  if (!parts.length) { if (stats) stats.noShape++; return []; }
  const out: GeoFeature[] = [];
  const props: Prop[] = [cleanLabel(label)];
  for (const part of parts) {
    if (stats) stats.parts++;
    if (part.coords.some((p) => !inParisBox(p))) { if (stats) stats.outside++; continue; }
    const simple = part.kind === "pt" ? part : { kind: part.kind, coords: simplifyCoords(part.coords, simplifyMeters) };
    const norm = normalizePart(simple);
    if (!norm) { if (stats) stats.badPart++; continue; }
    out.push({ kind: norm.kind, coords: norm.coords, props });
    if (stats) stats.kept++;
  }
  return out;
}

export type ForbiddenHit = { meters: number; label: string | null };

/** Tracé du jeu le plus proche d'une place, s'il passe à moins de `maxMeters`. Aucun tracé proche : null (la fiche ne dit RIEN, jamais « autorisé »). */
export function forbiddenNear(list: ReadonlyArray<Pick<GeoFeature, "kind" | "coords" | "props">>, lat: number, lng: number, maxMeters: number = FORBIDDEN_NEAR_METERS): ForbiddenHit | null {
  let best: ForbiddenHit | null = null;
  for (const f of list) {
    const meters = distanceToFeatureMeters(f, lat, lng);
    if (meters <= maxMeters && (!best || meters < best.meters)) best = { meters, label: typeof f.props[0] === "string" ? (f.props[0] as string) : null };
  }
  return best;
}

/** Ligne de la fiche d'une place proche. */
export function forbiddenCardLine(hit: ForbiddenHit): string {
  return hit.label ? `Stationnement interdit à cet endroit (${hit.label})` : "Stationnement interdit à cet endroit";
}
