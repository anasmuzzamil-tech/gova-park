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

## Animations
CSS seulement, 150 à 250 ms (`--gp-anim` = 200 ms), apparition de la feuille et des toasts. `prefers-reduced-motion: reduce` ramène la durée à 0.

## États
Vide : une phrase et une action. Chargement : squelette (pas de roue). Erreur : message court avec « Réessayer ». Aucun texte « inconnu » visible.

## Écran carte, de haut en bas
1. Recherche + « Ma position » + réglages. 2. Une rangée de puces « Mon véhicule ». 3. La carte, avec à droite le bouton rond « Couches ». 4. Feuille basse. 5. Onglets du bas (inchangés).
Messages : un seul emplacement (toast en haut, sous la recherche, une ligne, 4 s). Source et licence : seulement dans le panneau « i ».
