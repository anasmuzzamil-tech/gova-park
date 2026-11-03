# Guide de navigation GOVAPARK

Ce guide explique où trouver les principales parties du projet.

## Application visible (interface)
- `src/App.tsx` : point d’entrée et navigation générale.
- `src/pages/Home.tsx` : accueil et recherche de stationnements.
- `src/pages/PlaceDetail.tsx` : fiche détaillée d’une place.
- `src/pages/BookingFlow.tsx` : parcours de réservation.
- `src/pages/Favorites.tsx` : places favorites.
- `src/pages/Reservations.tsx` : réservations du client.
- `src/pages/Profile.tsx` : profil du compte.
- `src/pages/Owner.tsx` : espace propriétaire (annonces, calendrier, demandes et revenus).
- `src/pages/Login.tsx` : connexion.
- `src/components/ParkingMap.tsx` : carte.

## Serveur et données
- `api/govapark-router.ts` : routes métier GOVAPARK.
- `api/auth-router.ts` : authentification côté serveur.
- `api/lib/storage.ts` : accès au stockage.
- `db/schema.ts` : structure des tables de données.
- `db/seed.ts` : données de démarrage.
- `contracts/` : types, règles et constantes partagés.

## Démarrage
Consulter `README.md`, puis copier `.env.example` vers `.env` et renseigner les variables requises. Installer les dépendances avec `npm install`, puis lancer `npm run dev`.

## État important
L’espace propriétaire comprend déjà les écrans de gestion des annonces, calendrier, demandes et calcul des revenus. Les messages du code indiquent encore un paiement simulé : ne pas encaisser de vrais clients avant intégration et validation d’un prestataire de paiement, tests de sécurité et tests de bout en bout.
