# État réel du produit GOVAPARK (au 2026-11-05)

Une page, sans exagération. Légende : **Vérifié** = couvert par un test automatique existant dans le dépôt (non rejoué dans l'environnement qui a écrit ce document : npm bloqué) ou observé en production par l'équipe ; **Démo** = fonctionne avec des données d'exemple ; **Non testé** = code présent, jamais vérifié de bout en bout ; **Absent**.

## Ce qui fonctionne en vérité
- Site en ligne sur Render (gratuit), carte 3D (MapLibre) avec repli Leaflet, recherche d'adresse, filtres, itinéraire, mode hors ligne (PWA). *Observé en production par l'équipe ; pas de test automatique d'interface.*
- Règles métier pures, **avec tests unitaires** dans le dépôt : couleur de statut (jamais de vert sans source fiable), prix et commission, réservation (créneaux, conflits, 31 jours max), recherche/filtres, regroupement de marqueurs, validation d'annonce, compteur. Fichiers : `api/*.test.ts`.
- Paiement réellement désactivé dans le code : aucune réservation n'est confirmée ni débitée.

- **Places gratuites en rue (communautaire)** : couche « Places en rue » séparée des places privées. Règles de statut (vert 5 min, orange jusqu'à 10 min, rouge 10 min, disparition), concordance, anti-spam, distance GPS et validation des entrées : **couvertes par des tests unitaires** (`api/street-reports.test.ts`). Boutons « Je libère ma place » / « Je me gare » sur la carte mobile, fiche avec heure et fiabilité, proposition « Libérer la place pour les autres ? » à la fin du compteur : **écrits, non testés en interface** (non rejoués en ligne à ce jour). Version base réelle (table `streetReports`) : **non testée faute de base**. Limite assumée : un signalement n'est jamais une vérité garantie, et la vérification des 50 m repose sur la position envoyée par l'appareil (falsifiable). Aucune place n'existe tant que personne n'a signalé.

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
