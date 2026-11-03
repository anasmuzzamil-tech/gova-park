import "dotenv/config";
import { randomBytes } from "node:crypto";

// Sur Render, aucune variable n'est obligatoire pour DEMARRER : le site s'affiche toujours.
// Sans DATABASE_URL, seules les fonctions qui ont besoin de la base (comptes, places) répondent une erreur.
const isProduction = process.env.NODE_ENV === "production";

let appSecret = process.env.APP_SECRET ?? "";
if (!appSecret) {
  appSecret = randomBytes(32).toString("hex");
  if (isProduction) console.warn("[env] APP_SECRET absent : secret temporaire généré (les connexions sautent à chaque redémarrage).");
}

export const env = {
  appId: process.env.APP_ID ?? "govapark",
  appSecret,
  isProduction,
  databaseUrl: process.env.DATABASE_URL ?? "",
  kimiAuthUrl: process.env.KIMI_AUTH_URL ?? "",
  kimiOpenUrl: process.env.KIMI_OPEN_URL ?? "",
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
};
