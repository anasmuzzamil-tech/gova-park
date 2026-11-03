import { env } from "./lib/env";

// MODE DEMO : actif automatiquement tant que DATABASE_URL n'est pas renseignee.
// Le site s'ouvre directement sur la carte avec des places d'exemple, sans connexion ni base.
// Des que DATABASE_URL est ajoutee sur Render, ce mode se desactive tout seul.
export const isDemoMode = !env.databaseUrl;

export const demoUser = {
  id: 1,
  unionId: "demo:visiteur",
  name: "Visiteur démo",
  email: "demo@govapark.local",
  avatar: null,
  role: "user" as const,
  ownerVerificationStatus: "not_applicable" as const,
  passwordHash: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  lastSignInAt: new Date(),
};

const places = [
  ["Garage calme — Charonne", "Paris 11ᵉ · secteur Charonne", 48.8546, 2.3784, "garage", true, 250, 1800, 9500, "instant"],
  ["Place en résidence — Bastille", "Paris 12ᵉ · près de Bastille", 48.8524, 2.3712, "residence", true, 220, 1500, 8500, "validation"],
  ["Box sécurisé — Montparnasse", "Paris 14ᵉ · secteur Plaisance", 48.8372, 2.3184, "garage", true, 280, 1900, 10500, "instant"],
  ["Parking d’entreprise — Bercy", "Paris 12ᵉ · secteur Bercy", 48.8387, 2.3791, "entreprise", true, 240, 1600, 9000, "validation"],
  ["Place couverte — Batignolles", "Paris 17ᵉ · secteur Batignolles", 48.8862, 2.3167, "residence", true, 260, 1700, 9600, "instant"],
  ["Garage lumineux — Montmartre", "Paris 18ᵉ · bas de Montmartre", 48.8843, 2.3384, "garage", true, 230, 1550, 8700, "validation"],
  ["Place extérieure — Vincennes", "Vincennes · près du centre", 48.8468, 2.4371, "residence", false, 180, 1200, 6800, "instant"],
  ["Box avec badge — La Défense", "Courbevoie · secteur La Défense", 48.8905, 2.2441, "garage", true, 250, 1700, 9200, "instant"],
  ["Parking résidentiel — Boulogne", "Boulogne-Billancourt · centre", 48.8341, 2.2414, "residence", true, 200, 1400, 7800, "validation"],
  ["Place pratique — Saint-Denis", "Saint-Denis · secteur Basilique", 48.9361, 2.3584, "parking", false, 150, 1000, 5600, "instant"],
  ["Garage spacieux — Saint-Ouen", "Saint-Ouen · près des Docks", 48.9069, 2.3334, "garage", true, 190, 1300, 7200, "instant"],
  ["Box sous-sol — Nation", "Paris 12ᵉ · secteur Nation", 48.8491, 2.3947, "garage", true, 210, 1450, 8000, "validation"],
  ["Place en résidence — Gobelins", "Paris 13ᵉ · secteur Gobelins", 48.8356, 2.3522, "residence", true, 230, 1500, 8400, "instant"],
  ["Parking d’entreprise — Issy", "Issy-les-Moulineaux · centre", 48.8234, 2.2701, "entreprise", true, 180, 1250, 6900, "validation"],
  ["Box double — Levallois", "Levallois-Perret · secteur So Ouest", 48.8951, 2.2872, "garage", true, 270, 1800, 9900, "instant"],
  ["Place extérieure — Montreuil", "Montreuil · secteur Croix de Chavaux", 48.8623, 2.4412, "residence", false, 160, 1100, 6100, "instant"],
  ["Garage sécurisé — Neuilly", "Neuilly-sur-Seine · secteur Sablons", 48.8821, 2.2721, "garage", true, 290, 1950, 10800, "validation"],
  ["Place couverte — Pantin", "Pantin · près du canal de l’Ourcq", 48.8954, 2.4013, "parking", true, 170, 1200, 6600, "instant"],
  ["Parking d’entreprise — Ivry", "Ivry-sur-Seine · secteur Ivry-Port", 48.8151, 2.3871, "entreprise", true, 170, 1150, 6400, "validation"],
  ["Box simple — Clichy", "Clichy · secteur Mairie", 48.9018, 2.3041, "garage", true, 200, 1350, 7500, "instant"],
] as const;

