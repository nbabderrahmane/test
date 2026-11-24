# Ronde Vive (`course-des-pions`) — règles retenues

> **À valider par un humain : les variantes locales diffèrent.**
> Le jeu reprend un genre traditionnel du domaine public (course de pions à dé : petits chevaux, ludo, etc.). Les règles de détail ci-dessous sont des choix de ce jeu ; chaque région a les siennes. Rien d'autre à valider : pas de contenu factuel, pas de texte long, aucune notion de mise, d'argent ou de gain.

## Plateau (à nous)
- Un carré de 7 x 7 cases. L'anneau extérieur compte **24 cases**, parcourues dans le sens des aiguilles d'une montre.
- Chaque camp a sa **porte** au milieu d'un côté, une **voie d'arrivée de 2 cases** qui part de sa porte vers le centre, et une **base** (2 x 2 cases) dans un angle intérieur. Le centre est la maison.
- Un joueur = une **couleur ET un symbole** : Corail ▲ triangle (toujours le joueur du parcours), Sarcelle ◆ losange, Lilas ★ étoile, Citron ■ carré. Couleur et symbole suivent le joueur, pas le côté du plateau.
- Contre 1 adversaire on joue en bas et en haut ; à 3 et 4 joueurs, les côtés se remplissent dans le sens des aiguilles d'une montre depuis le bas.

## Marche d'un pion
- Un pion part de sa **base**, entre sur sa **case d'entrée** (la case qui suit sa porte), fait **un tour complet** de l'anneau (24 cases), finit sur sa porte, puis monte ses 2 cases de voie et **rentre à la maison** : 26 cases de sa base à la maison (avec la sortie : 27 positions).
- **Sortir de la base : seulement avec un 6.** Le pion se pose sur la case d'entrée.
- **Rentrer à la maison : au compte exact.** Un dé trop grand rend le coup impossible pour ce pion.
- Un pion qui rentre quitte le plateau ; il reste un repère « rentré » dans la base.

## Tour de jeu
- Un seul dé, tiré par le générateur à graine du jeu, **affiché pour tous les joueurs** et identique pour tous. Rien ne le biaise selon le niveau ni l'adversaire.
- **Un 6 fait rejouer** (même sans coup possible). Pas de limite de 6 de suite.
- **Trois essais** pour sortir quand aucun pion n'est sur le parcours (tous en base, ou en base et rentrés) : au troisième échec le tour passe.
- Sinon, un dé sans coup possible passe le tour, avec un message.
- **Quand un seul coup est possible, il se joue seul.** Deux pions sur la même case sont interchangeables : un seul choix. Quand plusieurs choix existent, les pions jouables sont entourés et leur case d'arrivée est marquée en pointillé ; un tap sur un pion le joue aussitôt.
- Pas de blocage : plusieurs pions d'un même joueur peuvent partager une case.

