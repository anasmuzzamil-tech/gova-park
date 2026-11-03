# GOVAPARK — Étape 5 : administration et sécurisation

## Modifications incluses

- Ajout d'une console d'administration accessible uniquement aux comptes dont le rôle serveur est `admin`.
- Indicateurs de plateforme, liste des annonces en attente et actions de publication, refus ou suspension.
- Conservation d'une note de modération dans `listings.moderationNote`.
- Ajout d'un état de préparation Stripe Connect : il indique explicitement que les paiements et transferts sont désactivés.
- Correction critique : une réservation ne peut plus passer à `confirmed` par un simple clic de démonstration. L'endpoint de paiement refuse toute confirmation tant qu'un paiement vérifié n'est pas intégré.
- Une acceptation par le propriétaire passe désormais à `payment_pending`, et non à `confirmed`.
- Le parcours client affiche clairement qu'une place n'est pas confirmée tant que le paiement sécurisé n'est pas disponible.
- Un propriétaire ne peut pas réserver sa propre annonce.
- Ajout de tests unitaires sur le calcul du prix et les chevauchements de créneaux.

## Migration base de données

La migration `db/migrations/0005_govapark_moderation.sql` ajoute `moderationNote`. À exécuter sur la base cible avant le déploiement :

```sql
ALTER TABLE `listings` ADD COLUMN `moderationNote` TEXT NULL;
```

Le fichier de migration contient déjà cette instruction. Ne l'exécutez qu'une seule fois.

## Configuration paiement

Les variables `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` et `STRIPE_CONNECT_CLIENT_ID` sont documentées dans `.env.example`. Aucune clé n'est fournie et aucune transaction réelle n'est activée. Il faudra ensuite intégrer Stripe Connect, vérifier la signature des webhooks, gérer les remboursements, les litiges et la conformité KYC avant toute mise en production.

## Vérification

Des tests unitaires ont été ajoutés dans `api/pricing.test.ts`. L'installation des dépendances a dépassé le délai disponible pendant cette livraison ; la compilation TypeScript, le lint et l'exécution des tests restent donc à lancer dans un environnement avec les dépendances installées :

```bash
npm ci
npm run check
npm test
npm run lint
npm run build
```

## Important

Cette livraison améliore la sécurité métier, mais ne constitue pas une autorisation de mise en production. Il reste à faire auditer l'authentification, les règles de réservation, les obligations RGPD, les CGU/CGV, l'assurance, la facturation et le flux de paiement avant ouverture au public.
