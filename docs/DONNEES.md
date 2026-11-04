# Sources de données de stationnement (GOVAPARK)

Principe : **aucune disponibilité n'est inventée**. Sans donnée temps réel valide, la place est grise (« Disponibilité inconnue ») et seules les informations statiques sont affichées.

## Ce qui est branché aujourd'hui
| Donnée | Source | Fiabilité | Validité |
|---|---|---|---|
| Places privées (annonces) | Propriétaire, annonce validée par GOVAPARK | élevée | Statut recalculé à chaque requête : calendrier du propriétaire (heure de Paris) + réservations GOVAPARK |
| Signalements d'utilisateurs | Communauté (compte requis) | moyenne/faible (0-100, votes) | Libre : 15 min · occupé : 30 min · départ annoncé : jusqu'à 10 min après l'heure estimée |

Règles de couleur (`contracts/parking-status.ts`, testées dans `api/parking-status.test.ts`) :
- **Vert** : libre confirmé par une source fiable (exploitant, capteur, propriétaire, open data temps réel).
- **Rouge** : occupé confirmé (source fiable, ou signalement confirmé par au moins 2 utilisateurs avec fiabilité ≥ 70).
- **Orange** : signalement récent non confirmé, départ annoncé, estimation. Un signalement d'utilisateur ne donne **jamais** du vert.
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
