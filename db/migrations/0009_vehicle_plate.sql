-- GOVAPARK étape 9 : plaque facultative liée à une réservation privée.
-- À exécuter sur une base sauvegardée après validation en environnement de développement.
ALTER TABLE reservations ADD COLUMN vehiclePlate VARCHAR(12) NULL;
