# Étape 18 — Hub stationnement et accessibilité (version remplacée)

Cette étape avait initialement introduit des redirections vers des applications tierces. Cette orientation est abandonnée à la suite de la décision stratégique validée : GOVAPARK est une plateforme et un opérateur indépendants, sans redirection commerciale vers les applications concurrentes.

La version produit corrigée est décrite dans `ETAPE_19_STRATEGIE_INDEPENDANTE_MODELE_C.md` et implémentée dans `src/pages/Mobility.tsx` :
- GOVAPARK Marketplace : annonces et réservations directes de places privées ;
- GOVAPARK Parking : parkings achetés, loués ou exploités sous mandat ;
- GOVAPARK Street : futur paiement voirie, commune par commune, après autorisation et intégration ;
- GOVAPARK Valet : futur réseau propre, après assurances et autorisations ;
- GOVAPARK Access : informations CMI et accessibilité.

Aucun paiement, inventaire de parking détenu en propre ou service voiturier n'est déclaré actif sans preuve opérationnelle. Les services non prêts sont explicitement indiqués comme en préparation.
