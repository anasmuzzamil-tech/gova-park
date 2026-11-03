GOVAPARK — ÉTAPE 7
Messagerie et notifications internes

Nouveautés :
- Page Messages dans la navigation.
- Conversations pour réservations client et propriétaire.
- Envoi et lecture de messages avec vérification serveur des participants.
- Notifications internes lors d'une demande, d'une acceptation, d'un refus et d'un nouveau message.
- Marquage des notifications comme lues.

À FAIRE AVANT TEST EN ENVIRONNEMENT :
1. Sauvegarder la base de données.
2. Appliquer db/migrations/0006_messages_notifications.sql une seule fois.
3. Installer les dépendances avec npm ci.
4. Lancer npm run check, npm test, npm run lint et npm run build.
5. Tester avec deux comptes distincts et un troisième compte non autorisé.

Les notifications ne sont pas encore des push iOS/Android. Les messages ne sont pas chiffrés de bout en bout. Les paiements restent désactivés.
