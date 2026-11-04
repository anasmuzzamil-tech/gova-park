-- Recherche par zone affichee + accessibilite PMR (cree aussi automatiquement par `drizzle-kit push` au demarrage).
-- Non teste faute de base de donnees.
ALTER TABLE `listings` ADD COLUMN `accessible` BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX `listings_geo_idx` ON `listings` (`listingStatus`,`latitude`,`longitude`);
