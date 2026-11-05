// Contrôle des fichiers envoyés (photos d'annonces) : liste blanche stricte de types, vérifiée sur les
// OCTETS réels du fichier (signature « magic bytes »), pas sur l'en-tête déclaré ni sur l'extension.
// Le nom de fichier fourni par le client n'est jamais utilisé pour construire la clé de stockage.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 Mo
// Taille maximale de la chaîne base64 correspondante (4 octets de texte pour 3 octets de fichier, + marge de remplissage).
export const MAX_UPLOAD_BASE64_CHARS = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4;

export const ALLOWED_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export type UploadCheck =
  | { ok: true; bytes: Uint8Array; mime: AllowedImageType; ext: string }
  | { ok: false; code: "BAD_REQUEST" | "PAYLOAD_TOO_LARGE"; message: string };

const MSG_FORMAT = "Format de fichier non accepté : envoyez une photo JPEG, PNG ou WebP.";

// Type réel d'après les premiers octets, ou null si ce n'est pas une des images acceptées.
export function detectImageType(b: Uint8Array): AllowedImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  // WebP : « RIFF » + taille (4 octets) + « WEBP »
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export function validateImageUpload(input: { contentBase64: string; contentType?: string | null }): UploadCheck {
  const text = input.contentBase64;
  if (text.length > MAX_UPLOAD_BASE64_CHARS) return { ok: false, code: "PAYLOAD_TOO_LARGE", message: "Photo trop volumineuse : 5 Mo maximum." };
  if (text.length === 0 || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return { ok: false, code: "BAD_REQUEST", message: "Fichier illisible : envoi corrompu, réessayez." };
  const bytes = new Uint8Array(Buffer.from(text, "base64"));
  if (bytes.byteLength === 0) return { ok: false, code: "BAD_REQUEST", message: "Fichier vide." };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, code: "PAYLOAD_TOO_LARGE", message: "Photo trop volumineuse : 5 Mo maximum." };
  const detected = detectImageType(bytes);
  if (!detected) return { ok: false, code: "BAD_REQUEST", message: MSG_FORMAT };
  // Un en-tête déclaré, s'il existe, doit être dans la liste blanche ET correspondre au contenu réel.
  const declared = (input.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (declared && declared !== detected) {
    return { ok: false, code: "BAD_REQUEST", message: declared in ALLOWED_IMAGE_TYPES ? "Le contenu du fichier ne correspond pas à son type déclaré." : MSG_FORMAT };
  }
  return { ok: true, bytes, mime: detected, ext: ALLOWED_IMAGE_TYPES[detected] };
}
