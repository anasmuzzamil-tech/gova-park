# GOVAPARK

Application web (PWA) de **recherche de stationnement en Île-de-France** avec carte 3D, guidage, signalements communautaires et location de **places privées entre particuliers**.

- Production : https://gova-park.onrender.com
- Dépôt : `anasmuzzamil-tech/gova-park`
- État réel du produit (vérifié / démo / manquant) : [`docs/PRODUIT.md`](docs/PRODUIT.md)
- Audit sécurité et qualité : [`docs/AUDIT.md`](docs/AUDIT.md)
- Règles de travail du projet : [`CLAUDE.md`](CLAUDE.md)

> **Statut : prototype avancé, pas encore un service commercial.** Le site public tourne en **mode démo** (pas de base de données branchée, annonces d'exemple, rien n'est enregistré). Le paiement est **désactivé**. Voir « Limites connues ».

## Principe produit
1. Trouver une place : carte 3D (MapLibre) avec repli Leaflet, filtres, recherche d'adresse, itinéraire.
2. Honnêteté des données : **aucune disponibilité n'est inventée**. Vert = libre confirmé par une source fiable ; rouge = occupé confirmé ; orange = estimation ou signalement non confirmé ; gris = inconnu ou donnée expirée. Un signalement d'utilisateur ne donne jamais du vert. Règles dans `contracts/parking-status.ts` (testées).
3. Louer sa place : un propriétaire publie une annonce (validée par GOVAPARK), un conducteur réserve un créneau. GOVAPARK agit comme intermédiaire. Le paiement n'étant pas activé, aucune réservation n'est confirmée par un débit.
4. Compteur de stationnement (estimation au prorata, jamais un paiement), alertes de proximité, messagerie liée à une réservation.

## Architecture
```
src/        Front : Vite + React 19 + react-router v7 (pages dans src/pages, composants, carte 3D)
api/        Back : Hono + tRPC (api/govapark-router.ts = API métier, api/auth-router.ts = comptes)
contracts/  Règles métier pures partagées client/serveur (prix, réservation, statut, recherche, validation) - testées
db/         Schéma Drizzle (MySQL), migrations SQL, données de départ (seed)
api/providers/  Architecture de fournisseurs de données de stationnement (aucun fournisseur réel branché)
server.js   Point d'entrée Render : migre la base si DATABASE_URL, lance l'API, sinon sert le site seul
public/     PWA : manifest, service worker, page hors ligne, icônes
```
Flux : navigateur -> Hono (`/api/trpc`, `/health`, fichiers statiques) -> tRPC -> Drizzle -> MySQL. Sans `DATABASE_URL`, `api/demo.ts` fournit des données d'exemple en mémoire.

## Stack
Vite 7, React 19, react-router 7, TypeScript 5.9, Tailwind 3 + Radix UI, tRPC 11, Hono 4, Drizzle ORM + MySQL, zod, MapLibre GL (carte 3D) et Leaflet (repli), vitest, Capacitor 7 (socle mobile iOS/Android, non publié).

## Lancement en local
Prérequis : Node 20 à 24.
```bash
npm install --legacy-peer-deps   # voir .npmrc
npm run dev                      # site + API en développement (mode démo si DATABASE_URL vide)
npm test                         # tests unitaires (vitest, api/*.test.ts)
npm run build                    # build du site (dist/public) puis du serveur (dist/server)
npm start                        # lance le build de production (PORT, défaut 10000)
```
Pour utiliser une vraie base : copier `.env.example` en `.env`, renseigner `DATABASE_URL`, puis `npm run db:push`. Détails : [`BASE_DE_DONNEES.md`](BASE_DE_DONNEES.md).

## Variables d'environnement
Aucune valeur secrète n'est versionnée. Modèle : `.env.example`.

| Variable | Rôle | Obligatoire |
|---|---|---|
| `APP_SECRET` | signature des sessions (générée automatiquement par Render) | recommandé |
| `APP_ID` | identifiant de l'application (`govapark`) | non |
| `DATABASE_URL` | MySQL ; **vide = mode démo** | non (sinon pas de comptes réels) |
| `OWNER_UNION_ID` | identifiant du compte qui reçoit le rôle admin à la première connexion OAuth | non |
| `KIMI_AUTH_URL`, `KIMI_OPEN_URL`, `VITE_KIMI_AUTH_URL`, `VITE_APP_ID` | reliquat du gabarit de départ (OAuth de la plateforme) ; la connexion actuelle est e-mail + mot de passe | non |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID` | prévues pour le paiement ; **non utilisées, paiement désactivé** | non |

## Déploiement (Render, plan gratuit)
Service web Node 22 décrit dans `render.yaml`, déploiement automatique à chaque push sur `main`, health check `/health`. Procédure, limites du plan gratuit et vérifications : [`DEPLOIEMENT.md`](DEPLOIEMENT.md). La CI GitHub (`.github/workflows/ci.yml`) est indépendante de Render et ne bloque pas le déploiement.

## Limites connues
- Mode démo en production : annonces d'exemple, aucun compte réel, rien d'enregistré (plan gratuit, pas de base branchée).
- Aucune source réelle de stationnement public ou de parkings collectifs : ces catégories renvoient une liste vide (pistes dans `docs/DONNEES.md`).
- Paiement, reversement aux propriétaires et remboursements automatiques : non activés.
- Stockage de photos : le module `api/lib/storage.ts` dépend du stockage de la plateforme de départ ; non vérifié sur Render (voir `docs/AUDIT.md`).
- Limitation de débit en mémoire, mono-instance. Plan gratuit : veille après 15 min d'inactivité.
- Documents juridiques : seulement des brouillons (`docs/legal/`), à faire valider par un juriste.
- Application native (Capacitor) : socle présent, non générée, non signée, non publiée.
- Aucun `package-lock.json` : installations non reproductibles à l'identique.

## Feuille de route (non engageante)
1. Brancher une base MySQL gratuite et passer en mode réel ; tester comptes, annonces, réservations de bout en bout.
2. Brancher une première source ouverte de stationnement (BNLS / parkings-relais IDFM) après vérification de licence et validation défensive.
3. Stockage de photos indépendant de la plateforme de départ.
4. Cadre juridique validé (CGU, RGPD, rôle d'intermédiaire), puis paiement légal (prestataire agréé).
5. Corrections de `docs/AUDIT.md`, lockfile, CI bloquante une fois le typage vérifié.

## Documentation du dépôt
Les fichiers `ETAPE_*.md`, `README_ETAPE_*.txt` et `ETAT_DE_LIVRAISON*.txt` sont l'historique des étapes de développement ; ils peuvent contenir des formulations optimistes. En cas de doute, `docs/PRODUIT.md` fait foi.
