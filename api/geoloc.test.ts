import { describe, expect, it } from "vitest";
import { acquirePosition, geolocMessage, getGeolocDiag, reasonOfCode, PRECISE_OPTIONS, COARSE_OPTIONS } from "@/lib/geoloc";

type Cb = (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
const fix = { coords: { latitude: 48.85, longitude: 2.35, accuracy: 30 } };
const fake = (script: Array<{ ok: true } | { code: number } | "never">) => {
  const calls: Array<PositionOptions | undefined> = [];
  return { calls, geo: { getCurrentPosition: (ok: Cb, err: (e: { code: number }) => void, o?: PositionOptions) => {
    calls.push(o); const step = script[calls.length - 1];
    if (step === "never") return;
    if ("ok" in step) ok(fix); else err({ code: step.code });
  } } };
};

describe("géolocalisation : essai précis puis essai réseau", () => {
  it("succès au premier essai : une seule demande, précise, sans position ancienne", async () => {
    const f = fake([{ ok: true }]);
    const p = await acquirePosition(f.geo, true);
    expect(p).toEqual({ latitude: 48.85, longitude: 2.35, accuracy: 30 });
    expect(f.calls).toEqual([PRECISE_OPTIONS]);
    expect(PRECISE_OPTIONS.maximumAge).toBe(0);
  });
  it("délai dépassé en précis : second essai basse précision avec position récente acceptée", async () => {
    const f = fake([{ code: 3 }, { ok: true }]);
    await acquirePosition(f.geo, true);
    expect(f.calls).toEqual([PRECISE_OPTIONS, COARSE_OPTIONS]);
    expect(COARSE_OPTIONS.enableHighAccuracy).toBe(false);
    expect(COARSE_OPTIONS.maximumAge).toBeGreaterThan(0);
    expect(getGeolocDiag().attempt).toBe("réseau");
  });
  it("refus (code 1) : pas de second essai, message iPhone exact, code gardé pour le diagnostic", async () => {
    const f = fake([{ code: 1 }]);
    const err = await acquirePosition(f.geo, true).catch((e) => e);
    expect(f.calls.length).toBe(1);
    expect(err.reason).toBe("denied"); expect(err.code).toBe(1);
    expect(err.message).toBe(geolocMessage("denied", true));
    expect(getGeolocDiag().lastCode).toBe(1);
  });
  it("les deux essais échouent : le code du dernier échec (indisponible = 2, délai = 3)", async () => {
    expect((await acquirePosition(fake([{ code: 3 }, { code: 2 }]).geo, false).catch((e) => e)).reason).toBe("unavailable");
    expect((await acquirePosition(fake([{ code: 2 }, { code: 3 }]).geo, false).catch((e) => e)).reason).toBe("timeout");
  });
  it("navigateur sans géolocalisation : refus clair", async () => {
    expect((await acquirePosition(undefined, false).catch((e) => e)).reason).toBe("unsupported");
  });
  it("jamais de promesse sans fin : le garde-fou rejette en délai dépassé", async () => {
    const err = await acquirePosition(fake(["never"]).geo, true, 20).catch((e) => e);
    expect(err.reason).toBe("timeout");
  });
  it("un refus précédent n'est pas mémorisé : un nouvel appel redemande et peut réussir", async () => {
    await acquirePosition(fake([{ code: 1 }]).geo, true).catch(() => null);
    const f = fake([{ ok: true }]);
    expect((await acquirePosition(f.geo, true)).accuracy).toBe(30);
    expect(f.calls.length).toBe(1);
  });
  it("codes : 1 refusée, 2 indisponible, 3 délai", () => {
    expect([1, 2, 3].map(reasonOfCode)).toEqual(["denied", "unavailable", "timeout"]);
  });
});
