# Règles du projet GOVAPARK

- **Stack à conserver** : Vite + React 19 + react-router v7 + tRPC + Hono + Drizzle/MySQL. Pas de changement de framework.
- **Aucune dépense** : pas de service payant, pas de nouveau service externe sans accord explicite d'Anas. Rester sur Render gratuit et sources gratuites.
- **Aucun secret** dans le code, les docs, les commits ni le navigateur (pas de clé dans `VITE_*`). Seul `.env.example` (sans valeurs) est versionné.
- **Jamais de disponibilité fabriquée** : pas de vert sans source datée. Sans donnée, la place est grise (places privées et parkings : vert seulement avec une source fiable, `contracts/parking-status.ts`). **Exception décidée par Anas, limitée aux places gratuites en rue** (`contracts/street-reports.ts`) : un signalement « libre » récent d'un utilisateur connecté (visiteur démo en démo) est VERT 5 min, ORANGE de 5 à 10 min, puis la place disparaît ; « prise » est ROUGE 10 min puis disparaît ; le plus récent l'emporte ; toujours afficher l'heure et « Signalé par un utilisateur », jamais comme vérité garantie. Aucune place en rue n'est pré-remplie ; en démo tout signalement est étiqueté « exemple ». Les places en rue ne se mélangent jamais aux places privées/collectives (couche et filtre séparés).
- **Paiement désactivé** : ne jamais marquer une réservation payée/confirmée sans webhook vérifié d'un prestataire. Ne pas activer Stripe sans demande explicite.
- **Un push à la fois** : `git pull --rebase` avant chaque push, `git add` par chemin (jamais `git add -A`), ne pas commiter les fichiers modifiés par quelqu'un d'autre. `main` déploie automatiquement sur Render : ne rien pousser de non vérifié.
- **Séparer « vérifié » et « non testé »** dans chaque rapport, commit sensible et doc. Ne jamais déclarer fonctionnel ce qui n'a pas été exécuté.
- **Exécution précise** : faire exactement ce qui est demandé, sans embellir ni modifier d'éléments non demandés. Communication en français.
- Pas de suppression définitive de données. Ne pas toucher à la configuration Render sans demande.
- Avant de livrer : `npm test`, `npm run build` ; si impossible (sandbox sans npm), vérifier la syntaxe des fichiers TS touchés (transpileModule) et le dire.
- Références : `docs/PRODUIT.md` (état réel), `docs/AUDIT.md` (sécurité), `docs/DONNEES.md` (sources de données), `DEPLOIEMENT.md`.
