// Lecteur Shapefile minimal, sans dépendance : SHP (polygones, type 5) + DBF (dBase III), Node 22.
// Le DBF est lu PAR POSITION : un Shapefile tronque les noms de colonnes à 10 caractères, donc deux colonnes peuvent porter le même nom (cas du jeu des zones tarifaires de Paris).
import fs from "node:fs";

/** Colonnes d'un DBF dans l'ordre du fichier : [{ index, name, type, length, decimals }]. Nombre d'enregistrements, longueur d'en-tête et d'enregistrement inclus. */
export function readDbf(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 33) throw new Error("DBF trop court.");
  const count = buf.readUInt32LE(4), headerLength = buf.readUInt16LE(8), recordLength = buf.readUInt16LE(10);
  const fields = [];
  for (let p = 32; p + 32 <= headerLength && buf[p] !== 0x0d; p += 32) {
    const raw = buf.subarray(p, p + 11); const end = raw.indexOf(0);
    fields.push({ index: fields.length, name: raw.subarray(0, end < 0 ? 11 : end).toString("latin1"), type: String.fromCharCode(buf[p + 11]), length: buf[p + 16], decimals: buf[p + 17] });
  }
  if (fields.reduce((a, f) => a + f.length, 1) !== recordLength) throw new Error("DBF incohérent : somme des largeurs de colonnes différente de la longueur d'enregistrement.");
  const rows = [];
  for (let r = 0; r < count; r++) {
    let p = headerLength + r * recordLength;
    if (p + recordLength > buf.length) throw new Error("DBF tronqué.");
    const deleted = buf[p] === 0x2a; p += 1;
    const values = fields.map((f) => {
      const text = buf.subarray(p, p + f.length).toString("utf8").trim(); p += f.length;
      if (f.type === "N" || f.type === "F") { if (text === "") return null; const n = Number(text); return Number.isFinite(n) ? n : null; }
      return text;
    });
    if (!deleted) rows.push(values);
  }
  return { fields, rows };
}

/** Polygones d'un SHP (type 5, ou 15/25 avec Z/M ignorés) : un tableau par enregistrement de { parts: [anneau, ...] }, anneau = [[x, y], ...]. Autres types : erreur. */
export function readShpPolygons(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 100 || buf.readInt32BE(0) !== 9994) throw new Error("Ce n'est pas un fichier SHP (code 9994 attendu).");
  const fileType = buf.readInt32LE(32);
  if (![5, 15, 25].includes(fileType)) throw new Error(`Type de forme ${fileType} non pris en charge (polygones seulement).`);
  const out = [];
  let p = 100;
  while (p + 8 <= buf.length) {
    const lengthBytes = buf.readInt32BE(p + 4) * 2; const start = p + 8;
    if (start + lengthBytes > buf.length) throw new Error("SHP tronqué.");
    const type = buf.readInt32LE(start);
    if (type === 0) out.push({ parts: [] });
    else {
      if (type !== fileType) throw new Error(`Enregistrement de type ${type} dans un fichier de type ${fileType}.`);
      const nParts = buf.readInt32LE(start + 36), nPoints = buf.readInt32LE(start + 40);
      const partsAt = start + 44, pointsAt = partsAt + 4 * nParts;
      const starts = []; for (let i = 0; i < nParts; i++) starts.push(buf.readInt32LE(partsAt + 4 * i));
      const parts = [];
      for (let i = 0; i < nParts; i++) {
        const a = starts[i], b = i + 1 < nParts ? starts[i + 1] : nPoints; const ring = [];
        for (let k = a; k < b; k++) ring.push([buf.readDoubleLE(pointsAt + 16 * k), buf.readDoubleLE(pointsAt + 16 * k + 8)]);
        parts.push(ring);
      }
      out.push({ parts });
    }
    p = start + lengthBytes;
  }
  return out;
}

/** Lit <base>.shp + <base>.dbf (+ .prj renvoyé tel quel) : [{ parts, values }] avec values = valeurs du DBF dans l'ordre des colonnes. */
export function readShapefile(base) {
  const shapes = readShpPolygons(fs.readFileSync(`${base}.shp`));
  const dbf = readDbf(fs.readFileSync(`${base}.dbf`));
  if (shapes.length !== dbf.rows.length) throw new Error(`SHP (${shapes.length}) et DBF (${dbf.rows.length}) n'ont pas le même nombre d'enregistrements.`);
  const prj = fs.existsSync(`${base}.prj`) ? fs.readFileSync(`${base}.prj`, "utf8") : null;
  return { fields: dbf.fields, prj, records: shapes.map((s, i) => ({ parts: s.parts, values: dbf.rows[i] })) };
}
