# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```


## Étape 7 — messagerie et notifications

Voir `ETAPE_7_MESSAGERIE_NOTIFICATIONS.md`. La migration `db/migrations/0006_messages_notifications.sql` doit être appliquée en environnement de test puis en production après sauvegarde. Les notifications sont internes et interrogées périodiquement ; aucun push natif ni paiement réel n’est activé.


## Étape 8 — Carte GPS et disponibilités
Voir `ETAPE_8_CARTE_GPS_DISPONIBILITES.md` : carte OpenStreetMap, suivi GPS en premier plan, disponibilité calculée des parkings privés et signalements communautaires pour la rue.

## Étape 19 — stratégie indépendante, modèle C

GOVAPARK adopte le modèle C : marketplace de places proposées par des propriétaires/exploitants tiers ET activité d'exploitation de parkings détenus, loués ou gérés sous mandat. La stratégie complète, les flux métier, les KPI, les phases de déploiement et les garde-fous sont décrits dans `ETAPE_19_STRATEGIE_INDEPENDANTE_MODELE_C.md`.

Le hub mobilité est désormais indépendant : aucun parcours client ne redirige vers les applications concurrentes. Les services soumis à autorisation, contrat ou intégration technique sont signalés comme en préparation. Voir `ETAPE_18_HUB_STATIONNEMENT_ACCESSIBILITE.md` pour l'historique de la correction.
