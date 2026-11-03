# GOVAPARK — Étape 7 : messagerie et notifications

## Fonctionnalités ajoutées

- Espace « Messages » accessible depuis la navigation principale.
- Liste des conversations liées aux réservations du client ou aux annonces du propriétaire.
- Envoi de messages avec validation serveur, longueur maximale de 2 000 caractères et contrôle d'accès à chaque réservation.
- Notifications persistantes à la création d'une demande, à son acceptation/refus et à la réception d'un message.
- Consultation des notifications et action « marquer comme lu ».
- Actualisation périodique des conversations et notifications (ce n'est pas du push temps réel).
- Bouton « Écrire au propriétaire » depuis chaque réservation client.

## Migration obligatoire

Exécuter une seule fois `db/migrations/0006_messages_notifications.sql` après la migration 0005 sur la base de données cible. Cette migration crée `messages` et `notifications` avec les index de lecture. Sauvegarder la base avant migration.

## Limites connues

- Les messages sont textuels ; pas de pièces jointes, appels ni chiffrement de bout en bout.
- Les notifications sont internes à l'application et vérifiées par interrogation périodique. Aucun e-mail, SMS ou push natif n'est envoyé.
- Les notifications et messages ne peuvent être consultés que par les participants autorisés via l'API.
- Le paiement demeure désactivé : l'acceptation d'une demande ne confirme pas la réservation.
- Le propriétaire et le client peuvent communiquer à travers une réservation existante. Les annonces sans réservation ne disposent pas encore de chat préalable.

## Vérifications avant mise en ligne

1. Appliquer la migration en environnement de test.
2. Exécuter `npm ci`, `npm run check`, `npm test`, `npm run lint` et `npm run build`.
3. Tester avec deux comptes distincts : client et propriétaire.
4. Vérifier qu'un troisième compte ne peut ni lire ni envoyer de message dans une conversation étrangère.
5. Tester les notifications de création, acceptation, refus et message.
6. Ajouter politique de conservation, signalement/blocage, limitation anti-spam et règles RGPD avant ouverture publique.
