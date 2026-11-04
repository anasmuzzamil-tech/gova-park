# Règles du projet GOVAPARK

- **Stack à conserver** : Vite + React 19 + react-router v7 + tRPC + Hono + Drizzle/MySQL. Pas de changement de framework.
- **Aucune dépense** : pas de service payant, pas de nouveau service externe sans accord explicite d'Anas. Rester sur Render gratuit et sources gratuites.
- **Aucun secret** dans le code, les docs, les commits ni le navigateur (pas de clé dans `VITE_*`). Seul `.env.example` (sans valeurs) est versionné.
- **Jamais de disponibilité fabriquée** : pas de vert sans source fiable datée. Sans donnée, la place est grise. Un signalement utilisateur ne donne jamais du vert (`contracts/parking-status.ts`).
- **Paiement désactivé** : ne jamais marquer une réservation payée/confirmée sans webhook vérifié d'un prestataire. Ne pas activer Stripe sans demande explicite.
- **Un push à la fois** : `git pull --rebase` avant chaque push, `git add` par chemin (jamais `git add -A`), ne pas commiter les fichiers modifiés par quelqu'un d'autre. `main` déploie automatiquement sur Render : ne rien pousser de non vérifié.
- **Séparer « vérifié » et « non testé »** dans chaque rapport, commit sensible et doc. Ne jamais déclarer fonctionnel ce qui n'a pas été exécuté.
- **Exécution précise** : faire exactement ce qui est demandé, sans embellir ni modifier d'éléments non demandés. Communication en français.
- Pas de suppression définitive de données. Ne pas toucher à la configuration Render sans demande.
- Avant de livrer : `npm test`, `npm run build` ; si impossible (sandbox sans npm), vérifier la syntaxe des fichiers TS touchés (transpileModule) et le dire.
- Références : `docs/PRODUIT.md` (état réel), `docs/AUDIT.md` (sécurité), `docs/DONNEES.md` (sources de données), `DEPLOIEMENT.md`.