// Annonces telles que la carte les attend (sans adresse exacte ni consignes d'acces).
export function demoListings() {
  return places.map((p, i) => ({
    id: i + 1,
    ownerId: null,
    title: p[0],
    description: "Emplacement entretenu, accès simple et environnement surveillé. Idéal pour un stationnement ponctuel ou régulier. Merci de respecter les horaires réservés et la largeur de l’emplacement.",
    approxAddress: p[1],
    latitude: p[2],
    longitude: p[3],
    placeType: p[4],
    covered: p[5],
    lengthM: i % 4 === 0 ? 5.2 : 4.8,
    widthM: i % 3 === 0 ? 2.6 : 2.4,
    heightCm: p[5] ? (i % 2 === 0 ? 190 : 205) : 450,
    hourlyCents: p[6],
    dailyCents: p[7],
    weeklyCents: p[8],
    bookingMode: p[9],
    status: "published" as const,
    photos: [`/parking/parking-${(i % 10) + 1}.png`, `/parking/parking-${((i + 2) % 10) + 1}.png`, `/parking/parking-${((i + 5) % 10) + 1}.png`],
    mainPhoto: 0,
    availability: JSON.stringify({ days: [1, 2, 3, 4, 5, 6, 0], start: "00:00", end: "23:59" }),
    blocked: JSON.stringify([]),
    rating: 4.4 + (i % 5) * 0.1,
    reviewCount: 7 + i * 2,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    currentAvailability: (i % 6 === 3 ? "unavailable" : "available") as "available" | "unavailable",
  }));
}

// Signalements de la communaute, dates par rapport a l'instant present.
export function demoReports() {
  const now = Date.now();
  const base = { userId: null, createdAt: new Date(now), expiresAt: null, contradictions: 0 };
  return [
    { ...base, id: 1, kind: "free" as const, latitude: 48.8561, longitude: 2.3522, address: "Rue de Rivoli, Paris 4ᵉ", source: "Lina M. · communauté", confidence: 88, estimatedDeparture: null, updatedAt: new Date(now - 4 * 60000), confirmations: 3 },
    { ...base, id: 2, kind: "occupied" as const, latitude: 48.8584, longitude: 2.3471, address: "Rue Saint-Antoine, Paris 4ᵉ", source: "Mehdi R. · communauté", confidence: 76, estimatedDeparture: null, updatedAt: new Date(now - 9 * 60000), confirmations: 2 },
    { ...base, id: 3, kind: "departure" as const, latitude: 48.8531, longitude: 2.3491, address: "Quai des Célestins, Paris 4ᵉ", source: "Sophie D. · communauté", confidence: 64, estimatedDeparture: new Date(now + 12 * 60000), updatedAt: new Date(now - 3 * 60000), confirmations: 1 },
    { ...base, id: 4, kind: "free" as const, latitude: 48.8606, longitude: 2.3698, address: "Rue de la Folie-Méricourt, Paris 11ᵉ", source: "Adam B. · communauté", confidence: 92, estimatedDeparture: null, updatedAt: new Date(now - 6 * 60000), confirmations: 4 },
    { ...base, id: 5, kind: "occupied" as const, latitude: 48.8441, longitude: 2.3731, address: "Rue de Lyon, Paris 12ᵉ", source: "Nora L. · communauté", confidence: 81, estimatedDeparture: null, updatedAt: new Date(now - 14 * 60000), confirmations: 2 },
    { ...base, id: 6, kind: "departure" as const, latitude: 48.8421, longitude: 2.3221, address: "Rue de Vaugirard, Paris 15ᵉ", source: "Jules T. · communauté", confidence: 57, estimatedDeparture: new Date(now + 20 * 60000), updatedAt: new Date(now - 8 * 60000), confirmations: 1 },
  ];
}
