# Système de design de l'écran carte (GOVAPARK)

Ce document décrit les règles de l'écran carte. Les jetons sont dans `src/styles/tokens.css`, les styles de l'écran dans `src/styles/map-screen.css`. Rien n'est supprimé de `src/index.css` : les nouvelles règles s'ajoutent après lui et gagnent à spécificité égale.
Principe : **la carte d'abord**. Au repos, seulement : recherche flottante, bouton « Ma position », bouton « Couches », une rangée de puces « Mon véhicule », une feuille basse.

## Couleurs
| Jeton | Valeur | Usage |
|---|---|---|
| `--gp-accent` | violet existant (`--primary`) | action principale, puce active |
| `--gp-ink` / `--gp-ink-2` | #17142b / #55526e | texte principal / secondaire (contraste 15:1 / 7:1 sur blanc) |
| `--gp-surface`, `--gp-surface-2`, `--gp-line` | #fff, #f4f3fa, #e6e4f0 | fonds et filets |
| `--gp-green`, `--gp-orange`, `--gp-red`, `--gp-gray` | #12a150, #f08a14, #e5483c, #8a8f9c | statuts, **identiques à `STATUS_COLORS` de `contracts/parking-status.ts`** |
| `--gp-green-ink`, `--gp-orange-ink`, `--gp-red-ink` | #0b7a3b, #8a4b00, #b42318 | texte de statut sur fond clair (AA) |

