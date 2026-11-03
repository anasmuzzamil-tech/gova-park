-- GOVAPARK étape 13 : vérification des propriétaires, commissions et litiges.
ALTER TABLE users ADD COLUMN ownerVerificationStatus ENUM('not_applicable','pending','verified','rejected') NOT NULL DEFAULT 'not_applicable';
CREATE TABLE ownerVerifications (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, userId BIGINT UNSIGNED NOT NULL UNIQUE, status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending', legalName VARCHAR(180) NULL, phone VARCHAR(40) NULL, adminNote TEXT NULL, submittedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewedAt TIMESTAMP NULL);
CREATE TABLE companySettings (id INT NOT NULL PRIMARY KEY, commissionBps INT NOT NULL DEFAULT 1200, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
INSERT INTO companySettings (id, commissionBps) VALUES (1,1200);
CREATE TABLE disputes (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, reservationId BIGINT UNSIGNED NOT NULL UNIQUE, openedBy BIGINT UNSIGNED NOT NULL, reason VARCHAR(1000) NOT NULL, status ENUM('open','under_review','resolved','rejected') NOT NULL DEFAULT 'open', resolution TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);

-- Reprise des propriétaires existants : ils doivent également être contrôlés.
INSERT INTO ownerVerifications (userId, status) SELECT id, 'pending' FROM users WHERE role = 'owner' ON DUPLICATE KEY UPDATE userId = VALUES(userId);
UPDATE users SET ownerVerificationStatus = 'pending' WHERE role = 'owner' AND ownerVerificationStatus = 'not_applicable';
-- Reconstituer les dossiers de litige déjà ouverts avant cette migration.
INSERT INTO disputes (reservationId, openedBy, reason, status) SELECT id, userId, 'Litige existant à examiner', 'open' FROM reservations WHERE status = 'dispute' ON DUPLICATE KEY UPDATE reservationId = VALUES(reservationId);

-- Journal des prédictions et évaluation différée par confirmations communautaires.
CREATE TABLE predictionEvaluations (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, cellKey VARCHAR(32) NOT NULL, predictedScore INT NOT NULL, predictedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, evaluateAfter TIMESTAMP NOT NULL, actualOutcome ENUM('free','occupied') NULL, observedAt TIMESTAMP NULL, sourceObservationId BIGINT UNSIGNED NULL, INDEX prediction_evaluations_cell_time_idx (cellKey, predictedAt), INDEX prediction_evaluations_due_idx (evaluateAfter, actualOutcome));
