# GOVAPARK — Étape 12 : comptes, espaces métier et moteur de tendances

## Espaces
L’accès à l’application est protégé : une connexion est requise avant d’ouvrir les espaces.
- Conducteur / locataire : compte e-mail + mot de passe, carte, favoris, réservations, messages et alertes.
- Propriétaire : compte e-mail + mot de passe, annonces, calendrier, demandes et indicateurs de revenus calculés.
- Société : espace `/entreprise` réservé au rôle `admin`, avec indicateurs, zones observées et activité horaire.

Les inscriptions publiques ne peuvent créer que les rôles `user` ou `owner`. Un compte société doit être créé puis promu par une opération sécurisée de l'administrateur technique.

## Authentification
- Inscription et connexion par adresse e-mail et mot de passe.
- Les anciens comptes Kimi gardent une connexion OAuth de compatibilité si la configuration est présente.
- Mots de passe hachés avec scrypt et sel aléatoire.
- Session signée et cookie HttpOnly/Secure selon l'environnement.
- Aucune possibilité de choisir le rôle administrateur lors de l'inscription.
- À compléter avant production : limitation de tentatives distribuée, vérification d'e-mail, réinitialisation, MFA pour société, journal d'audit, politique de mot de passe et tests de sécurité.

## Moteur de tendances
Un compte ne peut évaluer un même signalement qu’une fois, afin de limiter les manipulations simples. Les observations sont regroupées en cellules géographiques d'environ 250 m et associées au jour de semaine et à l'heure locale. Les données sont conservées 90 jours pour les endpoints de calcul. Le score utilise un lissage statistique prudent. Les résultats sont masqués si moins de trois observations existent.

Il s'agit d'un moteur statistique initial, pas encore d'un modèle d'apprentissage automatique entraîné. Une prochaine version devra distinguer les confirmations indépendantes, dédupliquer les événements, pondérer la fiabilité par utilisateur, comparer les prédictions aux résultats réels et mesurer Brier score / précision par zone.

## Mise en service
1. Sauvegarder la base de données.
2. Exécuter `db/migrations/0010_comptes_roles_et_cerveau.sql`.
3. Configurer APP_SECRET robuste et HTTPS en production.
4. Créer le compte société via l'inscription normale, puis affecter `role='admin'` depuis un accès SQL sécurisé avec `UPDATE users SET role='admin' WHERE email='VOTRE_EMAIL_SOCIETE';`.
5. Vérifier les permissions des trois rôles et les règles RGPD avant ouverture publique.

Les paiements restent désactivés dans ce prototype. Les observations communautaires ne garantissent jamais une place libre.
