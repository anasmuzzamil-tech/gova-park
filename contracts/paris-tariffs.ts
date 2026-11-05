// Zones tarifaires du stationnement payant sur voie publique de Paris : TARIF VISITEUR (pas le tarif résident), Ville de Paris, licence ODbL.
// Source : « Stationnement sur voie publique - zones tarifaires » (data.gouv.fr ; original opendata.paris.fr), Shapefile WGS84 : 2 enregistrements, zone 1 et zone 2.
//
// SENS DES COLONNES h1..h6 (établi, ne pas deviner) : h_n = prix de la n-IÈME HEURE (tarif horaire du palier n) ; le prix à payer pour N heures est la SOMME de h1..hN.
//   Preuves officielles : (1) délibération 2024 DVD 43-1 de la Ville de Paris (cdn.paris.fr/paris/2024/05/06/dvd-43-pj-NAS9.PDF), tarif SUV : « tarif horaire » par heure 18, 18, 36, 45, 54, 54 en zone I et
//   « cumul » 18, 36, 72, 117, 171, 225 (maximum 6 h) = exactement les colonnes vis_suv_h1..h6 du fichier ; (2) paris.fr, « Payer son stationnement » (2 roues motorisés, visiteur) : 3, 6, 12, 19,50, 28,50, 37,50 € (zone 1)
//   et 2, 4, 8, 13, 19, 25 € (zone 2) pour 1 à 6 h = sommes cumulées des colonnes vis_2rm (3,3,6,7.5,9,9 et 2,2,4,5,6,6) ; (3) paris.fr, « Paris réforme son stationnement » : 6 € (zone 1) et 4 € (zone 2) par heure pour les
//   deux premières heures des véhicules légers = vis_vl_h1 et h2 ; stationnement visiteur limité à 6 h consécutives. Les colonnes vl valent exactement le tiers des colonnes suv et le double des colonnes 2rm pour les 6 heures.
//   NON LU À LA LETTRE sur une source officielle : les heures 3 à 6 de la grille « véhicule léger » (le texte officiel les met dans une image) ; elles ne sont confirmées que par cette proportionnalité et par une source non officielle (Yespark : 6, 12, 24, 39, 57, 75 €).
//   Les colonnes vis_vl_h*_l et vis_vl_h*_s (et les deux jeux vis_2rm) ont ici les mêmes valeurs : leur différence éventuelle n'est pas documentée ; l'importeur refuse un fichier où elles diffèrent.
// Zone 1 = Centre et 5e à 11e ; zone 2 = 12e à 20e (hors bois) : paris.fr. Les bois de Boulogne et de Vincennes ont leurs propres tarifs et ne sont dans aucun des 2 polygones : aucun prix n'y est affiché.
// Tarif en vigueur du lundi au samedi de 9 h à 20 h, hors jours fériés, fractionnable par 15 minutes. Ce fichier ne dit rien de la disponibilité et ne colore jamais une place.
import { formatDataDate } from "./geo-layers.ts";

export const TARIFF_SOURCE = {
  name: "Stationnement sur voie publique - zones tarifaires",
  producer: "Ville de Paris",
  license: "ODbL",
  url: "https://www.data.gouv.fr/datasets/stationnement-sur-voie-publique-zones-tarifaires",
} as const;

export type LngLat = [number, number];
export type TariffZone = 1 | 2;
/** Prix de chacune des 6 heures (h1..h6), en euros, pour une catégorie de véhicule. */
export type HourlyPrices = [number, number, number, number, number, number];
export type TariffFile = {
  version: 1;
  source: typeof TARIFF_SOURCE;
  /** Date de RÉCEPTION du fichier (le fichier ne donne pas sa date de mise à jour ; le catalogue data.gouv.fr affiche le 24/10/2022). */
  dataDate: string | null;
  /** Anneaux de chaque zone : le premier est le contour extérieur, les suivants sont des trous (la zone 2 a pour trou la zone 1). */
  zones: Array<{ zone: TariffZone; rings: LngLat[][] }>;
  /** vl = voiture (véhicule léger), rm2 = deux-roues motorisés. Pas de SUV, ni autre catégorie. */
  hourly: Record<TariffZone, { vl: HourlyPrices; rm2: HourlyPrices }>;
  maxHours: 6;
};

