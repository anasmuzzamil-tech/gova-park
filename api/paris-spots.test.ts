import { describe, expect, it } from "vitest";
import {
  CAR_SPOT_TYPES, DEFAULT_SPOT_TYPES, GRID, PARIS_ATTRIBUTION, SPOT_TYPE, SPOT_TYPE_CODES, SPOT_TYPE_LABEL, aggregateOverview, bucketTiles, decodeNumero, decodeOverview, decodeTile, describeParisSpot, displayMode, encodeNumero, formatStreet,
  interpretRegime, limitNearCenter, mergeWithReports, streetKey, tileKey, tilesForBounds, titleCaseVoie,
  type OfficialSpot, type RawPoint, type ReportLite,
} from "@contracts/paris-spots";

// Couples « Régime prioritaire » / « Régime particulier » réellement présents dans le fichier de la Ville de Paris du 31/10/2026
// (53 couples, relevés avec un script sur le CSV fourni), avec le sens attendu. cars : true = une voiture peut s'y garer ; false = autre usage ; null = incertain, aucune promesse.
const REAL_COMBOS: Array<[string, string, number, boolean | null]> = [
  ["PAYANT MIXTE", "Mixte", SPOT_TYPE.paid, true],
  ["PAYANT ROTATIF", "Rotatif", SPOT_TYPE.paid, true],
  ["GRATUIT", "Gratuit", SPOT_TYPE.free, true],
  ["2 ROUES", "Vélos", SPOT_TYPE.bike, false],
  ["2 ROUES", "Vélo-cargo", SPOT_TYPE.bike, false],
  ["2 ROUES", "Box à vélos", SPOT_TYPE.bike, false],
  ["2 ROUES", "Motos payant Mixte", SPOT_TYPE.moto, false],
  ["2 ROUES", "Motos payant Rotatif", SPOT_TYPE.moto, false],
  ["2 ROUES", "Mixte", SPOT_TYPE.other, null], // incertain (motos ou vélos ? 237 lignes sur 238 ont un arceau comme mobilier) : jamais deviné
  ["LIVRAISON", "ZL périodique", SPOT_TYPE.delivery, false],
  ["LIVRAISON", "ZL permanente", SPOT_TYPE.delivery, false],
  ["GIG/GIC", "GIG/GIC Standard", SPOT_TYPE.pmr, false],
  ["GIG/GIC", "GIG/GIC Elargie", SPOT_TYPE.pmr, false],
  ["GIG/GIC", "GIG/GIC Standard piétonne", SPOT_TYPE.pmr, false],
  ["LOCATION", "Vélib'", SPOT_TYPE.bike, false],
  ["LOCATION", "Véhicule partagé", SPOT_TYPE.reserved, false],
  ["LOCATION", "Véhicules électriques partagés", SPOT_TYPE.reserved, false],
  ["LOCATION", "Mobilib utilitaire", SPOT_TYPE.reserved, false],
  ["LOCATION", "Autopartage", SPOT_TYPE.reserved, false],
  ["ELECTRIQUE", "Bélib'", SPOT_TYPE.reserved, false],
  ["ELECTRIQUE", "Bélib' 2RM", SPOT_TYPE.reserved, false],
  ["AUTOCAR", "Autocar (payant)", SPOT_TYPE.coach, false],
  ["AUTOCAR", "Autocar dépose/reprise", SPOT_TYPE.coach, false],
  ["AUTOCAR", "Autocar dépose", SPOT_TYPE.coach, false],
  ["AUTOCAR", "Autocar reprise", SPOT_TYPE.coach, false],
  ["AUTOCAR", "Autocar stationnement gratuit", SPOT_TYPE.coach, false],
  ["AUTRE REGIME", "Transport de fonds", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Police", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Pompiers", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Services de secours (SAMU, SMUR, protection civile)", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Nettoiement", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Véhicules Postaux", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Mairie", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Ministère", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Administration", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Juridiction", SPOT_TYPE.reserved, false],
  ["AUTRE REGIME", "SP - Gendarmerie", SPOT_TYPE.reserved, false],
  // Incertains : jamais devinés (libellé « Régime : valeur brute », hors de l'affichage par défaut).
  ["PAYANT MIXTE", "Mixte Marché", SPOT_TYPE.other, null],
  ["PAYANT ROTATIF", "Rotatif Marché", SPOT_TYPE.other, null],
  ["GRATUIT", "Gratuit Bois", SPOT_TYPE.other, null],
  ["GRATUIT", "Gratuit Marché", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "Taxi gaine autorisée", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "Taxi gaine interdite", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "Trilib'", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "cd-cmd", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "Travaux", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "Marché", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "Inaccessible", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "Station Service", SPOT_TYPE.other, null],
  ["AUTRE REGIME", "Dépose minute", SPOT_TYPE.other, null],
  ["ELECTRIQUE", "Ex Autolib' 2 avec bornes de recharge", SPOT_TYPE.other, null],
  ["ELECTRIQUE", "Ex Autolib' 1 pour stat elec sans recharge", SPOT_TYPE.other, null],
  ["ELECTRIQUE", "Ex Autolib' 2 pour stat elec sans recharge", SPOT_TYPE.other, null],
];

describe("interprétation des régimes du fichier de Paris", () => {
  it("chaque couple réel est classé comme prévu (type et possibilité de se garer en voiture)", () => {
    for (const [prio, part, t, cars] of REAL_COMBOS) {
      const r = interpretRegime(prio, part);
      expect(`${prio} | ${part} -> ${r.t} ${r.cars}`).toBe(`${prio} | ${part} -> ${t} ${cars}`);
    }
  });
  it("seuls payant mixte, payant rotatif et gratuit autorisent une voiture ordinaire", () => {
    const yes = REAL_COMBOS.filter(([p, q]) => interpretRegime(p, q).cars === true).map(([p, q]) => `${p}|${q}`);
    expect(yes).toEqual(["PAYANT MIXTE|Mixte", "PAYANT ROTATIF|Rotatif", "GRATUIT|Gratuit"]);
  });
  it("GIG/GIC = réservé aux personnes à mobilité réduite titulaires de la carte, jamais « on peut se garer »", () => {
    const r = interpretRegime("GIG/GIC", "GIG/GIC Standard");
    expect(r.cars).toBe(false);
    expect(r.note).toContain("carte de stationnement pour personnes handicapées");
    expect(r.note).toContain("carte");
    expect(interpretRegime("GIG/GIC", "GIG/GIC Elargie").note).toContain("GIG/GIC Elargie");
  });
  it("payant mixte = payant, tous véhicules", () => {
    const r = interpretRegime("PAYANT MIXTE", "Mixte");
    expect(r.title).toBe("Place payante");
    expect(r.note).toBe("Ouvert à tous les véhicules");
  });
  it("livraison, autocars, deux-roues motorisés et vélos sont réservés à leur usage", () => {
    expect(interpretRegime("LIVRAISON", "ZL permanente").note).toContain("livraisons");
    expect(interpretRegime("AUTOCAR", "Autocar (payant)").note).toContain("autocars");
    expect(interpretRegime("2 ROUES", "Motos payant Mixte").note).toContain("deux-roues motorisés");
    expect(interpretRegime("2 ROUES", "Vélos").note).toContain("vélos");
    for (const [p, q] of [["LIVRAISON", "ZL permanente"], ["AUTOCAR", "Autocar (payant)"], ["2 ROUES", "Motos payant Mixte"], ["2 ROUES", "Vélos"]]) expect(interpretRegime(p, q).cars).toBe(false);
  });
  it("libellés par type : Place payante, Place moto, Place autocar, Zone de livraison (sans promesse), Place vélo", () => {
    expect(interpretRegime("PAYANT ROTATIF", "Rotatif").title).toBe("Place payante (rotatif)");
    expect(interpretRegime("AUTOCAR", "Autocar (payant)").title).toBe("Place autocar");
    expect(interpretRegime("LIVRAISON", "ZL permanente").title).toBe("Zone de livraison");
    expect(interpretRegime("LIVRAISON", "ZL périodique").title).toBe("Zone de livraison");
    expect(interpretRegime("2 ROUES", "Vélos").title).toBe("Place vélo");
  });
  it("une zone de livraison périodique ne promet aucun horaire", () => {
    const r = interpretRegime("LIVRAISON", "ZL périodique");
    expect(r.title).toBe("Zone de livraison");
    expect(r.note).toBe("Régime : ZL périodique ; voir le panneau pour les horaires");
    expect(/libre|dispo/i.test(`${r.title} ${r.note}`)).toBe(false);
  });
  it("valeur inconnue ou incertaine : « Régime : valeur brute », sans promesse, hors affichage par défaut", () => {
    const a = interpretRegime("AUTRE REGIME", "Taxi gaine autorisée");
    expect(a.title).toBe("Régime : Taxi gaine autorisée");
    expect(a.cars).toBeNull();
    expect(a.t).toBe(SPOT_TYPE.other);
    const b = interpretRegime("NOUVEAU REGIME", "Truc");
    expect(b.title).toBe("Régime : Truc");
    expect(b.cars).toBeNull();
    expect(interpretRegime("", "").title).toBe("Régime : non renseigné");
    expect(interpretRegime(undefined, null).cars).toBeNull();
  });
  it("une valeur reconnue avec un régime particulier inattendu reste incertaine", () => {
    expect(interpretRegime("PAYANT MIXTE", "Autre chose").cars).toBeNull();
    expect(interpretRegime("GRATUIT", "Gratuit étrange").cars).toBeNull();
  });
  it("par défaut (« Voitures et motos ») : payant, gratuit et deux-roues motorisés ; tous les types ont un libellé", () => {
    expect(DEFAULT_SPOT_TYPES).toEqual([SPOT_TYPE.paid, SPOT_TYPE.free, SPOT_TYPE.moto]);
    expect(CAR_SPOT_TYPES).toEqual([SPOT_TYPE.paid, SPOT_TYPE.free]);
    for (const code of SPOT_TYPE_CODES) expect(SPOT_TYPE_LABEL[code]).toBeTruthy();
    // Vélos, livraison, autocars, PMR, services et incertains restent masqués par défaut.
    for (const t of [SPOT_TYPE.bike, SPOT_TYPE.delivery, SPOT_TYPE.coach, SPOT_TYPE.pmr, SPOT_TYPE.reserved, SPOT_TYPE.other]) expect(DEFAULT_SPOT_TYPES.includes(t)).toBe(false);
    // Les types voiture ne sortent que des trois couples sûrs ; le type moto ne sort que des deux couples « Motos payant … » (jamais les vélos).
    for (const [p, q, t] of REAL_COMBOS) if (CAR_SPOT_TYPES.includes(t)) expect(interpretRegime(p, q).cars).toBe(true);
    const motos = REAL_COMBOS.filter(([, , t]) => t === SPOT_TYPE.moto).map(([p, q]) => `${p}|${q}`);
    expect(motos).toEqual(["2 ROUES|Motos payant Mixte", "2 ROUES|Motos payant Rotatif"]);
  });
  it("2 ROUES | Mixte est incertain : « Régime : Mixte », ni moto, ni vélo, ni voiture", () => {
    const r = interpretRegime("2 ROUES", "Mixte");
    expect(r.t).toBe(SPOT_TYPE.other); expect(r.cars).toBeNull(); expect(r.title).toBe("Régime : Mixte");
  });
  it("place moto : libellé clair, jamais « on peut s'y garer en voiture »", () => {
    for (const q of ["Motos payant Mixte", "Motos payant Rotatif"]) {
      const r = interpretRegime("2 ROUES", q);
      expect(r.t).toBe(SPOT_TYPE.moto); expect(r.cars).toBe(false);
      expect(r.title).toBe("Place moto");
      const d = describeParisSpot({ regime: r, places: 4, street: streetKey("RUE", "X"), numeroCode: 0 });
      expect(d.title).toBe("Place moto · Rue X");
      expect(d.places).toBe("4 places");
      expect(d.carsOk).toBe(false);
      expect(d.note).toContain("deux-roues motorisés");
      expect(`${d.title} ${d.note} ${d.status}`.toLowerCase().includes("vous pouvez")).toBe(false);
      expect(`${d.title} ${d.note}`.includes("Ouvert à tous")).toBe(false);
    }
  });
});

describe("rue, numéro et fiche d'un emplacement", () => {
  it("met en forme la rue : type développé, particules en minuscules, numéro si connu", () => {
    expect(formatStreet(streetKey("RUE DU", "CHERCHE-MIDI"), encodeNumero("61"))).toBe("61 rue du Cherche-Midi");
    expect(formatStreet(streetKey("QU D'", "ORLEANS"), encodeNumero("14"))).toBe("14 quai d'Orleans");
    expect(formatStreet(streetKey("AV", "MAURICE D'OCAGNE"), 0)).toBe("Avenue Maurice d'Ocagne");
    expect(formatStreet(streetKey("BD DE LA", "VILLETTE"), encodeNumero("5", "Bis"))).toBe("5 bis boulevard de la Villette");
    expect(formatStreet(streetKey("RUE", "BOUILLOUX-LAFONT"), 0)).toBe("Rue Bouilloux-Lafont");
    expect(formatStreet(streetKey("RUE DE L'", "ABBE GREGOIRE"), 0)).toBe("Rue de l'Abbe Gregoire");
  });
  it("un type de voie inconnu est conservé tel quel, une rue vide donne une chaîne vide", () => {
    expect(formatStreet(streetKey("PGS", "BRADY"), 0)).toBe("PGS Brady");
    expect(formatStreet(streetKey("CRS LA", "REINE"), 0)).toBe("Cours la Reine");
    expect(formatStreet("|", 0)).toBe("");
  });
  it("numéro : 0, vide ou invalide = inconnu ; bis/ter reconnus ; aller-retour sans perte", () => {
    expect(encodeNumero("0")).toBe(0);
    expect(encodeNumero("")).toBe(0);
    expect(encodeNumero("abc")).toBe(0);
    expect(encodeNumero("12", "*** travaux")).toBe(120);
    expect(decodeNumero(encodeNumero("12", "ter"))).toBe("12 ter");
    expect(decodeNumero(encodeNumero("7"))).toBe("7");
    expect(decodeNumero(0)).toBe("");
    expect(titleCaseVoie("SAINT-HONORE")).toBe("Saint-Honore");
  });
  it("nombre de places : « X places », 1 place au singulier, 0 = non renseigné", () => {
    const base = { regime: interpretRegime("PAYANT MIXTE", "Mixte"), street: streetKey("RUE DU", "CHERCHE-MIDI"), numeroCode: encodeNumero("61") };
    expect(describeParisSpot({ ...base, places: 7 }).places).toBe("7 places");
    expect(describeParisSpot({ ...base, places: 1 }).places).toBe("1 place");
    expect(describeParisSpot({ ...base, places: 0 }).places).toBe("Nombre de places non renseigné");
  });
  it("sans signalement : place grise, AUCUN texte de statut ; avec signalement : heure relative + « par un utilisateur »", () => {
    const base = { regime: interpretRegime("PAYANT MIXTE", "Mixte"), places: 7, street: streetKey("RUE DU", "CHERCHE-MIDI"), numeroCode: encodeNumero("61") };
    const none = describeParisSpot(base);
    expect(none.status).toBeNull();
    expect(none.title).toBe("Place payante · 61 rue du Cherche-Midi");
    expect(none.carsOk).toBe(true);
    expect(describeParisSpot({ ...base, report: { status: "free", minutes: 3, stale: false, example: false } }).status).toBe("Signalée libre il y a 3 min par un utilisateur");
    expect(describeParisSpot({ ...base, report: { status: "taken", minutes: 0, stale: false, example: false } }).status).toBe("Signalée prise à l'instant par un utilisateur");
    expect(describeParisSpot({ ...base, report: { status: "free", minutes: 7, stale: true, example: true } }).status).toBe("Signalée libre il y a 7 min par un utilisateur (à vérifier) · exemple");
  });
  it("vocabulaire : aucune formulation « inconnu », « officiel » ou « voirie » dans la fiche, les titres de régime ni la mention de source", () => {
    const banned = /inconnu|officiel|voirie|exhaustiv.*place disponible|statut/i;
    for (const [p, q] of REAL_COMBOS) {
      const r = interpretRegime(p, q);
      const d = describeParisSpot({ regime: r, places: 3, street: streetKey("AV DES", "CHAMPS ELYSEES"), numeroCode: 0 });
      expect(banned.test(`${d.title} ${d.places} ${d.note ?? ""} ${d.status ?? ""}`), `${p} | ${q}`).toBe(false);
    }
    expect(banned.test(PARIS_ATTRIBUTION)).toBe(false);
    expect(PARIS_ATTRIBUTION).toContain("ODbL");
    expect(describeParisSpot({ regime: interpretRegime("GRATUIT", "Gratuit"), places: 5, street: streetKey("AV DES", "CHAMPS ELYSEES"), numeroCode: 0 }).title).toBe("Place gratuite · Avenue des Champs Elysees");
  });
  it("une place PMR ou une livraison ne dit jamais qu'une voiture peut s'y garer", () => {
    for (const [p, q] of [["GIG/GIC", "GIG/GIC Standard"], ["LIVRAISON", "ZL permanente"], ["AUTRE REGIME", "Travaux"]]) {
      const d = describeParisSpot({ regime: interpretRegime(p, q), places: 2, street: streetKey("RUE", "X"), numeroCode: 0 });
      expect(d.carsOk).toBe(false);
      expect(`${d.title} ${d.note} ${d.status}`.toLowerCase().includes("vous pouvez")).toBe(false);
    }
  });
});

const origin = { south: 48.8, west: 2.2 };
const pt = (lat: number, lng: number, t: number, places: number, street = "RUE|A", num = 0): RawPoint => ({ lat, lng, t, places, g: 0, street, num });
const pts: RawPoint[] = [pt(48.8501, 2.3001, 1, 5, "RUE|A", 120), pt(48.8502, 2.3002, 1, 2, "RUE|B"), pt(48.8503, 2.3003, 2, 1, "RUE|A", 130), pt(48.9001, 2.4001, 3, 4)];

describe("découpage en tuiles", () => {
  it("clé de tuile stable", () => {
    expect(tileKey(48.8501, 2.3001, origin, GRID.tileDeg)).toBe("5_2");
    expect(tileKey(48.8, 2.2, origin, GRID.tileDeg)).toBe("0_0");
  });
  it("répartit tous les points, sans en perdre, et se relit à 5 décimales", () => {
    const b = bucketTiles(pts, origin, GRID.tileDeg);
    expect([...b.values()].reduce((s, f) => s + f.rows.length, 0)).toBe(4);
    const spots = decodeTile("5_2", b.get("5_2")!);
    expect(spots).toHaveLength(3);
    expect(spots[0].lat).toBe(48.8501);
    expect(spots[0].agg).toBe(false);
  });
  it("conserve « Nombre places réelles », la rue (dictionnaire par tuile) et le numéro de chaque tronçon", () => {
    const spots = decodeTile("5_2", bucketTiles(pts, origin, GRID.tileDeg).get("5_2")!);
    expect(spots.map((x) => x.places)).toEqual([5, 2, 1]);
    expect(spots.map((x) => x.street)).toEqual(["RUE|A", "RUE|B", "RUE|A"]);
    expect(spots.map((x) => decodeNumero(x.num))).toEqual(["12", "", "13"]);
    expect(bucketTiles(pts, origin, GRID.tileDeg).get("5_2")!.streets).toEqual(["RUE|A", "RUE|B"]);
  });
  it("tuiles de la zone visible : seulement celles qui existent, proches du centre d'abord, avec un maximum", () => {
    const index = { origin, tileDeg: GRID.tileDeg, tiles: { "5_2": 3, "9_5": 1 } };
    expect(tilesForBounds({ south: 48.84, north: 48.86, west: 2.29, east: 2.31 }, index).keys).toEqual(["5_2"]);
    const all = tilesForBounds({ south: 48.8, north: 48.95, west: 2.2, east: 2.5 }, index);
    expect(all.keys).toHaveLength(2);
    expect(tilesForBounds({ south: 48.8, north: 48.95, west: 2.2, east: 2.5 }, index, 1)).toEqual({ keys: ["5_2"], truncated: true } as never);
  });
});

describe("vue d'ensemble agrégée", () => {
  it("additionne les PLACES par cellule et par type (le total de places est conservé)", () => {
    const rows = aggregateOverview(pts, origin, GRID.overviewDeg);
    const spots = decodeOverview(rows);
    expect(spots.reduce((s, p) => s + p.places, 0)).toBe(12);
    expect(spots.some((p) => p.places === 7 && p.t === 1)).toBe(true);
    expect(spots.every((p) => p.agg)).toBe(true);
  });
  it("mode d'affichage selon la largeur de la carte", () => {
    expect(displayMode({ south: 48.8, north: 48.9, west: 2.2, east: 2.5 })).toBe("overview");
    expect(displayMode({ south: 48.85, north: 48.86, west: 2.3, east: 2.32 })).toBe("detail");
  });
  it("limite les emplacements détaillés autour du centre", () => {
    const many: OfficialSpot[] = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, lat: 48.85 + i * 0.001, lng: 2.35, t: 1, places: 1, agg: false, g: 0, street: "", num: 0 }));
    const r = limitNearCenter(many, { lat: 48.85, lng: 2.35 }, 3);
    expect(r.truncated).toBe(true);
    expect(r.spots.map((s) => s.id)).toEqual(["a0", "a1", "a2"]);
    expect(limitNearCenter(many, { lat: 48.85, lng: 2.35 }, 20).truncated).toBe(false);
  });
});

