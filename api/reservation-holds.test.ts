import { describe, expect, it } from "vitest";
import { assertCanCreatePending, blocksSlot, countPending, isPaymentHoldExpired, MAX_PENDING_PER_USER, PAYMENT_HOLD_MINUTES, paymentHoldExpiry } from "./lib/reservation-holds";

const now = new Date("2026-11-05T12:00:00Z");
const at = (min: number) => new Date(now.getTime() + min * 60_000);

describe("réservations en attente : expiration", () => {
  it("l'attente de paiement dure 15 minutes", () => {
    expect(PAYMENT_HOLD_MINUTES).toBe(15);
    expect(paymentHoldExpiry(now).getTime() - now.getTime()).toBe(15 * 60_000);
  });
  it("une attente de paiement non expirée bloque le créneau, une expirée non", () => {
    expect(blocksSlot({ status: "payment_pending", expiresAt: at(5) }, now)).toBe(true);
    expect(blocksSlot({ status: "payment_pending", expiresAt: at(-1) }, now)).toBe(false);
    expect(blocksSlot({ status: "payment_pending", expiresAt: at(0) }, now)).toBe(false);
    expect(blocksSlot({ status: "payment_pending", expiresAt: null }, now)).toBe(false);
  });
  it("un statut « expired » ne bloque jamais, confirmé et en cours bloquent toujours", () => {
    expect(blocksSlot({ status: "expired", expiresAt: at(60) }, now)).toBe(false);
    expect(blocksSlot({ status: "confirmed", expiresAt: null }, now)).toBe(true);
    expect(blocksSlot({ status: "in_progress", expiresAt: null }, now)).toBe(true);
    expect(blocksSlot({ status: "pending", expiresAt: at(60) }, now)).toBe(false);
    expect(blocksSlot({ status: "cancelled", expiresAt: at(60) }, now)).toBe(false);
  });
  it("seule une attente de paiement dont l'heure est passée doit passer à « expired »", () => {
    expect(isPaymentHoldExpired({ status: "payment_pending", expiresAt: at(-1) }, now)).toBe(true);
    expect(isPaymentHoldExpired({ status: "payment_pending", expiresAt: at(1) }, now)).toBe(false);
    expect(isPaymentHoldExpired({ status: "confirmed", expiresAt: at(-100) }, now)).toBe(false);
    expect(isPaymentHoldExpired({ status: "pending", expiresAt: at(-100) }, now)).toBe(false);
  });
});

describe("réservations en attente : plafond par utilisateur", () => {
  it("compte les demandes et attentes de paiement non expirées seulement", () => {
    const rows = [
      { status: "pending", expiresAt: at(600) }, { status: "payment_pending", expiresAt: at(3) },
      { status: "payment_pending", expiresAt: at(-3) }, { status: "expired", expiresAt: at(-3) },
      { status: "confirmed", expiresAt: null }, { status: "cancelled", expiresAt: at(10) },
    ];
    expect(countPending(rows, now)).toBe(2);
  });
  it("refuse la création au plafond, avec un message clair", () => {
    expect(assertCanCreatePending(MAX_PENDING_PER_USER - 1).ok).toBe(true);
    const r = assertCanCreatePending(MAX_PENDING_PER_USER);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain("en attente");
    expect(assertCanCreatePending(MAX_PENDING_PER_USER + 5).ok).toBe(false);
  });
});
