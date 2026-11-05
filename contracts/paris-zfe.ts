// Zone à faibles émissions (ZFE) de Paris : PÉRIMÈTRE seulement (trait pointillé fin, jamais de remplissage), Ville de Paris via la base nationale consolidée des ZFE.
// Source : « Base nationale consolidée des zones à faibles émissions » (transport.data.gouv.fr / data.gouv.fr, schéma etalab/schema-zfe), licence ODbL ; entité 217500016-ZFE-001, publiée par la Ville de Paris.
//
// SENS DES CHAMPS (schéma etalab/schema-zfe, lu sur GitHub et sur doc.transport.data.gouv.fr) : vp_critair, deux_rm_critair… = « vignette Crit'Air à partir de laquelle la circulation n'est PAS autorisée »
//   (V4 = Crit'Air 4, Crit'Air 5 et sans vignette interdits ; ordre EL, V1…V5, NC), PAS une vignette minimale autorisée ; *_horaires au format opening_hours d'OpenStreetMap ; date_debut = entrée en vigueur de la réglementation ;
//   date_fin = fin de la réglementation ; date_maj n'est pas définie par le schéma et n'existe pas dans l'entité de Paris.
// POURQUOI AUCUNE VIGNETTE NI HORAIRE N'EST AFFICHÉE : l'entité de Paris indique V4 / date_debut 2021-06-01, alors que paris.fr (page mise à jour le 30/12/2025) indique que la restriction des Crit'Air 3 est entrée en vigueur
//   le 1er janvier 2025 (donc V3), que la ZFE de la Métropole du Grand Paris couvre l'intérieur de l'A86 (le fichier ne contient que la limite de Paris), et qu'une période pédagogique sans sanction court jusqu'au 31 décembre 2026.
//   Les valeurs du fichier sont donc périmées ou incomplètes : on n'affiche que le périmètre et « voir l'arrêté » (liens du fichier). Aucune règle de circulation n'est ajoutée.
import { formatDataDate } from "./geo-layers.ts";

export const ZFE_SOURCE = {
  name: "Base nationale consolidée des zones à faibles émissions (BNZFE)",
  producer: "Point d'accès national transport.data.gouv.fr (entité publiée par la Ville de Paris)",
  license: "ODbL",
  url: "https://www.data.gouv.fr/datasets/base-nationale-consolidee-des-zones-a-faibles-emissions",
} as const;

export type ZfeFile = {
  version: 1; source: typeof ZFE_SOURCE; id: string;
  /** Date de RÉCEPTION du fichier (il ne donne pas de date de mise à jour de l'entité). */
  dataDate: string | null;
  /** date_debut de l'entité (entrée en vigueur de l'arrêté d'origine), non interprétée comme règle actuelle. */
  dateDebut: string | null;
  urlArrete: string | null; urlSite: string | null;
  /** Contour extérieur [lng, lat]. */
  ring: Array<[number, number]>;
};

/** Liens à n'accepter que s'ils sont en https (jamais un lien venu d'un fichier sans contrôle). */
export const safeUrl = (u: unknown): string | null => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);

/** Mention du panneau « i » : périmètre seulement, source, licence, dates, et pourquoi aucune vignette n'est citée. Jamais en bandeau sur la carte. */
export function zfeAttribution(dataDate: string | null | undefined): string {
  const d = formatDataDate(dataDate);
  return `Zone à faibles émissions : limite de Paris (base nationale consolidée des ZFE, licence ODbL, ${d ? `fichier reçu le ${d}` : "date du fichier non renseignée"}, catalogue data.gouv.fr mis à jour le 26 mars 2026). Périmètre seulement : la ZFE de la Métropole du Grand Paris couvre l'intérieur de l'A86 et les vignettes concernées comme les horaires ne sont pas affichés, voir l'arrêté.`;
}

/** GeoJSON de la limite (ligne fermée), ou une collection vide. */
export function zfeLine(file: Pick<ZfeFile, "ring"> | null): GeoJSON.FeatureCollection {
  if (!file || file.ring.length < 4) return { type: "FeatureCollection", features: [] };
  const ring = file.ring;
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]];
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: closed } }] };
}
