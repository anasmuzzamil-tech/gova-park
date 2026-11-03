# GOVAPARK — Étape 11 : estimation des départs et potentiel de stationnement

## Fonction ajoutée
- Un panneau « Places susceptibles de se libérer » apparaît dans les résultats.
- Il utilise les départs annoncés par les membres de la communauté dans un rayon de 5 km.
- Les annonces doivent être récentes (30 minutes maximum) et leur départ prévu se situer entre 5 minutes avant maintenant et 60 minutes après.
- Un indice expérimental sur 100 combine le niveau de confiance du signalement (55 %), la proximité de l'heure prévue (25 %) et la fraîcheur du signalement (20 %).
- Les annonces sont triées par indice et limitées aux cinq meilleures.
- La distance est calculée depuis la position GPS si elle est disponible, sinon depuis le centre de carte.

## Limites assumées
- L'indice n'est pas une probabilité statistique et ne garantit jamais qu'une place sera libre.
- Le produit ne possède pas encore de base d'historique par rue ou par créneau horaire. Il ne prétend donc pas prédire les habitudes de sortie des bureaux ou des résidents.
- Les prédictions de trafic/places en voirie nécessiteront des données historiques fiables, suffisamment d'utilisateurs actifs, une politique de conservation limitée et une validation statistique.
- Les places privées publiées comme disponibles restent une catégorie distincte des annonces communautaires.

## Pour une vraie version prédictive
1. Conserver des événements anonymisés de signalement (création, confirmation, contradiction, expiration), sans garder les coordonnées GPS précises des utilisateurs.
2. Agréger par zones géographiques suffisamment larges et créneaux horaires.
3. Mesurer la précision réelle des prédictions et afficher un taux calibré uniquement après validation sur des données séparées.
4. Ajouter un service serveur planifié et des notifications push opt-in pour les alertes de libération.
5. Ne jamais utiliser une plaque d'immatriculation comme moyen de localisation.
