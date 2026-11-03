GOVAPARK — ÉTAPE 12

Accès à l’application : connexion obligatoire.

Trois espaces :
1. Conducteur / locataire : inscription et connexion e-mail/mot de passe, espace client.
2. Propriétaire : espace annonces, calendrier, demandes et revenus.
3. Société : /entreprise, réservé au rôle admin.

Le moteur apprend à partir des observations confirmées par zone (cellule ~250 m), jour et heure sur 90 jours. Les résultats sont indicatifs.

INSTALLATION : exécuter db/migrations/0010_comptes_roles_et_cerveau.sql sur la base avant le déploiement.
Un administrateur doit promouvoir le compte société manuellement en base.

Sécurité : mots de passe scrypt + sel, session signée HttpOnly. Prévoir vérification e-mail, reset, MFA, rate limiting et audit avant production.

POUR CRÉER LE COMPTE SOCIÉTÉ :
1. Créer un compte avec une adresse e-mail dédiée via l'écran d'inscription.
2. Depuis un accès SQL administrateur, exécuter : UPDATE users SET role='admin' WHERE email='VOTRE_EMAIL_SOCIETE';
3. Se reconnecter : le menu affiche alors l'Espace société et la modération.
