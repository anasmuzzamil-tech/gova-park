# Étape 14 — Sécurité opérationnelle, audit et remboursements

## Fonctionnalités ajoutées

### 1. Justificatifs propriétaires
- L'espace propriétaire accepte un PDF, JPG, PNG ou WebP jusqu'à 10 Mo.
- Types : pièce d'identité, justificatif de propriété / droit de louer, document d'immatriculation société.
- Les fichiers sont envoyés via le stockage privé existant. La base ne conserve que la clé de stockage et les métadonnées.
- L'espace société récupère des URL signées temporaires pour examiner les documents. Ces URL expirent ; elles ne doivent pas être partagées publiquement.

### 2. Journal d'audit
- Historique des décisions de modération d'annonces.
- Historique des validations/refus de propriétaires.
- Historique des changements de rôle, taux de commission, décisions de litige et opérations de remboursement.
- Consultation réservée aux administrateurs GOVAPARK.

### 3. Remboursements
- Un conducteur peut demander un remboursement depuis ses réservations avec un motif.
- Une annulation d'une réservation confirmée crée aussi une demande de remboursement à examiner.
- Le centre société propose les statuts : demandé, en examen, approuvé, refusé, traité.
- Pour marquer une demande comme traitée, l'administrateur doit fournir une référence du prestataire externe.
- Le statut « remboursé » n'est appliqué qu'après cette saisie.

### 4. Notifications internes
- Réception d'un justificatif.
- Validation ou refus d'un propriétaire.
- Modération d'une annonce.
- Nouvelle demande de remboursement et mise à jour de son traitement.

## Migration et déploiement

1. Faire une sauvegarde complète de la base MySQL.
2. Vérifier que les migrations antérieures 0005 à 0011 sont appliquées.
3. Appliquer `db/migrations/0012_securite_audit_remboursements.sql`.
4. Déployer ensemble l'API et le frontend.
5. Tester avec trois comptes de recette distincts : conducteur, propriétaire et administrateur.
6. Vérifier les permissions des documents avec des sessions séparées et l'expiration des URL signées.

## Limites à ne pas confondre avec une mise en production

- Aucun paiement ni remboursement bancaire n'est exécuté par ce code. Le remboursement doit être réalisé auprès du prestataire choisi et sa référence reportée dans GOVAPARK.
- Les notifications sont internes à l'application ; l'e-mail, les SMS et les push nécessitent des fournisseurs, des clés et les consentements adaptés.
- Le journal couvre les actions sensibles instrumentées dans cette étape ; il ne remplace pas les journaux d'infrastructure, d'hébergement ou d'accès SQL.
- Avant ouverture publique, définir les durées de conservation, l'information des personnes, les droits d'accès et de suppression, les procédures de fuite de données et le cadre RGPD pour les pièces d'identité et justificatifs.
- Le contrôle de syntaxe n'est pas un build complet. Les dépendances de développement ne sont pas installées dans cet environnement ; le contrôle TypeScript complet doit être rejoué après `npm ci` sur une machine disposant du registre de paquets.
