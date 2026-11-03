import { getDb } from "../api/queries/connection";
import { listings, communityReports, reservations } from "./schema";
import { calculatePrice } from "../contracts/pricing";

const places = [
  ["Garage calme — Charonne", "Paris 11ᵉ · secteur Charonne", "24 rue de la Roquette, 75011 Paris", 48.8546, 2.3784, "garage", true, 250, 1800, 9500, "instant"],
  ["Place en résidence — Bastille", "Paris 12ᵉ · près de Bastille", "18 rue de Charenton, 75012 Paris", 48.8524, 2.3712, "residence", true, 220, 1500, 8500, "validation"],
  ["Box sécurisé — Montparnasse", "Paris 14ᵉ · secteur Plaisance", "61 rue de Plaisance, 75014 Paris", 48.8372, 2.3184, "garage", true, 280, 1900, 10500, "instant"],
  ["Parking d’entreprise — Bercy", "Paris 12ᵉ · secteur Bercy", "42 rue de Bercy, 75012 Paris", 48.8387, 2.3791, "entreprise", true, 240, 1600, 9000, "validation"],
  ["Place couverte — Batignolles", "Paris 17ᵉ · secteur Batignolles", "51 boulevard des Batignolles, 75017 Paris", 48.8862, 2.3167, "residence", true, 260, 1700, 9600, "instant"],
  ["Garage lumineux — Montmartre", "Paris 18ᵉ · bas de Montmartre", "33 rue des Abbesses, 75018 Paris", 48.8843, 2.3384, "garage", true, 230, 1550, 8700, "validation"],
  ["Place extérieure — Vincennes", "Vincennes · près du centre", "12 avenue de Paris, 94300 Vincennes", 48.8468, 2.4371, "residence", false, 180, 1200, 6800, "instant"],
  ["Box avec badge — La Défense", "Courbevoie · secteur La Défense", "8 place des Reflets, 92400 Courbevoie", 48.8905, 2.2441, "garage", true, 250, 1700, 9200, "instant"],
  ["Parking résidentiel — Boulogne", "Boulogne-Billancourt · centre", "26 rue de Silly, 92100 Boulogne-Billancourt", 48.8341, 2.2414, "residence", true, 200, 1400, 7800, "validation"],
  ["Place pratique — Saint-Denis", "Saint-Denis · secteur Basilique", "14 rue de la Légion d’Honneur, 93200 Saint-Denis", 48.9361, 2.3584, "parking", false, 150, 1000, 5600, "instant"],
  ["Garage spacieux — Saint-Ouen", "Saint-Ouen · près des Docks", "19 rue des Docks, 93400 Saint-Ouen", 48.9069, 2.3334, "garage", true, 190, 1300, 7200, "instant"],
  ["Box sous-sol — Nation", "Paris 12ᵉ · secteur Nation", "9 boulevard de Charonne, 75011 Paris", 48.8491, 2.3947, "garage", true, 210, 1450, 8000, "validation"],
  ["Place en résidence — Gobelins", "Paris 13ᵉ · secteur Gobelins", "27 avenue des Gobelins, 75013 Paris", 48.8356, 2.3522, "residence", true, 230, 1500, 8400, "instant"],
  ["Parking d’entreprise — Issy", "Issy-les-Moulineaux · centre", "16 rue Rouget de Lisle, 92130 Issy-les-Moulineaux", 48.8234, 2.2701, "entreprise", true, 180, 1250, 6900, "validation"],
  ["Box double — Levallois", "Levallois-Perret · secteur So Ouest", "31 rue Louis Pasteur, 92300 Levallois-Perret", 48.8951, 2.2872, "garage", true, 270, 1800, 9900, "instant"],
  ["Place extérieure — Montreuil", "Montreuil · secteur Croix de Chavaux", "22 rue de Paris, 93100 Montreuil", 48.8623, 2.4412, "residence", false, 160, 1100, 6100, "instant"],
  ["Garage sécurisé — Neuilly", "Neuilly-sur-Seine · secteur Sablons", "7 rue de Longchamp, 92200 Neuilly-sur-Seine", 48.8821, 2.2721, "garage", true, 290, 1950, 10800, "validation"],
  ["Place couverte — Pantin", "Pantin · près du canal de l’Ourcq", "15 rue Delizy, 93500 Pantin", 48.8954, 2.4013, "parking", true, 170, 1200, 6600, "instant"],
  ["Parking d’entreprise — Ivry", "Ivry-sur-Seine · secteur Ivry-Port", "11 quai Marcel Boyer, 94200 Ivry-sur-Seine", 48.8151, 2.3871, "entreprise", true, 170, 1150, 6400, "validation"],
  ["Box simple — Clichy", "Clichy · secteur Mairie", "20 rue Martre, 92110 Clichy", 48.9018, 2.3041, "garage", true, 200, 1350, 7500, "instant"],
] as const;

