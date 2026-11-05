import { describe, expect, it } from "vitest";
import { GUIDANCE, buildPlan, formatDistance, mapOsrmSteps, maneuverText, navProgress, pickAnnouncement, projectOnRoute, shouldReroute, type NavRoute } from "../src/lib/guidance";

// Itinéraire de test : 1 km plein nord (lat croissante) puis 500 m plein est.
const lat0 = 48.85, lng0 = 2.35, dLat = 1000 / 111320, dLng = 500 / (111320 * Math.cos((lat0 * Math.PI) / 180));
const coords: NavRoute["coordinates"] = [[lat0, lng0], [lat0 + dLat / 2, lng0], [lat0 + dLat, lng0], [lat0 + dLat, lng0 + dLng]];
const route: NavRoute = {
  coordinates: coords, distance: 1500, duration: 300,
  steps: [
    { instruction: "Démarrez", distance: 1000, location: coords[0], dir: "depart" },
    { instruction: "Tournez à droite sur Rue X", distance: 500, location: coords[2], dir: "right" },
    { instruction: "Vous êtes arrivé à destination", distance: 0, location: coords[3], dir: "arrive" },
  ],
};
const plan = buildPlan(route);
const at = (alongNorth: number, east = 0) => ({ lat: lat0 + alongNorth / 111320, lng: lng0 + east / (111320 * Math.cos((lat0 * Math.PI) / 180)) });

describe("textes de manœuvre en français", () => {
  it("tourner, rond-point, demi-tour, arrivée", () => {
    expect(maneuverText("turn", "left", "Rue A").text).toBe("Tournez à gauche sur Rue A");
    expect(maneuverText("turn", "slight right").text).toBe("Tournez légèrement à droite");
    expect(maneuverText("roundabout", undefined, undefined, 2).text).toBe("Au rond-point, prenez la 2ᵉ sortie");
    expect(maneuverText("turn", "uturn").text).toBe("Faites demi-tour");
    expect(maneuverText("arrive", "right").dir).toBe("arrive");
  });
  it("aucun mot anglais dans les étapes converties", () => {
    const steps = mapOsrmSteps([{ distance: 10, name: "Rue B", maneuver: { type: "turn", modifier: "sharp left", location: [2.3, 48.8] } }], [0, 0]);
    expect(steps[0].instruction).toBe("Tournez franchement à gauche sur Rue B");
    expect(steps[0].location).toEqual([48.8, 2.3]);
  });
});

describe("projection sur l'itinéraire", () => {
  it("distance parcourue et écart", () => {
    const p = projectOnRoute(plan, at(400, 0));
    expect(Math.abs(p.along - 400) < 3).toBe(true);
    expect(p.off < 3).toBe(true);
    const side = projectOnRoute(plan, at(400, 80));
    expect(Math.abs(side.off - 80) < 3).toBe(true);
  });
  it("position des manœuvres le long du tracé", () => {
    expect(Math.abs(plan.stepAlong[1] - 1000) < 3).toBe(true);
    expect(Math.abs(plan.total - 1500) < 5).toBe(true);
  });
});

describe("progression", () => {
  it("sans position : tout l'itinéraire est devant, prochaine manœuvre = la première après le départ", () => {
    const s = navProgress(plan, route, null);
    expect(s.located).toBe(false);
    expect(s.next?.step.instruction).toBe("Tournez à droite sur Rue X");
    expect(Math.abs(s.remaining - 1500) < 5).toBe(true);
    expect(s.arrived).toBe(false);
  });
  it("en route : distance restante, durée proportionnelle, manœuvre suivante", () => {
    const s = navProgress(plan, route, at(700));
    expect(Math.abs(s.next!.distance - 300) < 5).toBe(true);
    expect(Math.abs(s.remaining - 800) < 5).toBe(true);
    expect(Math.abs(s.remainingSec - 160) < 4).toBe(true);
    expect(s.then?.instruction).toBe("Vous êtes arrivé à destination");
  });
  it("après la manœuvre, la suivante devient l'arrivée", () => {
    const s = navProgress(plan, route, at(1000, 100));
    expect(s.next?.step.dir).toBe("arrive");
  });
  it("arrivée sous 25 m de la fin", () => {
    expect(navProgress(plan, route, at(1000, 490)).arrived).toBe(true);
    expect(navProgress(plan, route, at(1000, 300)).arrived).toBe(false);
  });
});

describe("recalcul", () => {
  it("seulement après plusieurs positions hors tracé et hors délai de repos", () => {
    expect(shouldReroute(100, 10, 1, 0, 100000)).toBe(false);
    expect(shouldReroute(100, 10, GUIDANCE.offRouteFixes, 0, 100000)).toBe(true);
    expect(shouldReroute(100, 10, GUIDANCE.offRouteFixes, 95000, 100000)).toBe(false);
    expect(shouldReroute(30, 10, 5, 0, 100000)).toBe(false);
  });
  it("une mauvaise précision GPS élargit la tolérance", () => {
    expect(shouldReroute(100, 100, 5, 0, 100000)).toBe(false);
    expect(shouldReroute(200, 100, 5, 0, 100000)).toBe(true);
  });
});

describe("annonces vocales", () => {
  it("un palier une seule fois, le plus proche si plusieurs sont franchis", () => {
    const spoken = new Set<string>();
    expect(pickAnnouncement(1, "Tournez à droite", 800, spoken)).toBe(null);
    expect(pickAnnouncement(1, "Tournez à droite", 480, spoken)).toBe("Dans 500 mètres, tournez à droite");
    expect(pickAnnouncement(1, "Tournez à droite", 470, spoken)).toBe(null);
    expect(pickAnnouncement(1, "Tournez à droite", 190, spoken)).toBe("Dans 200 mètres, tournez à droite");
    expect(pickAnnouncement(1, "Tournez à droite", 40, spoken)).toBe("Tournez à droite");
    expect(pickAnnouncement(1, "Tournez à droite", 10, spoken)).toBe(null);
    expect(pickAnnouncement(2, "Continuez", 100, new Set())).toBe("Dans 200 mètres, continuez");
  });
});

describe("affichage", () => {
  it("distances", () => {
    expect(formatDistance(250)).toBe("250 m");
    expect(formatDistance(3400)).toBe("3,4 km");
  });
});
