-- Chaque signalement de place en rue porte un type de vehicule (voiture, moto, bus, velo).
-- Les anciennes lignes deviennent des voitures (valeur par defaut). Non teste faute de base de donnees (jamais execute).
ALTER TABLE `streetReports` ADD COLUMN `vehicleType` ENUM('car','moto','bus','bike') NOT NULL DEFAULT 'car' AFTER `streetStatus`;
