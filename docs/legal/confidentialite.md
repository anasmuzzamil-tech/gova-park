# Politique de confidentialité (route prévue : /confidentialite)

> **BROUILLON - À FAIRE VALIDER PAR UN JURISTE AVANT TOUTE PUBLICATION.**
> Ce document n'est pas un avis juridique et ne prétend pas être conforme à la loi. Il n'est pas branché au site. Les éléments entre crochets [À COMPLÉTER] sont des informations que GOVAPARK ne possède pas encore ou des choix à arbitrer.

Rédigée à partir de ce que le code **collecte réellement** (relecture de `db/schema.ts` et de `api/`). Les finalités, bases légales et durées sont des **propositions** à arbitrer.

## Responsable de traitement
[À COMPLÉTER : identité de l'éditeur, contact, délégué à la protection des données si nécessaire (DPO : à évaluer).]

## Données collectées
| Donnée | Quand | Où elle est conservée | Finalité envisagée | Base légale à valider | Durée de conservation |
|---|---|---|---|---|---|
| Nom, e-mail, mot de passe (haché, jamais en clair) | création de compte | base de données (si branchée) | gérer le compte | exécution du contrat | [À COMPLÉTER] |
| Rôle (conducteur / propriétaire / admin), dates de connexion | compte | base | gestion et sécurité | exécution du contrat, intérêt légitime | [À COMPLÉTER] |
| Position géographique de l'appareil | quand l'utilisateur l'autorise (carte, trajet, alertes, détection de départ) | surtout dans le navigateur ; envoyée au serveur uniquement pour certaines fonctions (voir ci-dessous) | afficher les places proches, guider | consentement (autorisation du navigateur) | [À COMPLÉTER] |
| Signalements de places (coordonnées, type, heure, adresse) liés au compte | signalement | base | disponibilité communautaire | consentement / intérêt légitime | [À COMPLÉTER] |
| Observations agrégées (cellule d'environ 250 m, jour, heure), sans identité | signalement ou vote | base | prédiction de stationnement | intérêt légitime (à valider : anonymisation réelle ?) | [À COMPLÉTER] |
| Alertes de proximité (rayon, type de lieu) | activation des alertes | base | notifications | consentement | [À COMPLÉTER] |
| Jetons de notification push (iOS/Android) | app native uniquement (non publiée) | base | notifications | consentement | [À COMPLÉTER] |
| Réservations (créneau, plaque d'immatriculation facultative, montants) | réservation | base | exécuter la réservation | contrat | [À COMPLÉTER : obligations comptables] |
| Messages entre locataire et propriétaire | messagerie | base | mise en relation | contrat | [À COMPLÉTER] |
| Sessions de compteur de stationnement (début, fin, lieu) | utilisation du compteur | base (ou mémoire en démo) | estimer un coût | contrat / consentement | [À COMPLÉTER] |
| Propriétaires : nom légal, téléphone, pièce d'identité, justificatif de propriété, document de société | vérification du compte propriétaire | stockage de fichiers (prestataire à choisir ; voir docs/AUDIT.md, A8) | prévenir la fraude, vérifier l'identité | obligation légale / intérêt légitime (à valider) | [À COMPLÉTER] |
| Photos et adresse exacte de la place | annonce | stockage / base | publier l'annonce | contrat | [À COMPLÉTER] |
| Journaux techniques (adresse IP côté infrastructure, requêtes API, erreurs navigateur) | navigation | journaux serveur Render | sécurité, diagnostic | intérêt légitime | [À COMPLÉTER] |

Points factuels : le mode démo actuel du site public n'enregistre aucune donnée personnelle (aucune base branchée) ; aucune clé de service n'est envoyée au navigateur ; le paiement est désactivé, donc aucune donnée de carte bancaire n'est collectée.

## Destinataires et transferts
- Hébergeur (Render, États-Unis) : [À COMPLÉTER : garanties de transfert hors Union européenne].
- Services appelés par le navigateur (cartes, recherche d'adresse, itinéraires) : ils reçoivent l'adresse IP et les requêtes de recherche. [À COMPLÉTER : liste exacte et finalité].
- Prestataire de paiement : aucun à ce jour.
- Partage avec d'autres utilisateurs : le propriétaire voit les informations de réservation nécessaires ; l'adresse exacte n'est révélée qu'après certains statuts de réservation.

## Droits des personnes
Accès, rectification, effacement, limitation, portabilité, opposition, retrait du consentement, réclamation auprès de la CNIL. [À COMPLÉTER : adresse de contact et procédure]. Point technique : il n'existe pas aujourd'hui de fonction d'export ni de suppression de compte dans l'application ; à construire ou à traiter manuellement.

## Cookies et stockage local
- Cookie de session (authentification), nécessaire au service.
- Stockage local du navigateur et cache du service worker pour le mode hors ligne (tuiles de carte, dernières places).
- Aucun outil de mesure d'audience ni publicité identifié dans le code relu. [À COMPLÉTER : confirmer par un relevé complet ; bandeau de consentement requis si un traceur non essentiel est ajouté].

## Sécurité
Mots de passe hachés (scrypt), connexion chiffrée en production, limitation de requêtes, contrôle d'accès par rôle. Des faiblesses connues sont listées dans docs/AUDIT.md. [À COMPLÉTER : procédure de notification de violation de données.]

## Mineurs
[À COMPLÉTER].
