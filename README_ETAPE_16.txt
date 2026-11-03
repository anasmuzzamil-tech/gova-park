GOVAPARK — ÉTAPE 16
Socle application mobile native iOS / Android (Capacitor).

Lire en premier : ETAPE_16_APPLICATION_NATIVE_IOS_ANDROID.md
Migration : db/migrations/0013_appareils_notifications_push.sql

IMPORTANT : le token push peut être enregistré, mais APNs/FCM et le service serveur d'envoi doivent encore être configurés. Le GPS arrière-plan permanent n'est pas activé.

Commandes : npm install ; migration SQL ; npx cap add android ; (Mac) npx cap add ios ; npm run build ; npx cap sync.
