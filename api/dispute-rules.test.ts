import { describe, expect, it } from "vitest";
import { checkDisputeAllowed, DISPUTABLE_STATUSES } from "./lib/dispute-rules";

describe("litige : statuts autorisés", () => {
  it("autorise confirmée, en cours et terminée", () => {
    for (const s of ["confirmed", "in_progress", "completed"]) expect(checkDisputeAllowed(s).ok).toBe(true);
    expect(DISPUTABLE_STATUSES).toHaveLength(3);
  });
  it("refuse tous les autres statuts avec un message clair et distinct", () => {
    const others = ["pending", "payment_pending", "cancelled", "expired", "refund_pending", "refunded", "dispute"];
    const messages = new Set<string>();
    for (const s of others) {
      const r = checkDisputeAllowed(s);
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.message.length > 10).toBe(true); messages.add(r.message); }
    }
    expect(messages.size >= 5).toBe(true);
  });
  it("litige déjà ouvert : message explicite", () => {
    const r = checkDisputeAllowed("dispute");
    expect(r.ok === false && r.message).toContain("déjà ouvert");
  });
  it("statut inconnu : refusé par défaut", () => {
    expect(checkDisputeAllowed("n_importe_quoi").ok).toBe(false);
  });
});
