import { describe, expect, it } from "vitest";
import { normalizeIp, parseTrustedHops, resolveClientIp } from "./lib/client-ip";

describe("adresse IP du client (limitation de débit)", () => {
  it("ignore une valeur inventée par le client à gauche de X-Forwarded-For", () => {
    // Le client envoie « 1.2.3.4 » ; le proxy de confiance ajoute l'adresse qu'il a réellement vue.
    expect(resolveClientIp({ forwardedFor: "1.2.3.4, 203.0.113.9", socketIp: "10.0.0.1", trustedHops: 1 })).toBe("203.0.113.9");
  });
  it("changer l'en-tête envoyé par le client ne change pas l'adresse retenue", () => {
    const a = resolveClientIp({ forwardedFor: "9.9.9.9, 203.0.113.9", socketIp: "10.0.0.1", trustedHops: 1 });
    const b = resolveClientIp({ forwardedFor: "8.8.8.8, 7.7.7.7, 203.0.113.9", socketIp: "10.0.0.1", trustedHops: 1 });
    expect(a).toBe(b);
  });
  it("avec deux proxys de confiance, prend l'entrée située deux places avant la fin", () => {
    expect(resolveClientIp({ forwardedFor: "6.6.6.6, 203.0.113.9, 172.70.0.1", socketIp: "10.0.0.1", trustedHops: 2 })).toBe("203.0.113.9");
  });
  it("liste plus courte que prévu : retombe sur le socket, jamais sur le client", () => {
    expect(resolveClientIp({ forwardedFor: "1.2.3.4", socketIp: "10.0.0.1", trustedHops: 2 })).toBe("10.0.0.1");
  });
  it("entrée qui n'a pas la forme d'une IP : retombe sur le socket", () => {
    expect(resolveClientIp({ forwardedFor: "x, <script>", socketIp: "10.0.0.1", trustedHops: 1 })).toBe("10.0.0.1");
    expect(resolveClientIp({ forwardedFor: "1.2.3.4,", socketIp: "10.0.0.1", trustedHops: 1 })).toBe("10.0.0.1");
  });
  it("0 saut : l'en-tête est ignoré, on utilise le socket", () => {
    expect(resolveClientIp({ forwardedFor: "1.2.3.4", socketIp: "198.51.100.7", trustedHops: 0 })).toBe("198.51.100.7");
  });
  it("sans en-tête ni socket : « inconnu »", () => {
    expect(resolveClientIp({ forwardedFor: null, socketIp: undefined, trustedHops: 1 })).toBe("inconnu");
  });
  it("normalise IPv4 écrite en IPv6 et accepte IPv6", () => {
    expect(normalizeIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(normalizeIp("abc")).toBeNull();
    expect(normalizeIp("")).toBeNull();
  });
  it("TRUSTED_PROXY_HOPS : défaut selon l'environnement, valeurs invalides refusées", () => {
    expect(parseTrustedHops(undefined, true)).toBe(1);
    expect(parseTrustedHops(undefined, false)).toBe(0);
    expect(parseTrustedHops("2", true)).toBe(2);
    expect(parseTrustedHops("0", true)).toBe(0);
    expect(parseTrustedHops("-1", true)).toBe(1);
    expect(parseTrustedHops("abc", true)).toBe(1);
    expect(parseTrustedHops("99", true)).toBe(1);
  });
});
