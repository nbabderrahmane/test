# Vagues 1 et 2 — huit jeux, 20 niveaux chacun

Décision du propriétaire du produit (24 novembre) : lancer les vagues 1 et 2 de `docs/ETUDE-20-JEUX.md`, 20 niveaux par jeu.
Chaque jeu vit dans `games/<slug>/index.html`, ses tests dans `tests/<slug>.spec.js`, ses outils dans `tools/<slug>/`, son contenu à valider dans `docs/contenu/<slug>.md`. Un agent ne touche qu'à ces quatre emplacements.

## Contrat commun (en plus d'`AGENTS.md`)

**Parcours.** 20 niveaux fixes, difficulté croissante avec respirations ; niveaux 1 et 2 réussis par n'importe qui en moins d'une minute, sans texte d'explication (au plus une phrase et une animation au premier coup). Déblocage séquentiel. 1 à 3 étoiles par niveau, selon un critère propre au jeu, affiché avant de jouer. Pas de niveau du jour dans ce lot.

**Écrans.** Accueil (nom, une ligne de promesse, « Continuer · Niveau N », étoiles obtenues sur 60) · grille des 20 niveaux · jeu · résultat (étoiles, « Suivant », « Partager », « Défier un ami », « Rejouer »). Un tap depuis l'accueil pour jouer.

**Reprise.** La partie en cours est reprise à l'identique après rechargement. Sauvegarde corrompue ou absente : le jeu démarre sain.

**Partage.** Texte court sans solution (« <Nom du jeu> · Niveau 7 · ⭐⭐⭐ … »), `navigator.share` puis repli presse-papiers.

**Défi par lien.** « Défier un ami » partage un lien `…#defi-<niveau>-<score>` (lettres, chiffres, tirets seulement). Base du lien : `window.MJ_CONFIG.shareBaseUrl`, sinon l'adresse courante si elle est en http(s), sinon pas de lien. À l'ouverture : le niveau s'ouvre même verrouillé, avec un seul objectif à l'écran ; égaler suffit ; ouvrir un défi ne modifie ni la progression ni la partie en cours. Un fragment malformé est ignoré sans erreur.

**Événements** (`postMessage`, règle 11) : `level_complete` (level, score, stars), `share` (kind), `challenge_open` (level, target), `challenge_result` (level, score, target, won). Aucune donnée personnelle.

**Crochets de test.** `window.__game` : `state()`, `levels` (20), `loadLevel(n)`, et de quoi jouer un niveau sans animation. Tout aléa passe par un générateur à graine, réglable par `__game.seed(n)`.

**Habillage.** Même famille que Pile Poil (`games/tri-couleurs/index.html` sert de référence : fond sombre, boutons, écran de résultat, typographie système), avec une couleur d'accent et une identité propres à chaque jeu. Produit grand public, pas une démo. Respect de `prefers-reduced-motion`.

**Originalité.** On reprend un genre ou un jeu traditionnel du domaine public. Le nom, les règles de détail, l'habillage et les niveaux sont à nous : ne reproduis ni le nom, ni la grille, ni les couleurs, ni les textes d'un jeu commercial existant.

**Contenu factuel** (mots, questions, villes, chansons). Uniquement des faits stables et sûrs ; rien qui dépende de l'actualité. En cas de doute sur un fait, ne pas l'utiliser. Tout le contenu est listé dans `docs/contenu/<slug>.md` (question, réponse, niveau) avec la mention « à valider par un humain avant publication ». Rien de politique, religieux, ou qui oppose des pays ou des communautés. Public : Afrique francophone, tous âges.

**Preuves** (`node tests/<slug>.spec.js`, contexte mobile tactile) : les 20 niveaux gagnés par de vrais taps ; un échec géré proprement ; étoiles ; reprise après rechargement ; sauvegarde corrompue ; défi (lien, ouverture, gagné, perdu, fragment malformé, progression intacte) ; événements ; mise en page à 320x568, 360x640, 430x932 sur chaque écran et sur le niveau le plus chargé (aucun défilement de page, cibles ≥ 44 px) ; aucune requête réseau, aucune erreur console ; fichier < 150 Ko.

## Les huit jeux

### Vague 1

**`mot-secret` — déduction de mot.**
Trouver un mot français caché. La première lettre est donnée. Après chaque essai, chaque lettre reçoit une marque : bien placée, présente ailleurs, absente — par une forme en plus de la couleur. Longueur croissante : 4 lettres (niveaux 1-5), 5 (6-11), 6 (12-16), 7 (17-20). 6 essais. Clavier AZERTY à l'écran, qui retient l'état des lettres. Seuls des mots courants, sans accent à saisir (les accents sont ignorés), noms communs au singulier ou verbes à l'infinitif ; un essai doit appartenir à une liste de mots admis embarquée (compacte). Étoiles : 3 en 3 essais ou moins, 2 en 4-5, 1 en 6. Score du défi : nombre d'essais (le moins possible). Partage : la suite de formes, sans lettres.

