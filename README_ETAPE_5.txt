GOVAPARK — VERSION ÉTAPE 5

Démarrage : npm ci puis npm run dev
Contrôles : npm run check ; npm test ; npm run lint ; npm run build
Migration : db/migrations/0005_govapark_moderation.sql
Guide détaillé : ETAPE_5_SECURITE_ADMIN_PAIEMENT.md

Paiements réels désactivés. Ne pas annoncer une réservation comme confirmée sans paiement validé par un prestataire et webhook vérifié.
