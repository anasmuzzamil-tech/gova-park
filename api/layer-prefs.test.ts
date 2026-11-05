import { describe, expect, it } from "vitest";
import { LAYER_DEFAULTS, LAYER_KEY, loadLayerPrefs, parseLayerPrefs, saveLayerPrefs } from "../src/lib/layer-prefs";

describe("couches mémorisées", () => {
  it("par défaut : places en rue, emplacements et interdictions actifs ; chantiers et ZFE masqués", () => {
    expect(LAYER_DEFAULTS).toEqual({ street: true, paris: true, forbidden: true, works: false, zfe: false });
  });
  it("lecture tolérante : texte illisible, valeurs mal typées, champs en trop", () => {
    expect(parseLayerPrefs("pas du json")).toEqual(LAYER_DEFAULTS);
    expect(parseLayerPrefs(null)).toEqual(LAYER_DEFAULTS);
    expect(parseLayerPrefs('{"street":false,"works":"oui","zfe":true,"x":1}')).toEqual({ ...LAYER_DEFAULTS, street: false, zfe: true });
  });
  it("écriture puis lecture", () => {
    const mem: Record<string, string> = {};
    const st = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    saveLayerPrefs({ ...LAYER_DEFAULTS, works: true, street: false }, st);
    expect(Object.keys(mem)).toEqual([LAYER_KEY]);
    expect(loadLayerPrefs(st)).toEqual({ ...LAYER_DEFAULTS, works: true, street: false });
  });
  it("stockage qui lève une erreur ou absent : aucune exception, valeurs par défaut", () => {
    const bad = { getItem: () => { throw new Error("bloqué"); }, setItem: () => { throw new Error("plein"); } };
    expect(loadLayerPrefs(bad)).toEqual(LAYER_DEFAULTS);
    expect(() => saveLayerPrefs(LAYER_DEFAULTS, bad)).not.toThrow();
    expect(loadLayerPrefs(null)).toEqual(LAYER_DEFAULTS);
  });
});
