-- Places gratuites en rue signalées par la communauté (cree aussi automatiquement par `drizzle-kit push` au demarrage).
-- Non teste faute de base de donnees.
CREATE TABLE IF NOT EXISTS `streetReports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `streetStatus` ENUM('free','taken') NOT NULL,
  `userId` BIGINT UNSIGNED NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` TIMESTAMP NOT NULL,
  `reliability` INT NOT NULL DEFAULT 50,
  PRIMARY KEY (`id`),
  KEY `street_reports_geo_idx` (`latitude`,`longitude`),
  KEY `street_reports_created_idx` (`createdAt`),
  KEY `street_reports_user_idx` (`userId`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
