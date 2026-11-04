import type { Bbox } from "@contracts/parking-search";
import type { ParkingCategory, ParkingProvider, ProviderRecord } from "./types";

// Les fournisseurs réellement branchés sont listés ici. Vide pour l'instant : aucune source réelle n'est encore connectée.
// Le fournisseur d'exemple (api/providers/example.ts) n'est volontairement PAS enregistré.
const providers: ParkingProvider[] = [];

export function registerProvider(provider: ParkingProvider) { providers.push(provider); }
export const listProviders = () => [...providers];

/** Interroge tous les fournisseurs d'une catégorie ; l'échec d'un fournisseur n'empêche pas les autres. */
export async function fetchCategory(category: ParkingCategory, bbox: Bbox, limit = 300): Promise<{ records: ProviderRecord[]; errors: string[] }> {
  const records: ProviderRecord[] = []; const errors: string[] = [];
  await Promise.all(providers.filter((p) => p.category === category).map(async (p) => {
    try { records.push(...(await p.fetchStatic(bbox))); } catch (e) { errors.push(`${p.id}: ${e instanceof Error ? e.message : "erreur"}`); }
  }));
  return { records: records.filter((r) => r.category === category).slice(0, limit), errors };
}
