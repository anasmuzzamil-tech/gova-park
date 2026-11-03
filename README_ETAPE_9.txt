GOVAPARK — VERSION COMPLETE ETAPE 9

Nouveautes :
- Itineraire routier dessine sur la carte.
- Places privees disponibles reperees a moins de 900 m du trajet.
- Boutons Itineraire et Reserver directement depuis le marqueur.
- Alertes de places a moins de 800 m apres autorisation explicite.
- Plaque facultative associee a la reservation privee.
- Detection volontaire du depart via le GPS du telephone du declarant ; deux positions fiables a au moins 120 m changent le statut en place potentiellement libre pour 15 minutes.

IMPORTANT : une plaque d'immatriculation ne permet PAS de geolocaliser une voiture. Aucun suivi a partir de la plaque n'est implemente. Le suivi GPS exige le consentement de l'auteur du signalement. Les navigateurs peuvent suspendre le GPS en arriere-plan.

MIGRATION BASE DE DONNEES :
ALTER TABLE reservations ADD COLUMN vehiclePlate VARCHAR(12) NULL;
Voir db/migrations/0009_vehicle_plate.sql.

LIMITES : OSRM public est un service de demonstration ; utiliser un fournisseur contractuel avant lancement. Les alertes navigateur exigent autorisation et page active. Compilation complete et tests d'integration a executer avec npm ci et une base de test.
