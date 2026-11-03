# Plan de finalisation et lancement — GOVAPARK

## Lot A — Fiabilisation fonctionnelle
- Vérifier inscription/connexion et sessions.
- Vérifier création, édition, suspension et archivage des annonces.
- Vérifier photos et droits d'accès aux fichiers.
- Tester favoris, calendrier, disponibilités et réservations concurrentes.
- Tester que l'adresse exacte et les consignes restent privées avant confirmation.
- Ajouter des tests automatisés sur prix, chevauchements, annulations et permissions propriétaire.

## Lot B — Paiement marketplace
- Choisir le prestataire et ouvrir le compte plateforme.
- Définir la commission et les frais affichés.
- Mettre en place l'onboarding KYC des propriétaires.
- Créer les paiements avec montant calculé côté serveur.
- Confirmer une réservation uniquement après événement de paiement vérifié côté serveur.
- Gérer annulation, remboursement, litige, paiement échoué et reversement.
- Tester les webhooks, doublons, rejouabilité et remboursements partiels.

## Lot C — Administration et conformité
- Back-office de modération avec journal d'audit.
- Vérification de propriété/droit de louer une place.
- Signalement d'annonce, blocage, suspension et recours.
- CGU, CGV, confidentialité, cookies, mentions légales et rétention des données.
- Support utilisateur et procédure d'urgence.

## Lot D — Pilote Île-de-France
- Pilote fermé sur une zone limitée.
- Recruter les premiers propriétaires et vérifier manuellement les annonces.
- Mesurer conversion recherche → fiche → réservation.
- Mesurer taux d'acceptation, annulation, litige et disponibilité réelle.
- Corriger les retours avant élargissement géographique.

## Critère de sortie
GOVAPARK ne doit pas être annoncé comme prêt au paiement ou au lancement public tant que les paiements réels, les webhooks, la conformité, les tests et le support ne sont pas validés.
