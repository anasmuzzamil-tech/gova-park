// Validation d'une annonce de place privée avant publication (partagée client/serveur, testée dans api/listing-validation.test.ts).
export type ListingDraft = {
  title: string; description: string; address: string; approxAddress: string; accessInstructions: string;
  latitude: number; longitude: number; lengthM: number; widthM: number; heightCm: number;
  hourlyCents: number; dailyCents: number; weeklyCents: number;
  photoCount: number; availability: { days: number[]; start: string; end: string };
};

// Emprise de la France métropolitaine (large) : une position hors de cette zone est refusée.
const FR = { south: 41.2, north: 51.2, west: -5.5, east: 9.8 };

export function validateListing(d: ListingDraft): string[] {
  const errors: string[] = [];
  if (d.title.trim().length < 4) errors.push("Titre trop court (4 caractères minimum).");
  if (d.description.trim().length < 20) errors.push("Description trop courte (20 caractères minimum).");
  if (d.address.trim().length < 5) errors.push("Adresse exacte obligatoire.");
  if (d.approxAddress.trim().length < 3) errors.push("Adresse approximative publique obligatoire.");
  if (d.accessInstructions.trim().length < 5) errors.push("Conditions d'accès obligatoires.");
  if (!Number.isFinite(d.latitude) || !Number.isFinite(d.longitude) || (d.latitude === 0 && d.longitude === 0)) errors.push("Position GPS manquante : localisez l'adresse sur la carte.");
  else if (d.latitude < FR.south || d.latitude > FR.north || d.longitude < FR.west || d.longitude > FR.east) errors.push("Position GPS hors de France métropolitaine.");
  if (!(d.lengthM >= 2 && d.lengthM <= 12)) errors.push("Longueur : entre 2 et 12 m.");
  if (!(d.widthM >= 1.2 && d.widthM <= 4)) errors.push("Largeur : entre 1,2 et 4 m.");
  if (!(d.heightCm >= 100 && d.heightCm <= 600)) errors.push("Hauteur maximale : entre 100 et 600 cm.");
  if (!(d.hourlyCents >= 50 && d.hourlyCents <= 5000)) errors.push("Prix horaire : entre 0,50 € et 50 €.");
  if (!(d.dailyCents >= d.hourlyCents)) errors.push("Le prix journée ne peut pas être inférieur au prix horaire.");
  if (!(d.weeklyCents >= d.dailyCents)) errors.push("Le prix semaine ne peut pas être inférieur au prix journée.");
  if (d.photoCount < 1) errors.push("Au moins une photo est obligatoire.");
  if (d.availability.days.length === 0) errors.push("Choisissez au moins un jour disponible.");
  if (!(d.availability.start < d.availability.end)) errors.push("L'heure de fin doit suivre l'heure de début.");
  return errors;
}
