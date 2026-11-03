# GOVAPARK — Étape 17 : itinéraires intelligents et services routiers

## Fonctionnalités ajoutées
- Jusqu'à trois itinéraires alternatifs OSRM : le plus rapide, le plus court et meilleur compromis temps/distance.
- Sélection manuelle d'une alternative et dessin de son tracé sur la carte.
- Recherche de bornes électriques, aires de repos/service, parkings, restaurants, stations-service et espaces poids lourds référencés dans OpenStreetMap via Overpass.
- Prix des carburants français depuis l'API Explore du ministère de l'Économie : gazole, E10, SP95, SP98, E85. Le prix et sa date de mise à jour sont affichés lorsqu'ils existent.
- Estimation indicative du coût de carburant par itinéraire selon le carburant choisi et la consommation déclarée. Le coût ne comprend pas les péages, l'usure, ni le trafic.
- Intégration du plugin natif `@capacitor-community/background-geolocation` pour démarrer/arrêter le suivi GPS en arrière-plan après consentement explicite.

## Sources et limites
- OSRM public : calcul routier de démonstration, sans garantie de disponibilité/SLA. Pour production commerciale, héberger un moteur ou souscrire un fournisseur routier adapté.
- OpenStreetMap / Overpass : données contributives, exhaustivité et fraîcheur variables ; attribution OSM nécessaire.
- Prix carburants : flux officiel du ministère, mis à jour environ toutes les 10 minutes. Les stations disponibles près du milieu du trajet servent à identifier un prix bas de référence ; ce n'est pas une garantie de prix au moment du passage.
- Les points poids lourds sont reconnus à partir des tags cartographiques (HGV, parkings, aires, stations). Il n'existe pas encore de garantie d'accès camion, de disponibilité, de restauration ouverte ou de prix gazole professionnel.
- Le routage actuel reste automobile OSRM : il ne respecte pas encore les restrictions poids lourds (hauteur, poids, ADR, interdictions). Ne pas utiliser pour guider un poids lourd sans moteur de routage poids lourds dédié.
- Le tarif de recharge électrique et la disponibilité réelle des bornes ne sont pas garantis par OpenStreetMap ; intégration Open Charge Map / opérateurs à venir.

## Configuration native obligatoire
### iOS — Info.plist / Xcode
Ajouter les descriptions d’usage adaptées à l’application et activer le mode Background Modes > Location updates :
- `NSLocationWhenInUseUsageDescription` : « GOVAPARK utilise votre position pour calculer et afficher votre trajet. »
- `NSLocationAlwaysAndWhenInUseUsageDescription` : « Si vous l’activez, GOVAPARK continue le guidage pendant que l’application est en arrière-plan. »
- `UIBackgroundModes` avec `location`.

### Android — AndroidManifest.xml
Vérifier les permissions de localisation précise et arrière-plan nécessaires à la version Android ciblée (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`) ainsi que `FOREGROUND_SERVICE` et `FOREGROUND_SERVICE_LOCATION` selon le niveau d’API. La notification persistante doit rester visible pendant le suivi. Ne demander l’autorisation arrière-plan qu’après explication et action du conducteur.

## GPS natif arrière-plan
- Le conducteur doit confirmer le consentement avant activation. Le plugin communautaire Capacitor Background Geolocation est ajouté au manifeste des dépendances (version 1.2.25, compatible Capacitor 7).
- Android affiche une notification persistante pendant le suivi.
- Le module ne transmet ni n'enregistre les coordonnées sur le serveur ; callback local uniquement.
- Configuration iOS obligatoire : `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes` contenant `location`.
- Configuration Android et tests appareils réels nécessaires ; `android.useLegacyBridge` activé dans Capacitor.
- Vérifier la conformité RGPD, la politique de confidentialité, l'impact batterie et les règles App Store / Play Store avant diffusion.

## Préparation
1. `npm install`
2. `npx cap sync`
3. `npx cap add ios` sur Mac puis configurer Info.plist et Background Modes dans Xcode.
4. `npx cap add android`, vérifier les permissions localisation et notifications dans AndroidManifest.xml.
5. Tester sur appareils réels avec autorisation « toujours » / « autoriser en arrière-plan ».

## État
Code d'intégration ajouté, mais non compilé ni testé sur appareils physiques dans cet environnement. Notifications push distantes : l'enregistrement du token existe, l'envoi serveur APNs/FCM reste à configurer. La synchronisation cloud des préférences reste à développer.