describe("fusion avec les signalements (jamais de vert sans signalement)", () => {
  const officials: OfficialSpot[] = [
    { id: "a", lat: 48.85, lng: 2.35, t: 1, places: 1, agg: false, g: 0, street: "", num: 0 },
    { id: "b", lat: 48.85002, lng: 2.35, t: 2, places: 1, agg: false, g: 0, street: "", num: 0 }, // environ 2 m de a
    { id: "c", lat: 48.8505, lng: 2.35, t: 1, places: 1, agg: false, g: 0, street: "", num: 0 }, // environ 55 m de a
    { id: "agg", lat: 48.85, lng: 2.35, t: 1, places: 12, agg: true, g: -1, street: "", num: 0 },
  ];
  const rep = (over: Partial<ReportLite>): ReportLite => ({ id: 1, latitude: 48.85, longitude: 2.35, color: "green", reportedAt: "2026-11-05T12:00:00Z", ...over });
  it("sans signalement, tout est gris", () => {
    const r = mergeWithReports(officials, []);
    expect(r.spots.every((s) => s.color === "gray" && s.reportId === 0)).toBe(true);
    expect(r.matchedReportIds.size).toBe(0);
  });
  it("un signalement à moins de 15 m colore l'emplacement le plus proche, et lui seul", () => {
    const r = mergeWithReports(officials, [rep({})]);
    expect(r.spots.find((s) => s.id === "a")!.color).toBe("green");
    expect(r.spots.find((s) => s.id === "a")!.reportId).toBe(1);
    expect(r.spots.filter((s) => s.color !== "gray")).toHaveLength(1);
    expect(r.matchedReportIds.has(1)).toBe(true);
  });
  it("à plus de 15 m : aucun emplacement coloré, le signalement reste une place en rue à part", () => {
    const r = mergeWithReports(officials, [rep({ latitude: 48.8503 })]);
    expect(r.spots.every((s) => s.color === "gray")).toBe(true);
    expect(r.matchedReportIds.size).toBe(0);
  });
  it("orange et rouge reprennent la couleur du signalement ; une couleur inconnue (grise) ne colore rien", () => {
    expect(mergeWithReports(officials, [rep({ color: "orange" })]).spots[0].color).toBe("orange");
    expect(mergeWithReports(officials, [rep({ color: "red" })]).spots[0].color).toBe("red");
    expect(mergeWithReports(officials, [rep({ color: "gray" })]).spots.every((s) => s.color === "gray")).toBe(true);
  });
  it("le signalement le plus récent l'emporte sur un même emplacement", () => {
    const r = mergeWithReports(officials, [rep({ id: 1, color: "green", reportedAt: "2026-11-05T12:00:00Z" }), rep({ id: 2, color: "red", reportedAt: "2026-11-05T12:03:00Z" })]);
    expect(r.spots.find((s) => s.id === "a")!.color).toBe("red");
  });
  it("les points agrégés de la vue d'ensemble ne sont jamais colorés", () => {
    const r = mergeWithReports([{ id: "agg", lat: 48.85, lng: 2.35, t: 1, places: 12, agg: true, g: -1, street: "", num: 0 }], [rep({})]);
    expect(r.spots[0].color).toBe("gray");
    expect(r.matchedReportIds.size).toBe(0);
  });
});
