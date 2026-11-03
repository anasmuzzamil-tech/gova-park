# GOVAPARK — Étape 16 : socle mobile natif iOS et Android

## Objectif
Embarquer l'application web GOVAPARK existante dans un conteneur natif Capacitor, conserver les trois espaces (conducteur, propriétaire, société) et préparer les capacités natives : autorisations GPS, notifications push, liens profonds, barre d'état et écran de lancement.

## Inclus dans le dépôt
- `capacitor.config.ts` : identifiant `fr.govapark.app`, nom et plugins natifs.
- Dépendances Capacitor iOS/Android et plugins App, Geolocation, Push Notifications, Local Notifications, Status Bar et Splash Screen.
- `src/lib/native-lifecycle.ts` : initialisation native et gestion contrôlée des liens profonds.
- `src/components/NativePushControl.tsx` : demande explicite d'autorisation push et GPS depuis les paramètres du compte.
- `pushDevices` et migration SQL `0013_appareils_notifications_push.sql` : association d'un token push au compte authentifié et désactivation du token.

## Installation développeur
1. Installer Node.js LTS et Android Studio sur PC. Pour iOS, un Mac avec Xcode est obligatoire pour compiler et signer l'application iPhone.
2. Depuis le dossier `GOVAPARK` : `npm install`.
3. Exécuter la migration `db/migrations/0013_appareils_notifications_push.sql` sur la base après sauvegarde.
4. Ajouter les plateformes : `npx cap add android` puis, sur Mac, `npx cap add ios`.
5. Construire le front : `npm run build`. Vérifier que le dossier de sortie `dist/public` est bien généré par la configuration Vite.
6. Synchroniser : `npx cap sync`. Ouvrir ensuite `npx cap open android` ou `npx cap open ios`.
7. Configurer les certificats de signature, les identifiants Apple/Google et les fichiers de configuration push du fournisseur avant les tests sur appareils réels.

## Notifications : limite importante
Le token de l'appareil peut être enregistré dans la base. Cela ne signifie pas que les notifications distantes sont déjà envoyées : il faut encore configurer APNs (Apple) et Firebase Cloud Messaging (Android), créer un service serveur d'envoi, traiter les retours d'erreur et tester les notifications sur appareils réels. Les clés privées restent exclusivement côté serveur.

## GPS et sécurité
Le bouton GPS demande une autorisation explicite et vérifie qu'une position peut être obtenue. Le suivi GPS permanent en arrière-plan n'est volontairement pas activé : il exige une justification produit, une déclaration de confidentialité, les autorisations iOS/Android adaptées, un service natif dédié et des tests de consommation batterie. Aucun suivi n'est lancé au démarrage.

## À faire avant publication
- Vérifier les chemins de sortie Vite et l'URL HTTPS de production.
- Générer les projets natifs iOS/Android avec Capacitor puis contrôler les manifestes et permissions.
- Ajouter APNs/FCM et un worker d'envoi push, avec désinscription et rotation des tokens.
- Mettre en place les rappels locaux avec gestion des fuseaux horaires et annulation.
- Réaliser tests physiques, accessibilité, sécurité, politique de confidentialité, conformité RGPD et procédures App Store / Play Store.
- Tester authentification, cookies de session, déconnexion, liens profonds et reprise après fermeture.

## État de validation
Les sources et la migration sont livrées. Les dossiers natifs générés par `cap add`, la signature, APNs/FCM et les tests sur iPhone/Android ne sont pas inclus et ne sont pas déclarés comme validés. Le build complet reste à exécuter après installation des dépendances.
