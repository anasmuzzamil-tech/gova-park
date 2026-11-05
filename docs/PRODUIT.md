# État réel du produit GOVAPARK (au 2026-11-05)

Une page, sans exagération. Légende : **Vérifié** = couvert par un test automatique existant dans le dépôt (non rejoué dans l'environnement qui a écrit ce document : npm bloqué) ou observé en production par l'équipe ; **Démo** = fonctionne avec des données d'exemple ; **Non testé** = code présent, jamais vérifié de bout en bout ; **Absent**.

## Ce qui fonctionne en vérité
- Site en ligne sur Render (gratuit), carte 3D (MapLibre) avec repli Leaflet, recherche d'adresse, filtres, itinéraire, mode hors ligne (PWA). *Observé en production par l'équipe ; pas de test automatique d'interface.*
- Règles métier pures, **avec tests unitaires** dans le dépôt : couleur de statut (jamais de vert sans source fiable), prix et commission, réservation (créneaux, conflits, 31 jours max), recherche/filtres, regroupement de marqueurs, validation d'annonce, compteur. Fichiers : `api/*.test.ts`.
- Paiement réellement désactivé dans le code : aucune réservation n'est confirmée ni débitée.

- **Places gratuites en rue (communautaire)** : couche « Places en rue » séparée des places privées. Règles de statut (vert 5 min, orange jusqu'à 10 min, rouge 10 min, disparition), concordance, anti-spam, distance GPS et validation des entrées : **couvertes par des tests unitaires** (`api/street-reports.test.ts`). Boutons « Je libère ma place » / « Je me gare » sur la carte mobile, fiche avec heure et fiabilité, proposition « Libérer la place pour les autres ? » à la fin du compteur : **écrits, non testés en interface** (non rejoués en ligne à ce jour). Version base réelle (table `streetReports`) : **non testée faute de base**. Limite assumée : un signalement n'est jamais une vérité garantie, et la vérification des 50 m repose sur la position envoyée par l'appareil (falsifiable). Aucune place n'existe tant que personne n'a signalé.
  - **Écran d'accueil mobile** : panneau « Places en rue » en bas de la carte avec compteur « X places libres signalées il y a moins de 5 min près de vous » (rayon 500 m autour de la position GPS, sinon du centre de la carte ; 0 honnête avec invitation à signaler ; état distinct si hors ligne, zoom insuffisant, couche masquée, erreur ou chargement, jamais un 0 quand la donnée est inconnue) et les deux boutons de signalement en un geste. Le calcul du compteur (`countFreeNearby`) est **couvert par des tests unitaires** ; l'affichage (composant `StreetPanel`) est **écrit, non testé en interface**. Sur mobile, la liste des places privées est repliée au démarrage (un toucher l'ouvre).

- **Navigation vers une place (façon Waze)** : bouton « Y aller » sur la fiche d'une place en rue, sur la fiche d'une place privée (page place) et sur les cartes ; calcul via OSRM public (gratuit), aperçu des options puis « Démarrer » = mode plein écran (prochaine manœuvre en grand avec flèche, distance, instructions en français, distance et durée restantes, heure d'arrivée estimée sans trafic, vitesse GPS, voix du navigateur désactivable, bascule recentrage / vue d'ensemble, recalcul après 3 positions hors tracé, arrivée avec rappel « Place signalée libre il y a X min, elle peut être prise »). Démarre sans permission de géolocalisation (départ = adresse saisie ou centre de la carte, note à l'écran, bouton « Activer la position » non bloquant). Hors ligne : message honnête, pas d'itinéraire inventé, recalcul impossible. **Couvert par des tests unitaires** : projection sur le tracé, progression, arrivée, décision de recalcul, annonces vocales, textes français (`api/guidance.test.ts`, logique dans `src/lib/guidance.ts`). **Écrit, non testé** : tout l'affichage (`NavigationMode`), la voix (`speechSynthesis`), le suivi GPS réel, la rotation de la carte selon le cap (carte 3D seulement, la carte de secours Leaflet ne tourne pas), le recalcul réel. Pas de trafic, pas de limitations de vitesse, pas de guidage écran verrouillé (limite d'un site web).

## Ce qui est en démo (données d'exemple)
- Le site public n'a **pas de base de données branchée** : 35 annonces d'exemple générées en mémoire (`api/demo.ts`), un visiteur « démo » connecté d'office, rien d'enregistré durablement. Les statuts affichent « Simulation (mode démo) ».
- Places en rue : aucune place pré-remplie ; les signalements faits par le visiteur démo sont étiquetés « exemple ».
- Réservations, favoris, signalements, compteur : fonctionnent en mémoire pendant la vie du serveur, perdus au redémarrage.

## Code présent mais non testé de bout en bout
- Mode réel avec MySQL : comptes, espace propriétaire (annonces, calendrier, demandes), messagerie, notifications, litiges, demandes de remboursement, centre de contrôle admin. Écrit et migré, mais jamais éprouvé avec une vraie base sur Render dans ce dépôt.
- Dépôt de photos et justificatifs (stockage hérité de la plateforme de départ).
- Application native (Capacitor), notifications push, détection de départ en arrière-plan : socle seulement, non générée, non signée.
- Prédiction de stationnement : modèle simple basé sur des observations ; aucune mesure de précision prouvée.

## Ce qui manque pour un vrai lancement
1. **Base de données** gratuite branchée, sauvegardes, tests réels de bout en bout.
2. **Vraies sources de stationnement** : aucun fournisseur branché ; stationnement public et parkings collectifs renvoient une liste vide. Pistes (BNLS, parkings-relais IDFM) dans `docs/DONNEES.md`, à brancher après vérification de licence. Pas de disponibilité temps réel confirmée aujourd'hui.
3. **Offre de places privées réelle** : aujourd'hui uniquement des exemples ; il faut des propriétaires vérifiés et de vraies photos (les images actuelles sont des illustrations).
4. **Comptes** : vérification d'e-mail, réinitialisation de mot de passe, suppression et export de compte (absents).
5. **Paiement légal** : prestataire agréé (Stripe Connect prévu, non configuré), reversements, facturation, remboursements automatisés.
6. **Juridique** : mentions légales, CGU, confidentialité, statut d'intermédiaire, assurances. Seulement des brouillons (`docs/legal/`).
7. **Sécurité et qualité** : points ouverts de `docs/AUDIT.md` (limitation de débit contournable, dépôt de fichiers, lockfile, tests du routeur), typage non vérifié.
8. **Infrastructure** : plan gratuit = veille après 15 min, une seule instance ; à revoir avant un usage réel.
9. **Marché** : aucune donnée d'usage, de rétention ou de revenus n'existe ; ce document n'en avance aucune.