function reservationPrice(input: Parameters<typeof calculatePrice>[0]) {
  const { startedHours: _startedHours, ...price } = calculatePrice(input);
  return price;
}

async function seed() {
  const db = getDb();
  const existing = await db.select({ id: listings.id }).from(listings).limit(1);
  if (existing.length) {
    console.log("Demo data already present.");
    process.exit(0);
  }
  const inserted = await db.insert(listings).values(places.map((p, i) => ({
    ownerId: i < 3 ? 1 : null,
    title: p[0],
    description: "Emplacement entretenu, accès simple et environnement surveillé. Idéal pour un stationnement ponctuel ou régulier. Merci de respecter les horaires réservés et la largeur de l’emplacement.",
    approxAddress: p[1], exactAddress: p[2],
    accessInstructions: "Prenez l’entrée piétonne puis le niveau -1. La place porte le numéro indiqué dans votre confirmation. Badge ou télécommande à restituer au départ.",
    latitude: p[3], longitude: p[4], placeType: p[5], covered: p[6],
    lengthM: i % 4 === 0 ? 5.2 : 4.8, widthM: i % 3 === 0 ? 2.6 : 2.4,
    heightCm: p[6] ? (i % 2 === 0 ? 190 : 205) : 450,
    hourlyCents: p[7], dailyCents: p[8], weeklyCents: p[9], bookingMode: p[10],
    status: "published" as const, photos: JSON.stringify([`/parking/parking-${(i % 10) + 1}.png`, `/parking/parking-${((i + 2) % 10) + 1}.png`, `/parking/parking-${((i + 5) % 10) + 1}.png`]),
    mainPhoto: 0, availability: JSON.stringify({ days: [1,2,3,4,5,6,0], start: "00:00", end: "23:59" }),
    blocked: JSON.stringify([]), rating: 4.4 + (i % 5) * 0.1, reviewCount: 7 + i * 2,
  }))).$returningId();

  const now = Date.now();
  await db.insert(communityReports).values([
    { kind: "free", latitude: 48.8561, longitude: 2.3522, address: "Rue de Rivoli, Paris 4ᵉ", source: "Lina M. · communauté", confidence: 88, updatedAt: new Date(now - 4 * 60000) },
    { kind: "occupied", latitude: 48.8584, longitude: 2.3471, address: "Rue Saint-Antoine, Paris 4ᵉ", source: "Mehdi R. · communauté", confidence: 76, updatedAt: new Date(now - 9 * 60000) },
    { kind: "departure", latitude: 48.8531, longitude: 2.3491, address: "Quai des Célestins, Paris 4ᵉ", source: "Sophie D. · communauté", confidence: 64, estimatedDeparture: new Date(now + 12 * 60000), updatedAt: new Date(now - 2 * 60000) },
    { kind: "free", latitude: 48.8606, longitude: 2.3698, address: "Rue de la Folie-Méricourt, Paris 11ᵉ", source: "Adam B. · communauté", confidence: 92, updatedAt: new Date(now - 6 * 60000) },
    { kind: "occupied", latitude: 48.8441, longitude: 2.3731, address: "Rue de Lyon, Paris 12ᵉ", source: "Nora L. · communauté", confidence: 81, updatedAt: new Date(now - 14 * 60000) },
    { kind: "departure", latitude: 48.8421, longitude: 2.3221, address: "Rue de Vaugirard, Paris 15ᵉ", source: "Jules T. · communauté", confidence: 57, estimatedDeparture: new Date(now + 20 * 60000), updatedAt: new Date(now - 11 * 60000) },
    { kind: "free", latitude: 48.8711, longitude: 2.3011, address: "Rue de Miromesnil, Paris 8ᵉ", source: "Inès K. · communauté", confidence: 71, updatedAt: new Date(now - 45 * 60000) },
  ]);

  const listingId = inserted[0].id;
  const startAt = new Date(now + 24 * 3600000);
  const endAt = new Date(now + 26 * 3600000);
  const price = reservationPrice({ startAt, endAt, hourlyCents: 250, dailyCents: 1800, weeklyCents: 9500 });
  await db.insert(reservations).values([
    { listingId, userId: 1, startAt, endAt, status: "confirmed", ...price },
    { listingId, userId: 1, startAt: new Date(now - 8 * 86400000), endAt: new Date(now - 8 * 86400000 + 7200000), status: "completed", ...price },
    { listingId: inserted[1].id, userId: 999, startAt: new Date(now + 3 * 86400000), endAt: new Date(now + 3 * 86400000 + 10800000), status: "pending", expiresAt: new Date(now + 20 * 3600000), ...reservationPrice({ startAt: new Date(now + 3 * 86400000), endAt: new Date(now + 3 * 86400000 + 10800000), hourlyCents: 220, dailyCents: 1500, weeklyCents: 8500 }) },
  ]);
  console.log(`Seeded ${places.length} private spaces and community reports.`);
  process.exit(0);
}

seed().catch((error) => { console.error(error); process.exit(1); });
