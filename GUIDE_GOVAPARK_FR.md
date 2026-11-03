# GOVAPARK — guide du projet

## Ce que contient cette version

Cette livraison repart du ZIP original fourni dans la conversation et conserve son application React + TypeScript, son API tRPC, sa base MySQL/Drizzle et ses pages existantes.

### Parcours déjà présents dans le code
- Carte et recherche des places de stationnement.
- Fiche détaillée d'une place.
- Création de compte / connexion via le fournisseur d'authentification configuré.
- Création d'annonce par un propriétaire, photos, dimensions, tarifs et horaires.
- Calendrier avec périodes bloquées.
- Réservation instantanée ou demande soumise au propriétaire.
- Liste des réservations du client.
- Favoris enregistrés côté serveur.
- Signalements communautaires.
- Espace propriétaire et calcul des montants par réservation.

## Changements de cette livraison
- Ajout d'une route sécurisée `owner.dashboard` qui calcule les indicateurs à partir des annonces et réservations appartenant au propriétaire connecté.
- Ajout d'un résumé d'activité dans l'espace propriétaire.
- Le refus d'une demande est maintenant limité aux réservations en attente appartenant au propriétaire.
- Les libellés de l'interface précisent qu'aucun paiement bancaire réel n'est exécuté.
- Suppression du faux formulaire de carte bancaire dans le parcours de démonstration : l'application ne demande plus de numéro, date d'expiration ou CVC fictifs.

## Limites importantes — ne pas confondre prototype et lancement réel
- Le paiement réel n'est PAS intégré. La route `reservations.pay` change le statut dans la base, elle ne prélève aucun argent.
- Les demandes acceptées par le propriétaire ne déclenchent aucun débit ni virement.
- Les chiffres de revenus sont des montants calculés à partir des réservations enregistrées ; ce ne sont pas des sommes encaissées ou versées.
- Le contrôle des annonces est représenté par un statut de modération, mais il faut encore un véritable back-office administrateur et une procédure de vérification.
- Les tests de compilation automatisés n'ont pas pu être exécutés dans l'environnement de préparation, car l'installation des dépendances (`npm ci`) a dépassé le délai disponible. Il faut exécuter les commandes ci-dessous sur un ordinateur avant déploiement.

## Démarrer sur un ordinateur
1. Installer Node.js LTS et MySQL.
2. Ouvrir un terminal dans le dossier `GOVAPARK`.
3. Copier `.env.example` vers `.env` et remplir les paramètres requis.
4. Installer les dépendances : `npm ci`.
5. Préparer la base : `npm run db:push` (après avoir vérifié `DATABASE_URL`).
6. Lancer en développement : `npm run dev`.
7. Vérifier les types : `npm run check`.
8. Vérifier le lint : `npm run lint`.
9. Construire : `npm run build`.
10. Lancer les tests : `npm test`.

Ne jamais publier le fichier `.env`, des clés privées, des identifiants MySQL ou des clés de paiement.

## Avant une ouverture au public
- Choisir et configurer un prestataire de paiement compatible marketplace (ex. Stripe Connect) et valider son contrat, ses frais, le KYC des propriétaires, les remboursements, les litiges et les reversements.
- Ajouter des webhooks signés et idempotents ; ne jamais considérer un simple changement de statut comme une preuve de paiement.
- Faire auditer les règles d'annulation, les commissions et les conditions générales.
- Compléter mentions légales, CGU, politique de confidentialité, politique cookies et registre RGPD.
- Définir la procédure de modération des annonces et de gestion des signalements.
- Tester les conflits de créneaux, fuseaux horaires, annulations, remboursements et accès à l'adresse exacte.
- Mettre en place sauvegardes MySQL, journalisation, surveillance, limitation de débit et procédure de support.
- Tester sur iPhone, Android et navigateurs desktop.

## Règle de livraison
Chaque nouvelle livraison doit repartir du dossier complet `GOVAPARK/`, intégrer les changements précédents et fournir une nouvelle bibliothèque HTML consultable avec des noms français compréhensibles.