**`cinq-sur-cinq` — quiz football.**
5 questions à 4 réponses par niveau, 12 secondes par question ; la rapidité donne un bonus. 100 questions au total : histoire des grandes compétitions africaines et mondiales, règles du jeu, clubs et sélections, records anciens. Faits stables seulement, texte seul (ni logo, ni photo, ni écusson). Niveau gagné à 3 bonnes réponses sur 5. Étoiles : 3/5, 4/5, 5/5. Score du défi : points (le plus possible). L'ordre des réponses est mélangé par la graine. La bonne réponse est montrée après chaque question.

**`chanson-emojis` — devinette musicale.**
3 devinettes par niveau : une suite d'emojis évoque le titre d'une chanson très connue (Afrique francophone d'abord, puis succès mondiaux) ; le joueur choisit le titre parmi 4. Un indice possible (artiste ou décennie) coûte une étoile sur la devinette. 60 devinettes. Ni paroles, ni pochette, ni extrait : titres et noms d'artistes seulement. Niveau gagné à 2 sur 3. Étoiles selon bonnes réponses sans indice. Score du défi : points.

**`cap-sur` — géographie.**
Deviner une ville d'Afrique. À chaque essai (saisie avec suggestions parmi ~120 villes embarquées avec leurs coordonnées), le jeu donne la distance en km, une flèche de direction et un pourcentage de proximité. 6 essais. Niveaux 1-8 : capitales ; ensuite grandes villes. Pas de carte, pas de frontière dessinée, pas de mention de territoire disputé. Étoiles : 3 en 3 essais ou moins, 2 en 4-5, 1 en 6. Score du défi : nombre d'essais. Partage : la suite de flèches et de pourcentages, sans nom de ville.

### Vague 2

**`semailles` — awalé (jeu de semailles traditionnel).**
Plateau de 2 rangées de 6 cases, 4 graines par case. Règle de base de l'awalé : on sème une case dans le sens antihoraire, on capture quand la dernière graine porte une case adverse à 2 ou 3, captures en chaîne vers l'arrière, obligation de nourrir l'adversaire, 25 graines pour gagner. Les règles sont résumées sur un écran d'aide. 20 adversaires de force croissante (du coup au hasard à une recherche de plus en plus profonde), quelques niveaux avec position de départ particulière. Étoiles selon l'écart de graines. Score du défi : graines capturées. Les coups jouables sont mis en évidence ; le semis est animé graine par graine, vite.

**`les-familles` — regroupement.**
12 mots à ranger en 4 familles de 3. On sélectionne 3 mots puis on valide ; 3 erreurs permises ; « presque » signalé quand 2 sur 3 sont justes. Les familles trouvées se rangent en haut avec leur nom. 20 grilles : thèmes du quotidien (cuisine, marché, école, sport, musique, nature, métiers, transports), avec des pièges honnêtes (un mot qui pourrait aller ailleurs, mais une seule solution complète). Étoiles : 0, 1-2, 3 erreurs. Score du défi : erreurs (le moins possible). Partage : l'ordre des familles trouvées, en formes de couleur.

**`compte-rond` — calcul.**
Atteindre un nombre cible avec 6 nombres et les 4 opérations ; chaque nombre sert une fois, les résultats intermédiaires sont réutilisables, pas de négatif ni de fraction. On tape un nombre, une opération, un nombre : le résultat remplace les deux. Annuler illimité. 20 niveaux générés et prouvés par solveur, de 2 opérations à 5. Étoiles : cible exacte en autant d'opérations que la solution de référence ou moins (3), cible exacte (2), à 5 près (1). Score du défi : nombre d'opérations.

**`course-des-pions` — jeu de parcours à dés traditionnel (petits chevaux / ludo).**
Chaque joueur fait le tour du plateau et rentre ses pions ; un 6 fait sortir un pion et rejouer ; arriver sur un pion adverse le renvoie à sa base ; cases refuges. Version courte : 2 pions par joueur (niveaux 1-10), 3 pions ensuite ; 1 adversaire puis 2, puis 3. Adversaires de plus en plus avisés. Le dé est tiré par le générateur à graine, visible et identique pour tous les joueurs ; aucune mise, aucun gain. Mode « à plusieurs sur ce téléphone » accessible depuis l'accueil (2 à 4 joueurs), hors parcours. Étoiles selon le classement et l'avance. Score du défi : nombre de tours pour gagner. Plateau lisible à 320 px, pions ≥ 44 px au toucher (zone tactile élargie si besoin).
