# Activer la base de données (Govapark)

Tant que `DATABASE_URL` est vide, le site tourne en **mode démo** (aucune donnée enregistrée).
Dès qu'elle est renseignée sur Render, au prochain démarrage le site :
1. crée les tables tout seul ;
2. ajoute les 20 places d'exemple si la base est vide ;
3. passe en mode réel : comptes, réservations, signalements et favoris sont enregistrés.

## Étapes
1. Crée une base MySQL gratuite (par exemple TiDB Cloud Serverless ou Aiven for MySQL).
2. Copie l'adresse de connexion, de la forme `mysql://utilisateur:motdepasse@hote:4000/nom_base?ssl={"rejectUnauthorized":true}`.
3. Sur Render, service `gova-park`, menu Environment : ajoute `DATABASE_URL` avec cette adresse, puis enregistre.
4. Render redémarre le site. Regarde les Logs : « Base de donnees : creation des tables… ».
5. Pour créer ton compte : ouvre le site, page de connexion, « Créer un compte ».

Pour revenir au mode démo : supprime `DATABASE_URL` sur Render.
