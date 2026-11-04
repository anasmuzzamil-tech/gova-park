// Détection WebGL tolérante (iPhone Safari compris) : WebGL2 puis WebGL1, sans refuser les GPU « lents »
// (failIfMajorPerformanceCaveat désactivé). Le contexte de test est libéré tout de suite
// pour ne pas consommer l'un des rares contextes WebGL autorisés par Safari.
export function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  const attempts: Array<[string, WebGLContextAttributes]> = [
    ["webgl2", { failIfMajorPerformanceCaveat: false }],
    ["webgl", { failIfMajorPerformanceCaveat: false }],
    ["experimental-webgl", { failIfMajorPerformanceCaveat: false }],
  ];
  for (const [name, attributes] of attempts) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext(name, attributes) as WebGLRenderingContext | null;
      if (gl && typeof gl.getParameter === "function") {
        try { gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* sans importance */ }
        return true;
      }
    } catch { /* on essaie le contexte suivant */ }
  }
  return false;
}

// Import dynamique avec nouvel essai automatique (réseau mobile instable, ancien déploiement en cache).
export async function importWithRetry<T>(load: () => Promise<T>, tries = 3, delayMs = 1200): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await load(); } catch (error) {
      lastError = error;
      if (i < tries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw lastError;
}
