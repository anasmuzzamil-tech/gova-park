import { describe, expect, it } from "vitest";
import { exampleProvider } from "./providers/example";
import { fetchCategory } from "./providers/registry";
import { toStatusSignals } from "./providers/types";
import { resolveStatus } from "@contracts/parking-status";

describe("fournisseurs de données", () => {
  it("le fournisseur d'exemple n'invente aucune disponibilité : statut gris inconnu", async () => {
    const [record] = await exampleProvider.fetchStatic({ south: 48, north: 49, west: 2, east: 3 });
    expect(record.meta.isExample).toBe(true);
    expect(record.availability).toBeNull();
    expect(resolveStatus(toStatusSignals(record)).color).toBe("gray");
  });
  it("une mesure temps réel valide donne un statut vert, périmée elle repasse en gris", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    const base = { externalId: "x", category: "collective" as const, subtype: "souterrain", name: "X", latitude: 0, longitude: 0, meta: { providerId: "p", source: "Exploitant", sourceType: "operator" as const, retrievedAt: now, reliability: 95, license: "ODbL" } };
    expect(resolveStatus(toStatusSignals({ ...base, availability: { state: "free", observedAt: new Date(now.getTime() - 60000), validForMinutes: 10 } }), now).color).toBe("green");
    expect(resolveStatus(toStatusSignals({ ...base, availability: { state: "free", observedAt: new Date(now.getTime() - 20 * 60000), validForMinutes: 10 } }), now).color).toBe("gray");
  });
  it("sans fournisseur enregistré, aucune place publique n'est inventée", async () => {
    expect((await fetchCategory("public", { south: 48, north: 49, west: 2, east: 3 })).records.length).toBe(0);
  });
});
