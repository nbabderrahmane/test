# Petit Mil (`semailles`) — règles retenues

**À valider par un humain : les variantes régionales diffèrent.** Les règles de l'awalé (oware, ayo, songo…) varient d'une région à l'autre ; ce qui suit est la variante implémentée, choisie pour être la plus simple et la plus répandue. Aucun contenu factuel (mots, faits, noms de lieux) dans ce jeu.

## Plateau et semis
- 2 rangées de 6 cases ; 4 graines par case au départ classique (48 graines en tout). Le joueur a la rangée du bas, l'adversaire celle du haut.
- On vide une case de son camp et on sème une graine par case, dans le sens inverse des aiguilles d'une montre (vers la droite en bas, vers la gauche en haut).
- Une case de 12 graines ou plus saute sa case de départ (la 12e graine va dans la case suivante).
- Le joueur commence toujours (choix simple, pas de tirage au sort).

## Captures
- Si la dernière graine tombe dans une case du camp adverse et la porte à 2 ou 3, on prend ses graines.
- Les captures s'enchaînent vers l'arrière (cases précédentes) tant que les cases du camp adverse valent 2 ou 3 ; la chaîne ne passe jamais dans son propre camp.
- Seule la dernière case semée décide : une case à 2 ou 3 rencontrée en route ne compte pas.

## Interdiction d'affamer, obligation de nourrir
- Variante retenue (« grand chelem sans prise ») : un coup qui prendrait **toutes** les graines de l'adversaire reste jouable, mais **ne capture rien**.
- Si l'adversaire n'a plus aucune graine, on est obligé de jouer un coup qui lui en donne. Si aucun coup ne le peut, la partie s'arrête.

## Fin de partie
- Le premier à 25 graines capturées gagne aussitôt.
- Si le joueur qui doit jouer n'a pas de coup légal (plus de graines, ou impossible de nourrir), la partie s'arrête : chaque camp garde les graines qui sont de son côté, puis on compare.
- Partie interminable : après 200 coups (100 chacun) on arrête et on compte de la même façon (graines capturées + graines de son côté).
- Égalité possible (24 – 24) : elle ne fait pas gagner le niveau.