### Couleur des types de véhicule (puces, regroupements, pictogrammes)
Source unique : `VEHICLE_COLORS` dans `contracts/vehicle-types.ts` = jetons `--gp-v-*` de `tokens.css` (un test vérifie qu'ils sont identiques).
| Type | Couleur | Texte blanc dessus |
|---|---|---|
| Voiture | bleu #2563EB | 5,2:1 |
| Moto | violet #7C3AED (l'ancien accent) | 5,7:1 |
| Livraison | rose #DB2777 | 4,6:1 |
| Vélo | cyan foncé #0E7490 (le cyan demandé #0891B2 n'atteignait que 3,7:1, nuance assombrie) | 5,4:1 |
| Tout | ardoise #1F2937 | 14,7:1 |
**Types d'affichage seulement** (`DISPLAY_COLORS`, jetons `--gp-v-pmr` et `--gp-v-ev`) : PMR brun #78350F (9,1:1 avec du texte blanc) et Électrique fuchsia #A21CAF (6,3:1). Un test impose un écart de couleur (CIE76) d'au moins 25 avec les 5 couleurs ci-dessus, l'accent violet #6d4ae0 et les 4 statuts. Ces deux types n'ont aucun signalement : pas de « Je libère » / « Je me gare » ni de compteur quand ils sont choisis. La rangée de puces (7 puces) défile avec un fondu à droite.
Ces couleurs évitent le vert, l'orange, le rouge et le gris, réservés aux **statuts**. Puce active = fond plein de la couleur du type ; puce inactive = blanche avec un point de 8 px de cette couleur. Regroupements numérotés de « Emplacements Paris » = couleur du type affiché (ardoise en « Tout »). Icône d'un emplacement : anneau de la couleur de son TYPE autour d'un fond de couleur de STATUT (gris sans signalement) ; autocar, PMR, réservé et autre : anneau blanc. « Je me gare », le badge « libre », la feuille « Couches » et le reste de l'interface ne changent pas (couleurs de statut, violet d'accent).

Un statut se lit toujours par la couleur ET par un mot (Libre, Peut-être libre, Prise) : jamais la couleur seule. Mode sombre : il n'existe pas dans l'application, il n'est pas ajouté.

## Forme
- Rayons : 12 px (puces d'info, champs), 16 px (cartes), 24 px (feuille basse, barre de recherche), pilule 999 px (puces, boutons ronds).
- Ombres : niveau 1 `--gp-shadow-1` (puces, boutons ronds), niveau 2 `--gp-shadow-2` (feuilles, barre de recherche).
- Espacements : multiples de 4 px (`--gp-s-1` à `--gp-s-6`). Marge d'écran : 16 px.
- Zone tactile minimale : 44 px (`--gp-touch`) ; boutons ronds de la barre du haut : 56 px (existant), bouton « Couches » : 48 px ; boutons d'action de la feuille : 56 px.

## Typographie (Manrope, déjà chargée)
12 px (légendes, chips), 14 px (texte courant, puces), 16 px (titres de carte, champs : 16 px évite le zoom automatique d'iOS), 20 px (titre de fiche), 24 px (chiffres du compteur). Graisses : 500 texte, 600 libellés, 700 titres.

## Composants (un seul style de chacun)
- **Bouton primaire** : plein violet, texte blanc, 48 px de haut (« Y aller »). **Secondaire** : contour violet sur fond blanc (« Je libère », « Je me gare »). **Discret** : texte violet sans fond. États : pressé = légère réduction (`scale(.97)`), désactivé = 45 % d'opacité et curseur interdit.
- **Puce** (`.m-chip`) : 40 px de haut, pilule, blanche ; active = violet plein. Rangée unique, défilante, sans retour à la ligne.
- **Bouton rond** (`.m-round`) : blanc, ombre 1 ; actif = violet (56 px dans la barre du haut, 48 px pour « Couches »).
- **Interrupteur** (`.gp-switch`) : ligne de 52 px, libellé à gauche, curseur à droite (`role="switch"`), violet quand actif.
- **Carte de place** : 16 px de rayon, titre (type + rue) en 16/700, puces d'info en dessous.
- **Puce d'info** (`.gp-chip-info`) : 12 px, fond `--gp-surface-2`, texte `--gp-ink-2` ; variantes de statut avec teinte foncée.
- **Icônes** : un seul jeu, `lucide-react` (pas d'émoji dans les nouveaux composants).

### Recherche d'adresse : raccourcis et récents (`.m-places`, `src/styles/map-screen.css`)
Panneau sous la barre de recherche, barre vide et touchée : rangée défilante de **puces de lieu** (`.m-fav`, 44 px, pilule, texte 14/700 + adresse 12/500 en dessous, bouton « x » de 36 x 44 px pour supprimer ; puce non définie = contour pointillé « À définir » ; « + Nouveau » en violet), puis titre « Récemment » (12 px, majuscules) et lignes de 44 px avec icône horloge, libellé sur une ou deux lignes et corbeille de 44 px. Pied : « Enregistré sur cet appareil seulement. ». Les règles sont préfixées `.m-places` pour dépasser `.search-suggestions button/span` d'`index.css`. Se ferme au toucher en dehors de la barre.

### Écran de trajet : onglets de mode, cartes de trajet, stationnement à l'arrivée
Dans la carte `.m-route` (hauteur au plus 56 % de l'écran, défilante) de haut en bas : **onglets de mode** (`.m-mode-tabs`, 4 colonnes, 44 px, libellé 12/600 + durée 14/700, actif = fond de la couleur du type `--gp-v-*`, texte blanc) ; **cartes de trajet** (`.m-trip-card`, rayon 16 px, bordure 1,5 px, sélectionnée = bordure et liseré violets sur fond `--gp-surface-2` ; ligne 1 : durée 20/700, distance 14, étiquette pilule violette 12/700 ; ligne 2 : coût et « via » en 14, une ligne, coupée par des points de suspension ; ligne ZFE : trait pointillé violet + texte 12/600) ; mention « Durées sans traffic. » ; bouton primaire vert « Y aller » ; bloc **Stationnement à l'arrivée** (`.m-arrival`, rayon 16 px, titre 12 majuscules, phrase 14/600, « Détails » repliés : signalements avec pastille de couleur ET mot, tarif, source). Le statut se lit par la couleur ET le mot (Libre, Peut-être libre, Prise). Maquette Playwright 390 px : carte de 473 px sur 844, aucun défilement horizontal.

## Mouvement
**Règles** : CSS seulement (aucune bibliothèque), `transform` et `opacity` seulement (jamais de largeur, hauteur ou position animée), durées de 150 à 250 ms (`--gp-anim` = 200 ms ; feuille 250 ms ; fondu de page 150 ms), courbe `--gp-ease` = `cubic-bezier(.2, .8, .2, 1)` (ou `ease-out`). Rien d'animé en fond, pas de confettis, pas de parallaxe. `prefers-reduced-motion: reduce` coupe tout : les blocs d'animation sont sous `@media (prefers-reduced-motion: no-preference)`, `--gp-anim` tombe à 0, la règle globale d'`index.css` ramène le reste à 0,01 ms, et la carte saute (`jumpTo`) au lieu de voler. Code : bloc « Mouvement » de `src/styles/map-screen.css`.
| Élément | Mouvement |
|---|---|
| Feuille basse (replié / mi-hauteur / plein) | elle se pose : montée de 10 px + fondu, 250 ms, rejouée à chaque changement d'état (un nom d'animation par état). Ce n'est pas une feuille qu'on tire au doigt : la hauteur change instantanément, seule l'arrivée est adoucie (changer la hauteur animée serait un décalage de mise en page). Poignée : s'élargit à l'appui. |
| Puces véhicule | appui `scale(.96)`, fondu de couleur, la puce qui devient active s'illumine 250 ms. |
| « Je libère », « Je me gare », « Y aller » | appui `scale(.96)` ; roue (`gp-spin`) sur le bouton touché pendant « Localisation… » / « Envoi… » ; coche qui apparaît 1,5 s après un signalement réussi. |
| Marqueurs | « pop » (`scale` .8 à 1 + fondu, 200 ms) seulement pour les NOUVEAUX marqueurs (mémoire des identifiants déjà vus), jamais si plus de 40 d'un coup. Anneau doux (2,4 s) seulement sur les 30 places en rue VERTES les plus proches du centre de la carte. Les emplacements de Paris sont une couche MapLibre (pas du HTML) : pas de pop propre, MapLibre les fond déjà à l'affichage. |
| Toast | glissement depuis le haut + fondu, sortie douce : animation native de sonner (non modifiée). |
| Compteur « libre » | fondu + translation de 5 px à chaque changement de valeur. |
| Panneaux « Couches » et « i » | fondu + montée de 6 à 8 px. |
| Chargement de la liste | squelettes avec reflet léger (`skeleton-shimmer`, déjà en place). |
| Recherche d'adresse | `flyTo` de 900 ms ; saut direct en reduced-motion. |
| Onglets du bas | fondu de 150 ms de la page qui arrive (opacité seule sur `.app-main > *`, routeur inchangé). |

## États
Vide : une phrase et une action. Chargement : squelette (pas de roue). Erreur : message court avec « Réessayer ». Aucun texte « inconnu » visible.

## Écran carte, de haut en bas
1. Recherche + « Ma position » + réglages. 2. Une rangée de puces « Mon véhicule ». 3. La carte, avec à droite le bouton rond « Couches ». 4. Feuille basse. 5. Onglets du bas (inchangés).
Messages : un seul emplacement (toast en haut, sous la recherche, une ligne, 4 s). Source et licence : seulement dans le panneau « i ».

## Direction visuelle (passe de design du 2026-11-05)
**Principe : « zinc et encre »** : surfaces blanches nettes posées sur la carte, encre violet très sombre pour le texte, un seul accent violet (`--gp-accent-ink` #4a2fb8 pour le texte et les actions, 7,9:1 sur blanc), les couleurs de statut et de type de véhicule **inchangées**. Une seule chose est mise en avant : la barre d'action « compteur · Je libère · Je me gare » ; le reste reste calme.
- **Profondeur** : trois niveaux seulement : filet fin `--gp-ring` (séparation sans bordure), `--gp-shadow-1` (puces, boutons ronds), `--gp-shadow-2` (recherche, barre d'action, feuilles, cartes). Ombres teintées violet, en deux couches.
- **Rayons** : 12 (petits éléments), 16 (boutons internes, blocs), 24 (surfaces flottantes : recherche, cartes, barre, feuille, panneaux), 28 (fiche de place), pilule 999. Plus de 14, 15, 18, 20, 22.
- **Typographie** : Manrope, chiffres tabulaires (prix, distances, compteur). Texte courant **14 px minimum** ; titres de carte 16 ; prix et compteur 24. Exceptions assumées, à 12 px : attribution/licence sous la carte, ligne de diagnostic du panneau « i », mention « libres » de la pastille compteur, étiquettes des onglets du bas, source du bloc d'arrivée. Pas de majuscules en étiquette.
- **Pastille de statut** (`.m-state`) : fond clair teinté + point de la couleur du statut + mot en teinte foncée (AA). Avant : texte blanc sur vert/orange (3,5:1 / 2,4:1, insuffisant). La couleur ET le mot restent.
- **Carte de place en rue** : statut et distance en haut, nom de rue, mention « Place en rue · signalée par un utilisateur » **entière** (elle était tronquée en « signalée p… »). Chaque carte garde sa hauteur propre.
- **Fiche de place** : ligne de statut dans un bloc gris clair, « Y aller » en pilule pleine (54 px), actions secondaires 52 px.
- **Trajets** : cartes comparées compactes (20 px pour la durée), onglets de mode 52 px lisibles à 14 px, « Démarrer » (vert foncé 5,4:1) et « Arrêter » sur la même ligne, bloc d'arrivée en surface propre, hauteurs bornées (route 52 dvh, arrivée 24 dvh) pour que « Démarrer » reste visible. Ces règles sont dans `src/styles/polish.css` mais **ne s'appliquent qu'après fusion de la branche `trajets-waze`** (ces composants n'existent pas encore dans `main`).
- **Mouvement et focus** : inchangés (règles ci-dessus) ; anneau de focus 3 px `--gp-accent-ink` sur puces, boutons, cartes, interrupteurs.
- **Mode sombre** : toujours absent, non ajouté. **Écran d'accueil** : l'application n'en a pas (l'écran de connexion n'a pas été retouché).
Fichiers : `src/styles/tokens.css` (jetons ajoutés : `--gp-ring`, teintes de statut, `--gp-accent-ink`, `--gp-ink-3`), `src/styles/polish.css` (règles, chargé après `map-screen.css`).
