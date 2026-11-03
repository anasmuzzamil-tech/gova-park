# Étape 8 — Carte réelle, géolocalisation et disponibilité

## Ce qui est intégré

- Remplacement du fond schématique par une vraie carte OpenStreetMap avec attribution visible.
- Géolocalisation du navigateur via `watchPosition` : la position du véhicule est actualisée pendant que la page reste active.
- Recentrage doux de la carte lorsque le véhicule a parcouru environ 50 mètres.
- Bouton GPS pour démarrer ou arrêter explicitement le suivi.
- Marqueurs des parkings GOVAPARK : vert si l'annonce est ouverte, non bloquée et sans réservation active sur l'heure à venir ; rouge sinon.
- Les demandes de paiement encore valides bloquent également le créneau affiché.
- Les signalements de rue restent séparés : vert = place signalée libre, rouge = place signalée occupée, orange = départ annoncé. Ils sont rafraîchis toutes les 30 secondes et leur détail affiche l'heure de mise à jour et le niveau de confiance.

## Limites importantes

- La carte ne détecte pas magiquement les places publiques libres. Les places de rue sont des déclarations communautaires, pas des capteurs officiels. Il faut afficher leur fraîcheur et leur confiance et ne jamais les présenter comme garanties.
- Le statut d'une annonce privée est calculé à partir des horaires, périodes bloquées et réservations enregistrées. Il est indicatif et peut changer entre l'affichage et la réservation ; le serveur revalide toujours le créneau lors de la réservation.
- Le suivi GPS nécessite l'autorisation de l'utilisateur et un site servi en HTTPS. Les navigateurs mobiles peuvent suspendre la géolocalisation en arrière-plan ou lorsque l'écran est verrouillé. Ce n'est pas encore un GPS de navigation avec guidage vocal.
- Les tuiles OpenStreetMap sont utilisées pour le développement et les premiers essais avec attribution. Avant un trafic commercial important, choisir un fournisseur de tuiles adapté ou une infrastructure cartographique propre et respecter sa politique d'utilisation.

## À faire avant le lancement

1. Tester sur iPhone Safari et Android Chrome en HTTPS, en mouvement réel et avec autorisation refusée/accordée.
2. Vérifier la fraîcheur des signalements, les faux signalements et les abus.
3. Mettre en place une source de données officielle ou un partenariat local si GOVAPARK veut annoncer automatiquement des places publiques libres.
4. Ajouter un vrai moteur d'itinéraire routier et les consignes de sécurité : aucune interaction avec l'application pendant la conduite.
5. Effectuer la compilation complète et les tests avec les dépendances du projet installées.
