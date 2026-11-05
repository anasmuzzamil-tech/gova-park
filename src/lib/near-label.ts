// Libellé de la poignée de la feuille basse : « 35 places près de [adresse cherchée] », « … près de vous » (position connue, sans adresse), « … près du centre ».
export function nearLabel(count: number, where: { hasPosition: boolean; address?: string | null }): string {
  const places = `${count} ${count > 1 ? "places" : "place"}`;
  const address = where.address?.trim();
  if (address) return `${places} près de ${address}`;
  return where.hasPosition ? `${places} près de vous` : `${places} près du centre`;
}
