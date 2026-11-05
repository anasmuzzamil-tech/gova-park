import { describe, expect, it } from "vitest";
import { detectImageType, MAX_UPLOAD_BYTES, validateImageUpload } from "./lib/upload-validation";

const b64 = (bytes: number[] | Uint8Array) => Buffer.from(bytes as Uint8Array).toString("base64");
const pad = (head: number[], total = 64) => { const a = new Uint8Array(total); a.set(head); return a; };
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = pad([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const PDF = pad([0x25, 0x50, 0x44, 0x46, 0x2d]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

describe("envoi de photos : contrôle du contenu réel", () => {
  it("détecte JPEG, PNG et WebP d'après les octets", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(WEBP)).toBe("image/webp");
  });
  it("accepte les trois types et donne l'extension déduite du contenu", () => {
    const j = validateImageUpload({ contentBase64: b64(JPEG), contentType: "image/jpeg" });
    expect(j.ok && j.ext).toBe("jpg");
    const p = validateImageUpload({ contentBase64: b64(PNG), contentType: "image/png" });
    expect(p.ok && p.ext).toBe("png");
    const w = validateImageUpload({ contentBase64: b64(WEBP) });
    expect(w.ok && w.mime).toBe("image/webp");
  });
  it("refuse un fichier dont le contenu n'est pas une image acceptée, même si l'en-tête dit image/jpeg", () => {
    const r = validateImageUpload({ contentBase64: b64(HTML), contentType: "image/jpeg" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain("JPEG, PNG ou WebP");
  });
  it("refuse un PDF, même avec un en-tête image", () => {
    expect(validateImageUpload({ contentBase64: b64(PDF), contentType: "image/png" }).ok).toBe(false);
    expect(validateImageUpload({ contentBase64: b64(PDF), contentType: "application/pdf" }).ok).toBe(false);
  });
  it("refuse un en-tête déclaré hors liste blanche ou qui contredit le contenu", () => {
    expect(validateImageUpload({ contentBase64: b64(PNG), contentType: "image/gif" }).ok).toBe(false);
    const mismatch = validateImageUpload({ contentBase64: b64(PNG), contentType: "image/jpeg" });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.ok === false && mismatch.message).toContain("ne correspond pas");
  });
  it("refuse un fichier trop gros (5 Mo)", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1); big.set([0xff, 0xd8, 0xff]);
    const r = validateImageUpload({ contentBase64: b64(big), contentType: "image/jpeg" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("PAYLOAD_TOO_LARGE");
    const exact = new Uint8Array(MAX_UPLOAD_BYTES); exact.set([0xff, 0xd8, 0xff]);
    expect(validateImageUpload({ contentBase64: b64(exact), contentType: "image/jpeg" }).ok).toBe(true);
  });
  it("refuse une chaîne base64 invalide, vide ou à la longueur impossible", () => {
    for (const bad of ["", "abc", "@@@@", "/9j/ 4AAQ"]) expect(validateImageUpload({ contentBase64: bad }).ok).toBe(false);
  });
  it("refuse un fichier trop court pour être une image", () => {
    expect(validateImageUpload({ contentBase64: b64([0xff, 0xd8]) }).ok).toBe(false);
  });
});
