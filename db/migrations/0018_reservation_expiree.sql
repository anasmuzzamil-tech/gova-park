-- Statut « expired » pour les reservations en attente de paiement dont l'heure limite (15 min) est passee.
-- Elargissement de l'enum seulement : aucune donnee supprimee ni modifiee. En production le schema est applique par
-- `drizzle-kit push` au demarrage (server.js) a partir de db/schema.ts. Non teste faute de base de donnees (jamais execute).
ALTER TABLE `reservations` MODIFY COLUMN `reservationStatus` ENUM('pending','payment_pending','confirmed','in_progress','completed','cancelled','refund_pending','refunded','dispute','expired') NOT NULL;
