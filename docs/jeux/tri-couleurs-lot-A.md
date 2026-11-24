# Pile Poil — lot A : 200 niveaux et habitude

Aucune dépendance serveur ni super-app. Tout reste dans `games/tri-couleurs/index.html` (< 150 Ko), hors ligne.

## 1. Niveaux
- **200 niveaux fixes**, en **10 mondes de 20**. Les 10 niveaux actuels restent les niveaux 1 à 10 (la progression des joueurs est conservée).
- Produits hors ligne par `tools/gen-levels.js` : génération en masse, notation par le solveur (longueur de solution, nombre d'impasses rencontrées), sélection.
- **Courbe en dents de scie** : dans un monde, la difficulté monte, avec une respiration tous les 4 à 5 niveaux ; le dernier niveau d'un monde est son plus dur ; le premier du monde suivant est facile et présente la nouveauté.
- **Mécaniques**, introduites une par une, puis combinées :
  | Mécanique | Règle |
  |---|---|
  | Tube haut | hauteur 5 au lieu de 4 |
  | Un seul tube vide | moins de marge |
  | Tube court | un tube de capacité 2 remplace un tube vide |
  | Billes mystère | seule la bille du dessus est visible ; les autres se révèlent quand on les découvre, et restent révélées, y compris après Annuler, Recommencer et un rechargement |
- **Table finale des mondes**, dans l'ordre de jeu (mesurée par `tools/gen-levels.js`, graine fixe, régénérée après la recette des niveaux). « Solution » = longueur de la meilleure solution connue (repère des étoiles, prouvée optimale par A* sur les 320 niveaux) ; « vides » = tubes vides de pleine hauteur ; « difficulté » = longueur de solution + 40 × (1 − taux de victoire d'un joueur au hasard) ; « victoire au hasard » = taux de victoire moyen de la simulation de `tools/qa/sim.js` (politique « naïf ») ; « premiers coups fatals » = part maximale, dans le monde, des premiers coups légaux qui rendent le niveau impossible (recherche exhaustive) :

  | Monde | Nom | Mécaniques | Hauteur | Vides | Couleurs | Solution min / médiane / max | Difficulté médiane | Victoire au hasard (moy.) | Premiers coups fatals (max) |
  |---|---|---|---|---|---|---|---|---|---|
  | 1 | Le Tiroir | bases | 4 (3 aux niveaux 1 à 4) | 2 | 2-6 | 5 / 18.5 / 23 | 26 | 85 % | 0 % |
  | 2 | Le Grenier | tube haut | 5 | 2 | 4-6 | 18 / 25 / 27 | 31 | 83 % | 0 % |
  | 3 | La Brume | billes mystère | 4 | 2 | 5-8 | 18 / 23 / 30 | 37 | 65 % | 0 % |
  | 4 | La Cave | tube court | 4 | 1 + 1 tube court | 5-8 | 18 / 22 / 32 | 45 | 41 % | 0 % |
  | 5 | L'Étagère | plus de couleurs | 4 | 2 | 7-10 | 24 / 29.5 / 41 | 54 | 38 % | 13 % |
  | 6 | Le Placard | un seul tube vide | 4 | 1 | 4-7 | 16 / 26 / 36 | 61 | 9 % | 25 % |
  | 7 | Le Garage | court + mystère | 4 | 1 + 1 tube court | 7-9 | 25 / 31 / 39 | 66 | 16 % | 0 % |
  | 8 | Le Hangar | un seul vide + mystère | 4 | 1 | 6-8 | 24 / 30.5 / 42 | 67 | 8 % | 0 % |
  | 9 | L'Atelier | haut + un seul vide | 5 | 1 | 5-8 | 33 / 46.5 / 60 | 81 | 8 % | 25 % |
  | 10 | Pile Poil | tout ensemble | 5 | 1 + 1 tube court | 7-10 | 42 / 52.5 / 66 | 93 | 1 % | 0 % |
  | Jour (120) | | 4 de haut, 2 vides | 4 | 2 | 6-8 | 17 / 26 / 33 | 48 | 31-55 % | 0 % |

  Ordre des mondes : changé par rapport au premier jet (tube haut, mystère, tube court, couleurs, un seul vide, puis les combinaisons) pour que la médiane de difficulté ne baisse jamais d'un monde au suivant et ne monte jamais de plus de 30 % (médianes mesurées : 26, 31, 37, 46, 55, 61, 66, 66, 82, 92).
  Courbe : chaque monde est découpé en 4 groupes de 5 niveaux (respiration au 1er de chaque groupe, pointe au 5e ; le 20e est le plus dur et le plus long du monde, et le seul de sa longueur). Pas de pic de plus de 25 % de difficulté par rapport au niveau précédent (hors 20e niveau), avec un plancher de +3 points pour les tout premiers niveaux (difficulté 5, 7, 9… : 25 % de 5 n'est pas jouable). Monde 1 : niveaux 1 à 10 régénérés (décision 9), hauteur 3 aux niveaux 1 à 4, de 2 à 6 couleurs.
  Premiers coups : au plus 25 % de premiers coups fatals, 0 % pour les 3 premiers niveaux de chaque monde et pour tous les niveaux mystère (seuil atteint partout ; le maximum de 25 % est atteint dans les mondes 6 et 9, 13 % dans le monde 5). Aucune contrainte relâchée.
  Niveaux du jour (120) : hauteur 4, 2 tubes vides, sans mécanique, 6 à 8 couleurs, 17 à 33 coups, victoire au hasard mesurée entre 31 % et 55 % (la fiche exige 25 % à 60 %).
  Solutions : rejouées par les tests ; le test refait indépendamment la recherche du plus court chemin (QA, A* sans élagage) et retrouve exactement le repère sur 320 niveaux sur 320.
- Le solveur garantit que tout niveau est gagnable. Au-delà de ce qu'un A* optimal résout en temps raisonnable, une solution non optimale suffit : le repère d'étoiles est la longueur de la solution trouvée.
- **Format compact** dans le fichier (une chaîne par niveau). Les **solutions ne sont pas embarquées** dans le jeu : elles vivent dans `tools/solutions.json`, lu par les tests. `window.__game.solutions` disparaît.

## 2. Niveau du jour
- Réserve de **120 niveaux du jour** pré-générés et prouvés gagnables, de difficulté moyenne (2 à 3 min). Le niveau du jour = réserve[numéro du jour local modulo 120] : le même pour tous, sans serveur.
- Un seul résultat compte par jour (le premier gagné) ; rejouer reste possible sans effet sur la série.

## 3. Série
- +1 par jour où le niveau du jour est gagné. Un jour manqué remet à zéro, sauf **joker** : 1 joker gagné tous les 7 jours de série, 2 en réserve au plus, consommé automatiquement, un par jour manqué, dès l'ouverture du jeu (l'accueil affiche donc toujours les jokers réellement disponibles). Une série perdue remet les jokers à zéro.
- Le niveau du jour commencé un jour et gagné le lendemain compte pour le jour où il a été commencé.
- Horloge du téléphone : si la date recule, on n'ajoute rien et on ne casse rien.
- Visible sur l'accueil (flamme + nombre), et rappel « niveau du jour pas encore joué ».

