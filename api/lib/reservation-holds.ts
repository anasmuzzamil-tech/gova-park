// Réservations « en attente » : plafond par utilisateur et durée de blocage d'un créneau.
// Logique pure (testée) ; les requêtes SQL de govapark-router.ts utilisent les mêmes constantes.
// Le paiement reste désactivé : une réservation en attente ne devient jamais « confirmée » ici.

/** Durée pendant laquelle une réservation « en attente de paiement » bloque son créneau. */
export const PAYMENT_HOLD_MINUTES = 15;
/** Nombre maximal de réservations en attente (demandes + attente de paiement, non expirées) par utilisateur. */
export const MAX_PENDING_PER_USER = 3;

export const paymentHoldExpiry = (now: Date) => new Date(now.getTime() + PAYMENT_HOLD_MINUTES * 60_000);

type Holdable = { status: string; expiresAt: Date | null };

/** Une réservation bloque-t-elle encore son créneau ? (la valeur de `expiresAt` fait foi, même si le statut n'a pas encore été passé à « expired ») */
export function blocksSlot(r: Holdable, now: Date): boolean {
  if (r.status === "confirmed" || r.status === "in_progress") return true;
  return r.status === "payment_pending" && r.expiresAt != null && r.expiresAt > now;
}

/** Réservations en attente comptées dans le plafond : demandes à valider ou attente de paiement, non expirées. */
export function countPending(rows: Holdable[], now: Date): number {
  return rows.filter((r) => (r.status === "pending" || r.status === "payment_pending") && (r.expiresAt == null || r.expiresAt > now)).length;
}

export function pendingLimitMessage(): string {
  return `Vous avez déjà ${MAX_PENDING_PER_USER} réservations en attente. Terminez-les ou annulez-en une avant d'en créer une nouvelle (une attente de paiement expire au bout de ${PAYMENT_HOLD_MINUTES} min).`;
}

export function assertCanCreatePending(currentPending: number): { ok: true } | { ok: false; message: string } {
  return currentPending >= MAX_PENDING_PER_USER ? { ok: false, message: pendingLimitMessage() } : { ok: true };
}

/** Une réservation en attente de paiement dont l'heure limite est passée doit passer au statut « expired » (jamais supprimée). */
export function isPaymentHoldExpired(r: Holdable, now: Date): boolean {
  return r.status === "payment_pending" && r.expiresAt != null && r.expiresAt <= now;
}
