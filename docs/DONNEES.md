# Sources de données de stationnement (GOVAPARK)

Principe : **aucune disponibilité n'est inventée**. Sans donnée temps réel valide, la place est grise (« Disponibilité inconnue ») et seules les informations statiques sont affichées.

## Ce qui est branché aujourd'hui
| Donnée | Source | Fiabilité | Validité |
|---|---|---|---|
| Places privées (annonces) | Propriétaire, annonce validée par GOVAPARK | élevée | Statut recalculé à chaque requête : calendrier du propriétaire (heure de Paris) + réservations GOVAPARK |
| Signalements d'utilisateurs (ancien « Signaler ») | Communauté (compte requis) | moyenne/faible (0-100, votes) | Libre : 15 min · occupé : 30 min · départ annoncé : jusqu'à 10 min après l'heure estimée |
| **Places en rue** (couche « Places en rue », un type de véhicule par signalement : voiture, moto, livraison, vélo ; table `streetReports.vehicleType`, migration 0017 jamais exécutée) | Communauté uniquement (compte requis ; visiteur démo en démo) : aucune source ouverte ne donne l'occupation par place en rue | 10 à 95 % (concordance d'utilisateurs distincts) | Libre : vert 5 min, orange jusqu'à 10 min, puis disparaît · prise : rouge 10 min puis disparaît |

Règles de couleur (`contracts/parking-status.ts`, testées dans `api/parking-status.test.ts`) :
- **Vert** : libre confirmé par une source fiable (exploitant, capteur, propriétaire, open data temps réel).
- **Rouge** : occupé confirmé (source fiable, ou signalement confirmé par au moins 2 utilisateurs avec fiabilité ≥ 70).
- **Orange** : signalement récent non confirmé, départ annoncé, estimation. Pour les places privées, parkings et l'ancien « Signaler », un signalement d'utilisateur ne donne **jamais** du vert.

