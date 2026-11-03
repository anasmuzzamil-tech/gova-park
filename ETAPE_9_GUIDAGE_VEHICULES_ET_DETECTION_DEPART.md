# GOVAPARK — Étape 9 : guidage, places sur le trajet et départ détecté

## Ajouts
- Calcul d'itinéraire routier depuis la position GPS ou le centre de carte vers une place privée, via le service de démonstration OSRM.
- Tracé de l'itinéraire sur la carte Leaflet.
- Détection des annonces GOVAPARK disponibles à moins de 900 mètres de la géométrie du trajet et liste dédiée.
- Fenêtre de carte avec actions « Itinéraire » et « Réserver » directement depuis le marqueur.
- Alertes navigateur à proximité (rayon de 800 m) après activation volontaire et autorisation système. Les alertes sont locales à l'appareil et fonctionnent quand la page est active.
- Plaque facultative saisie lors d'une réservation privée. Elle est stockée sur la réservation, non publiée sur la carte, et visible uniquement dans les espaces du client et du propriétaire via les requêtes authentifiées existantes.
- Pour un signalement « Je pars bientôt », le propriétaire du signalement peut activer un suivi GPS explicite. Après deux positions précises indiquant un déplacement d'au moins 120 m depuis le point déclaré, le serveur transforme le signalement en « place libre signalée » pour 15 minutes, avec confiance initiale de 65 %.

## Limites et protection des données
- Une plaque d'immatriculation ne contient pas de coordonnées GPS. GOVAPARK ne peut pas retrouver la position d'une voiture à partir de sa plaque et ne doit pas tenter de suivre un véhicule sans consentement.
- La détection de départ utilise le GPS du téléphone de la personne qui a elle-même publié le départ, après activation explicite. Le suivi s'arrête dès la détection ou à la fermeture de la page. Les navigateurs mobiles peuvent suspendre le GPS en arrière-plan : le fonctionnement continu écran verrouillé nécessite une application native et des autorisations spécifiques.
- La plaque est une donnée personnelle. Elle est facultative, limitée à la réservation et ne doit jamais être affichée publiquement. Avant lancement, ajouter durée de conservation, suppression/anonymisation à la fin de la réservation, information RGPD et contrôle d'accès audité.
- La transformation automatique signifie « place potentiellement libérée », jamais « place garantie libre ». La communauté peut confirmer ou contredire.
- OSRM public est un endpoint de démonstration, sans SLA de production. Prévoir un fournisseur d'itinéraires contractuel, quotas et politique de confidentialité avant lancement commercial.
- Les places de rue ne sont pas réservables. Les places privées doivent toujours être revérifiées côté serveur au moment de la réservation.

## Migration de base de données
Exécuter une migration contrôlée sur l'environnement de développement avant lancement :

```sql
ALTER TABLE reservations ADD COLUMN vehiclePlate VARCHAR(12) NULL;
```

Le schéma Drizzle est mis à jour dans `db/schema.ts`. Sauvegarder la base avant toute migration de production.

## Tests requis avant production
- Tester OSRM, trajet sans résultat, GPS refusé, perte réseau et destination hors zone.
- Vérifier qu'une annonce proche de la route est bien listée et qu'une annonce éloignée ne l'est pas.
- Vérifier l'ouverture de la réservation depuis le popup de carte.
- Vérifier permission notifications refusée/acceptée et absence de doublons d'alertes.
- Tester détection de départ avec GPS imprécis, déplacement inférieur/ supérieur à 120 m, utilisateur non propriétaire et faux appel API.
- Vérifier les droits d'accès à la plaque, sa non-publication et sa suppression en fin de conservation.
- Ne jamais interagir avec le téléphone en conduisant : régler la destination avant de démarrer et utiliser un support / guidage vocal d'un fournisseur spécialisé.