## Capture et refuges
- Arriver sur une case de l'anneau occupée par un ou plusieurs pions adverses les **renvoie tous à leur base**. Cela ne fait pas rejouer.
- **Cases refuges** (8 cases ornées d'un cercle) : les 4 angles du plateau et les 4 cases d'entrée. On n'y capture personne ; des pions de camps différents peuvent y cohabiter.
- Les voies d'arrivée sont privées : jamais de capture dessus.

## Fin de partie, étoiles, classement
- **Le premier joueur qui rentre tous ses pions gagne** ; la partie s'arrête là. Un niveau est réussi par une victoire.
- Le **classement** de fin (1er, 2e…) est donné par l'ordre d'arrivée puis par la progression des pions.
- **Étoiles** (selon l'avance sur le meilleur adversaire, en cases restant à parcourir quand le joueur finit) : 1 étoile pour une victoire, 2 étoiles avec 2 cases d'avance par pion (en comptant le plus grand nombre de pions de la partie : 4 cases à 2 pions, 6 à 3 pions) ou plus, 3 étoiles avec 5 cases d'avance par pion (10 ou 15 cases) ou plus. Le critère de 3 étoiles est affiché avant de jouer.
- **Score du défi : nombre de tours pour gagner** (un 6 qui fait rejouer reste dans le même tour). Le défi est relevé si on gagne en autant de tours ou moins.

## Parcours : 20 niveaux (fixes), la difficulté par l'asymétrie de pions
Le dé n'est jamais biaisé. Le levier est le nombre de pions à ramener, annoncé avant la partie (« Toi : 1 pion · Adversaire : 3 pions »), puis le nombre d'adversaires et la qualité de leur jeu (force 0 : au hasard ; 5 : le plus avisé, qui capture, rentre, évite les cases où il peut être pris et guette les pions devant lui). Au début le joueur a moins de pions que ses adversaires (niveaux 1 à 11), puis autant (12 à 20).

Taux de victoire mesurés avec le joueur de test (`tools/course-des-pions/player.js`, hors du jeu) sur 1 000 parties par niveau (`node tools/course-des-pions/sim.js 1000 --md`). Le test de la suite les recalcule sur 400 parties avec d'autres graines et tolère ±7 points. Respirations : niveaux 7, 12 et 18.

| Niveau | Toi (pions) | Adversaires : pions chacun (force) | Victoires mesurées | Étoiles 3/2/1 (% des victoires) | Durée estimée |
|---|---|---|---|---|---|
| 1 | 1 | 1 × 3 pions (0) | 99 % | 94 / 2 / 4 | 0.6 min |
| 2 | 1 | 1 × 2 pions (0) | 91 % | 80 / 8 / 12 | 0.6 min |
| 3 | 1 | 1 × 2 pions (2) | 88 % | 79 / 8 / 12 | 0.6 min |
| 4 | 1 | 1 × 2 pions (5) | 87 % | 79 / 9 / 12 | 0.6 min |
| 5 | 1 | 2 × 2 pions (2·2) | 81 % | 74 / 10 / 16 | 0.8 min |
| 6 | 1 | 2 × 2 pions (5·5) | 78 % | 73 / 9 / 18 | 0.8 min |
| 7 | 2 | 1 × 3 pions (2) | 83 % | 70 / 11 / 19 | 1.0 min |
| 8 | 2 | 1 × 3 pions (5) | 80 % | 62 / 15 / 23 | 1.0 min |
| 9 | 2 | 2 × 3 pions (2·2) | 74 % | 67 / 11 / 22 | 1.5 min |
| 10 | 2 | 2 × 3 pions (5·5) | 68 % | 61 / 14 / 25 | 1.5 min |
| 11 | 2 | 3 × 3 pions (5·5·5) | 61 % | 59 / 16 / 25 | 2.1 min |
| 12 | 3 | 1 × 3 pions (0) | 68 % | 55 / 12 / 32 | 1.2 min |
| 13 | 3 | 1 × 3 pions (3) | 55 % | 42 / 17 / 41 | 1.2 min |
| 14 | 3 | 1 × 3 pions (5) | 53 % | 43 / 14 / 43 | 1.2 min |
| 15 | 3 | 2 × 3 pions (0·0) | 52 % | 42 / 16 / 42 | 1.7 min |
| 16 | 3 | 2 × 3 pions (2·2) | 48 % | 51 / 14 / 35 | 1.8 min |
| 17 | 3 | 2 × 3 pions (3·3) | 39 % | 39 / 18 / 42 | 1.8 min |
| 18 | 2 | 2 × 2 pions (0·0) | 47 % | 42 / 14 / 44 | 1.1 min |
| 19 | 3 | 3 × 3 pions (3·3·2) | 34 % | 46 / 17 / 38 | 2.4 min |
| 20 | 3 | 3 × 3 pions (4·4·3) | 29 % | 48 / 15 / 37 | 2.4 min |

Fourchette visée : niveaux 1-2 au moins 85 %, descente régulière jusqu'à environ 30 % au niveau 20, jamais moins de 25 %.

Défi : l'objectif d'un lien doit être atteignable (de 1, 3 ou 6 tours selon 1, 2 ou 3 pions du joueur, jusqu'à 99) ; hors bornes le lien est ignoré. Un défi se joue une fois par ouverture : ni « Rejouer », ni « Recommencer », ni « Annuler ».

## Mode « à plusieurs sur ce téléphone »
Depuis l'accueil, 2 à 4 joueurs (2 pions chacun), hors parcours : pas d'étoiles, pas de sauvegarde, pas d'événement. Chacun joue à son tour sur le même écran ; le dé affiché indique qui l'a lancé. Le premier qui rentre ses 2 pions gagne.

## Choix faits sans consigne (à confirmer)
1. Parcours d'un seul tour complet de l'anneau (24 cases) + 2 cases de voie, pour tenir 2 à 4 minutes.
2. Trois essais pour sortir quand tout est en base, pour ne pas attendre un 6 pendant des tours.
3. Un 6 fait toujours rejouer, une capture ou une arrivée à la maison non.
4. Partie arrêtée à la première arrivée ; le classement des perdants est donné par leur progression.
5. Le joueur du parcours joue toujours le Corail ▲ ; ses adversaires sont Sarcelle, Lilas, Citron.
6. « Annuler » reprend le choix d'un pion, seulement jusqu'au lancer suivant (le dé déjà vu reste le même, aucun dé futur n'est dévoilé) ; les tours des adversaires attendent un instant après un choix du joueur. Pas d'« Annuler » en défi.
7. « Accélérer » (×2) raccourcit les tours des adversaires ; réglage mémorisé.
8. « Continuer » ouvre toujours le premier niveau non terminé ; une partie laissée en cours sur un autre niveau se reprend depuis la grille.
9. La graine d'une nouvelle partie vient de l'horloge ; elle est enregistrée avec la partie pour une reprise à l'identique.
