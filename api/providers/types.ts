// Architecture de fournisseurs de données de stationnement.
// Chaque donnée porte : une source, une date de récupération, un niveau de fiabilité, un statut et une durée de validité.
// Les catégories (public / privé / collectif) ne sont jamais mélangées : un enregistrement appartient à une seule catégorie.
import type { Bbox } from "@contracts/parking-search";
import type { SourceType, StatusSignal } from "@contracts/parking-status";

export type ParkingCategory = "public" | "private" | "collective";

export type ProviderAvailability = {
  state: "free" | "occupied";
  freeSpots?: number;
  observedAt: Date;
  /** Durée de validité de cette mesure (minutes) : au-delà, la donnée est périmée et la place repasse en gris. */
  validForMinutes: number;
};

export type ProviderRecord = {
  externalId: string;
  category: ParkingCategory;
  subtype: string; // ex. "voirie", "payant", "pmr", "livraison", "souterrain", "exterieur"
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  covered?: boolean | null;
  capacity?: number | null;
  hourlyCents?: number | null; // null = tarif inconnu (jamais 0 par défaut)
  maxDurationMinutes?: number | null;
  pmr?: boolean | null;
  heightCm?: number | null;
  restrictions?: string | null;
  openingHours?: string | null;
  /** Disponibilité temps réel si (et seulement si) la source la fournit. null = inconnue. */
  availability: ProviderAvailability | null;
  meta: {
    providerId: string;
    source: string;       // nom lisible, affiché à l'utilisateur
    sourceType: SourceType;
    retrievedAt: Date;    // date de récupération
    reliability: number;  // 0-100
    license: string;
    isExample?: boolean;  // donnée d'exemple : ne doit jamais être présentée comme réelle
  };
};

export interface ParkingProvider {
  id: string;
  name: string;
  category: ParkingCategory;
  sourceType: SourceType;
  license: string;
  documentationUrl: string;
  /** Données statiques (emplacement, tarif, capacité) d'une zone. */
  fetchStatic(bbox: Bbox): Promise<ProviderRecord[]>;
  /** Optionnel : disponibilité temps réel. Absent = la source n'en fournit pas. */
  fetchAvailability?(externalIds: string[]): Promise<Record<string, ProviderAvailability>>;
}

/** Convertit un enregistrement en signal de statut : sans mesure temps réelle, aucun signal (donc gris, « inconnu »). */
export function toStatusSignals(record: ProviderRecord): StatusSignal[] {
  if (!record.availability) return [];
  return [{
    state: record.availability.state,
    sourceType: record.meta.sourceType,
    source: record.meta.source,
    observedAt: record.availability.observedAt,
    validForMinutes: record.availability.validForMinutes,
    confidence: record.meta.reliability,
  }];
}
