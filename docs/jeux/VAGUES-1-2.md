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

## Décisions après première revue (24 novembre) — s'appliquent aux huit jeux

**R1. Un score ne se remet pas à zéro en cours de partie.** Dans les jeux où les étoiles comptent des essais ou des erreurs (`mot-secret`, `les-familles`, `cap-sur`), il n'y a pas de « Recommencer » en cours de partie : quitter puis revenir reprend la partie telle quelle. Dans les autres jeux, Recommencer reste possible quand il n'efface aucune pénalité.

**R2. Un échec ne donne pas la solution.** Après un niveau perdu, le jeu ne révèle ni le mot, ni les familles, ni la ville : il propose « Réessayer » (nouvelle partie du même niveau, compteur à zéro) et « Niveaux ». Exception : les quiz (`cinq-sur-cinq`, `chanson-emojis`) montrent la bonne réponse après chaque question, c'est leur règle.

**R3. Un défi se joue une fois par ouverture.** Sur l'écran de résultat d'un défi, pas de « Réessayer » ni de « Rejouer » : seulement « Renvoyer le défi » (si gagné) et « Accueil ». `challenge_result` part une seule fois par ouverture de lien. L'objectif d'un lien est borné aux valeurs atteignables du niveau ; hors bornes, le fragment est ignoré. Limite connue et acceptée tant qu'il n'y a pas de serveur : rien n'empêche de rouvrir le lien.

**R4. Le lien partagé ne contient que `origin + pathname + #defi-…`.** Jamais la chaîne de requête de l'adresse courante (elle peut porter un jeton ou un numéro posé par l'app hôte). Testé avec une adresse qui porte `?token=…`.

**R5. La solution n'est pas lisible par un joueur.** Rien dans le DOM, les attributs, le texte de partage ou le lien ne permet de déduire la solution (identifiants de tuiles mélangés par partie, par exemple). Un test inspecte le DOM.

**R6. « Continuer » pointe toujours le premier niveau non terminé.** Rejouer un ancien niveau ne le déplace pas.

**R7. Couleurs jamais seules, y compris dans le texte de partage** : des formes distinctes, pas seulement des carrés de couleur.

