// Adresse IP du client pour la limitation de débit.
//
// Règle : on ne lit JAMAIS l'adresse que le client fournit lui-même. L'en-tête
// X-Forwarded-For est une liste « client, proxy1, proxy2… » où chaque proxy AJOUTE
// à droite l'adresse de celui qui lui a parlé ; tout ce qui est à gauche peut avoir été
// inventé par le client. On ne fait donc confiance qu'aux `trustedHops` dernières entrées
// (celles ajoutées par nos propres proxys) : l'adresse du client est l'entrée située
// `trustedHops` places avant la fin. Si la liste est plus courte que prévu, ou si l'entrée
// n'a pas la forme d'une adresse IP, on retombe sur l'adresse du socket (jamais sur une valeur du client).

const IP_SHAPE = /^[0-9a-fA-F:.]{2,45}$/;

export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.toLowerCase().startsWith("::ffff:") && ip.includes(".")) ip = ip.slice(7); // IPv4 écrite en IPv6
  if (!IP_SHAPE.test(ip)) return null;
  if (!ip.includes(".") && !ip.includes(":")) return null;
  return ip.toLowerCase();
}

// Nombre de proxys de confiance devant l'application. Variable TRUSTED_PROXY_HOPS (0 à 5).
// Défaut : 1 en production (un proxy ajoute l'adresse qu'il voit), 0 sinon (socket direct).
export function parseTrustedHops(raw: string | undefined, isProduction: boolean): number {
  const fallback = isProduction ? 1 : 0;
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : fallback;
}

export function resolveClientIp(opts: { forwardedFor?: string | null; socketIp?: string | null; trustedHops: number }): string {
  const socket = normalizeIp(opts.socketIp);
  if (opts.trustedHops > 0 && opts.forwardedFor) {
    const entries = opts.forwardedFor.split(",").map((part) => part.trim());
    if (entries.length >= opts.trustedHops) {
      const candidate = normalizeIp(entries[entries.length - opts.trustedHops]);
      if (candidate) return candidate;
    }
  }
  return socket ?? "inconnu";
}
