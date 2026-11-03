GOVAPARK — VERSION COMPLETE ETAPE 10

Cette version reprend le projet complet de l'étape 9 et ajoute :
- consignes d'itinéraire OSRM conservées et consultables ;
- guidage vocal navigateur en français, après activation volontaire ;
- activation de la permission des notifications et gestion des notifications push dans le service worker ;
- ouverture de GOVAPARK au clic sur une notification ;
- documentation des limites iOS/Android et des travaux requis pour un vrai suivi GPS en arrière-plan.

INSTALLATION
1. Décompresser le ZIP.
2. Ouvrir le dossier GOVAPARK dans VS Code.
3. Installer les dépendances avec npm install.
4. Configurer les variables d'environnement à partir de .env.example.
5. Exécuter npm run check puis npm run build.
6. Déployer en HTTPS pour les fonctions GPS, service worker et notifications.

IMPORTANT
Le guidage vocal navigateur fonctionne lorsque la page est active et reçoit des positions GPS. Une PWA ne garantit pas le GPS continu lorsque l'écran est verrouillé. Les notifications push en arrière-plan nécessitent encore un backend Web Push avec clés VAPID et enregistrement des abonnements. Pour la navigation GPS et audio fiable écran verrouillé, prévoir des modules natifs iOS/Android et les autorisations correspondantes.
La plaque d'immatriculation ne sert jamais à localiser un véhicule.
