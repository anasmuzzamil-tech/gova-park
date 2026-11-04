-- Compteur de stationnement (cree aussi automatiquement par `drizzle-kit push` au demarrage).
CREATE TABLE IF NOT EXISTS `parkingSessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `label` VARCHAR(160) NOT NULL,
  `address` VARCHAR(255) NULL,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `hourlyCents` INT NULL,
  `startedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `endedAt` TIMESTAMP NULL,
  `totalCents` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `parking_sessions_user_idx` (`userId`,`endedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
