import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TYPES_COLOR, DISPLAY_COLORS, DISPLAY_TYPES, VEHICLE_COLORS, VEHICLE_TYPES, hexToRgba, spotTypeColor, typeColor } from "@contracts/vehicle-types";
import { STATUS_COLORS } from "@contracts/parking-status";
import { SPOT_TYPE } from "@contracts/paris-spots";

const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrastWithWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);

describe("couleurs des types de véhicule", () => {
  it("valeurs décidées : voiture bleu, moto violet, livraison rose, vélo cyan (assombri), tout ardoise", () => {
    expect(VEHICLE_COLORS).toEqual({ car: "#2563EB", moto: "#7C3AED", delivery: "#DB2777", bike: "#0E7490" });
    expect(ALL_TYPES_COLOR).toBe("#1F2937");
    expect(typeColor("all")).toBe("#1F2937");
    expect(typeColor("bike")).toBe("#0E7490");
  });
  it("une couleur par type, toutes différentes (« Tout » comprise)", () => {
    const all = [...VEHICLE_TYPES.map((v) => VEHICLE_COLORS[v]), ALL_TYPES_COLOR].map((c) => c.toLowerCase());
    expect(new Set(all).size).toBe(5);
  });
  it("aucune n'égale une couleur de statut (vert, orange, rouge, gris)", () => {
    const status = Object.values(STATUS_COLORS).map((c) => c.toLowerCase());
    for (const c of [...Object.values(VEHICLE_COLORS), ALL_TYPES_COLOR]) expect(status).not.toContain(c.toLowerCase());
  });
  it("texte blanc lisible sur chaque couleur : contraste >= 4,5:1", () => {
    for (const c of [...Object.values(VEHICLE_COLORS), ALL_TYPES_COLOR]) expect(contrastWithWhite(c) >= 4.5).toBe(true);
    expect(contrastWithWhite("#0891B2") < 4.5).toBe(true); // le cyan d'origine ne passait pas : d'où #0E7490
  });
  it("jetons CSS = constantes partagées", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");
    const token = (name: string) => new RegExp(`--gp-v-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)?.[1]?.toUpperCase();
    expect(token("car")).toBe(VEHICLE_COLORS.car); expect(token("moto")).toBe(VEHICLE_COLORS.moto);
    expect(token("delivery")).toBe(VEHICLE_COLORS.delivery); expect(token("bike")).toBe(VEHICLE_COLORS.bike);
    expect(token("all")).toBe(ALL_TYPES_COLOR);
  });
  it("couleur du type d'un emplacement : payant et gratuit = voiture, moto, livraison, vélo ; PMR : brun ; autocar, réservé, autre : aucune", () => {
    expect(spotTypeColor(SPOT_TYPE.paid)).toBe(VEHICLE_COLORS.car);
    expect(spotTypeColor(SPOT_TYPE.free)).toBe(VEHICLE_COLORS.car);
    expect(spotTypeColor(SPOT_TYPE.moto)).toBe(VEHICLE_COLORS.moto);
    expect(spotTypeColor(SPOT_TYPE.delivery)).toBe(VEHICLE_COLORS.delivery);
    expect(spotTypeColor(SPOT_TYPE.bike)).toBe(VEHICLE_COLORS.bike);
    expect(spotTypeColor(SPOT_TYPE.pmr)).toBe(DISPLAY_COLORS.pmr);
    for (const t of [SPOT_TYPE.coach, SPOT_TYPE.reserved, SPOT_TYPE.other]) expect(spotTypeColor(t)).toBeNull();
  });
  it("rgba des regroupements", () => { expect(hexToRgba("#7C3AED", 0.9)).toBe("rgba(124, 58, 237, 0.9)"); });

  it("types d'affichage seulement (PMR brun, Électrique fuchsia) : jetons CSS, contraste, distincts des 5 types, de l'accent violet et des statuts", () => {
    expect(DISPLAY_TYPES).toEqual(["pmr", "ev"]);
    expect(DISPLAY_COLORS).toEqual({ pmr: "#78350F", ev: "#A21CAF" });
    expect(typeColor("pmr")).toBe("#78350F"); expect(typeColor("ev")).toBe("#A21CAF");
    const css = fs.readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");
    const token = (name: string) => new RegExp(`--gp-v-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)?.[1]?.toUpperCase();
    expect(token("pmr")).toBe(DISPLAY_COLORS.pmr); expect(token("ev")).toBe(DISPLAY_COLORS.ev);
    for (const c of Object.values(DISPLAY_COLORS)) expect(contrastWithWhite(c) >= 4.5).toBe(true);
    // Écart de couleur CIE76 >= 25 avec chaque autre couleur du sélecteur, l'accent et les 4 statuts.
    const lab = (hex: string) => {
      const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255));
      const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
      const x = t((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = t(r * 0.2126 + g * 0.7152 + b * 0.0722), z = t((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    };
    const dE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
    const others = [...Object.values(VEHICLE_COLORS), ALL_TYPES_COLOR, "#6d4ae0", ...Object.values(STATUS_COLORS)];
    for (const c of Object.values(DISPLAY_COLORS)) for (const o of others) expect(dE(c, o) >= 25).toBe(true);
    expect(dE(DISPLAY_COLORS.pmr, DISPLAY_COLORS.ev) >= 25).toBe(true);
  });
});