export const TARIFF_KIND_FOR_SPOT: Record<number, "vl" | "rm2"> = { 1: "vl", 5: "rm2" };

/** Point dans un anneau (règle pair-impair). */
function inRing(lng: number, lat: number, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point dans un polygone à trous : pair-impair sur tous les anneaux (dans le contour extérieur ET hors des trous). */
export function pointInPolygon(lng: number, lat: number, rings: LngLat[][]): boolean {
  let inside = false;
  for (const ring of rings) if (inRing(lng, lat, ring)) inside = !inside;
  return inside;
}

/** Zone tarifaire d'un point, ou null (hors des 2 polygones : bois, hors de Paris). */
export function tariffZoneAt(file: Pick<TariffFile, "zones">, lat: number, lng: number): TariffZone | null {
  for (const z of file.zones) if (pointInPolygon(lng, lat, z.rings)) return z.zone;
  return null;
}

/** Prix cumulé pour 1 à 6 heures : somme des prix des heures (arrondi au centime). */
export function cumulativePrices(hourly: HourlyPrices): HourlyPrices {
  let total = 0;
  return hourly.map((p) => (total = Math.round((total + p) * 100) / 100)) as HourlyPrices;
}

/** « 6 € », « 19,50 € » (virgule française, 2 décimales seulement si nécessaire). */
export function formatEuros(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(".", ",")} €`;
}

/** Ligne de fiche : « Zone 1 · tarif visiteur : 6 € pour 1 h · 12 € pour 2 h · 24 € pour 3 h · 75 € pour 6 h ». */
export function tariffCardLine(zone: TariffZone, hourly: HourlyPrices): string {
  const c = cumulativePrices(hourly);
  return `Zone ${zone} · tarif visiteur : ${[0, 1, 2, 5].map((i) => `${formatEuros(c[i])} pour ${i + 1} h`).join(" · ")}`;
}

/** Ligne de tarif d'une place d'après son type d'emplacement (1 payant = voiture, 5 deux-roues motorisés payant = moto) ; null : aucun prix (gratuit, livraison, vélo, PMR, hors zones, bois). */
export function tariffLineFor(file: TariffFile | null, spotType: number, lat: number, lng: number): string | null {
  const kind = TARIFF_KIND_FOR_SPOT[spotType];
  if (!file || !kind) return null;
  const zone = tariffZoneAt(file, lat, lng);
  const hourly = zone ? file.hourly[zone]?.[kind] : null;
  return zone && hourly && hourly.length === 6 && hourly.every((p) => Number.isFinite(p) && p >= 0) ? tariffCardLine(zone, hourly) : null;
}

/** Mention du panneau « i » : source, licence, date, ce que le tarif est (visiteur), horaires, limite des 6 h, SUV et bois exclus, avertissement de péremption. Jamais en bandeau sur la carte. */
export function tariffAttribution(dataDate: string | null | undefined): string {
  const d = formatDataDate(dataDate);
  return `Tarifs de stationnement : Ville de Paris, « Stationnement sur voie publique - zones tarifaires », licence ODbL, ${d ? `fichier reçu le ${d}` : "date du fichier non renseignée"} (le catalogue data.gouv.fr affiche une dernière mise à jour du 24 octobre 2022). Tarif VISITEUR (pas résident) des véhicules légers et des deux-roues motorisés, du lundi au samedi de 9 h à 20 h hors jours fériés, 6 h consécutives au maximum ; tarif SUV et tarifs des bois non affichés. Tarifs à vérifier sur paris.fr avant de payer.`;
}
