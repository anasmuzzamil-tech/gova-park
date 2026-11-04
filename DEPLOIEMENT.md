# Déployer Govapark sur Render (gratuit)

## Service
- Type : **Web Service**, runtime Node (22), plan gratuit. Configuration dans `render.yaml`.
- Build : `npm install --include=dev --legacy-peer-deps && npm run build`
- Démarrage : `npm start` (port fourni par Render via `PORT`).
- Health check : `/health`.
- Déploiement automatique à chaque push sur `main`. Un nouveau push annule un déploiement en cours.

## Variables d'environnement
| Nom | Rôle |
|---|---|
| `NODE_VERSION`, `NODE_ENV`, `NPM_CONFIG_PRODUCTION` | déjà définies dans `render.yaml` |
| `APP_SECRET` | généré automatiquement |
| `DATABASE_URL` | adresse MySQL. Vide = mode démo (rien n'est enregistré) |

## Limites du plan gratuit (à connaître)
- Le service s'endort après 15 min sans visite et met environ 1 min à se réveiller.
- Aucun disque permanent : les fichiers écrits sur le serveur sont perdus à chaque redémarrage. Les données vont en base, les photos dans un stockage externe compatible S3 (à ajouter).
- 750 heures d'instance par mois.
- Le PostgreSQL gratuit de Render expire au bout de 30 jours : utiliser une base gratuite externe (voir `BASE_DE_DONNEES.md`).

## Sécurité en place
Mots de passe hachés, routes protégées, validation des entrées, en-têtes de sécurité (`hono/secure-headers`), limitation à 300 requêtes/minute/IP sur l'API, pas de CORS ouvert, aucune clé API dans le navigateur.

## Vérifier un déploiement
1. Logs Render : `[GOVAPARK]` au démarrage, puis la ligne du serveur.
2. `https://gova-park.onrender.com/health` répond `{"status":"ok"}`.
3. La carte s'affiche et une recherche d'adresse propose des suggestions.

## Cartographie et services externes
Tuiles OpenFreeMap (carte 3D), repli OpenStreetMap, adresses via api-adresse.data.gouv.fr, trajets via OSRM public, prix carburant via data.economie.gouv.fr. Tous gratuits et sans clé ; ne pas multiplier les requêtes inutiles.
