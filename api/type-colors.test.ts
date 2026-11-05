import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TYPES_COLOR, VEHICLE_COLORS, VEHICLE_TYPES, hexToRgba, spotTypeColor, typeColor } from "@contracts/vehicle-types";
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
  it("couleur du type d'un emplacement : payant et gratuit = voiture, moto, livraison, vélo ; autocar, PMR, réservé, autre : aucune", () => {
    expect(spotTypeColor(SPOT_TYPE.paid)).toBe(VEHICLE_COLORS.car);
    expect(spotTypeColor(SPOT_TYPE.free)).toBe(VEHICLE_COLORS.car);
    expect(spotTypeColor(SPOT_TYPE.moto)).toBe(VEHICLE_COLORS.moto);
    expect(spotTypeColor(SPOT_TYPE.delivery)).toBe(VEHICLE_COLORS.delivery);
    expect(spotTypeColor(SPOT_TYPE.bike)).toBe(VEHICLE_COLORS.bike);
    for (const t of [SPOT_TYPE.coach, SPOT_TYPE.pmr, SPOT_TYPE.reserved, SPOT_TYPE.other]) expect(spotTypeColor(t)).toBeNull();
  });
  it("rgba des regroupements", () => { expect(hexToRgba("#7C3AED", 0.9)).toBe("rgba(124, 58, 237, 0.9)"); });
});
