import { describe, expect, it } from "vitest";
import { IRVE_PROP, IRVE_SOURCE, irveAdd, irveAttribution, irveFeature, irvePosition, irveSheet, parseBool, type IrveAgg } from "@contracts/paris-irve";
import { LAYER } from "@contracts/geo-layers";

// LIGNES SYNTHÉTIQUES au format du schéma documenté etalab/schema-irve-statique (noms de colonnes) : ce ne sont PAS des lignes du vrai fichier.
const row = (extra: Record<string, string> = {}): Record<string, string> => ({
  id_station_itinerance: "FRXXXPEXEMPLE1", nom_operateur: "Opérateur Exemple", nom_enseigne: "Enseigne Exemple", nom_station: "Station Exemple", adresse_station: "1 rue de l'Exemple, 75011 Paris",
  coordonneesXY: "[2.3790,48.8570]", nbre_pdc: "2", id_pdc_itinerance: "A", puissance_nominale: "22", prise_type_ef: "false", prise_type_2: "true", prise_type_combo_ccs: "false", prise_type_chademo: "false", prise_type_autre: "false", gratuit: "false", ...extra,
});

describe("bornes de recharge (IRVE) : lecture du schéma documenté", () => {
  it("position : coordonneesXY « [lng, lat] » ou « lng, lat » ; colonnes consolidated_* prioritaires ; hors Île-de-France ou illisible = null", () => {
    expect(irvePosition({ coordonneesXY: "[2.379,48.857]" })).toEqual([2.379, 48.857]);
    expect(irvePosition({ coordonneesXY: "2.379, 48.857" })).toEqual([2.379, 48.857]);
    expect(irvePosition({ coordonneesXY: "[0,0]", consolidated_longitude: "2.38", consolidated_latitude: "48.86" })).toEqual([2.38, 48.86]);
    expect(irvePosition({ coordonneesXY: "[4.83,45.76]" })).toBeNull(); // Lyon
    expect(irvePosition({ coordonneesXY: "n'importe quoi" })).toBeNull();
    expect(irvePosition({})).toBeNull();
  });
  it("booléens du fichier", () => { expect(parseBool("True")).toBe(true); expect(parseBool("false")).toBe(false); expect(parseBool("")).toBeNull(); expect(parseBool("peut-être")).toBeNull(); });
  it("regroupe les points de charge d'une station : nombre, puissance max, prises réunies, gratuit seulement si tout concorde", () => {
    const map = new Map<string, IrveAgg>();
    expect(irveAdd(map, row())).toBe("added");
    irveAdd(map, row({ id_pdc_itinerance: "B", puissance_nominale: "50", prise_type_2: "false", prise_type_combo_ccs: "true" }));
    expect(map.size).toBe(1);
    const f = irveFeature([...map.values()][0]);
    expect(f.kind).toBe("pt");
    expect(f.props[IRVE_PROP.pdc]).toBe(2);
    expect(f.props[IRVE_PROP.kw]).toBe(50);
    expect(f.props[IRVE_PROP.plugs]).toBe(2 + 4);
    expect(f.props[IRVE_PROP.free]).toBe(0);
    irveAdd(map, row({ id_pdc_itinerance: "C", gratuit: "true" }));
    expect(irveFeature([...map.values()][0]).props[IRVE_PROP.free]).toBeNull(); // déclarations contradictoires : rien d'affirmé
  });
  it("puissance absurde (> 1000 kW, probablement des watts) : ignorée, jamais divisée au hasard", () => {
    const map = new Map<string, IrveAgg>(); irveAdd(map, row({ puissance_nominale: "7400" }));
    expect(irveFeature([...map.values()][0]).props[IRVE_PROP.kw]).toBeNull();
  });
  it("ligne sans position exploitable : comptée à part, aucune borne inventée", () => {
    const map = new Map<string, IrveAgg>();
    expect(irveAdd(map, row({ coordonneesXY: "" }))).toBe("noPosition");
    expect(map.size).toBe(0);
  });
  it("station sans identifiant : regroupée par position", () => {
    const map = new Map<string, IrveAgg>(); irveAdd(map, row({ id_station_itinerance: "", id_station_local: "" })); irveAdd(map, row({ id_station_itinerance: "", id_station_local: "", id_pdc_itinerance: "B" }));
    expect(map.size).toBe(1);
  });
});

describe("fiche d'une borne : seulement ce que la source déclare", () => {
  it("titre, points de charge, puissance, prises, opérateur et adresse", () => {
    const map = new Map<string, IrveAgg>(); irveAdd(map, row()); irveAdd(map, row({ id_pdc_itinerance: "B", puissance_nominale: "50", prise_type_combo_ccs: "true" }));
    const s = irveSheet(irveFeature([...map.values()][0]).props);
    expect(s.title).toBe("Borne de recharge");
    expect(s.chips).toEqual(["2 points de charge", "jusqu'à 50 kW", "Type 2", "Combo CCS"]);
    expect(s.note).toBe("Opérateur Exemple · Station Exemple · 1 rue de l'Exemple, 75011 Paris");
  });
  it("valeurs absentes : aucune puce, aucune mention « inconnu »", () => {
    const s = irveSheet([null, null, null, null, null, null, null]);
    expect(s.chips).toEqual([]); expect(s.note).toBeNull();
    expect(JSON.stringify(s).toLowerCase().includes("inconnu")).toBe(false);
  });
  it("jamais de disponibilité ni de statut dans la fiche ; source et licence dans l'attribution du panneau « i »", () => {
    const s = irveSheet([null, "Station", null, 1, 22, 2, 1]);
    expect(JSON.stringify(s).toLowerCase().includes("libre")).toBe(false);
    expect(IRVE_SOURCE.license).toBe("Licence Ouverte");
    expect(irveAttribution("2026-11-05")).toContain("Aucune disponibilité en temps réel");
    expect(LAYER.pointZoom).toBe(14);
  });
});
