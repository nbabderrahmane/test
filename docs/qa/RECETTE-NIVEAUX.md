# Recette des niveaux — Pile Poil (lot A)

Recette qualité des 200 niveaux et des 120 niveaux du jour de `games/tri-couleurs/index.html`, jouée avec de vrais taps sur Chromium émulé (tactile, 360×640 et 320×568). Aucun fichier existant du jeu, des tests, des fiches ni des solutions n'a été modifié (vérifié par `git diff` sur `games/`, `tests/`, `tools/gen-levels.js`, `tools/solutions.json`, `docs/jeux/`) ; je n'ai rien committé. Le dépôt contient un commit « Add level QA scripts (work in progress) » (e06f42a) fait pendant ma session par un autre acteur, qui a enregistré une version intermédiaire de mes scripts ; la version finale de `tools/qa/` et ce rapport sont dans l'arbre de travail, non committés. Scripts : `tools/qa/`. Captures : `/tmp/claude-0/-home-user/3653fa57-520f-59f5-9349-580d753a3fad/scratchpad/qa/` (hors dépôt).

Convention : **[MESURÉ]** = exécuté et chiffré dans cette recette ; **[SUPPOSÉ]** = jugement ou hypothèse, non prouvé ; **seuil** = règle de décision choisie par le testeur (elle n'est pas dans la fiche du jeu).

## 1. Verdict global

1. **Fonctionnel : sans défaut mesuré.** Les 320 niveaux (200 + 120 du jour) ont été gagnés au doigt (`locator.tap()`) en rejouant leur solution, aux deux tailles : 320/320 à 360×640, 320/320 à 320×568, 3 étoiles et compteur de coups justes à chaque fois ; aucun doublon, aucun tube hors écran, aucun chevauchement, aucun défilement, tubes ≥ 44 px.
2. **Qualité de jeu : irrégulière, à corriger avant une démonstration.** Dans les mondes à « un seul tube vide » (4, 7, 9), 33 niveaux sur 60 ont au moins la moitié de leurs premiers coups possibles qui rendent le niveau impossible à gagner (prouvé par recherche exhaustive, recoupé sur 16 niveaux par un second programme) ; en monde 10, 9 niveaux sur 20 mènent presque toujours à une position perdue sans que le jeu le dise. Le jeu ne détecte que « plus aucun coup possible ».
3. **Recommandation : 0 niveau à retirer, 66 à revoir (58 niveaux + 8 niveaux du jour), 254 sans alerte.** Pour montrer le jeu à un client, s'appuyer sur les mondes 1, 2, 3, 5, 6, 8 ; éviter 4, 7 et 9 tant que le point 2 n'est pas traité. Côté textes : trois points de marque à trancher (§ 9).

## 2. Compteurs

| | Niveaux (200) | Niveaux du jour (120) | Total (320) |
|---|---|---|---|
| Joués avec de vrais taps, 360×640 | 200 | 120 | 320 |
| Gagnés (état `won`, écran de victoire, 3★, compteur juste), 360×640 | 200 | 120 | 320 |
| Gagnés, idem, 320×568 | 200 | 120 | 320 |
| En échec | 0 | 0 | 0 |
| **OK** (aucune alerte aux seuils de ce rapport) | 142 | 112 | 254 |
| **À revoir** | 58 | 8 | 66 |
| **À retirer** | 0 | 0 | 0 |

Total de coups joués au doigt : 9564 par passe (19128 sur les deux passes), aucune erreur console, aucune requête réseau. « OK » veut dire : jouable, rendu mesuré sans anomalie, et aucune des alertes de calcul du § 4 ; cela ne dit rien du plaisir de jeu.

## 3. Méthode et ce qui a été exécuté

- **Jouabilité [MESURÉ]** : `tools/qa/play.js`. Pour chaque niveau : `loadLevel(n)` / `loadDaily(i)`, puis chaque coup de `tools/solutions.json` en deux `locator.tap()` sur `[data-tube]`, avec contrôle que le compteur avance à chaque coup ; à la fin `state().won`, overlay de victoire visible, étoiles allumées, `#wMoves` et `#mv` égaux à la longueur de la solution, carte de victoire et boutons (≥ 44 px) dans l'écran.
- **Rendu [MESURÉ]** : `tools/qa/render.js`, 320 niveaux × 2 tailles = 640 mesures `getBoundingClientRect` au départ (zone de jeu, tubes, billes, en-tête, bandeau, message, boutons du bas, défilement, zoom) + sélection d'un tube (bille soulevée) + une capture par mesure.
- **Données [MESURÉ]** : `tools/qa/analyze.js` (conformité à la fiche, doublons à permutation de tubes et de couleurs près par test d'isomorphisme exact, courbe), `tools/qa/opt.js` (A* complet, heuristique admissible : le repère est-il l'optimum ?), `tools/qa/verify-opt.js` (les solutions plus courtes sont rejouées dans le jeu).
- **Joueur naïf [MESURÉ]** : `tools/qa/sim.js`, 200 parties par niveau et par politique, plafond de coups = max(120, 4 × solution). Politique « hasard » : coup légal uniforme. Politique « naïf » (celle des tableaux) : ne défait pas le coup précédent, préfère empiler sur une même couleur plutôt que remplir un tube vide, évite de casser un tube déjà d'une seule couleur. **Impasse** = aucun coup légal (le jeu l'affiche). **Position perdue** = au moins un coup légal mais plus aucune victoire possible (le jeu ne l'affiche pas) : testée par recherche exhaustive à l'état atteint après 4, 8, … 40 coups sur 40 parties par niveau. **Premiers coups fatals** = parmi les coups légaux au départ, ceux qui mènent à une position perdue (recherche exhaustive, recoupée sur 16 niveaux par un second programme indépendant : `tools/qa/crosscheck.js`, 16/16 identiques).
- **Comportements, écrans, textes [MESURÉ]** : `tools/qa/behaviors.js` (33 contrôles, tous passés), `tools/qa/behaviors2.js` (93 contrôles sur 2 à 4 niveaux par mécanique, 91 passés, 2 « impasse non atteinte au hasard » sans gravité), `winworst.js`, `mystery-replay.js`. Captures regardées moi-même, aux deux tailles : 40 niveaux (28 niveaux : les 10e et 20e de chaque monde, plus 1, 21, 185, 195 ; 12 niveaux du jour : 0, 5, 12, 20, 25, 37, 50, 62, 75, 88, 100, 119) dont 4 « suspects » (42, 61, 125, 165), soit 80 vues, plus les écrans accueil, mondes, grille, badges, victoire.
- Non refait : `npm test` (consigne).

## 4. Niveaux « À revoir » et « À retirer »

**À retirer : aucun.** Aucun niveau n'est injouable, déjà gagné, hors règles de la fiche, ni doublon d'un autre (§ 7). Ce n'est pas une validation de leur qualité : voir la liste ci-dessous.

Seuils [seuil] : piège = au moins 50 % des premiers coups fatals ; silence = au moins 90 % des parties naïves en position perdue avant le coup 40 ; facile = le joueur au hasard gagne au moins 90 % des parties (hors respirations en position 1 de chaque groupe de 5 et niveaux 1 à 5) ; pic = au moins +40 % de coups par rapport au niveau précédent dans le même groupe (positions 3 à 5) ; étoiles = repère supérieur de 2 coups ou plus à l'optimum ; jour dur = le joueur au hasard gagne au plus 2 % des parties ; jour facile = au moins 85 %.

Compte par motif : piège 33, silence 16, facile 5, courbe 4, étoiles 7, jour dur 5, jour facile 3. Un niveau peut cumuler plusieurs motifs.

| Niveau | Monde · place | Motif et mesure |
|---|---|---|
| N61 | 4 Le Placard · 1 | **PIEGE** 3/4 premiers coups rendent le niveau ingagnable (prouvé) |
| N63 | 4 Le Placard · 3 | **PIEGE** 3/5 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 |
| N64 | 4 Le Placard · 4 | **PIEGE** 3/6 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 |
| N67 | 4 Le Placard · 7 | **PIEGE** 3/5 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 |
| N68 | 4 Le Placard · 8 | **PIEGE** 4/6 premiers coups rendent le niveau ingagnable (prouvé) ; 2 affichent « Plus aucun coup possible » dès le coup 1 |
| N69 | 4 Le Placard · 9 | **PIEGE** 4/6 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 |
| N70 | 4 Le Placard · 10 | **PIEGE** 4/7 premiers coups rendent le niveau ingagnable (prouvé) ; 2 affichent « Plus aucun coup possible » dès le coup 1 |
| N71 | 4 Le Placard · 11 | **PIEGE** 3/4 premiers coups rendent le niveau ingagnable (prouvé) |
| N73 | 4 Le Placard · 13 | **PIEGE** 3/6 premiers coups rendent le niveau ingagnable (prouvé) ; 3 affichent « Plus aucun coup possible » dès le coup 1 |
| N75 | 4 Le Placard · 15 | **PIEGE** 5/7 premiers coups rendent le niveau ingagnable (prouvé) |
| N79 | 4 Le Placard · 19 | **PIEGE** 4/7 premiers coups rendent le niveau ingagnable (prouvé) ; 3 affichent « Plus aucun coup possible » dès le coup 1 |
| N87 | 5 La Cave · 7 | **FACILE** joueur au hasard gagne 98 % des parties (solution 19 coups) : trop simple pour la place 7 du monde 5 |
| N90 | 5 La Cave · 10 | **SILENCE** 90 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N94 | 5 La Cave · 14 | **SILENCE** 95 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N99 | 5 La Cave · 19 | **COURBE** pic : 31 coups après 21 (+48 %) au sein du même groupe de 5 |
| N102 | 6 La Brume · 2 · mystère | **FACILE** joueur au hasard gagne 91 % des parties (solution 17 coups) : trop simple pour la place 2 du monde 6 |
| N112 | 6 La Brume · 12 · mystère | **FACILE** joueur au hasard gagne 92 % des parties (solution 17 coups) : trop simple pour la place 12 du monde 6 |
| N113 | 6 La Brume · 13 · mystère | **FACILE** joueur au hasard gagne 92 % des parties (solution 21 coups) : trop simple pour la place 13 du monde 6 |
| N118 | 6 La Brume · 18 · mystère | **FACILE** joueur au hasard gagne 98 % des parties (solution 21 coups) : trop simple pour la place 18 du monde 6 |
| N124 | 7 L'Atelier · 4 | **PIEGE** 4/6 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 |
| N128 | 7 L'Atelier · 8 | **PIEGE** 4/6 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; **COURBE** pic : 45 coups après 32 (+41 %) au sein du même groupe de 5 |
| N131 | 7 L'Atelier · 11 | **PIEGE** 2/4 premiers coups rendent le niveau ingagnable (prouvé) ; **SILENCE** 98 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N132 | 7 L'Atelier · 12 | **SILENCE** 90 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N133 | 7 L'Atelier · 13 | **PIEGE** 4/6 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 |
| N134 | 7 L'Atelier · 14 | **PIEGE** 5/7 premiers coups rendent le niveau ingagnable (prouvé) ; 3 affichent « Plus aucun coup possible » dès le coup 1 |
| N135 | 7 L'Atelier · 15 | **PIEGE** 4/7 premiers coups rendent le niveau ingagnable (prouvé) ; 2 affichent « Plus aucun coup possible » dès le coup 1 ; **COURBE** pointe plus basse que la pointe précédente : 55 coups contre 61 au niveau 130 (la fiche demande des pointes croissantes) |
| N136 | 7 L'Atelier · 16 | **PIEGE** 2/4 premiers coups rendent le niveau ingagnable (prouvé) |
| N138 | 7 L'Atelier · 18 | **PIEGE** 3/6 premiers coups rendent le niveau ingagnable (prouvé) ; 2 affichent « Plus aucun coup possible » dès le coup 1 |
| N140 | 7 L'Atelier · 20 | **PIEGE** 6/8 premiers coups rendent le niveau ingagnable (prouvé) ; **ETOILES** repère d'étoiles 70 coups, optimum réel 68 (A* complet) : le repère 3★ n'est pas l'optimum |
| N145 | 8 Le Garage · 5 · mystère | **SILENCE** 90 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N148 | 8 Le Garage · 8 · mystère | **SILENCE** 93 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N162 | 9 Le Hangar · 2 · mystère | **PIEGE** 4/6 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N163 | 9 Le Hangar · 3 · mystère | **PIEGE** 3/6 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N164 | 9 Le Hangar · 4 · mystère | **PIEGE** 4/7 premiers coups rendent le niveau ingagnable (prouvé) ; 3 affichent « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N165 | 9 Le Hangar · 5 · mystère | **PIEGE** 5/7 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N166 | 9 Le Hangar · 6 · mystère | **SILENCE** 93 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N167 | 9 Le Hangar · 7 · mystère | **PIEGE** 4/6 premiers coups rendent le niveau ingagnable (prouvé) ; 2 affichent « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N169 | 9 Le Hangar · 9 · mystère | **PIEGE** 4/7 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N172 | 9 Le Hangar · 12 · mystère | **PIEGE** 4/6 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N173 | 9 Le Hangar · 13 · mystère | **PIEGE** 4/7 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable ; **COURBE** pic : 32 coups après 22 (+45 %) au sein du même groupe de 5 |
| N174 | 9 Le Hangar · 14 · mystère | **PIEGE** 6/8 premiers coups rendent le niveau ingagnable (prouvé) ; 2 affichent « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N175 | 9 Le Hangar · 15 · mystère | **PIEGE** 5/8 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N178 | 9 Le Hangar · 18 · mystère | **PIEGE** 5/7 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N179 | 9 Le Hangar · 19 · mystère | **PIEGE** 4/8 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N180 | 9 Le Hangar · 20 · mystère | **PIEGE** 7/9 premiers coups rendent le niveau ingagnable (prouvé) ; 1 affiche « Plus aucun coup possible » dès le coup 1 ; billes cachées : non devinable |
| N182 | 10 Pile Poil · 2 · mystère | **SILENCE** 95 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N183 | 10 Pile Poil · 3 · mystère | **SILENCE** 95 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N184 | 10 Pile Poil · 4 · mystère | **SILENCE** 95 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **ETOILES** repère d'étoiles 56 coups, optimum réel 53 (A* complet) : le repère 3★ n'est pas l'optimum |
| N185 | 10 Pile Poil · 5 · mystère | **SILENCE** 98 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **ETOILES** repère d'étoiles 61 coups, optimum réel 59 (A* complet) : le repère 3★ n'est pas l'optimum |
| N187 | 10 Pile Poil · 7 · mystère | **ETOILES** repère d'étoiles 50 coups, optimum réel 48 (A* complet) : le repère 3★ n'est pas l'optimum |
| N190 | 10 Pile Poil · 10 · mystère | **SILENCE** 93 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N193 | 10 Pile Poil · 13 · mystère | **ETOILES** repère d'étoiles 51 coups, optimum réel 49 (A* complet) : le repère 3★ n'est pas l'optimum |
| N194 | 10 Pile Poil · 14 · mystère | **ETOILES** repère d'étoiles 60 coups, optimum réel 58 (A* complet) : le repère 3★ n'est pas l'optimum |
| N195 | 10 Pile Poil · 15 · mystère | **SILENCE** 98 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N197 | 10 Pile Poil · 17 · mystère | **SILENCE** 98 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N198 | 10 Pile Poil · 18 · mystère | **SILENCE** 98 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N199 | 10 Pile Poil · 19 · mystère | **ETOILES** repère d'étoiles 63 coups, optimum réel 61 (A* complet) : le repère 3★ n'est pas l'optimum |
| N200 | 10 Pile Poil · 20 · mystère | **SILENCE** 95 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| Jour 4 | 8 couleurs | **DUR** niveau du jour : joueur au hasard ne gagne que 2 % des parties, 100 % perdues avant le coup 40 (solution 30 coups, 8 couleurs) |
| Jour 29 | 9 couleurs | **DUR** niveau du jour : joueur au hasard ne gagne que 2 % des parties, 98 % perdues avant le coup 40 (solution 34 coups, 9 couleurs) |
| Jour 45 | 7 couleurs | **FACILE** niveau du jour : joueur au hasard gagne 87 % des parties (solution 26 coups, 7 couleurs) |
| Jour 51 | 7 couleurs | **FACILE** niveau du jour : joueur au hasard gagne 97 % des parties (solution 26 coups, 7 couleurs) |
| Jour 68 | 9 couleurs | **DUR** niveau du jour : joueur au hasard ne gagne que 1 % des parties, 100 % perdues avant le coup 40 (solution 35 coups, 9 couleurs) |
| Jour 77 | 9 couleurs | **DUR** niveau du jour : joueur au hasard ne gagne que 2 % des parties, 98 % perdues avant le coup 40 (solution 34 coups, 9 couleurs) |
| Jour 104 | 9 couleurs | **DUR** niveau du jour : joueur au hasard ne gagne que 1 % des parties, 100 % perdues avant le coup 40 (solution 36 coups, 9 couleurs) |
| Jour 118 | 8 couleurs | **FACILE** niveau du jour : joueur au hasard gagne 85 % des parties (solution 31 coups, 8 couleurs) |

À surveiller, sous le seuil de piège (30 à 49 % de premiers coups fatals, 16 niveaux) : N65 (2/6), N72 (2/5), N74 (3/7), N77 (2/5), N78 (2/6), N122 (2/5), N125 (2/6), N127 (2/5), N129 (2/6), N130 (3/7), N137 (2/5), N139 (3/7), N161 (2/5), N168 (3/7), N170 (3/8), N177 (2/6).

## 5. Tableau par monde

Solution = longueur de la solution de référence (= repère 3★ à +15 % près). Impasse naïve = part des 200 parties « naïf » qui finissent sur « Plus aucun coup possible » (moyenne des niveaux du monde). Perdu à 40 = impasse ou position perdue avant le coup 40 (40 parties). Premiers coups fatals = moyenne de la part de coups initiaux qui perdent le niveau. Gain au hasard = parties gagnées par la politique naïve avant le plafond.

| Monde | Mécanique | Solution min / médiane / max | Impasse naïve moy. | Perdu à 40 moy. | Premiers coups fatals moy. | Gain au hasard moy. | Niveaux signalés / 20 | Plus petite bille à 320 px |
|---|---|---|---|---|---|---|---|---|
| 1 Le Tiroir | bases | 3 / 21 / 35 | 13 % | 34 % | 0 % | 66 % | 0 | 33 px (symbole 19.1 px) |
| 2 L'Étagère | plus de couleurs | 19 / 30 / 41 | 22 % | 58 % | 0 % | 43 % | 0 | 33 px (symbole 19.1 px) |
| 3 Le Grenier | tube haut | 17 / 29 / 46 | 9 % | 34 % | 0 % | 65 % | 0 | 27 px (symbole 15.7 px) |
| 4 Le Placard | un seul vide | 16 / 25 / 42 | 56 % | 86 % | 47 % | 14 % | 11 | 33 px (symbole 19.1 px) |
| 5 La Cave | tube court | 13 / 22.5 / 37 | 7 % | 45 % | 0 % | 49 % | 4 | 33 px (symbole 19.1 px) |
| 6 La Brume | mystère | 13 / 21 / 34 | 9 % | 24 % | 0 % | 77 % | 4 | 33 px (symbole 19.1 px) |
| 7 L'Atelier | haut + un seul vide | 21 / 41.5 / 70 | 51 % | 91 % | 45 % | 9 % | 10 | 27 px (symbole 15.7 px) |
| 8 Le Garage | court + mystère | 18 / 27.5 / 39 | 18 % | 70 % | 0 % | 32 % | 2 | 33 px (symbole 19.1 px) |
| 9 Le Hangar | un seul vide + mystère | 19 / 31.5 / 53 | 65 % | 92 % | 52 % | 7 % | 14 | 33 px (symbole 19.1 px) |
| 10 Pile Poil | tout | 39 / 52 / 72 | 20 % | 93 % | 1 % | 3 % | 13 | 27 px (symbole 15.7 px) |
| Jour (120) | 4 de haut, 2 vides | 24 / 30 / 37 | 17 % | 63 % | 0 % | 36 % | 8 / 120 | 33 px (symbole 19.1 px) |

Lecture [MESURÉ] : la longueur de solution ne dit pas la difficulté. Les mondes à un seul tube vide (4, 7, 9) ont les plus forts taux d'impasse et de premiers coups fatals alors que leurs solutions ne sont pas plus longues que celles des mondes voisins.

### Courbe de longueur de solution (monde par monde)

| Monde | Niveaux 1 à 20 |
|---|---|
| 1 | 3 · 6 · 13 · 17 · 19 · 21 · 24 · 27 · 29 · 34 · 16 · 18 · 21 · 27 · 30 · 16 · 21 · 25 · 30 · 35 |
| 2 | 20 · 25 · 26 · 30 · 32 · 19 · 25 · 30 · 31 · 34 · 20 · 26 · 31 · 33 · 36 · 19 · 25 · 30 · 34 · 41 |
| 3 | 17 · 23 · 25 · 30 · 31 · 18 · 23 · 29 · 30 · 35 · 17 · 23 · 29 · 37 · 38 · 17 · 24 · 29 · 35 · 46 |
| 4 | 16 · 19 · 22 · 28 · 34 · 17 · 21 · 24 · 32 · 34 · 16 · 23 · 26 · 34 · 35 · 16 · 22 · 26 · 31 · 42 |
| 5 | 13 · 19 · 20 · 24 · 25 · 14 · 19 · 24 · 26 · 31 · 14 · 19 · 24 · 30 · 31 · 13 · 19 · 21 · 31 · 37 |
| 6 | 13 · 17 · 18 · 21 · 22 · 13 · 17 · 21 · 23 · 28 · 13 · 17 · 21 · 25 · 27 · 13 · 17 · 21 · 27 · 34 |
| 7 | 23 · 30 · 33 · 42 · 48 · 22 · 32 · 45 · 53 · 61 · 25 · 32 · 41 · 51 · 55 · 21 · 32 · 42 · 55 · 70 |
| 8 | 18 · 22 · 24 · 29 · 32 · 18 · 24 · 30 · 31 · 36 · 18 · 23 · 28 · 31 · 35 · 18 · 24 · 27 · 33 · 39 |
| 9 | 21 · 24 · 27 · 35 · 39 · 22 · 24 · 31 · 35 · 39 · 19 · 22 · 32 · 39 · 43 · 23 · 25 · 33 · 39 · 53 |
| 10 | 40 · 46 · 51 · 56 · 61 · 39 · 50 · 53 · 58 · 62 · 40 · 47 · 51 · 60 · 71 · 39 · 49 · 61 · 63 · 72 |

- [MESURÉ] Conforme à la fiche : le 20e niveau est le plus long de son monde et le seul de sa longueur dans les 10 mondes ; la respiration au 1er niveau de chaque groupe de 5 est présente dans les mondes 2 à 10 ; les bornes min/max et les paramètres (hauteur, vides, tube court, mystère, nombre de couleurs) de chacun des 200 niveaux correspondent à la table de la fiche (0 écart).
- [MESURÉ] Les pointes ne sont pas toutes croissantes (la fiche le demande) : niveau 135 (55) après le niveau 130 (61) ; égalités aux niveaux 70, 95, 170 ; niveaux 115 et 155 de 1 coup en dessous. Seul le 135 est signalé.
- [MESURÉ] Sauts entre mondes en médiane de solution : monde 6 → 7 : 21 → 41.5 (×1.98) ; monde 9 → 10 : 31.5 → 52 (×1.65) ; monde 7 → 8 : retombée de 41.5 à 27.5. Médianes des mondes 2 à 6 : 30, 29, 25, 22.5, 21 (décroissantes alors que les mécaniques s'ajoutent).
- [MESURÉ] Par le gain d'un joueur au hasard, la difficulté n'est pas monotone : M1 66 %, M2 43 %, M3 65 %, M4 14 %, M5 49 %, M6 77 %, M7 9 %, M8 32 %, M9 7 %, M10 3 %. Le monde 6 (La Brume, mystère, 2 vides) est le plus facile de tous, le monde 4 (premier « un seul tube vide ») passe d'un coup de 65 % à 14 %.
- [SUPPOSÉ] Ces taux viennent de mon joueur simulé ; ils comparent les niveaux entre eux mais ne prédisent pas un joueur humain.

## 6. Niveaux : ce qui est mesuré, par famille

### 6.1 Piège au premier coup (mondes 4, 7, 9)

- [MESURÉ] 33 niveaux ont au moins 50 % de premiers coups fatals : monde 4 : 11, monde 7 : 9, monde 9 : 13. 40 niveaux ont au moins un premier coup qui affiche tout de suite « Plus aucun coup possible : annule ou recommence. » (message vérifié à l'écran sur le niveau 63 après 1 coup, capture `screens/stuck-360.png`).
- Niveau d'introduction du monde 4 (N61, « Un seul tube vide : réfléchis avant de bouger. ») : 3 premiers coups sur 4 perdent le niveau ; le joueur au hasard le gagne 21 % du temps.
- Monde 9 (mystère + un seul vide) : les mêmes pièges, avec des billes cachées. [MESURÉ] à 2 coups, en moyenne 46 % des suites de 2 coups perdent le niveau (monde 4 : 38 %, monde 7 : 31 %) ; [SUPPOSÉ] un joueur qui ne voit que les sommets ne peut pas distinguer les coups sûrs des coups fatals et doit deviner dès le coup 1.
- Mondes mystère à 2 vides ou avec tube court (6 et 8) : premiers coups fatals 0 %, pas de devinette forcée au départ ; 2 coups : 2 % (monde 6), 7 % (monde 8). Monde 10 : premiers coups fatals 1 %, 2 coups 11 %.
- Annuler et Recommencer sont toujours présents et le message d'impasse est clair ; le défaut est le coût d'un premier tap raté sur des niveaux d'introduction de mécanique, pas l'absence d'issue (règle 9 de `AGENTS.md` respectée, mesuré).

### 6.2 Position perdue sans message (surtout monde 10)

- [MESURÉ] Le jeu ne signale que l'absence de coup légal. Après 40 coups « naïfs », 87 % des parties du monde 10 sont dans une position perdue qui autorise encore des coups (monde 8 : 60 %, monde 5 : 43 %). Médiane de la profondeur à laquelle la partie est perdue (niveaux du monde 10) : coup 8.
- 16 niveaux dépassent le seuil de 90 % : N90, N94, N131, N132, N145, N148, N166, N182, N183, N184, N185, N190, N195, N197, N198, N200.
- [SUPPOSÉ] Un joueur ordinaire continue de jouer sans comprendre pourquoi il n'arrive pas à finir. Un indice (« cette position ne peut plus être gagnée ») demanderait un solveur dans le jeu : non prévu par la fiche.

### 6.3 Niveaux triviaux ou donnés

- [MESURÉ] Le joueur au hasard gagne au moins 90 % des parties sur 26 niveaux : N1, N2, N3, N4, N5, N11, N16, N21, N41, N46, N51, N56, N86, N87, N91, N96, N101, N102, N106, N111, N112, N113, N116, N118, N146, N151. Les niveaux en position 1 de leur groupe (respiration voulue par la fiche) et les niveaux 1 à 5 sont exclus des alertes ; restent signalés : N87, N102, N112, N113, N118.
- [MESURÉ] Les niveaux 4 et 5 (solutions de 17 et 19 coups) sont gagnés au hasard dans 95 % et 99 % des cas : compatibles avec « premiers niveaux très faciles » de `AGENTS.md`.
- [MESURÉ] Aucun niveau n'est déjà gagné au départ ; aucun niveau n'a plus d'un tube déjà rangé au départ (hors niveaux 1 à 10 hérités du lot 1).
- Étoiles données ? [MESURÉ] Le joueur naïf obtient 3★ (≤ repère + 15 %) dans au moins 20 % des parties sur : N1 (100 %), N66 (21 %), N76 (22 %), N77 (25 %). Niveau 1 : repère 5 coups pour une solution de 3, donc 3★ à tout joueur (tutoriel). Aucun niveau du jour : 0 % de 3★ au hasard.
- Étoiles inatteignables ? [MESURÉ] Non : la solution de référence donne 3★ sur les 320 niveaux, aux deux tailles, au doigt.

### 6.4 Le repère d'étoiles est-il l'optimum ?

- [MESURÉ] A* complet sur les 320 niveaux (aucun abandon) : le repère égale l'optimum sur 307 niveaux et est plus long que l'optimum sur 13 : N60 (46 → 45), N140 (70 → 68), N145 (32 → 31), N184 (56 → 53), N185 (61 → 59), N187 (50 → 48), N188 (53 → 52), N189 (58 → 57), N190 (62 → 61), N193 (51 → 49), N194 (60 → 58), N197 (49 → 48), N199 (63 → 61).
- Chaque solution plus courte a été rejouée au doigt dans le jeu (`verify-opt.js`, 13/13 gagnées, 3★, compteur égal à l'optimum). La fiche annonçait « environ 16 niveaux sur 20 du monde 10 » non prouvés optimaux ; mon A* les prouve ou les améliore tous, donc l'écart est de 1 à 3 coups sur 13 niveaux seulement. Impact : le repère 3★ (repère + 15 %, au moins +2) laisse un peu plus de marge qu'annoncé ; 7 niveaux ont un écart de 2 coups ou plus (signalés).

## 7. Doublons

- [MESURÉ] 320 niveaux comparés deux à deux (200 + 120 du jour) après filtrage par invariants puis test d'isomorphisme exact (permutation des tubes et renommage des couleurs) : **0 doublon**, y compris entre niveaux et niveaux du jour.
- [MESURÉ] Quasi-doublons à lettres identiques (au moins 4 tubes identiques, à l'ordre près) : **0**.
- [MESURÉ] 10 groupes de niveaux partagent le même multiset de « profils de tubes » (mêmes formes, couleurs reliées autrement) : N8/N178 ; N74/N153/J96 ; N90/J27 ; N100/J88/J103 ; N113/N147 ; N114/J15 ; J4/J79 ; J7/J10 ; J63/J90 ; J76/J115. Ce ne sont pas des doublons (non isomorphes) ; ressemblance de structure seulement.

## 8. Comportements vérifiés (vrais taps, Chromium émulé 360×640 ; la victoire à 1 étoile et les écrans aussi à 320×568)

| Contrôle | Résultat | Détail mesuré |
|---|---|---|
| victoire à 1 étoile : 33 coups -> 1 étoile(s) (par 13, limites 3★≤15, 2★≤19) | OK |  |
| textes de partage capturés | OK | ["Pile Poil · Niveau 20 en 35 coups ⭐⭐⭐","Pile Poil · Niveau 20 en 35 coups. À toi de faire mieux ! file:///home/user/test/games/tri-couleurs/index.html#defi-20-35"] |
| victoire à 1 étoile : 33 coups -> 1 étoile(s) (par 13, limites 3★≤15, 2★≤19) | OK |  |
| coup interdit (couleur différente) refusé avec message | OK | message « Même couleur ou tube vide seulement. », coups 1 |
| coup interdit vers un tube plein : message | OK | message « Ce tube est plein. » |
| tube court refuse une 3e bille (niveau 83) | OK | message « Tube court : 2 billes au plus. », billes 2 |
| impasse signalée (niveau 63, 1 coups) | OK | message « Plus aucun coup possible : annule ou recommence. », boutons btn need / btn need |
| Annuler depuis l'impasse : le message disparaît | OK | coups 1 -> 0, stuck=false |
| Annuler x2 : compteur et billes revenus 2 coups en arrière | OK | coups 6 -> 4 |
| Recommencer : retour à l'état initial, 0 coup | OK |  |
| Annuler et Recommencer désactivés à 0 coup | OK | [true,true] |
| Quitter vers l'accueil et « Continuer » reprend la partie (5 coups) | OK |  |
| Fermer/rouvrir la page puis « Continuer » : partie reprise coup pour coup | OK | écran après reload : home |
| mystère niveau 101 : seules les billes du dessus visibles au départ (12 cachées, attendu 12) | OK |  |
| mystère 101 : première révélation au coup 1 sur le tube source (dessus découvert) | OK |  |
| mystère 101 : bille reste révélée après Annuler (retour à 0 coup) | OK | cachées 11 (au coup 1) / 10 (coup suivant) -> 10 après annulation |
| mystère 101 : bille reste révélée après Recommencer | OK | cachées 10 (attendu 10) |
| mystère 101 : bille reste révélée après rechargement | OK | niveau 101, cachées 10 (attendu 10) |
| mystère niveau 150 : seules les billes du dessus visibles au départ (24 cachées, attendu 24) | OK |  |
| mystère 150 : première révélation au coup 1 sur le tube source (dessus découvert) | OK |  |
| mystère 150 : bille reste révélée après Annuler (retour à 0 coup) | OK | cachées 23 (au coup 1) / 22 (coup suivant) -> 22 après annulation |
| mystère 150 : bille reste révélée après Recommencer | OK | cachées 22 (attendu 22) |
| mystère 150 : bille reste révélée après rechargement | OK | niveau 150, cachées 22 (attendu 22) |
| mystère niveau 165 : seules les billes du dessus visibles au départ (21 cachées, attendu 21) | OK |  |
| mystère 165 : première révélation au coup 1 sur le tube source (dessus découvert) | OK |  |
| mystère 165 : bille reste révélée après Annuler (retour à 0 coup) | OK | cachées 20 (au coup 1) / 19 (coup suivant) -> 19 après annulation |
| mystère 165 : bille reste révélée après Recommencer | OK | cachées 19 (attendu 19) |
| mystère 165 : bille reste révélée après rechargement | OK | niveau 165, cachées 19 (attendu 19) |
| mystère niveau 185 : seules les billes du dessus visibles au départ (36 cachées, attendu 36) | OK |  |
| mystère 185 : première révélation au coup 1 sur le tube source (dessus découvert) | OK |  |
| mystère 185 : bille reste révélée après Annuler (retour à 0 coup) | OK | cachées 35 (au coup 1) / 34 (coup suivant) -> 34 après annulation |
| mystère 185 : bille reste révélée après Recommencer | OK | cachées 34 (attendu 34) |
| mystère 185 : bille reste révélée après rechargement | OK | niveau 185, cachées 34 (attendu 34) |

Notes :
- Coup interdit : le message « Même couleur ou tube vide seulement. » (couleur différente), « Ce tube est plein. » (tube plein) et « Tube court : 2 billes au plus. » (tube court) s'affichent, le tube secoue, aucun coup n'est compté.
- Tube court : refus de la 3e bille vérifié sur 4 niveaux, dont 2 avec billes mystère (voir 8.2).
- Mystère : testé sur les niveaux 101 (monde 6), 150 (monde 8), 165 (monde 9), 185 (monde 10) ; une bille cachée n'a ni couleur ni symbole dans le DOM, la bille du dessous est révélée dès que la bille du dessus quitte le tube, et reste révélée après Annuler, Recommencer et rechargement.
- [MESURÉ] Conséquence de la règle « les billes révélées le restent » : après avoir gagné un niveau mystère puis « Rejouer », il ne reste que 1 bille cachée sur 12 (N101), 0 sur 24 (N150), 1 sur 36 (N185). Un niveau mystère rejoué n'est donc plus mystère (conforme à la fiche, mais à savoir pour une démonstration : la deuxième partie d'un niveau est un autre jeu).

### 8.2 Deuxième passe : au moins 2 niveaux par mécanique (vrais taps, 360×640)

`tools/qa/behaviors2.js` : sur chaque niveau, coup interdit (couleur différente, tube plein), Annuler ×2, quitter puis « Continuer », rechargement puis « Continuer », impasse atteinte par une marche au hasard (graine fixe, jusqu'à 60 parties), Annuler depuis l'impasse ; puis refus de la 3e bille du tube court.

| Mécanique | Niveaux testés | Contrôles passés | Écart |
|---|---|---|---|
| tube haut | N45, N50, N130 | 21/21 | aucun |
| un seul tube vide | N70, N124 | 14/14 | aucun |
| tube court | N83, N90, N146, N190, N84 | 28/29 | N146 : impasse signalée (la marche au hasard n'a pas atteint d'impasse : niveaux à 2 vides, impasse rare ; pas un défaut du jeu) |
| mystère | N101, N150, N165, N190 | 26/27 | N101 : impasse signalée (la marche au hasard n'a pas atteint d'impasse : niveaux à 2 vides, impasse rare ; pas un défaut du jeu) |
| tube court + mystère | N142, N143 | 2/2 | aucun |
| **Total** | | **91/93** | 2 non atteint(s), voir ci-dessus |

## 9. Image de marque : textes, écrans, rendu

### 9.1 Textes relus (tous les textes affichés dans accueil, mondes, grille, badges, jeu, victoire, partage, défi)

Relu à partir du code et des écrans réellement affichés (inventaire dans `behaviors.json`). **Aucune faute d'orthographe ni de grammaire trouvée** [MESURÉ par relecture], aucun texte tronqué ni débordant à 360×640 et 320×568 sur les 17 écrans parcourus (détection `scrollWidth > clientWidth`, 0 cas).

| # | Gravité | Texte / écran | Constat | Suggestion |
|---|---|---|---|---|
| T1 | Moyenne | Bandeau de défi, `screens/360x640-challenge-banner.png` | Deux objectifs de coups différents à l'écran en même temps : « Objectif : 40 coups ou moins » (défi) et « ★★★ en 41 coups ou moins » (étoiles). Le joueur ne sait pas lequel compte. [MESURÉ] | Masquer la ligne des étoiles pendant un défi ou la libeller « Étoiles : … ». |
| T2 | Moyenne | Rang 6 « Maniaque » | [SUPPOSÉ] « maniaque » peut se lire comme une insulte ou une connotation déplacée (obsessionnel, voire « maniaque sexuel » dans certains usages), surtout hors France ; à ne pas mettre devant des clients d'une grande marque. | « Méticuleux » ou « Minutieux ». |
| T3 | Faible | Rangs « Fouillis » (rang 1), « Rangeur » (rang 4) | « Fouillis » est un peu dévalorisant pour le tout premier rang ; « rangeur » n'est pas un mot courant du français (je ne l'ai pas vérifié dans un dictionnaire). [SUPPOSÉ] | « Débutant » ; « Ordonné ». |
| T4 | Faible | Défi perdu : « Raté de 2 coups » | Ton sec, un peu brutal pour un message de partage entre amis ; incohérent avec « Bien joué ! ». [SUPPOSÉ] | « Presque ! 2 coups de trop ». |
| T5 | Faible | « Pile poil » (nom du jeu, titre de victoire, rang 8, monde 10) | Expression familière très française, 4 emplois différents du même mot (jeu, titre, monde, rang) ; la compréhension par un public d'Afrique francophone n'a pas pu être testée. [SUPPOSÉ] | Faire valider le nom par un panel local ; éviter de réemployer « Pile Poil » comme nom de monde et de rang. |
| T6 | Faible | Ton | Tutoiement partout (« réfléchis », « annule ou recommence », « À toi de faire mieux ! »). Cohérent dans le jeu ; à confronter à la charte de la marque (vouvoiement possible). [SUPPOSÉ] | Décision de marque. |
| T7 | Faible | Sous-titres de monde | Formulations elliptiques et inégales : « bases », « hauts, un seul vide » (« hauts » sans nom), « court et mystère », « tout ensemble » ; singulier et pluriel mêlés (« tube court » / « tubes hauts »). Les messages d'aide du 1er niveau de chaque monde sont, eux, clairs. [MESURÉ] | Reprendre le libellé complet des aides (« Tubes hauts et un seul tube vide »). |
| T8 | Faible | Typographie | Aucune espace insécable (0 occurrence dans le fichier) devant « ! », « : » : « Pile poil ! » ou « Série : 7 jours » peuvent se couper avant la ponctuation. Apostrophes mélangées : droites (« L'Étagère », « L'Atelier ») et courbes (« d’un monde », « aujourd’hui »). [MESURÉ] | Uniformiser. |
| T9 | Faible | Partage | Le lien du défi reprend l'adresse courante de la page si `MJ_CONFIG.shareBaseUrl` n'est pas renseigné ; mesuré en test : `file:///…/index.html#defi-20-35`. Dans une webview ce lien peut être inutilisable pour le destinataire. Texte lui-même correct : « Pile Poil · Niveau 20 en 35 coups ⭐⭐⭐ » et « … À toi de faire mieux ! ». [MESURÉ] | Fournir `shareBaseUrl` à l'intégration. |
| T10 | Faible | Noms de mondes | Le Tiroir, L'Étagère, Le Grenier, Le Placard, La Cave, La Brume, L'Atelier, Le Garage, Le Hangar : rien de choquant ; univers très « maison européenne » (cave, grenier, placard). [SUPPOSÉ] | Neutre, à valider avec le public visé. |

Rien d'autre ne m'a paru poser problème : « Pas encore joué », « Fait pour aujourd’hui », « Entraînement : la série ne bouge pas », « Déjà compté aujourd’hui », « Défi relevé ! », « Copié ! », « Copie impossible », « Plus aucun coup possible : annule ou recommence. », les descriptions de badges et les libellés des boutons (relus, sans remarque autre que T1 à T10).

### 9.2 Rendu [MESURÉ]

| Contrôle | 360×640 | 320×568 |
|---|---|---|
| Mesures de départ (niveaux + jour) | 320 | 320 |
| Défilement horizontal ou vertical, page décalée, zoom | 0 | 0 |
| Tube ou bille hors écran / hors zone de jeu | 0 | 0 |
| Tubes qui se chevauchent entre eux ; avec en-tête, bandeau, message ou boutons du bas | 0 | 0 |
| Bille soulevée (tube sélectionné) hors zone | 0 | 0 |
| Largeur minimale d'un tube | 44 px | 44 px (cible ≥ 44 px : atteint, sans marge) |
| Plus petite bille | 32 px | 27 px |
| Plus petit symbole | 18.5 px | 15.7 px |
| Titre de monde tronqué | 0 | 0 |
| Carte de victoire et boutons dans l'écran (320 niveaux gagnés) | oui, boutons ≥ 48 px | oui, boutons ≥ 46 px |

- Captures regardées par moi (planches) : `sheets/A360.png` … `E360.png` et `A320.png` … `E320.png` ; captures individuelles : `start/<taille>-N<n>.png`, `start/<taille>-J<i>.png` (640 fichiers). Aucun défaut visuel bloquant constaté : tubes alignés, billes complètes, symboles identifiables sur les 80 vues regardées.
- [MESURÉ] Symboles les plus petits : 15.7 px à 320×568, dans les niveaux à tubes hauts (hauteur 5) et denses : 47 niveaux (mondes 3, 7, 10). Sur les captures regardées (N50, N60, N130, N140, N185, N190, N195, N200 à 320), les symboles restent lisibles ; [SUPPOSÉ] sur un petit écran réel en plein soleil, c'est la limite.
- Observation de style (captures `start/320x568-J2.png`, `start/360x640-N20.png`) : les petits ergots du bord supérieur de chaque tube se touchent d'un tube à l'autre et forment une ligne continue en haut d'une rangée (chevauchement de 2 à 6 px mesuré sur les ergots). Cosmétique, probablement voulu ; à signaler au graphiste.
- **Couleurs** [MESURÉ, par calcul `tools/qa/colors.js`] : les 10 couleurs sont toutes séparées d'au moins 16,6 (ΔE 2000) en vision normale (plus proches : bleu/violet 16,6, rouge/orange 19,8). Sous simulation de daltonisme (modèle de Machado, calcul, pas un test sur personnes) : jaune/citron 0,9 (protanopie), bleu/violet 1,6 (deutéranopie), rouge/orange 5,1 (tritanopie) : confondables par la couleur seule.
  Chaque couleur porte un symbole distinct (anneau, triangle, étoile, carré, losange, croix, cœur, lune, barres, goutte), donc jamais « couleur seule » (règle 8). Le couple bleu/violet est présent ensemble dans 297 des 320 niveaux ; jaune/citron dans 3. [MESURÉ] La lisibilité des symboles est donc essentielle pour les joueurs daltoniens. Confusion visuelle possible losange/carré à 16 px : non observée sur les captures, non testée sur des joueurs.
- Écrans parcourus aux deux tailles, avec une sauvegarde neuve, une sauvegarde pleine (480 étoiles, tous badges) et une sauvegarde partielle : accueil, mondes (verrouillés et ouverts), grille de monde (1, 2 et 10), badges (aucun / tous), jeu, victoire 3★, victoire 1★, victoire du jour avec badge « Série de 7 », victoire la plus chargée (rang + 5 badges + défi relevé : la carte tient à 320×568 avec 1 px de marge, `screens/320x568-win-worst.png`). Aucun écran ne défile, aucun texte tronqué.

## 10. Niveaux du jour (120)

- [MESURÉ] Conformes à la fiche : hauteur 4, 2 tubes vides, aucun tube court, aucune bille mystère, 7 à 9 couleurs, solutions de 24 à 37 coups (médiane 30) ; aucun premier coup fatal ; aucun doublon.
- [MESURÉ] « Difficulté moyenne » ? Elle dépend surtout du nombre de couleurs : gain d'un joueur au hasard 52 % à 7 couleurs (40 niveaux), 37 % à 8 (40), 18 % à 9 (40). Selon le jour, le même « niveau du jour » est donc très facile ou très dur : le plus facile (jour 51, solution 26) est gagné à 97 %, le plus dur (jour 104, solution 36) à 1 %.
- Signalés : très faciles Jour 45, Jour 51, Jour 118 ; très durs Jour 4, Jour 29, Jour 68, Jour 77, Jour 104. [SUPPOSÉ] Pour un client qui ouvre le jeu le jour d'un niveau très dur, la série et le défi du jour peuvent frustrer.
- Le niveau du jour dépend de l'horloge du téléphone (`todayNum()` modulo 120) : non testé avec de vraies dates, seulement avec `setToday` (victoire du jour et série vérifiées sur une date simulée).

## 11. Les 10 problèmes les plus graves

1. **Premier tap fatal dans les mondes à un seul tube vide.** 33 niveaux (monde 4 : 11, monde 7 : 9, monde 9 : 13) perdent au moins 50 % de leurs premiers coups ; le niveau d'introduction du monde 4 (N61) en perd 3 sur 4. [MESURÉ, recoupé]
2. **Monde 9 (mystère + un seul vide) : devinette forcée.** Mêmes pièges avec billes cachées : 52 % de premiers coups fatals en moyenne, 46 % des suites de 2 coups. [MESURÉ ; l'effet sur le joueur est SUPPOSÉ]
3. **Positions perdues sans message.** 16 niveaux (surtout monde 10 : 9/20) mènent à une position perdue encore jouable dans au moins 90 % des parties naïves ; le jeu ne signale que l'absence de coup. [MESURÉ]
4. **Niveaux mystère : plus de mystère à la 2e partie.** Après victoire puis « Rejouer », il reste 0 à 1 bille cachée sur 12 à 36 (N101, N150, N185). Conforme à la fiche, mais à décider avant une démo. [MESURÉ]
5. **Courbe de difficulté non monotone.** Médianes de solution décroissantes de 2 à 6, saut ×2.0 au monde 7 puis chute au monde 8, saut ×1.7 au monde 10 ; gain au hasard 77 % au monde 6 puis 9 % au monde 7. Pics : N99, N128, N173 (+41 à +48 % d'un niveau à l'autre), pointe N135 plus basse que N130. [MESURÉ]
6. **Bandeau de défi à deux objectifs** (40 coups pour le défi, 41 pour les étoiles, en même temps). [MESURÉ, capture]
7. **Niveaux du jour d'une difficulté très variable** (7 à 9 couleurs : 52 % contre 18 % de gain au hasard ; jour 51 contre jour 104). [MESURÉ]
8. **Repère d'étoiles non optimal sur 13 niveaux** (jusqu'à 3 coups : N184 56 → 53) ; les 3★ sont plus faciles que prévu, et un joueur très fort peut battre le repère. [MESURÉ, rejoué dans le jeu]
9. **Rang « Maniaque »** et ton « Raté de N coups » (§ 9.1 T2, T4) : risque d'image pour une grande marque. [SUPPOSÉ]
10. **Lien de défi sans `shareBaseUrl`** : adresse courante de la page (mesuré : `file://…`), inutilisable pour le destinataire. [MESURÉ en test ; effet en production SUPPOSÉ]

## 12. Ce que je n'ai PAS pu vérifier

- **Appareil réel** : tout est en Chromium émulé (tactile et `isMobile` simulés, même moteur que les tests existants). Pas de vrai téléphone, pas de WebView Android d'entrée de gamme, pas de Safari iOS, pas de mesure de fluidité ni de poids mémoire, pas de ressenti du doigt sur 44 px.
- **Plaisir de jeu et difficulté réelle** : aucun jugement humain. Mes taux (joueur au hasard, « naïf ») sont une simulation ; ils comparent les niveaux entre eux, ils ne remplacent pas un test avec des joueurs. « OK » ne veut pas dire « amusant ».
- **Perception des couleurs** : calculs de contraste et simulation de daltonisme uniquement ; aucun test sur écran réel, sous soleil, ni avec des joueurs daltoniens.
- **Public d'Afrique francophone** : mon avis sur les mots (« Maniaque », « Pile poil », « Rangeur ») est une hypothèse de relecteur, pas un test auprès de ce public.
- **Accessibilité** : `aria-label` présents et cohérents ; lecteur d'écran, navigation clavier, ordre de focus non testés ; [SUPPOSÉ] les boutons du jeu restent dans le DOM sous les écrans plein cadre et pourraient rester atteignables au clavier ou au lecteur d'écran.
- **Niveau du jour avec vraies dates**, fuseaux horaires, minuit, retour d'horloge : seulement `setToday` sur un cas de victoire du jour. Série, jokers, rangs et badges : pas rejoués ici (déjà couverts par `npm test`, que je n'ai pas relancé).
- **Partage réel** : `navigator.share` simulé (texte capturé) ; le repli presse-papiers (« Copié ! » / « Copie impossible ») n'a pas été exercé.
- **Parcours de 200 niveaux d'affilée par un humain** (déblocage progressif, 3 niveaux à la suite, fatigue) : non fait ; chaque niveau a été chargé directement par `loadLevel`, sans passer par le déblocage progressif.
- **Solveur** : mes figures « premiers coups fatals », « positions perdues » et « optimum » viennent de mon programme (lib.js) ; recoupement indépendant seulement pour les premiers coups fatals de 16 niveaux et pour les 13 solutions plus courtes (rejouées dans le jeu). Les taux de « position perdue » reposent sur 40 sondages par niveau (± 8 points environ), et sur un plafond de 4000 états pour conclure (sondages non conclus : 1 % en moyenne au monde 10, ~0 ailleurs ; suites de 2 coups non conclues : 13 % au monde 10, donc les chiffres « 2 coups » du monde 10 sont des minimums).

## Annexe A. Tous les niveaux, un par un

Taps 360 / 320 = solution rejouée au doigt, gagnée avec 3★. Rendu = géométrie sans anomalie (360 / 320). Hasard = parties gagnées par le joueur naïf. Imp. = parties finissant sur « Plus aucun coup possible ». Perdu 40 = impasse ou position perdue avant le coup 40. 1er fatal = premiers coups légaux qui perdent le niveau. Opt. = optimum calculé.

| Niveau | Monde·pl. | Sol. | Opt. | Taps 360 | Taps 320 | Rendu | Hasard | Imp. | Perdu 40 | 1er fatal | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| N1 | 1·1 | 3 | 3 | OK | OK | OK | 100 % | 0 % | 0 % | 0/2 | OK |
| N2 | 1·2 | 6 | 6 | OK | OK | OK | 100 % | 0 % | 0 % | 0/6 | OK |
| N3 | 1·3 | 13 | 13 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N4 | 1·4 | 17 | 17 | OK | OK | OK | 95 % | 2 % | 10 % | 0/10 | OK |
| N5 | 1·5 | 19 | 19 | OK | OK | OK | 99 % | 0 % | 0 % | 0/10 | OK |
| N6 | 1·6 | 21 | 21 | OK | OK | OK | 78 % | 11 % | 10 % | 0/12 | OK |
| N7 | 1·7 | 24 | 24 | OK | OK | OK | 68 % | 17 % | 40 % | 0/14 | OK |
| N8 | 1·8 | 27 | 27 | OK | OK | OK | 39 % | 17 % | 75 % | 0/14 | OK |
| N9 | 1·9 | 29 | 29 | OK | OK | OK | 53 % | 5 % | 40 % | 0/16 | OK |
| N10 | 1·10 | 34 | 34 | OK | OK | OK | 12 % | 22 % | 80 % | 0/18 | OK |
| N11 | 1·11 | 16 | 16 | OK | OK | OK | 100 % | 0 % | 0 % | 0/10 | OK |
| N12 | 1·12 | 18 | 18 | OK | OK | OK | 85 % | 0 % | 18 % | 0/10 | OK |
| N13 | 1·13 | 21 | 21 | OK | OK | OK | 81 % | 19 % | 28 % | 0/12 | OK |
| N14 | 1·14 | 27 | 27 | OK | OK | OK | 20 % | 1 % | 80 % | 0/14 | OK |
| N15 | 1·15 | 30 | 30 | OK | OK | OK | 14 % | 46 % | 83 % | 0/16 | OK |
| N16 | 1·16 | 16 | 16 | OK | OK | OK | 93 % | 0 % | 8 % | 0/10 | OK |
| N17 | 1·17 | 21 | 21 | OK | OK | OK | 85 % | 0 % | 13 % | 0/12 | OK |
| N18 | 1·18 | 25 | 25 | OK | OK | OK | 50 % | 14 % | 43 % | 0/14 | OK |
| N19 | 1·19 | 30 | 30 | OK | OK | OK | 32 % | 34 % | 68 % | 0/16 | OK |
| N20 | 1·20 | 35 | 35 | OK | OK | OK | 14 % | 67 % | 90 % | 0/18 | OK |
| N21 | 2·1 | 20 | 20 | OK | OK | OK | 95 % | 4 % | 8 % | 0/12 | OK |
| N22 | 2·2 | 25 | 25 | OK | OK | OK | 42 % | 0 % | 57 % | 0/14 | OK |
| N23 | 2·3 | 26 | 26 | OK | OK | OK | 22 % | 14 % | 80 % | 0/14 | OK |
| N24 | 2·4 | 30 | 30 | OK | OK | OK | 31 % | 22 % | 73 % | 0/16 | OK |
| N25 | 2·5 | 32 | 32 | OK | OK | OK | 62 % | 27 % | 43 % | 0/16 | OK |
| N26 | 2·6 | 19 | 19 | OK | OK | OK | 83 % | 17 % | 13 % | 0/12 | OK |
| N27 | 2·7 | 25 | 25 | OK | OK | OK | 44 % | 7 % | 60 % | 0/14 | OK |
| N28 | 2·8 | 30 | 30 | OK | OK | OK | 38 % | 21 % | 60 % | 0/16 | OK |
| N29 | 2·9 | 31 | 31 | OK | OK | OK | 9 % | 34 % | 85 % | 0/16 | OK |
| N30 | 2·10 | 34 | 34 | OK | OK | OK | 30 % | 55 % | 68 % | 0/18 | OK |
| N31 | 2·11 | 20 | 20 | OK | OK | OK | 85 % | 7 % | 10 % | 0/12 | OK |
| N32 | 2·12 | 26 | 26 | OK | OK | OK | 73 % | 7 % | 40 % | 0/14 | OK |
| N33 | 2·13 | 31 | 31 | OK | OK | OK | 62 % | 7 % | 43 % | 0/16 | OK |
| N34 | 2·14 | 33 | 33 | OK | OK | OK | 44 % | 43 % | 63 % | 0/18 | OK |
| N35 | 2·15 | 36 | 36 | OK | OK | OK | 3 % | 45 % | 93 % | 0/18 | OK |
| N36 | 2·16 | 19 | 19 | OK | OK | OK | 72 % | 9 % | 40 % | 0/12 | OK |
| N37 | 2·17 | 25 | 25 | OK | OK | OK | 51 % | 0 % | 55 % | 0/14 | OK |
| N38 | 2·18 | 30 | 30 | OK | OK | OK | 9 % | 14 % | 93 % | 0/16 | OK |
| N39 | 2·19 | 34 | 34 | OK | OK | OK | 6 % | 45 % | 90 % | 0/18 | OK |
| N40 | 2·20 | 41 | 41 | OK | OK | OK | 9 % | 63 % | 93 % | 0/20 | OK |
| N41 | 3·1 | 17 | 17 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N42 | 3·2 | 23 | 23 | OK | OK | OK | 63 % | 0 % | 28 % | 0/10 | OK |
| N43 | 3·3 | 25 | 25 | OK | OK | OK | 83 % | 2 % | 20 % | 0/10 | OK |
| N44 | 3·4 | 30 | 30 | OK | OK | OK | 80 % | 7 % | 18 % | 0/12 | OK |
| N45 | 3·5 | 31 | 31 | OK | OK | OK | 45 % | 27 % | 65 % | 0/12 | OK |
| N46 | 3·6 | 18 | 18 | OK | OK | OK | 97 % | 3 % | 3 % | 0/8 | OK |
| N47 | 3·7 | 23 | 23 | OK | OK | OK | 72 % | 0 % | 25 % | 0/10 | OK |
| N48 | 3·8 | 29 | 29 | OK | OK | OK | 31 % | 18 % | 65 % | 0/12 | OK |
| N49 | 3·9 | 30 | 30 | OK | OK | OK | 53 % | 20 % | 38 % | 0/12 | OK |
| N50 | 3·10 | 35 | 35 | OK | OK | OK | 16 % | 27 % | 95 % | 0/14 | OK |
| N51 | 3·11 | 17 | 17 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N52 | 3·12 | 23 | 23 | OK | OK | OK | 73 % | 0 % | 23 % | 0/10 | OK |
| N53 | 3·13 | 29 | 29 | OK | OK | OK | 79 % | 4 % | 30 % | 0/12 | OK |
| N54 | 3·14 | 37 | 37 | OK | OK | OK | 56 % | 2 % | 33 % | 0/14 | OK |
| N55 | 3·15 | 38 | 38 | OK | OK | OK | 24 % | 19 % | 60 % | 0/14 | OK |
| N56 | 3·16 | 17 | 17 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N57 | 3·17 | 24 | 24 | OK | OK | OK | 72 % | 0 % | 28 % | 0/10 | OK |
| N58 | 3·18 | 29 | 29 | OK | OK | OK | 88 % | 6 % | 13 % | 0/12 | OK |
| N59 | 3·19 | 35 | 35 | OK | OK | OK | 50 % | 14 % | 53 % | 0/14 | OK |
| N60 | 3·20 | 46 | 45 | OK | OK | OK | 20 % | 27 % | 83 % | 0/16 | OK |
| N61 | 4·1 | 16 | 16 | OK | OK | OK | 21 % | 0 % | 73 % | 3/4 | À revoir (PIEGE) |
| N62 | 4·2 | 19 | 19 | OK | OK | OK | 33 % | 63 % | 77 % | 0/5 | OK |
| N63 | 4·3 | 22 | 22 | OK | OK | OK | 21 % | 60 % | 85 % | 3/5 | À revoir (PIEGE) |
| N64 | 4·4 | 28 | 28 | OK | OK | OK | 0 % | 71 % | 100 % | 3/6 | À revoir (PIEGE) |
| N65 | 4·5 | 34 | 34 | OK | OK | OK | 1 % | 71 % | 100 % | 2/6 | OK |
| N66 | 4·6 | 17 | 17 | OK | OK | OK | 26 % | 0 % | 70 % | 1/4 | OK |
| N67 | 4·7 | 21 | 21 | OK | OK | OK | 15 % | 60 % | 88 % | 3/5 | À revoir (PIEGE) |
| N68 | 4·8 | 24 | 24 | OK | OK | OK | 0 % | 100 % | 100 % | 4/6 | À revoir (PIEGE) |
| N69 | 4·9 | 32 | 32 | OK | OK | OK | 0 % | 37 % | 100 % | 4/6 | À revoir (PIEGE) |
| N70 | 4·10 | 34 | 34 | OK | OK | OK | 1 % | 85 % | 93 % | 4/7 | À revoir (PIEGE) |
| N71 | 4·11 | 16 | 16 | OK | OK | OK | 28 % | 0 % | 78 % | 3/4 | À revoir (PIEGE) |
| N72 | 4·12 | 23 | 23 | OK | OK | OK | 3 % | 38 % | 100 % | 2/5 | OK |
| N73 | 4·13 | 26 | 26 | OK | OK | OK | 1 % | 66 % | 100 % | 3/6 | À revoir (PIEGE) |
| N74 | 4·14 | 34 | 34 | OK | OK | OK | 2 % | 57 % | 100 % | 3/7 | OK |
| N75 | 4·15 | 35 | 35 | OK | OK | OK | 0 % | 100 % | 100 % | 5/7 | À revoir (PIEGE) |
| N76 | 4·16 | 16 | 16 | OK | OK | OK | 74 % | 26 % | 18 % | 1/4 | OK |
| N77 | 4·17 | 22 | 22 | OK | OK | OK | 40 % | 42 % | 63 % | 2/5 | OK |
| N78 | 4·18 | 26 | 26 | OK | OK | OK | 10 % | 53 % | 83 % | 2/6 | OK |
| N79 | 4·19 | 31 | 31 | OK | OK | OK | 8 % | 92 % | 98 % | 4/7 | À revoir (PIEGE) |
| N80 | 4·20 | 42 | 42 | OK | OK | OK | 0 % | 99 % | 100 % | 1/8 | OK |
| N81 | 5·1 | 13 | 13 | OK | OK | OK | 80 % | 1 % | 13 % | 0/8 | OK |
| N82 | 5·2 | 19 | 19 | OK | OK | OK | 77 % | 2 % | 18 % | 0/10 | OK |
| N83 | 5·3 | 20 | 20 | OK | OK | OK | 85 % | 13 % | 10 % | 0/10 | OK |
| N84 | 5·4 | 24 | 24 | OK | OK | OK | 70 % | 1 % | 25 % | 0/12 | OK |
| N85 | 5·5 | 25 | 25 | OK | OK | OK | 18 % | 19 % | 80 % | 0/12 | OK |
| N86 | 5·6 | 14 | 14 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N87 | 5·7 | 19 | 19 | OK | OK | OK | 98 % | 0 % | 5 % | 0/10 | À revoir (FACILE) |
| N88 | 5·8 | 24 | 24 | OK | OK | OK | 1 % | 2 % | 88 % | 0/12 | OK |
| N89 | 5·9 | 26 | 26 | OK | OK | OK | 6 % | 13 % | 73 % | 0/12 | OK |
| N90 | 5·10 | 31 | 31 | OK | OK | OK | 8 % | 10 % | 90 % | 0/14 | À revoir (SILENCE) |
| N91 | 5·11 | 14 | 14 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N92 | 5·12 | 19 | 19 | OK | OK | OK | 64 % | 0 % | 28 % | 0/10 | OK |
| N93 | 5·13 | 24 | 24 | OK | OK | OK | 55 % | 2 % | 33 % | 0/12 | OK |
| N94 | 5·14 | 30 | 30 | OK | OK | OK | 3 % | 4 % | 95 % | 0/14 | À revoir (SILENCE) |
| N95 | 5·15 | 31 | 31 | OK | OK | OK | 15 % | 0 % | 80 % | 0/14 | OK |
| N96 | 5·16 | 13 | 13 | OK | OK | OK | 91 % | 6 % | 5 % | 0/8 | OK |
| N97 | 5·17 | 19 | 19 | OK | OK | OK | 69 % | 6 % | 33 % | 0/10 | OK |
| N98 | 5·18 | 21 | 21 | OK | OK | OK | 9 % | 20 % | 80 % | 0/12 | OK |
| N99 | 5·19 | 31 | 31 | OK | OK | OK | 35 % | 0 % | 55 % | 0/14 | À revoir (COURBE) |
| N100 | 5·20 | 37 | 37 | OK | OK | OK | 6 % | 38 % | 95 % | 0/16 | OK |
| N101 | 6·1M | 13 | 13 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N102 | 6·2M | 17 | 17 | OK | OK | OK | 91 % | 2 % | 13 % | 0/10 | À revoir (FACILE) |
| N103 | 6·3M | 18 | 18 | OK | OK | OK | 88 % | 4 % | 18 % | 0/10 | OK |
| N104 | 6·4M | 21 | 21 | OK | OK | OK | 78 % | 21 % | 30 % | 0/12 | OK |
| N105 | 6·5M | 22 | 22 | OK | OK | OK | 72 % | 23 % | 25 % | 0/12 | OK |
| N106 | 6·6M | 13 | 13 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N107 | 6·7M | 17 | 17 | OK | OK | OK | 86 % | 3 % | 18 % | 0/10 | OK |
| N108 | 6·8M | 21 | 21 | OK | OK | OK | 82 % | 10 % | 15 % | 0/12 | OK |
| N109 | 6·9M | 23 | 23 | OK | OK | OK | 54 % | 16 % | 48 % | 0/12 | OK |
| N110 | 6·10M | 28 | 28 | OK | OK | OK | 76 % | 3 % | 33 % | 0/14 | OK |
| N111 | 6·11M | 13 | 13 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N112 | 6·12M | 17 | 17 | OK | OK | OK | 92 % | 0 % | 8 % | 0/10 | À revoir (FACILE) |
| N113 | 6·13M | 21 | 21 | OK | OK | OK | 92 % | 0 % | 5 % | 0/12 | À revoir (FACILE) |
| N114 | 6·14M | 25 | 25 | OK | OK | OK | 74 % | 21 % | 23 % | 0/14 | OK |
| N115 | 6·15M | 27 | 27 | OK | OK | OK | 14 % | 22 % | 83 % | 0/14 | OK |
| N116 | 6·16M | 13 | 13 | OK | OK | OK | 100 % | 0 % | 0 % | 0/8 | OK |
| N117 | 6·17M | 17 | 17 | OK | OK | OK | 64 % | 1 % | 45 % | 0/10 | OK |
| N118 | 6·18M | 21 | 21 | OK | OK | OK | 98 % | 3 % | 0 % | 0/12 | À revoir (FACILE) |
| N119 | 6·19M | 27 | 27 | OK | OK | OK | 54 % | 16 % | 50 % | 0/14 | OK |
| N120 | 6·20M | 34 | 34 | OK | OK | OK | 20 % | 37 % | 70 % | 0/16 | OK |
| N121 | 7·1 | 23 | 23 | OK | OK | OK | 74 % | 26 % | 33 % | 1/4 | OK |
| N122 | 7·2 | 30 | 30 | OK | OK | OK | 22 % | 48 % | 75 % | 2/5 | OK |
| N123 | 7·3 | 33 | 33 | OK | OK | OK | 1 % | 55 % | 98 % | 1/5 | OK |
| N124 | 7·4 | 42 | 42 | OK | OK | OK | 1 % | 67 % | 100 % | 4/6 | À revoir (PIEGE) |
| N125 | 7·5 | 48 | 48 | OK | OK | OK | 1 % | 71 % | 100 % | 2/6 | OK |
| N126 | 7·6 | 22 | 22 | OK | OK | OK | 22 % | 0 % | 80 % | 1/4 | OK |
| N127 | 7·7 | 32 | 32 | OK | OK | OK | 13 % | 42 % | 88 % | 2/5 | OK |
| N128 | 7·8 | 45 | 45 | OK | OK | OK | 0 % | 36 % | 100 % | 4/6 | À revoir (PIEGE, COURBE) |
| N129 | 7·9 | 53 | 53 | OK | OK | OK | 1 % | 32 % | 98 % | 2/6 | OK |
| N130 | 7·10 | 61 | 61 | OK | OK | OK | 0 % | 73 % | 98 % | 3/7 | OK |
| N131 | 7·11 | 25 | 25 | OK | OK | OK | 1 % | 0 % | 98 % | 2/4 | À revoir (PIEGE, SILENCE) |
| N132 | 7·12 | 32 | 32 | OK | OK | OK | 1 % | 47 % | 93 % | 0/5 | À revoir (SILENCE) |
| N133 | 7·13 | 41 | 41 | OK | OK | OK | 0 % | 69 % | 100 % | 4/6 | À revoir (PIEGE) |
| N134 | 7·14 | 51 | 51 | OK | OK | OK | 7 % | 72 % | 98 % | 5/7 | À revoir (PIEGE) |
| N135 | 7·15 | 55 | 55 | OK | OK | OK | 0 % | 100 % | 100 % | 4/7 | À revoir (PIEGE, COURBE) |
| N136 | 7·16 | 21 | 21 | OK | OK | OK | 34 % | 50 % | 63 % | 2/4 | À revoir (PIEGE) |
| N137 | 7·17 | 32 | 32 | OK | OK | OK | 0 % | 30 % | 100 % | 2/5 | OK |
| N138 | 7·18 | 42 | 42 | OK | OK | OK | 0 % | 48 % | 100 % | 3/6 | À revoir (PIEGE) |
| N139 | 7·19 | 55 | 55 | OK | OK | OK | 0 % | 58 % | 100 % | 3/7 | OK |
| N140 | 7·20 | 70 | 68 | OK | OK | OK | 0 % | 100 % | 100 % | 6/8 | À revoir (PIEGE, ETOILES) |
| N141 | 8·1M | 18 | 18 | OK | OK | OK | 78 % | 7 % | 18 % | 0/10 | OK |
| N142 | 8·2M | 22 | 22 | OK | OK | OK | 25 % | 2 % | 73 % | 0/12 | OK |
| N143 | 8·3M | 24 | 24 | OK | OK | OK | 40 % | 16 % | 68 % | 0/12 | OK |
| N144 | 8·4M | 29 | 29 | OK | OK | OK | 10 % | 22 % | 90 % | 0/14 | OK |
| N145 | 8·5M | 32 | 31 | OK | OK | OK | 2 % | 13 % | 98 % | 0/14 | À revoir (SILENCE) |
| N146 | 8·6M | 18 | 18 | OK | OK | OK | 91 % | 0 % | 8 % | 0/10 | OK |
| N147 | 8·7M | 24 | 24 | OK | OK | OK | 40 % | 0 % | 57 % | 0/12 | OK |
| N148 | 8·8M | 30 | 30 | OK | OK | OK | 28 % | 4 % | 93 % | 0/14 | À revoir (SILENCE) |
| N149 | 8·9M | 31 | 31 | OK | OK | OK | 19 % | 23 % | 80 % | 0/14 | OK |
| N150 | 8·10M | 36 | 36 | OK | OK | OK | 5 % | 13 % | 100 % | 0/16 | OK |
| N151 | 8·11M | 18 | 18 | OK | OK | OK | 100 % | 0 % | 3 % | 0/10 | OK |
| N152 | 8·12M | 23 | 23 | OK | OK | OK | 51 % | 0 % | 40 % | 0/12 | OK |
| N153 | 8·13M | 28 | 28 | OK | OK | OK | 8 % | 22 % | 93 % | 0/14 | OK |
| N154 | 8·14M | 31 | 31 | OK | OK | OK | 25 % | 49 % | 83 % | 0/16 | OK |
| N155 | 8·15M | 35 | 35 | OK | OK | OK | 3 % | 47 % | 95 % | 0/16 | OK |
| N156 | 8·16M | 18 | 18 | OK | OK | OK | 17 % | 7 % | 85 % | 0/10 | OK |
| N157 | 8·17M | 24 | 24 | OK | OK | OK | 30 % | 3 % | 83 % | 0/12 | OK |
| N158 | 8·18M | 27 | 27 | OK | OK | OK | 52 % | 26 % | 63 % | 0/14 | OK |
| N159 | 8·19M | 33 | 33 | OK | OK | OK | 11 % | 43 % | 95 % | 0/16 | OK |
| N160 | 8·20M | 39 | 39 | OK | OK | OK | 13 % | 57 % | 80 % | 0/18 | OK |
| N161 | 9·1M | 21 | 21 | OK | OK | OK | 8 % | 43 % | 77 % | 2/5 | OK |
| N162 | 9·2M | 24 | 24 | OK | OK | OK | 29 % | 71 % | 88 % | 4/6 | À revoir (PIEGE) |
| N163 | 9·3M | 27 | 27 | OK | OK | OK | 23 % | 78 % | 60 % | 3/6 | À revoir (PIEGE) |
| N164 | 9·4M | 35 | 35 | OK | OK | OK | 0 % | 64 % | 100 % | 4/7 | À revoir (PIEGE) |
| N165 | 9·5M | 39 | 39 | OK | OK | OK | 0 % | 98 % | 100 % | 5/7 | À revoir (PIEGE) |
| N166 | 9·6M | 22 | 22 | OK | OK | OK | 3 % | 0 % | 93 % | 1/5 | À revoir (SILENCE) |
| N167 | 9·7M | 24 | 24 | OK | OK | OK | 18 % | 72 % | 90 % | 4/6 | À revoir (PIEGE) |
| N168 | 9·8M | 31 | 31 | OK | OK | OK | 16 % | 72 % | 85 % | 3/7 | OK |
| N169 | 9·9M | 35 | 35 | OK | OK | OK | 0 % | 86 % | 98 % | 4/7 | À revoir (PIEGE) |
| N170 | 9·10M | 39 | 39 | OK | OK | OK | 0 % | 91 % | 100 % | 3/8 | OK |
| N171 | 9·11M | 19 | 19 | OK | OK | OK | 11 % | 48 % | 90 % | 1/5 | OK |
| N172 | 9·12M | 22 | 22 | OK | OK | OK | 4 % | 87 % | 100 % | 4/6 | À revoir (PIEGE) |
| N173 | 9·13M | 32 | 32 | OK | OK | OK | 0 % | 90 % | 100 % | 4/7 | À revoir (PIEGE, COURBE) |
| N174 | 9·14M | 39 | 39 | OK | OK | OK | 6 % | 70 % | 85 % | 6/8 | À revoir (PIEGE) |
| N175 | 9·15M | 43 | 43 | OK | OK | OK | 1 % | 63 % | 100 % | 5/8 | À revoir (PIEGE) |
| N176 | 9·16M | 23 | 23 | OK | OK | OK | 18 % | 0 % | 88 % | 1/5 | OK |
| N177 | 9·17M | 25 | 25 | OK | OK | OK | 3 % | 77 % | 100 % | 2/6 | OK |
| N178 | 9·18M | 33 | 33 | OK | OK | OK | 1 % | 30 % | 100 % | 5/7 | À revoir (PIEGE) |
| N179 | 9·19M | 39 | 39 | OK | OK | OK | 8 % | 66 % | 95 % | 4/8 | À revoir (PIEGE) |
| N180 | 9·20M | 53 | 53 | OK | OK | OK | 1 % | 90 % | 98 % | 7/9 | À revoir (PIEGE) |
| N181 | 10·1M | 40 | 40 | OK | OK | OK | 5 % | 2 % | 83 % | 0/14 | OK |
| N182 | 10·2M | 46 | 46 | OK | OK | OK | 2 % | 27 % | 100 % | 0/16 | À revoir (SILENCE) |
| N183 | 10·3M | 51 | 51 | OK | OK | OK | 0 % | 14 % | 100 % | 0/16 | À revoir (SILENCE) |
| N184 | 10·4M | 56 | 53 | OK | OK | OK | 1 % | 0 % | 95 % | 0/16 | À revoir (SILENCE, ETOILES) |
| N185 | 10·5M | 61 | 59 | OK | OK | OK | 0 % | 51 % | 100 % | 0/18 | À revoir (SILENCE, ETOILES) |
| N186 | 10·6M | 39 | 39 | OK | OK | OK | 16 % | 17 % | 68 % | 0/14 | OK |
| N187 | 10·7M | 50 | 48 | OK | OK | OK | 2 % | 17 % | 88 % | 0/16 | À revoir (ETOILES) |
| N188 | 10·8M | 53 | 52 | OK | OK | OK | 1 % | 14 % | 98 % | 0/16 | OK |
| N189 | 10·9M | 58 | 57 | OK | OK | OK | 0 % | 48 % | 93 % | 0/18 | OK |
| N190 | 10·10M | 62 | 61 | OK | OK | OK | 0 % | 17 % | 98 % | 2/18 | À revoir (SILENCE) |
| N191 | 10·11M | 40 | 40 | OK | OK | OK | 19 % | 1 % | 75 % | 0/14 | OK |
| N192 | 10·12M | 47 | 47 | OK | OK | OK | 10 % | 12 % | 83 % | 0/16 | OK |
| N193 | 10·13M | 51 | 49 | OK | OK | OK | 0 % | 31 % | 95 % | 0/16 | À revoir (ETOILES) |
| N194 | 10·14M | 60 | 58 | OK | OK | OK | 0 % | 19 % | 98 % | 0/18 | À revoir (ETOILES) |
| N195 | 10·15M | 71 | 71 | OK | OK | OK | 0 % | 32 % | 100 % | 0/20 | À revoir (SILENCE) |
| N196 | 10·16M | 39 | 39 | OK | OK | OK | 11 % | 0 % | 85 % | 0/14 | OK |
| N197 | 10·17M | 49 | 48 | OK | OK | OK | 0 % | 16 % | 98 % | 0/16 | À revoir (SILENCE) |
| N198 | 10·18M | 61 | 61 | OK | OK | OK | 0 % | 8 % | 100 % | 0/18 | À revoir (SILENCE) |
| N199 | 10·19M | 63 | 61 | OK | OK | OK | 0 % | 48 % | 98 % | 0/18 | À revoir (ETOILES) |
| N200 | 10·20M | 72 | 72 | OK | OK | OK | 0 % | 22 % | 100 % | 0/20 | À revoir (SILENCE) |
| J0 | 7c | 26 | 26 | OK | OK | OK | 72 % | 16 % | 38 % | 0/14 | OK |
| J1 | 8c | 29 | 29 | OK | OK | OK | 33 % | 22 % | 50 % | 0/16 | OK |
| J2 | 9c | 33 | 33 | OK | OK | OK | 16 % | 27 % | 65 % | 0/18 | OK |
| J3 | 7c | 26 | 26 | OK | OK | OK | 42 % | 3 % | 58 % | 0/14 | OK |
| J4 | 8c | 30 | 30 | OK | OK | OK | 2 % | 4 % | 100 % | 0/16 | À revoir (DUR) |
| J5 | 9c | 34 | 34 | OK | OK | OK | 21 % | 31 % | 88 % | 0/18 | OK |
| J6 | 7c | 24 | 24 | OK | OK | OK | 47 % | 23 % | 35 % | 0/14 | OK |
| J7 | 8c | 30 | 30 | OK | OK | OK | 26 % | 20 % | 83 % | 0/16 | OK |
| J8 | 9c | 37 | 37 | OK | OK | OK | 17 % | 3 % | 93 % | 0/18 | OK |
| J9 | 7c | 26 | 26 | OK | OK | OK | 28 % | 14 % | 78 % | 0/14 | OK |
| J10 | 8c | 28 | 28 | OK | OK | OK | 50 % | 33 % | 43 % | 0/16 | OK |
| J11 | 9c | 33 | 33 | OK | OK | OK | 59 % | 22 % | 55 % | 0/18 | OK |
| J12 | 7c | 25 | 25 | OK | OK | OK | 36 % | 9 % | 73 % | 0/14 | OK |
| J13 | 8c | 29 | 29 | OK | OK | OK | 32 % | 28 % | 43 % | 0/16 | OK |
| J14 | 9c | 32 | 32 | OK | OK | OK | 4 % | 39 % | 100 % | 0/18 | OK |
| J15 | 7c | 26 | 26 | OK | OK | OK | 73 % | 6 % | 35 % | 0/14 | OK |
| J16 | 8c | 31 | 31 | OK | OK | OK | 38 % | 5 % | 68 % | 0/16 | OK |
| J17 | 9c | 33 | 33 | OK | OK | OK | 4 % | 24 % | 95 % | 0/18 | OK |
| J18 | 7c | 26 | 26 | OK | OK | OK | 36 % | 7 % | 60 % | 0/14 | OK |
| J19 | 8c | 27 | 27 | OK | OK | OK | 37 % | 37 % | 55 % | 0/16 | OK |
| J20 | 9c | 33 | 33 | OK | OK | OK | 8 % | 34 % | 98 % | 0/18 | OK |
| J21 | 7c | 24 | 24 | OK | OK | OK | 80 % | 20 % | 38 % | 0/14 | OK |
| J22 | 8c | 30 | 30 | OK | OK | OK | 44 % | 15 % | 65 % | 0/16 | OK |
| J23 | 9c | 33 | 33 | OK | OK | OK | 43 % | 40 % | 65 % | 0/18 | OK |
| J24 | 7c | 25 | 25 | OK | OK | OK | 51 % | 5 % | 50 % | 0/14 | OK |
| J25 | 8c | 31 | 31 | OK | OK | OK | 41 % | 6 % | 63 % | 0/16 | OK |
| J26 | 9c | 32 | 32 | OK | OK | OK | 28 % | 48 % | 65 % | 0/18 | OK |
| J27 | 7c | 26 | 26 | OK | OK | OK | 33 % | 1 % | 78 % | 0/14 | OK |
| J28 | 8c | 30 | 30 | OK | OK | OK | 6 % | 14 % | 95 % | 0/16 | OK |
| J29 | 9c | 34 | 34 | OK | OK | OK | 2 % | 18 % | 98 % | 0/18 | À revoir (DUR) |
| J30 | 7c | 27 | 27 | OK | OK | OK | 53 % | 1 % | 50 % | 0/14 | OK |
| J31 | 8c | 30 | 30 | OK | OK | OK | 23 % | 20 % | 70 % | 0/16 | OK |
| J32 | 9c | 36 | 36 | OK | OK | OK | 10 % | 3 % | 90 % | 0/18 | OK |
| J33 | 7c | 26 | 26 | OK | OK | OK | 53 % | 0 % | 43 % | 0/14 | OK |
| J34 | 8c | 30 | 30 | OK | OK | OK | 18 % | 8 % | 78 % | 0/16 | OK |
| J35 | 9c | 34 | 34 | OK | OK | OK | 51 % | 33 % | 45 % | 0/18 | OK |
| J36 | 7c | 26 | 26 | OK | OK | OK | 66 % | 1 % | 53 % | 0/14 | OK |
| J37 | 8c | 30 | 30 | OK | OK | OK | 48 % | 15 % | 45 % | 0/16 | OK |
| J38 | 9c | 34 | 34 | OK | OK | OK | 28 % | 18 % | 60 % | 0/18 | OK |
| J39 | 7c | 26 | 26 | OK | OK | OK | 30 % | 6 % | 75 % | 0/14 | OK |
| J40 | 8c | 29 | 29 | OK | OK | OK | 55 % | 36 % | 38 % | 0/16 | OK |
| J41 | 9c | 30 | 30 | OK | OK | OK | 38 % | 48 % | 65 % | 0/18 | OK |
| J42 | 7c | 25 | 25 | OK | OK | OK | 56 % | 15 % | 48 % | 0/14 | OK |
| J43 | 8c | 28 | 28 | OK | OK | OK | 30 % | 32 % | 65 % | 0/16 | OK |
| J44 | 9c | 34 | 34 | OK | OK | OK | 19 % | 18 % | 73 % | 0/18 | OK |
| J45 | 7c | 26 | 26 | OK | OK | OK | 87 % | 11 % | 8 % | 0/14 | À revoir (FACILE) |
| J46 | 8c | 30 | 30 | OK | OK | OK | 20 % | 34 % | 80 % | 0/16 | OK |
| J47 | 9c | 35 | 35 | OK | OK | OK | 4 % | 19 % | 98 % | 0/18 | OK |
| J48 | 7c | 26 | 26 | OK | OK | OK | 28 % | 1 % | 57 % | 0/14 | OK |
| J49 | 8c | 30 | 30 | OK | OK | OK | 29 % | 15 % | 63 % | 0/16 | OK |
| J50 | 9c | 35 | 35 | OK | OK | OK | 3 % | 11 % | 90 % | 0/18 | OK |
| J51 | 7c | 26 | 26 | OK | OK | OK | 97 % | 0 % | 8 % | 0/14 | À revoir (FACILE) |
| J52 | 8c | 31 | 31 | OK | OK | OK | 22 % | 1 % | 70 % | 0/16 | OK |
| J53 | 9c | 34 | 34 | OK | OK | OK | 17 % | 38 % | 83 % | 0/18 | OK |
| J54 | 7c | 25 | 25 | OK | OK | OK | 66 % | 18 % | 38 % | 0/14 | OK |
| J55 | 8c | 32 | 32 | OK | OK | OK | 34 % | 3 % | 60 % | 0/16 | OK |
| J56 | 9c | 35 | 35 | OK | OK | OK | 9 % | 18 % | 88 % | 0/18 | OK |
| J57 | 7c | 26 | 26 | OK | OK | OK | 59 % | 4 % | 40 % | 0/14 | OK |
| J58 | 8c | 31 | 31 | OK | OK | OK | 53 % | 11 % | 50 % | 0/16 | OK |
| J59 | 9c | 34 | 34 | OK | OK | OK | 22 % | 36 % | 73 % | 0/18 | OK |
| J60 | 7c | 25 | 25 | OK | OK | OK | 34 % | 3 % | 70 % | 0/14 | OK |
| J61 | 8c | 30 | 30 | OK | OK | OK | 19 % | 10 % | 73 % | 0/16 | OK |
| J62 | 9c | 35 | 35 | OK | OK | OK | 13 % | 27 % | 93 % | 0/18 | OK |
| J63 | 7c | 26 | 26 | OK | OK | OK | 49 % | 9 % | 43 % | 0/14 | OK |
| J64 | 8c | 31 | 31 | OK | OK | OK | 64 % | 3 % | 43 % | 0/16 | OK |
| J65 | 9c | 34 | 34 | OK | OK | OK | 6 % | 20 % | 88 % | 0/18 | OK |
| J66 | 7c | 25 | 25 | OK | OK | OK | 65 % | 12 % | 48 % | 0/14 | OK |
| J67 | 8c | 30 | 30 | OK | OK | OK | 51 % | 14 % | 30 % | 0/16 | OK |
| J68 | 9c | 35 | 35 | OK | OK | OK | 1 % | 28 % | 100 % | 0/18 | À revoir (DUR) |
| J69 | 7c | 24 | 24 | OK | OK | OK | 42 % | 27 % | 43 % | 0/14 | OK |
| J70 | 8c | 30 | 30 | OK | OK | OK | 39 % | 14 % | 70 % | 0/16 | OK |
| J71 | 9c | 36 | 36 | OK | OK | OK | 16 % | 18 % | 85 % | 0/18 | OK |
| J72 | 7c | 25 | 25 | OK | OK | OK | 55 % | 27 % | 45 % | 0/14 | OK |
| J73 | 8c | 30 | 30 | OK | OK | OK | 34 % | 26 % | 70 % | 0/16 | OK |
| J74 | 9c | 34 | 34 | OK | OK | OK | 28 % | 30 % | 70 % | 0/18 | OK |
| J75 | 7c | 25 | 25 | OK | OK | OK | 35 % | 1 % | 75 % | 0/14 | OK |
| J76 | 8c | 31 | 31 | OK | OK | OK | 38 % | 6 % | 75 % | 0/16 | OK |
| J77 | 9c | 34 | 34 | OK | OK | OK | 2 % | 25 % | 98 % | 0/18 | À revoir (DUR) |
| J78 | 7c | 26 | 26 | OK | OK | OK | 48 % | 2 % | 58 % | 0/14 | OK |
| J79 | 8c | 30 | 30 | OK | OK | OK | 14 % | 18 % | 65 % | 0/16 | OK |
| J80 | 9c | 35 | 35 | OK | OK | OK | 37 % | 41 % | 68 % | 0/18 | OK |
| J81 | 7c | 25 | 25 | OK | OK | OK | 69 % | 12 % | 38 % | 0/14 | OK |
| J82 | 8c | 28 | 28 | OK | OK | OK | 30 % | 44 % | 65 % | 0/16 | OK |
| J83 | 9c | 34 | 34 | OK | OK | OK | 5 % | 44 % | 83 % | 0/18 | OK |
| J84 | 7c | 27 | 27 | OK | OK | OK | 43 % | 3 % | 53 % | 0/14 | OK |
| J85 | 8c | 30 | 30 | OK | OK | OK | 19 % | 4 % | 73 % | 0/16 | OK |
| J86 | 9c | 33 | 33 | OK | OK | OK | 25 % | 34 % | 65 % | 0/18 | OK |
| J87 | 7c | 26 | 26 | OK | OK | OK | 47 % | 3 % | 63 % | 0/14 | OK |
| J88 | 8c | 30 | 30 | OK | OK | OK | 39 % | 17 % | 38 % | 0/16 | OK |
| J89 | 9c | 34 | 34 | OK | OK | OK | 18 % | 21 % | 63 % | 0/18 | OK |
| J90 | 7c | 26 | 26 | OK | OK | OK | 28 % | 3 % | 73 % | 0/14 | OK |
| J91 | 8c | 30 | 30 | OK | OK | OK | 61 % | 14 % | 33 % | 0/16 | OK |
| J92 | 9c | 36 | 36 | OK | OK | OK | 24 % | 2 % | 65 % | 0/18 | OK |
| J93 | 7c | 26 | 26 | OK | OK | OK | 28 % | 0 % | 85 % | 0/14 | OK |
| J94 | 8c | 29 | 29 | OK | OK | OK | 39 % | 24 % | 60 % | 0/16 | OK |
| J95 | 9c | 36 | 36 | OK | OK | OK | 16 % | 14 % | 80 % | 0/18 | OK |
| J96 | 7c | 25 | 25 | OK | OK | OK | 48 % | 18 % | 48 % | 0/14 | OK |
| J97 | 8c | 29 | 29 | OK | OK | OK | 26 % | 39 % | 80 % | 0/16 | OK |
| J98 | 9c | 34 | 34 | OK | OK | OK | 30 % | 43 % | 73 % | 0/18 | OK |
| J99 | 7c | 25 | 25 | OK | OK | OK | 44 % | 5 % | 55 % | 0/14 | OK |
| J100 | 8c | 31 | 31 | OK | OK | OK | 38 % | 11 % | 45 % | 0/16 | OK |
| J101 | 9c | 31 | 31 | OK | OK | OK | 12 % | 44 % | 88 % | 0/18 | OK |
| J102 | 7c | 25 | 25 | OK | OK | OK | 46 % | 16 % | 53 % | 0/14 | OK |
| J103 | 8c | 30 | 30 | OK | OK | OK | 72 % | 26 % | 30 % | 0/16 | OK |
| J104 | 9c | 36 | 36 | OK | OK | OK | 1 % | 9 % | 100 % | 0/18 | À revoir (DUR) |
| J105 | 7c | 25 | 25 | OK | OK | OK | 45 % | 13 % | 68 % | 0/14 | OK |
| J106 | 8c | 32 | 32 | OK | OK | OK | 19 % | 1 % | 83 % | 0/16 | OK |
| J107 | 9c | 33 | 33 | OK | OK | OK | 11 % | 28 % | 78 % | 0/18 | OK |
| J108 | 7c | 26 | 26 | OK | OK | OK | 68 % | 9 % | 35 % | 0/14 | OK |
| J109 | 8c | 28 | 28 | OK | OK | OK | 37 % | 32 % | 53 % | 0/16 | OK |
| J110 | 9c | 36 | 36 | OK | OK | OK | 7 % | 5 % | 95 % | 0/18 | OK |
| J111 | 7c | 26 | 26 | OK | OK | OK | 74 % | 10 % | 25 % | 0/14 | OK |
| J112 | 8c | 30 | 30 | OK | OK | OK | 65 % | 2 % | 38 % | 0/16 | OK |
| J113 | 9c | 36 | 36 | OK | OK | OK | 5 % | 4 % | 85 % | 0/18 | OK |
| J114 | 7c | 26 | 26 | OK | OK | OK | 39 % | 11 % | 53 % | 0/14 | OK |
| J115 | 8c | 31 | 31 | OK | OK | OK | 74 % | 18 % | 30 % | 0/16 | OK |
| J116 | 9c | 33 | 33 | OK | OK | OK | 19 % | 25 % | 90 % | 0/18 | OK |
| J117 | 7c | 26 | 26 | OK | OK | OK | 78 % | 0 % | 25 % | 0/14 | OK |
| J118 | 8c | 31 | 31 | OK | OK | OK | 85 % | 9 % | 20 % | 0/16 | À revoir (FACILE) |
| J119 | 9c | 32 | 32 | OK | OK | OK | 49 % | 27 % | 45 % | 0/18 | OK |

## Annexe B. Outils (`tools/qa/`)

`lib.js` (règles, isomorphisme, solveur) · `play.js` (jeu au doigt) · `render.js` (géométrie + captures) · `analyze.js` (données, doublons, courbe) · `sim.js` (joueur naïf, positions perdues) · `opt.js` et `verify-opt.js` (optimum) · `crosscheck.js` (recoupement indépendant) · `behaviors.js` (comportements, écrans, textes) · `behaviors2.js` (2 niveaux par mécanique) · `winworst.js`, `mystery-replay.js` · `colors.js` · `sheet.js` (planches) · `verdicts.js` et `report.js` (ce rapport).
Relance : `node tools/qa/play.js`, `node tools/qa/render.js`, `node tools/qa/analyze.js`, `node tools/qa/sim.js`, `node tools/qa/opt.js`, `node tools/qa/behaviors.js`, puis `node tools/qa/report.js`.
