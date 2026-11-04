// Fournisseur d'EXEMPLE, uniquement pour documenter et tester l'architecture.
// Il ne contient AUCUNE vraie donnée et n'est PAS branché sur la carte : voir docs/DONNEES.md pour ajouter une vraie source.
// Il montre le contrat : données statiques avec source/date/fiabilité, et disponibilité absente (donc statut « inconnu »).
import { inBbox, type Bbox } from "@contracts/parking-search";
import type { ParkingProvider, ProviderRecord } from "./types";

export const exampleProvider: ParkingProvider = {
  id: "example-static",
  name: "Fournisseur d'exemple (non réel)",
  category: "collective",
  sourceType: "open_data",
  license: "Sans objet (exemple)",
  documentationUrl: "docs/DONNEES.md",
  async fetchStatic(bbox: Bbox): Promise<ProviderRecord[]> {
    const sample: ProviderRecord = {
      externalId: "example-1", category: "collective", subtype: "souterrain", name: "Parking d'exemple (fictif)",
      latitude: 48.8566, longitude: 2.3522, covered: true, capacity: null, hourlyCents: null, maxDurationMinutes: null, pmr: null,
      availability: null,
      meta: { providerId: "example-static", source: "Exemple documenté, donnée fictive", sourceType: "open_data", retrievedAt: new Date(), reliability: 0, license: "Sans objet", isExample: true },
    };
    return inBbox(sample.latitude, sample.longitude, bbox) ? [sample] : [];
  },
};