## 4. Rangs et badges
- **Rang** = total d'étoiles (600 possibles), 8 paliers nommés. Passage de rang célébré une fois.
- **Badges** (6 à 8) : premier monde fini, monde parfait (60 étoiles), série de 7, série de 30, 100 étoiles, premier défi relevé.

## 5. Défi à un ami
- Depuis l'écran de victoire : « Défier un ami » partage un texte sans solution + un lien `…#defi-<niveau>-<coups>` (ou `#defi-jour-<numéro du jour>-<coups>`).
- La base du lien vient de `window.MJ_CONFIG.shareBaseUrl`, sinon de l'adresse courante. Le fragment n'emploie que lettres, chiffres et tirets.
- À l'ouverture d'un lien de défi : le niveau s'ouvre (même verrouillé) avec le bandeau « Objectif : 23 coups ou moins » (égaler suffit) ; à la victoire, « Défi relevé » ou « Raté de 2 coups », et proposition de renvoyer le défi.
- Partage : `navigator.share`, repli presse-papiers.

## 6. Écrans
Accueil (niveau du jour, série, rang, « Continuer ») · mondes · grille des 20 niveaux d'un monde · jeu · victoire · badges. Un tap depuis l'accueil pour jouer.

## 7. Stockage
Clé `mj:tri-couleurs:v1` conservée et étendue (étoiles par niveau, série, jokers, dernier jour joué, badges, rang vu). Une sauvegarde du lot 1 est lue sans perte.