### Emplacements de voirie de Paris (gris, statut inconnu)
Source : « Stationnement sur voie publique - emplacements », Ville de Paris, licence **ODbL** (https://www.data.gouv.fr/datasets/stationnement-sur-voie-publique-emplacements). Points de types payant, rotatif, mixte, livraison, car, vélo, deux-roues motorisés. Les données changent vite, sans garantie d'exhaustivité. Aucune disponibilité : seuls les signalements d'utilisateurs colorent un emplacement (à moins de 15 m). Mention de la source et de la licence affichée sur la carte. Import : `scripts/import-paris-spots.mjs` (fichiers statiques `public/data/paris/`, à générer et à committer après contrôle avec `--inspect` ; non encore fait). Logique : `contracts/paris-spots.ts`, tests `api/paris-spots.test.ts`.

### Emprises de stationnement de Paris (contours en pointillés, zoom rue)
Source : « Stationnement sur voie publique - emprises », Ville de Paris, licence **ODbL** (https://www.data.gouv.fr/datasets/stationnement-sur-voie-publique-emprises : adresse non revérifiée en ligne depuis cet environnement). Même relevé (31/10/2026) et mêmes 65 811 lignes que les emplacements, avec le contour de chaque zone (`geo_shape`, Polygon ou MultiPolygon). **Les lignes ne sont pas dans le même ordre que le CSV des emplacements et « Nouvel identifiant » n'est pas unique** : le lien se fait par la position (`geo_point_2d` arrondi au 1e-5 degré), vérifié : 65 800 clés composites communes sur 65 811 lignes, écart de position médian sous 0,0001 m.
- Import : `scripts/import-paris-polygons.mjs <csv>` (`--inspect` pour contrôler sans écrire). Le CSV (37 Mo) n'est jamais versionné.
- Filtre : un type de véhicule relié au régime (`contracts/vehicle-types.ts` via `interpretRegime`, jamais deviné) : 54 927 emprises = voiture 23 967 (PAYANT MIXTE, PAYANT ROTATIF, GRATUIT), moto 6 080 (« 2 ROUES | Motos payant Mixte » 5 140 / 35 940 places, « Motos payant Rotatif » 940 / 7 157), livraison 9 291 (« ZL permanente » 3 698, « ZL périodique » 5 593 ; toutes « Longitudinal », sans mobilier ; 164 lignes ont des plages horaires, non lues ni affichées), vélo 15 589 (Vélos 15 267, Vélo-cargo 285, Box à vélos 37). Exclus : stations Vélib' (« LOCATION | Vélib' » 1 523 lignes, type de mobilier Bornette 2R 1 485 / Bornette VL 28 / Autre 10 ; retirées aussi des emplacements, `isExcludedRegime`), « 2 ROUES | Mixte » 238 lignes (incertain : 237 ont un arceau comme mobilier), AUTOCAR 137 (aucun type du sélecteur : plus de bus, exclus des contours), PMR, services et autres.
- Fichiers : `public/data/paris/polygons/` (format 2) = `tiles/<type>/<ix>_<iy>.json` (183 fichiers) + `index.json`. **Poids : 3,10 Mo non compressé** (cible 6 Mo), plus grosse tuile 93 Ko (cible 150 Ko) ; la carte ne télécharge que les types choisis. Ligne = [latE5, lngE5, type d'emplacement, places, forme, puis les sommets en millionièmes de degré relatifs à l'ancrage]. Sommets arrondis au millionième de degré, anneau extérieur seulement. Les tuiles des emplacements (`tiles/`) restent mélangées.
- Champs gardés : contour, « Nombre places réelles », type (1 payant, 2 gratuit, 4 vélo, 5 deux-roues motorisés, 3 livraison, 6 autocar), forme (1 rectangle, 2 autre), point d'ancrage = celui de l'emplacement (100 % des contours retrouvés dans les tuiles des emplacements ; un point à cheval sur une frontière d'arrondi est recalé d'un E5 sur l'emplacement voisin unique). Aucun tarif, horaire ni disponibilité.
- Limites : la donnée est une ZONE, pas une place. La découpe en N parts égales (rectangles à 4 sommets, angles à 90° ± 8°, longueur / largeur au moins 1,3, N de 2 à 12) est calculée par GOVAPARK, **indicative**, et affichée comme telle : « Places réparties à titre indicatif : la Ville de Paris publie des zones de stationnement, pas chaque place. » (fiche d'un emplacement et panneau « i », jamais sur la carte). Formes non rectangulaires : contour seul. Les relevés changent : à réimporter avec un nouveau CSV.
- Licence ODbL : source et licence du jeu « emprises » citées dans le panneau « i » ; les fichiers générés sont une base dérivée, à partager dans les mêmes conditions.

### Places en rue (exception décidée par Anas)
Règles dans `contracts/street-reports.ts`, testées dans `api/street-reports.test.ts` :
- « libre » : **vert** moins de 5 min, **orange** de 5 à 10 min, puis la place disparaît de la carte ; « prise » : **rouge** 10 min puis disparaît.
- Le signalement le plus récent l'emporte. Des signalements concordants d'utilisateurs distincts (à moins de 5 min du plus récent, à moins de 15 m) relèvent la fiabilité (50 % + 15 par utilisateur concordant, -20 par utilisateur contradictoire, entre 10 et 95 %).
- Chaque place affiche l'heure, « il y a X min » et la source « Signalé par un utilisateur » ; jamais présentée comme garantie. Aucun nom d'utilisateur exposé.
- Aucune place pré-remplie : sans signalement récent, pas de place verte. En démo, tout signalement est étiqueté « exemple ».
- Anti-abus : connexion requise (visiteur démo en démo), position du signalement à moins de 50 m de la position GPS envoyée par l'appareil (cette distance ne prouve pas que le GPS n'est pas falsifié), 1 signalement par utilisateur et par minute dans une zone de 100 m, limite de débit par IP existante, bornes GPS validées, expiration calculée côté serveur.
- Données : table `streetReports` (migration `db/migrations/0016_places_en_rue.sql`), index sur (latitude, longitude), createdAt et (userId, createdAt). Démo : mémoire de `api/demo.ts`.
- **Gris** : aucune donnée, ou donnée expirée (« information trop ancienne »).

En mode démo (sans base), les annonces sont des exemples : leur statut indique « Simulation (mode démo) ».

## Stationnement public et parkings collectifs : pas encore de données branchées
La recherche renvoie une liste vide pour ces catégories (avec un message), plutôt que d'afficher de fausses places.

## Sources ouvertes identifiées (à brancher, rien n'est encore connecté)
Vérifié par consultation des pages des catalogues (dates indiquées par les pages elles-mêmes) :

1. **Base Nationale des Lieux de Stationnement (BNLS)**, data.gouv.fr / transport.data.gouv.fr. Format schéma « etalab/schema-stationnement » : emplacement, capacité, tarifs, PMR… (statique, pas de temps réel). Les collectivités et exploitants la publient en CSV. Exemple vérifié : *Parkings Saemes* (Saemes, Licence Ouverte 1.0, CSV, mis à jour le 2026-06-23). Le validateur signale des erreurs de conformité sur ce fichier : prévoir une validation défensive à l'import.
2. **Parkings-relais Île-de-France** (Île-de-France Mobilités, data.gouv.fr, Licence Ouverte 2.0, CSV/JSON/ZIP, mis à jour le 2026-07-21) : localisation des entrées de P+R ; la page n'indique ni capacité ni disponibilité temps réel.
3. **Portail open data de Saemes** : un article de 2016 (Journal du Net) indiquait une API de disponibilité rafraîchie toutes les 2 minutes sur 8 parkings, avec extension prévue. **À revérifier** : l'état actuel de cette API n'a pas pu être confirmé.
4. **Paris Data (opendata.paris.fr)** et **portail IDFM (data.iledefrance-mobilites.fr)** : à explorer pour le stationnement sur voirie et en ouvrage. Non consultés ici (accès bloqué depuis l'environnement de développement) : rien n'est affirmé sur leur contenu.
5. Autres collectivités publiant de la disponibilité temps réel (ex. Métropole Européenne de Lille, parkings relais de Grenoble) : utiles pour l'extension hors Île-de-France ; la page Grenoble est archivée (dernière mise à jour 2023), à ne pas utiliser en production.

Autres canaux, sans API ouverte connue : partenariats avec exploitants (Indigo, Saemes, Q-Park…), données transmises par les propriétaires, signalements des utilisateurs.

## Architecture de fournisseurs (`api/providers/`)
- `types.ts` : interface `ParkingProvider` (`fetchStatic(bbox)`, `fetchAvailability?(ids)` optionnel) et `ProviderRecord`. Chaque enregistrement porte `meta` (source, type de source, date de récupération, fiabilité 0-100, licence) et `availability` (état, heure d'observation, **durée de validité**) ou `null`.
- `toStatusSignals()` convertit une mesure en signal pour `resolveStatus` : pas de mesure = pas de signal = gris.
- `registry.ts` : liste des fournisseurs réellement branchés (vide pour l'instant) ; `fetchCategory()` interroge uniquement la catégorie demandée, un fournisseur en panne n'empêche pas les autres.
- `example.ts` : fournisseur d'exemple fictif, **non enregistré**, uniquement pour illustrer le contrat (testé dans `api/providers.test.ts`).

### Ajouter une vraie source
1. Vérifier la licence et la fréquence de mise à jour sur la page du jeu de données.
2. Créer `api/providers/<nom>.ts` implémentant `ParkingProvider` (catégorie unique, `sourceType` honnête : `open_data` ou `operator`).
3. Ne renseigner `availability` que si la source fournit une mesure datée ; fixer `validForMinutes` selon sa fréquence de mise à jour.
4. L'enregistrer dans `registry.ts`, ajouter un test, puis relier `listings.search` pour les catégories public/collectif.
5. Respecter les limites d'appel de la source (cache serveur, pas de requête par utilisateur).

## Base de données
Tables actuelles : `listings`, `reservations`, `communityReports`, `reportVotes`, `users`, `files`, `parkingObservations`… Les tables génériques `parking_spaces`, `parking_sources`, `parking_status_history` pour stocker les données de fournisseurs sont **à créer** au moment du premier branchement réel (non faites : rien à y stocker aujourd'hui). Index géographique : `listings_geo_idx` (statut, latitude, longitude) ; pas de PostGIS (MySQL).
