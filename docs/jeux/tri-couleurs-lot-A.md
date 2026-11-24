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
- **Table finale des mondes** (mesurée par `tools/gen-levels.js`, graine fixe ; « solution » = longueur de la solution du solveur, repère des étoiles ; « vides » = tubes vides de pleine hauteur) :

  | Monde | Nom | Mécaniques | Hauteur | Vides | Couleurs | Solution min-max | 1er → 20e |
  |---|---|---|---|---|---|---|---|
  | 1 | Le Tiroir | bases | 4 (3 aux niveaux 1-2) | 2 (1 au niveau 1) | 2-9 | 3-35 | 3 → 35 |
  | 2 | L'Étagère | plus de couleurs (jusqu'à 10) | 4 | 2 | 6-10 | 19-41 | 20 → 41 |
  | 3 | Le Grenier | tube haut | 5 | 2 | 4-8 | 17-46 | 17 → 46 |
  | 4 | Le Placard | un seul tube vide | 4 | 1 | 4-8 | 16-42 | 16 → 42 |
  | 5 | La Cave | tube court | 4 | 1 + 1 tube court | 4-8 | 13-37 | 13 → 37 |
  | 6 | La Brume | billes mystère | 4 | 2 | 4-8 | 13-34 | 13 → 34 |
  | 7 | L'Atelier | tube haut + un seul vide | 5 | 1 | 4-8 | 21-70 | 23 → 70 |
  | 8 | Le Garage | tube court + mystère | 4 | 1 + 1 tube court | 5-9 | 18-39 | 18 → 39 |
  | 9 | Le Hangar | un seul vide + mystère | 4 | 1 | 5-9 | 19-53 | 21 → 53 |
  | 10 | Pile Poil | tout : haut, court, un seul vide, mystère | 5 | 1 + 1 tube court | 7-10 | 39-72 | 40 → 72 |

  Courbe : chaque monde est découpé en 4 groupes de 5 niveaux (respiration au 1er de chaque groupe, pointe au 5e, pointes croissantes ; le 20e est le plus long du monde et le seul de sa longueur). Dans le monde 1, les niveaux 1 à 10 sont ceux du lot 1 (courbe croissante continue), les niveaux 11 à 20 repartent de 5 couleurs.
  Niveaux du jour (120) : hauteur 4, 2 tubes vides, sans mécanique, 7 à 9 couleurs, 24 à 37 coups.
  Solutions : prouvées optimales par A* quand le solveur y arrive (presque tous les niveaux, sauf environ 16 sur 20 du monde 10), sinon issues d'un A* pondéré ; dans tous les cas rejouées par les tests.
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