## 8. Événements vers la page hôte
`postMessage({source:'mini-jeu', game:'tri-couleurs', event, …})` pour : `level_complete` (level, moves, stars), `daily_complete` (day, moves, streak), `streak_lost`, `rank_up` (rank), `badge` (id), `share` (kind), `challenge_open` (level, target), `challenge_result` (level, moves, target, won) — pour un défi du jour, `level` vaut 0 et un champ `day` est ajouté. Aucune donnée personnelle.

## 9. Crochets de test
`window.__game` : `state()`, `levels` (200), `daily` (120), `loadLevel(n)`, `loadDaily(i)`, `applyMove(from,to)` (même logique que le tap, sans animation), `setToday('AAAA-MM-JJ')` (date simulée, pour les tests de série).

## 10. Preuves attendues (`npm test`)
- Les 200 niveaux et les 120 niveaux du jour sont gagnés en rejouant leur solution par `applyMove` ; un niveau par monde et un niveau par mécanique sont gagnés par de vrais taps.
- Mystère : une bille cachée n'expose ni couleur ni symbole dans le DOM avant d'être découverte. Tube court : refuse une troisième bille.
- Série : +1, jour manqué avec et sans joker, gain de joker au 7e jour, date qui recule.
- Rangs, badges, migration d'une sauvegarde du lot 1.
- Défi : lien généré, ouverture par fragment, résultat gagné et perdu.
- Mise en page à 320x568, 360x640, 430x932 sur l'accueil, la grille d'un monde, et le niveau le plus chargé : aucun défilement de page, cibles ≥ 44 px.
- Aucune requête réseau, aucune erreur console, fichier < 150 Ko.

## Hors périmètre
Classement, identité, récompenses, son, notifications.

## Décisions après revue (24 novembre)
- Ouvrir un défi ne modifie jamais la progression ni la partie en cours ; seule une victoire écrit.
- La partie en cours est reprise coup pour coup dans tous les modes (niveau, niveau du jour, défi).
- Limite connue, acceptée : une victoire enregistrée avec une horloge avancée par erreur bloque la série jusqu'à cette date.
- Les crochets de test exposent les couleurs cachées : accepté, ils ne sont pas accessibles à un joueur dans la webview.

## Décisions après recette des niveaux (24 novembre) — voir `docs/qa/RECETTE-NIVEAUX.md`
1. **Pas de premier coup piégé.** Un niveau n'est retenu que si au plus 25 % de ses premiers coups légaux mènent à une position perdue ; 0 % pour les 3 premiers niveaux de chaque monde. Pour les niveaux mystère : aucun premier coup fatal parmi ceux qu'un joueur ne peut pas distinguer.
2. **Courbe mesurée, pas supposée.** La difficulté d'un niveau = longueur de solution + taux de victoire d'un joueur au hasard (simulation de `tools/qa/sim.js`). Dans un monde, cette difficulté monte par paliers avec respirations ; d'un monde au suivant, la médiane ne baisse pas et ne monte pas de plus de 30 %. L'ordre des mondes peut changer pour y arriver ; aucun pic de plus de 25 % par rapport au niveau précédent hors dernier niveau d'un monde.
3. **Niveaux du jour homogènes** : taux de victoire au hasard entre 25 % et 60 %.
4. **Repères d'étoiles** : toujours la meilleure solution connue (les 13 solutions plus courtes trouvées par la recette sont reprises).
5. **Partie mal engagée** : quand le joueur dépasse 2 fois le repère, ou revient 3 fois sur une position déjà vue, un message discret propose Annuler ou Recommencer. Pas de solveur dans le jeu.
6. **Mystère** : « Rejouer » et toute nouvelle partie d'un niveau déjà gagné recachent les billes ; elles restent révélées pendant une même partie (Annuler, Recommencer, rechargement).
7. **Défi** : un seul objectif à l'écran (celui du défi remplace le repère d'étoiles). Résultat perdu : « À N coups près ». Sans `MJ_CONFIG.shareBaseUrl` et hors http(s), le partage n'inclut pas de lien.
8. **Textes** : le rang « Maniaque » devient « Perfectionniste ».
9. Les niveaux 1 à 10 peuvent changer : il n'y a pas encore de joueurs.
