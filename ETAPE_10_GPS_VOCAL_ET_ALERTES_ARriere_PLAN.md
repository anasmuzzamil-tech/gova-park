# GOVAPARK — Étape 10 : guidage vocal et alertes système

## Ajouts dans cette version
- Les étapes OSRM sont désormais conservées avec le tracé de l'itinéraire.
- Affichage d'une liste repliable des instructions de route en français.
- Activation volontaire du guidage vocal via l'API Web Speech (`speechSynthesis`). Les consignes sont annoncées à l'approche de leur point de manœuvre (environ 280 m) lorsque la page reçoit encore les positions GPS.
- Arrêt explicite du guidage vocal et remise à zéro des consignes au calcul d'un nouvel itinéraire.
- Bouton d'activation des notifications système et ajout des gestionnaires `push` / `notificationclick` au service worker.
- Le service worker peut afficher une notification reçue du serveur même lorsque l'interface n'est pas au premier plan, si le navigateur et le système autorisent Web Push.
- Clic sur une notification : retour dans GOVAPARK à l'URL fournie par le serveur.

## Limites techniques à ne pas masquer
- Le bouton « Alertes arrière-plan » accorde la permission et prépare le service worker. Il ne crée PAS à lui seul un abonnement Web Push : le backend doit générer/stocker les abonnements, utiliser une paire de clés VAPID et envoyer les notifications depuis un serveur.
- Une PWA dans Safari/iOS ne garantit pas un suivi GPS continu écran verrouillé. Le service worker n'est pas un service de localisation permanent et ne doit pas être présenté comme tel.
- Pour une navigation fiable avec GPS en arrière-plan, il faudra une application native ou un conteneur natif iOS/Android avec permissions de localisation « toujours/en arrière-plan », justification claire, indicateur visible, politique de conservation et validation des règles Apple/Google.
- La voix navigateur peut être suspendue lorsque l'application passe en arrière-plan ou que l'appareil verrouille l'écran. Pour un guidage vocal fiable en conduite, utiliser une solution native de navigation/audio.
- Les instructions OSRM sont indicatives et le service public est un endpoint de démonstration. Avant commercialisation, choisir un fournisseur d'itinéraires avec conditions et disponibilité contractuelles.
- Le guidage doit être configuré avant le départ. Le conducteur ne doit jamais manipuler le téléphone en conduisant.

## Étapes nécessaires pour une vraie production
1. Ajouter une API backend d'enregistrement/révocation des abonnements Web Push.
2. Générer des clés VAPID et les stocker uniquement dans les secrets serveur.
3. Envoyer des push après validation serveur d'une place réellement disponible ou d'un signalement frais.
4. Dédupliquer et limiter les alertes (distance, fraîcheur, préférences, plages horaires).
5. Développer les modules natifs iOS/Android pour localisation arrière-plan, audio et notifications persistantes.
6. Tester les scénarios écran verrouillé, économie d'énergie, perte réseau, GPS imprécis, autorisations refusées et arrêt forcé.

## Sécurité et vie privée
- La plaque d'immatriculation n'est jamais utilisée comme identifiant de géolocalisation.
- Le suivi GPS doit rester explicite, visible, révocable et limité à la finalité de navigation ou de confirmation du départ.
- Ne jamais afficher une adresse personnelle ou la position d'un véhicule à partir de sa plaque.
- Les places de rue signalées restent non garanties et ne sont pas réservables.
