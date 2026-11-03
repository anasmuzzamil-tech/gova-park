# GOVAPARK — Étape 13 : centre de contrôle de la société

## Objectif
L'espace `/entreprise` devient la console de pilotage de GOVAPARK. Il est réservé aux comptes dont `users.role = 'admin'`. Les inscriptions publiques ne peuvent jamais attribuer ce rôle.

## Modules livrés

1. **Vue générale** : comptes, annonces, réservations, commissions calculées, propriétaires à examiner, annonces en attente, litiges, données prédictives et activité régionale.
2. **Gestion des comptes** : liste de tous les comptes, recherche nom/e-mail/identifiant et attribution des rôles conducteur ou propriétaire. Les comptes administrateurs sont protégés de la modification dans l'interface.
3. **Validation des propriétaires** : formulaire propriétaire avec nom légal et téléphone, file d'examen, validation ou refus et note interne. Un propriétaire non validé ne peut pas soumettre de nouvelle annonce. Le contrôle documentaire/identité reste une procédure manuelle à définir (ne pas considérer les coordonnées seules comme une vérification KYC).
4. **Vérification des annonces** : publication ou refus des annonces en attente avec motif.
5. **Réservations et litiges** : suivi des 200 dernières réservations et cycle de traitement des litiges (ouvert, en examen, résolu, rejeté). La clôture du litige ne force pas artificiellement le statut financier de la réservation.
6. **Commissions et finances** : taux de commission administrable de 0 à 50 %. Le taux par défaut de 12 % reprend le calcul déjà utilisé dans le prototype et s'applique aux nouvelles réservations ; les réservations existantes conservent leurs montants historiques. Les frais locataire (8 % dans le calcul existant) restent distincts.
7. **Carte de France** : activité par région, estimée à partir des codes postaux présents dans les adresses d'annonces. Les données sans code postal exploitable sont classées « Non classé ».
8. **Cerveau prédictif** : journalisation d'instantanés de prédiction par cellule. Une évaluation différée n'est comptabilisée qu'après deux confirmations communautaires libres/occupées, au moins 30 minutes après la prédiction. Le tableau affiche volume, exactitude au seuil 50/100, précision/rappel des prédictions libres et Brier score lorsque les données existent.

## Interprétation des indicateurs
- Les commissions sont des montants calculés depuis les réservations, pas des encaissements prouvés.
- Stripe Connect n'est pas activé ; aucun paiement ou reversement réel n'est effectué.
- Les mesures du cerveau restent exploratoires : les confirmations communautaires ne sont pas des vérités terrain certifiées. Les mêmes observations peuvent couvrir plusieurs instantanés d'une zone ; une prochaine version devra améliorer la déduplication et le protocole d'évaluation.
- La carte régionale dépend de la qualité des codes postaux présents dans les annonces.

## Migration et activation
1. Sauvegarder la base MySQL.
2. Exécuter une seule fois `db/migrations/0011_centre_controle_societe.sql`, après les migrations 0005, 0006, 0009 et 0010.
3. Pour une première installation, exécuter les migrations dans l'ordre numérique.
4. Créer le compte société avec le formulaire normal, puis attribuer le rôle admin depuis un accès SQL sécurisé :

```sql
UPDATE users SET role = 'admin' WHERE email = 'VOTRE_EMAIL_SOCIETE';
```

5. Déployer l'application avec HTTPS, APP_SECRET robuste, sauvegardes et journaux d'audit.
6. Avant production, ajouter une vérification documentaire des propriétaires, MFA obligatoire pour les administrateurs, journal d'audit des actions société, tests d'accès, gestion des demandes RGPD et intégration réelle du prestataire de paiement.

## Vérifications réalisées
- Transpilation syntaxique TypeScript/TSX des six fichiers modifiés : OK.
- Intégrité de l'archive ZIP : contrôlée à la livraison.
- `npm ci` a dépassé le délai de l'environnement ; `tsc -b` ne peut pas terminer car les définitions `node` et `vite/client` sont absentes. Aucun build complet ni test de base de données n'est certifié.