## Niveaux, adversaires, étoiles
- 20 niveaux, déblocage séquentiel. « Continuer » mène au premier niveau non gagné (rejouer un ancien niveau ne le déplace pas).
- L'adversaire est réglé par la profondeur de sa recherche (budget de nœuds, jamais le temps : même graine, même partie) et par une part de coups au hasard tirée du générateur à graine. Au plus 5 demi-coups : à 8 demi-coups, presque personne ne gagnait.
- Étoiles selon l'écart de graines à la fin : 1 = gagner ; 2 = au moins 8 d'avance ; 3 = au moins 16. Critère affiché avant de jouer. Si « Annuler » a servi dans la partie, 2 étoiles au plus (annoncé à l'écran à la première utilisation). Pas d'Annuler ni de Recommencer dans un défi.
- Défi : score = graines capturées, plafonné à 25 (une partie s'arrête à 25) ; cible de 1 à 25, sinon le lien est ignoré ; un défi se joue une fois par ouverture (pas de « Rejouer » : « Renvoyer le défi » si gagné, « Accueil »). Le lien ne contient que origine + chemin + `#defi-N-S`.

### Courbe mesurée (taux de victoire du joueur, 200 parties par case, graines 1 à 200)
Joueurs de référence (`tools/semailles/reference-players.js`) : **débutant** = 1 demi-coup + 20 % de coups au hasard ; **bon joueur** = 4 demi-coups ; **hasard** = coups au hasard (mesure ajoutée pour distinguer les tout premiers niveaux). Le joueur commence toujours. Mesures refaites par `node tools/semailles/calibrate.js 200` ; le test recalcule ces taux sur 100 parties avec une tolérance de 10 points.

| N° | Adversaire | Profondeur / coups au hasard | Départ (annoncé avant la partie) | Hasard | Débutant | Bon joueur |
|---|---|---|---|---|---|---|
| 1 | Pépin | 1 demi-coup, 100 % au hasard | départ avancé : 16 graines déjà prises | 92 % | 100 % | 100 % |
| 2 | Moineau | 1 demi-coup, 100 % au hasard | départ avancé : 10 graines déjà prises | 78 % | 100 % | 100 % |
| 3 | Fourmi | 1 demi-coup, 100 % au hasard | départ avancé : 5 graines déjà prises | 59 % | 98 % | 100 % |
| 4 | Tourterelle | 1 demi-coup, 100 % au hasard | classique | 45 % | 95 % | 100 % |
| 5 | Criquet | 1 demi-coup, 90 % au hasard | classique | 31 % | 94 % | 100 % |
| 6 | Hérisson | 1 demi-coup, 70 % au hasard | départ avancé : 12 graines déjà prises | 56 % | 95 % | 100 % |
| 7 | Écureuil | 1 demi-coup, 70 % au hasard | classique | 14 % | 79 % | 100 % |
| 8 | Pintade | 1 demi-coup, 50 % au hasard | classique | 8 % | 63 % | 100 % |
| 9 | Chacal | 1 demi-coup, 35 % au hasard | classique | 4 % | 50 % | 100 % |
| 10 | Mangouste | 1 demi-coup, 20 % au hasard | classique | 2 % | 39 % | 99 % |
| 11 | Varan | 1 demi-coup, 30 % au hasard | quatre gros tas (6 graines dans les cases 2 à 5) | 3 % | 56 % | 100 % |
| 12 | Buffle | 2 demi-coups, 30 % au hasard | classique | 1 % | 26 % | 100 % |
| 13 | Hyène | 2 demi-coups, 15 % au hasard | classique | 0 % | 10 % | 99 % |
| 14 | Guépard | 3 demi-coups, 15 % au hasard | classique | 0 % | 2 % | 91 % |
| 15 | Éléphant | 3 demi-coups, 30 % au hasard | disette : 2 graines par case, 14 – 10 déjà prises | 13 % | 39 % | 95 % |
| 16 | Babouin | 4 demi-coups, 20 % au hasard | classique | 1 % | 8 % | 88 % |
| 17 | Python | 4 demi-coups, 10 % au hasard | classique | 0 % | 1 % | 74 % |
| 18 | Lionne | 4 demi-coups, 20 % au hasard | gros tas : une case de 12 graines | 0 % | 5 % | 89 % |
| 19 | Griot | 5 demi-coups, 20 % au hasard | classique | 0 % | 3 % | 74 % |
| 20 | Le Sage | 5 demi-coups, 8 % au hasard | classique | 0 % | 1 % | 43 % |

Cibles tenues : débutant ≥ 85 % aux niveaux 1-2 et ≥ 50 % jusqu'au 8 ; bon joueur ≥ 60 % jusqu'au 14 et ≥ 30 % au 20. Chaque niveau se distingue du précédent d'au moins 6 points chez l'un des trois joueurs ; respirations voulues aux niveaux 6, 11, 15 et 18 (départ avantageux ou adversaire plus faible que le précédent). Les points à 100 % du bon joueur (niveaux 1 à 12) sont tenus par le débutant et le hasard.

## Textes affichés (français, à relire)
Aide : « Tu joues en bas, l'adversaire en haut. On sème dans le sens inverse des aiguilles d'une montre… », « Si ta dernière graine tombe chez l'adversaire et porte une case à 2 ou 3, tu prends ces graines… », « Une case de 12 graines ou plus saute sa case de départ. », « Si l'adversaire n'a plus de graines, tu dois lui en donner. Prendre toutes ses graines d'un coup ne rapporte rien. », « Le premier à 25 graines gagne… ».
Noms d'adversaires : des animaux et un « Griot » / « Le Sage » (vérifier que « Griot » ne prête pas à confusion).
