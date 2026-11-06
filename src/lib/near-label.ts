// Libellé de la poignée de la feuille basse : « 35 places près de [adresse cherchée] », « … près de vous » (position connue, sans adresse), « … près du centre ».
export function nearLabel(count: number, where: { hasPosition: boolean; address?: string | null }): string {
  const places = `${count} ${count > 1 ? "places" : "place"}`;
  const address = where.address?.trim();
  if (address) return `${places} près de ${address}`;
  return where.hasPosition ? `${places} près de vous` : `${places} près du centre`;
}

/** Rayon du compteur de la poignée (feuille basse repliée). */
export const NEAR_COUNT_RADIUS_M = 1000;
/** Libellé exact du compteur : places (prises exclues) à moins de 1 km de la position, sinon du centre de la carte. Jamais « libres ». */
export function nearCountLabel(count: number, hasPosition: boolean): string {
  return `${count} ${count > 1 ? "places" : "place"} à moins de 1 km ${hasPosition ? "de vous" : "du centre de la carte"}`;
}
