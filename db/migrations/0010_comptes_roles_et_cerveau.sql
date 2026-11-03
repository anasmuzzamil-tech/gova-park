-- Comptes locaux e-mail/mot de passe et apprentissage des tendances de stationnement.
ALTER TABLE users MODIFY COLUMN role ENUM('user','owner','admin') NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN passwordHash VARCHAR(255) NULL;
CREATE UNIQUE INDEX users_email_unique ON users(email);
CREATE TABLE parkingObservations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cellKey VARCHAR(32) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  kind ENUM('free_confirmed','occupied_confirmed','departure','contradiction') NOT NULL,
  weekday INT NOT NULL,
  hour INT NOT NULL,
  reportId BIGINT UNSIGNED NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX parking_observations_cell_time_idx (cellKey, weekday, hour),
  INDEX parking_observations_created_idx (createdAt)
);
-- Pour activer l'espace société, attribuer role='admin' manuellement à un compte
-- créé au préalable. Ne jamais exposer cette opération dans l'inscription publique.
