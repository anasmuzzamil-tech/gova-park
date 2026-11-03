# État du projet GOVAPARK

## Fonctionnalités repérées dans le code
- Recherche et affichage des annonces de stationnement.
- Fiche d’une place et parcours de réservation.
- Authentification et espace personnel.
- Favoris.
- Espace propriétaire : annonces, création d’annonce, calendrier, demandes, acceptation/refus et aperçu des revenus.
- API métier et schéma de base de données.

## À finaliser avant un lancement public
1. Exécuter les tests automatisés et corriger les erreurs.
2. Vérifier les règles de disponibilité et les conflits en conditions réelles.
3. Connecter un prestataire de paiement réel et gérer remboursements, justificatifs et reversements.
4. Vérifier les autorisations, la confidentialité des adresses et la sécurité.
5. Préparer hébergement, sauvegardes, supervision et mentions légales.

**Attention :** les montants affichés dans l’espace propriétaire ne prouvent pas qu’un paiement réel a été encaissé. Le code contient encore des libellés de paiement simulé.


## Étape 16 — socle mobile natif
Capacitor configuré pour iOS/Android, commandes natives ajoutées, contrôles explicites d'autorisation GPS et push, enregistrement serveur des tokens par compte et migration 0013. APNs/FCM, projets natifs générés, signature et GPS arrière-plan restent à configurer/valider.
