# GOVAPARK — Étape 6 : expérience mobile et PWA

## Ajouts réalisés
- Manifeste PWA pour proposer l'installation de GOVAPARK sur les appareils compatibles.
- Métadonnées Apple pour l'ajout à l'écran d'accueil sur iPhone/iPad.
- Icônes SVG GOVAPARK en formats 192 et 512.
- Service worker avec cache limité aux ressources statiques de l'application.
- Page hors connexion expliquant que recherche, disponibilité et réservation nécessitent le réseau.
- Les requêtes API, tRPC, authentification et données privées ne sont jamais mises en cache.

## Limites connues
- Cette PWA n'est pas une application native publiée sur l'App Store ou Google Play.
- Les notifications push ne sont pas activées : elles nécessitent un service serveur, des clés VAPID et une gestion du consentement.
- Les paiements et reversements réels nécessitent encore la configuration d'un compte Stripe Connect et les vérifications contractuelles/KYC.
- Le cache hors ligne ne permet pas de réserver ni de consulter des données privées sans réseau.

## Installation en production
1. Déployer le site en HTTPS.
2. Sur Android/Chrome : menu du navigateur > Installer l'application.
3. Sur iPhone/Safari : bouton Partager > Sur l'écran d'accueil.
4. Vérifier que `/manifest.webmanifest`, `/sw.js` et `/offline.html` répondent en HTTPS.

## Vérifications techniques
Lancer `npm ci`, puis `npm run test`, `npm run check`, `npm run lint` et `npm run build`.
