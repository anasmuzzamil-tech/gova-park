// Statuts de réservation pour lesquels un litige peut être ouvert (alignés sur le bouton « Signaler un problème » du front :
// réservation confirmée, en cours ou terminée). Une réservation annulée, expirée, remboursée, en cours de remboursement,
// pas encore confirmée ou déjà en litige ne peut pas repasser en « dispute ».
export const DISPUTABLE_STATUSES = ["confirmed", "in_progress", "completed"] as const;

const REFUSALS: Record<string, string> = {
  dispute: "Un litige est déjà ouvert pour cette réservation.",
  pending: "Cette réservation n'est pas encore confirmée : annulez-la plutôt qu'ouvrir un litige.",
  payment_pending: "Cette réservation n'est pas encore confirmée : annulez-la plutôt qu'ouvrir un litige.",
  cancelled: "Cette réservation est annulée : aucun litige ne peut être ouvert.",
  expired: "Cette réservation a expiré : aucun litige ne peut être ouvert.",
  refund_pending: "Un remboursement est déjà en cours d'examen pour cette réservation : aucun litige ne peut être ouvert.",
  refunded: "Cette réservation est déjà remboursée : aucun litige ne peut être ouvert.",
};

export function checkDisputeAllowed(status: string): { ok: true } | { ok: false; message: string } {
  if ((DISPUTABLE_STATUSES as readonly string[]).includes(status)) return { ok: true };
  return { ok: false, message: REFUSALS[status] ?? "Cette réservation ne peut pas faire l'objet d'un litige dans son état actuel." };
}
