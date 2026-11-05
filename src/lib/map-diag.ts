// Diagnostic de la carte 3D pour le panneau « i » : dernier message d'erreur, état du style, tuiles reçues, tentative. Module léger (n'importe pas MapLibre).
export const mapDiag: { lastError: string | null; tiles: number; loaded: boolean; map: { isStyleLoaded(): boolean } | null; attempt: number } = { lastError: null, tiles: 0, loaded: false, map: null, attempt: 0 };

export function getMapDiag(): { lastError: string | null; style: string; tiles: number; attempt: number } {
  let style = "carte non créée";
  try { if (mapDiag.map) style = mapDiag.loaded ? (mapDiag.map.isStyleLoaded() ? "chargé" : "chargé, tuiles en cours") : "en chargement"; } catch { style = "illisible"; }
  return { lastError: mapDiag.lastError, style, tiles: mapDiag.tiles, attempt: mapDiag.attempt };
}

/** Texte de la ligne de diagnostic. */
export function mapDiagLine(d: ReturnType<typeof getMapDiag>): string {
  return `Carte : style ${d.style} · tuiles reçues ${d.tiles} · tentative ${d.attempt + 1} · dernière erreur ${d.lastError ?? "aucune"}`;
}