**R8. Originalité, concrètement.** Chaque jeu a sa palette (dérivée de sa couleur d'accent), ses formes et ses libellés ; aucun ne reprend la combinaison de codes d'un jeu commercial ou télévisé connu :
- `mot-secret` : pas de vert/jaune/gris, pas de carré plein + rond, pas de retournement de tuile. Marques : ▲ bien placée, ◆ ailleurs, · absente, dans la palette du jeu.
- `les-familles` : pas de jaune/vert/bleu/violet ni de carrés emoji dans le partage ; « Deux sur trois » au lieu de « presque ».

**R9. Contenu.**
- `mot-secret` : pour chaque niveau, au moins 30 mots admis de même longueur et même première lettre (testé) ; la liste admise est nettoyée de tout mot religieux, politique, violent ou grossier, et complétée des mots les plus courants (famille, maison, nourriture, école) ; l'orthographe de chaque mot est contrôlée contre un dictionnaire libre si l'environnement permet d'en obtenir un (sinon le dire) ; la fiche de contenu ne doit rien affirmer qui ne soit vérifié par un script.
- `les-familles` : les grilles 9, 10 et 12 ont une autre répartition légitime (tabouret/banc, piment/gingembre, soleil/orage) : changer un mot dans chacune ; la table « ce mot peut appartenir à ces familles » est relue en cherchant activement les autres lectures ; pas de famille entière réutilisée d'une grille à l'autre, et au plus un mot commun entre deux grilles.

**R10. Dérogation assumée** : les touches lettres d'un clavier à l'écran peuvent faire moins de 44 px de large (jamais moins de 28) si elles font au moins 44 px de haut.

## Décisions après deuxième revue (24 novembre) — s'appliquent aux huit jeux

**R11. On ne gagne pas d'étoiles avec une solution déjà vue.** Dans les jeux à solution fixe (`mot-secret`, `les-familles`, `cap-sur`) :
- les essais ou erreurs d'un niveau **se cumulent** d'une partie à l'autre jusqu'à la première victoire (une partie perdue puis « Réessayer » ne remet pas le compteur d'étoiles à zéro ; l'écran le dit : « Essais cumulés : 7 ») ;
- les étoiles d'un niveau **se figent à la première victoire** ; « Rejouer » un niveau gagné est possible pour le plaisir et l'écran de résultat le dit, sans changer les étoiles ;
- une partie de défi sur un niveau pas encore gagné compte dans ce cumul, qu'elle soit gagnée ou perdue.
Dans les quiz (`cinq-sur-cinq`, `chanson-emojis`), où les réponses sont montrées : une nouvelle tentative après un échec plafonne à 2 étoiles, et les étoiles se figent à la première réussite.
Dans les jeux sans solution cachée (`compte-rond`, `semailles`, `course-des-pions`), rejouer pour améliorer ses étoiles reste permis.

**R12. Une partie en cours par niveau.** Dans les jeux soumis à R1, la partie en cours est sauvegardée par niveau : passer par la grille et ouvrir un autre niveau ne remet à zéro ni les essais ni les erreurs du premier. Le test passe par un autre niveau avant de revenir.

**R13. R4 vaut aussi pour `MJ_CONFIG.shareBaseUrl`** : la base configurée est réduite à `origin + pathname`. Testé avec une base portant `?token=…`.

**R14. Tests stables.** Le script d'initialisation des tests n'écrit la sauvegarde de départ qu'à la première navigation (drapeau en `sessionStorage`), jamais après un rechargement : sous Chromium en `file://`, `localStorage.getItem` rend parfois `null` juste après un rechargement et le script effaçait alors la partie en cours. Chaque suite passe 5 fois de suite.

**R15. Un défi s'arrête à son objectif.** Quand l'objectif ne peut plus être atteint (essais ou erreurs dépassés), la partie de défi se termine, perdue ; un seul compteur à l'écran. Un défi en cours est repris après rechargement, et `challenge_result` part toujours une fois.

**R16. Contenu, suite.**
- `mot-secret` : la liste de blocage s'étend à l'alcool et au tabac, à l'armée, la police et la justice, à la violence, à l'origine et la politique, aux jeux d'argent, au porc ; la fiche dit que la liste n'est pas exhaustive ; « cuve » (niveau 5) est remplacé par un mot plus courant.
- `les-familles` : la grille 18 a deux solutions (`maillot` est aussi du matériel de sport) : remplacer ; « sans erreur » au lieu de « en aucune erreur ».
- `cap-sur` : Kinshasa et Brazzaville ne doivent pas être à 0 km l'une de l'autre (deux décimales) ; un test vérifie qu'aucune paire de villes n'est à moins de 5 km ; aucune ville dont le statut de capitale est en cours de changement n'est marquée capitale.
- `compte-rond` : les grands nombres ne sont pas systématiquement 25, 50, 75, 100 : varier les jeux de nombres (par exemple 12, 15, 20, 30, 40, 60) pour avoir notre propre style ; régénérer en gardant la courbe.

## Décisions après revue des quatre derniers jeux (24 novembre)

**R17. Un chrono ne s'arrête pas.** Quand un jeu chronomètre une réponse, l'échéance est une heure d'horloge enregistrée au moment où la question s'affiche : quitter l'écran, cacher l'application ou recharger ne rend pas de temps. Au retour, si l'échéance est passée, la question est comptée « temps écoulé ».

**R18. `course-des-pions` : la fiche est amendée.** Le dé domine ce jeu et n'est jamais biaisé ; la difficulté vient du nombre de pions de chaque camp (annoncé avant la partie), puis du nombre et de la qualité des adversaires. La règle « 2 pions (niveaux 1-10), 3 ensuite » est remplacée par la table mesurée de `docs/contenu/course-des-pions.md`. Les étoiles se comptent sur l'avance à l'arrivée. Un écran d'aide résume les règles (sortie sur 6, rejouer, trois essais, capture, refuges, arrivée au compte exact). Le mode à plusieurs est repris après rechargement.

**R19. Un défi demande de gagner.** Dans les jeux contre un adversaire, un défi n'est relevé que si la partie est gagnée et l'objectif atteint ; l'objectif d'un lien est borné en bas par ce qui est acquis au départ. Un défi quitté est abandonné pour de bon.

**R20. Quiz : des leurres honnêtes.** Une mauvaise réponse ne doit pas être défendable : dans `chanson-emojis`, les leurres d'une devinette excluent tout titre que ses emojis évoquent aussi (table d'exclusions par paire, testée). Pas de « Recommencer » en cours de niveau dans un quiz.

**R21. Contenu des deux quiz.**
- `cinq-sur-cinq` : aucune formulation qui dépende de l'avenir (« sa seule CAN » → « la CAN 1976 ») ; « Quel fut le premier pays africain à jouer une Coupe du monde, en 1934 ? » ; « La grande finale ». L'accent ne doit pas être le vert d'une marque connue.
- `chanson-emojis` : retirer « Poker Face » et « Milord » ; refaire les emojis faibles relevés par la revue ; corriger la fiche (lieu de naissance de Corneille, année de « Dernière danse », emojis composés). La part d'Afrique francophone reste insuffisante (4 titres d'artistes d'Afrique francophone sur 60) : le modèle ne connaît pas assez de titres avec certitude — la liste doit être fournie par une équipe locale ; la fiche de contenu le dit en tête.
