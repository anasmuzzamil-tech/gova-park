-- Appareils mobiles inscrits aux notifications push GOVAPARK.
CREATE TABLE IF NOT EXISTS `pushDevices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `token` VARCHAR(512) NOT NULL,
  `platform` ENUM('ios','android') NOT NULL,
  `deviceId` VARCHAR(160) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `lastSeenAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pushDevices_token_unique` (`token`),
  KEY `push_devices_user_active_idx` (`userId`,`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
