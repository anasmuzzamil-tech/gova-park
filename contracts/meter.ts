// Compteur de stationnement : tarif calcule au prorata de la duree reelle (a la minute pres),
// a partir du tarif horaire saisi par le conducteur. Estimation indicative, jamais un paiement.
export function meterCostCents(hourlyCents: number | null | undefined, startedAt: Date, endedAt: Date) {
  if (!hourlyCents || hourlyCents <= 0) return null;
  const minutes = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000));
  return Math.round((hourlyCents * minutes) / 60);
}
