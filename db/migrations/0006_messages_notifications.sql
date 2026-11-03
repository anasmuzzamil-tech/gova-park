CREATE TABLE `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `body` VARCHAR(500) NOT NULL,
  `kind` VARCHAR(40) NOT NULL DEFAULT 'message',
  `reservationId` BIGINT UNSIGNED NULL,
  `readAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `notifications_user_created_idx` (`userId`, `createdAt`),
  INDEX `notifications_user_read_idx` (`userId`, `readAt`)
);

CREATE TABLE `messages` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `reservationId` BIGINT UNSIGNED NOT NULL,
  `senderId` BIGINT UNSIGNED NOT NULL,
  `recipientId` BIGINT UNSIGNED NOT NULL,
  `body` VARCHAR(2000) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `messages_reservation_created_idx` (`reservationId`, `createdAt`),
  INDEX `messages_recipient_idx` (`recipientId`)
);
