GOVAPARK — ÉTAPE 13 : CENTRE DE CONTRÔLE SOCIÉTÉ

Espace /entreprise réservé au rôle admin.

Modules :
- Vue générale de l'activité
- Gestion de tous les comptes avec recherche et rôles
- Validation des propriétaires (nom légal, téléphone, décision et note interne)
- Vérification des annonces en attente
- Réservations et suivi des litiges
- Paramétrage du taux de commission et indicateurs financiers
- Carte de France avec activité par région
- Suivi de l'évaluation du cerveau prédictif (exactitude, précision, rappel, Brier)

MIGRATION OBLIGATOIRE : db/migrations/0011_centre_controle_societe.sql
À exécuter après 0010, une seule fois, après sauvegarde de la base.

Le taux initial de commission est 12 %, hérité du calcul existant. Le nouveau taux s'applique uniquement aux nouvelles réservations.
Les paiements Stripe Connect ne sont pas activés : les montants sont des calculs internes, pas des encaissements.
Les confirmations communautaires ne constituent pas une vérité terrain certifiée.

Pour activer l'espace société : créer un compte normalement puis, depuis un accès SQL sécurisé :
UPDATE users SET role='admin' WHERE email='VOTRE_EMAIL_SOCIETE';

Contrôle syntaxique des fichiers modifiés : OK.
Build complet non certifié : npm ci a dépassé le délai et les types node / vite/client sont absents.
