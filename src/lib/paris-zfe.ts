// Chargement du périmètre de la ZFE de Paris (un petit fichier généré par scripts/import-paris-zfe.mjs). Absent ou illisible : null (rien n'est dessiné).
import { safeUrl, type ZfeFile } from "@contracts/paris-zfe";

let cached: Promise<ZfeFile | null> | null = null;
export function loadZfe(): Promise<ZfeFile | null> {
  cached ??= fetch("/data/paris-zfe/zone.json", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
      const file = (await response.json()) as ZfeFile;
      return file && file.version === 1 && Array.isArray(file.ring) && file.ring.length >= 4
        ? { ...file, urlArrete: safeUrl(file.urlArrete), urlSite: safeUrl(file.urlSite) }
        : null;
    })
    .catch(() => { cached = null; return null; });
  return cached;
}
