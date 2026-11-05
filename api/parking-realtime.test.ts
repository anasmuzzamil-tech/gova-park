import { beforeEach, describe, expect, it } from "vitest";
import { realtimeColor, realtimeLines, realtimeStatus } from "@contracts/parking-realtime";
import { fetchSaemes, parseSaemes, resetSaemesCache } from "./providers/saemes";

const NOW = new Date("2026-11-05T12:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60000).toISOString();

describe("parking temps réel : règle du vert", () => {
  it("vert seulement avec des places libres > 0 et une mesure de moins de 10 minutes", () => {
    expect(realtimeColor({ free: 12, observedAt: ago(3) }, NOW)).toBe("green");
    expect(realtimeColor({ free: 1, observedAt: ago(9) }, NOW)).toBe("green");
  });
  it("gris dans tous les autres cas : 0 place, mesure de 10 min ou plus, nombre ou date absents, date future", () => {
    expect(realtimeColor({ free: 0, observedAt: ago(1) }, NOW)).toBe("gray");
    expect(realtimeColor({ free: 12, observedAt: ago(10) }, NOW)).toBe("gray");
    expect(realtimeColor({ free: 12, observedAt: ago(45) }, NOW)).toBe("gray");
    expect(realtimeColor({ free: null, observedAt: ago(1) }, NOW)).toBe("gray");
    expect(realtimeColor({ free: 12, observedAt: null }, NOW)).toBe("gray");
    expect(realtimeColor({ free: 12, observedAt: new Date(NOW.getTime() + 30 * 60000).toISOString() }, NOW)).toBe("gray");
    expect(realtimeStatus({ free: Number.NaN, observedAt: ago(1) }, NOW).color).toBe("gray");
  });
  it("jamais de rouge déduit d'un parking à 0 place", () => {
    expect(realtimeColor({ free: 0, observedAt: ago(1) }, NOW)).not.toBe("red");
  });
});

describe("parking temps réel : texte de fiche", () => {
  const base = { id: "p", name: "P", lat: 48.85, lng: 2.35, capacity: 300 };
  it("« Places libres : N · mis à jour à HH:MM » + capacité (heure de Paris)", () => {
    const l = realtimeLines({ ...base, free: 42, observedAt: "2026-11-05T11:55:00Z" }, NOW);
    expect(l.free).toBe("Places libres : 42 · mis à jour à 12:55");
    expect(l.capacity).toBe("Capacité : 300 places");
  });
  it("mesure ancienne : aucun nombre mis en avant ; données absentes : aucune ligne inventée", () => {
    expect(realtimeLines({ ...base, free: 42, observedAt: ago(30) }, NOW).free).toContain("trop ancienne");
    expect(realtimeLines({ ...base, free: 42, observedAt: ago(30) }, NOW).free).not.toContain("42");
    expect(realtimeLines({ ...base, free: null, observedAt: null, capacity: null }, NOW)).toEqual({ free: null, capacity: null });
  });
});

// ÉCHANTILLON SYNTHÉTIQUE du schéma SUPPOSÉ (noms de champs candidats, enveloppe Opendatasoft v2.1) : ce n'est PAS une réponse réelle de Saemes.
const SYNTHETIC = { total_count: 3, results: [
  { nom_parking: "Parking exemple A", places_disponibles: 120, capacite: 400, horodatage: "2026-11-05T11:58:00+00:00", geo_point_2d: { lat: 48.853, lon: 2.349 } },
  { nom_parking: "Parking exemple B", places_disponibles: "0", capacite: 250, horodatage: "2026-11-05T11:58:00+00:00", geo_point_2d: [48.86, 2.34] },
  { nom_parking: "Hors Paris", places_disponibles: 5, geo_point_2d: { lat: 45.7, lon: 4.8 } },
] };
describe("lecture de la réponse (schéma supposé)", () => {
  it("lit nom, position, places libres, capacité et date ; ignore une ligne hors Paris", () => {
    const rows = parseSaemes(SYNTHETIC);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Parking exemple A", free: 120, capacity: 400, lat: 48.853, lng: 2.349 });
    expect(rows[0].observedAt).toBe("2026-11-05T11:58:00.000Z");
    expect(rows[1].free).toBe(0);
  });
  it("champs non reconnus : free et date restent null (donc gris), rien n'est inventé", () => {
    const rows = parseSaemes({ results: [{ nom: "X", geo_point_2d: { lat: 48.85, lon: 2.35 }, champ_inconnu: 7 }] });
    expect(rows[0].free).toBeNull(); expect(rows[0].observedAt).toBeNull();
    expect(realtimeColor(rows[0], NOW)).toBe("gray");
  });
  it("réponse vide, illisible ou ancien format (records.fields)", () => {
    expect(parseSaemes(null)).toEqual([]); expect(parseSaemes({})).toEqual([]);
    expect(parseSaemes({ records: [{ fields: SYNTHETIC.results[0] }] })).toHaveLength(1);
  });
});

describe("récupération serveur : cache de 60 s", () => {
  beforeEach(() => resetSaemesCache());
  it("un seul appel dans la minute, un nouvel appel ensuite ; une erreur HTTP lève", async () => {
    let calls = 0;
    const ok = (async () => { calls++; return new Response(JSON.stringify(SYNTHETIC), { status: 200 }); }) as unknown as typeof fetch;
    await fetchSaemes(ok, 1_000_000); await fetchSaemes(ok, 1_030_000);
    expect(calls).toBe(1);
    await fetchSaemes(ok, 1_061_000);
    expect(calls).toBe(2);
    resetSaemesCache();
    const bad = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchSaemes(bad, 2_000_000)).rejects.toThrow();
  });
});
