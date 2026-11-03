# Étape 15 — Expérience conducteur, personnalisation et services de trajet

## Éléments intégrés dans cette version

- Accueil carte avec salutation « Bonjour + prénom », accès direct à la boîte de réception et aux paramètres. Le champ de recherche devient « Où souhaitez-vous aller ? » et présente la planification d'un trajet.
- Préférences de profil enregistrées localement sur l'appareil : thème automatique/jour/sombre/veille, mode invisible (préférence d'interface), domicile, travail, humeur, type et couleur du véhicule, choix 2D/3D, boussole, trafic, Goveurs, compteur GPS, stations-service, péage et covoiturage.
- Compteur de vitesse : lit la vitesse renvoyée par le GPS du téléphone, uniquement pendant le suivi GPS actif. Le téléphone peut ne pas fournir cette valeur.
- Stations-service : recherche de stations autour de la carte via l'API publique Overpass/OpenStreetMap, si l'option est activée. Dépend de la disponibilité et des limites du service tiers.
- Alertes : sélection des catégories de sécurité et distance préférée de 5 à 200 km, par défaut sur l'itinéraire. Ces préférences sont locales ; le moteur de diffusion et les flux de données de trafic/danger ne sont pas encore raccordés.
- Rappels textuels locaux, préférences e-mail et push. Aucun fournisseur d'e-mail/push n'est configuré dans cette étape.
- Date d'anniversaire et anniversaire d'inscription : salutations annuelles locales. La date de naissance reste stockée sur l'appareil.
- Prouesses et niveaux : affichage indicatif basé sur les signalements visibles ; les points ne sont pas encore un portefeuille de points serveur et devront être calculés à partir de contributions confirmées.
- Sélection d'un service audio parmi Apple Music, Android Music, YouTube Music, Spotify, Amazon Music, Deezer, Tidal, TuneIn, TuneIn Pro, NRJ, RTL, RTL2, NPR One, Audible, Audiobooks.com, Castbox, Scribd et Fun Radio. Ce choix est un raccourci de préférence, pas un lecteur audio embarqué ni une intégration API.

## Limites techniques à connaître

- La carte actuelle utilise Leaflet/OSM en 2D. L'option 3D est affichée comme « à venir » ; elle n'active pas de rendu 3D.
- Le bouton/paramètre trafic ne dispose pas encore d'une couche trafic en direct. La boussole affichée indique le nord en haut, elle ne suit pas encore le cap du téléphone.
- Les alertes de radars et de présence policière localisée ne sont pas proposées. GOVAPARK peut intégrer des zones de danger réglementaires et des alertes de sécurité routière conformes au droit local.
- La détection de véhicule par plaque n'est pas une géolocalisation. Le type et la couleur du véhicule sont choisis par l'utilisateur ; ils ne sont pas déduits de l'immatriculation.
- Le mode invisible et les préférences sont conservés localement à ce stade. Pour les synchroniser entre appareils, il faudra une table de préférences et des règles serveur de confidentialité.
- Les rappels ne déclenchent pas encore de notification programmée lorsque l'application est fermée. Les push en arrière-plan nécessitent un service serveur, un fournisseur, des autorisations et des tests iOS/Android.
- Le guidage GPS en arrière-plan et la voix continue exigent une application native ou une intégration mobile dédiée avec consentement explicite.

## Déploiement et vérifications

1. Cette étape ne requiert pas de migration SQL supplémentaire : les nouvelles préférences sont locales au navigateur/appareil.
2. Installer les dépendances avec `npm ci`.
3. Exécuter `npm run check`, `npm run lint`, `npm test`, puis `npm run build`.
4. Tester sur iPhone et Android : thème, stockage local, autorisation GPS, vitesse GPS, affichage des stations-service et permissions de notification.
5. Avant production, remplacer les services cartographiques publics de démonstration par des fournisseurs adaptés à la charge et définir les contrats/quotas.
