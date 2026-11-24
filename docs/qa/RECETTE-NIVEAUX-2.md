# Recette des niveaux, deuxième passe : Pile Poil (lot A après décisions)

Deuxième recette, après régénération des niveaux et correction du jeu (commit `63c084e`, section « Décisions après recette des niveaux » de `docs/jeux/tri-couleurs-lot-A.md`). Chromium émulé tactile, 360×640 et 320×568, vrais taps. Aucun fichier du jeu, des tests, des fiches ni des solutions n'a été modifié ; seuls `tools/qa/` et `docs/qa/` ont été écrits ; rien n'est committé. Captures hors dépôt : `/tmp/claude-0/-home-user/3653fa57-520f-59f5-9349-580d753a3fad/scratchpad/qa/`.

Convention : **[MESURÉ]** = exécuté et chiffré ici ; **[SUPPOSÉ]** = jugement ou hypothèse non prouvée ; **seuil** = règle de décision du testeur. Les mesures sont refaites de zéro avec mes scripts (simulation avec des graines différentes de celles du générateur : `--seedoff 777`, recherche exhaustive de mon côté, second programme de recoupement) ; je n'ai repris aucun chiffre du codeur sans le remesurer, je les compare seulement.

## 1. Verdict global

1. **Fonctionnel : tout passe, aux deux tailles.** 320/320 niveaux (200 + 120 du jour) gagnés au doigt à 360×640 et 320/320 à 320×568 (3★, compteur et écran de victoire justes) ; 0 doublon ; 0 anomalie de géométrie sur 640 mesures ; repère d'étoiles = optimum sur 320/320 (A* complet).
2. **Les pièges de la première recette sont réglés, la courbe aussi dans sa définition, mais un mur reste à la fin.** Plus aucun niveau à plus de 25 % de premiers coups fatals (max mesuré : 25 %, contre 33 niveaux au-dessus de 50 % avant) ; décisions 3, 4, 6, 7, 9 tenues sans réserve ; 1 tenue à la lettre (réserve : devinette encore possible au 2e coup sur certains niveaux mystère) ; 2 et 5 tenues avec réserve (2 : vraie pour la mesure composite de la fiche, fausse pour un joueur attentif ; 5 : seuils exacts mais message très furtif) ; 8 tenue mais elle crée un défaut (« Perfectionniste » tronqué à 320 px). Voir § 3.
3. **35 niveaux à revoir (34 niveaux + 1 du jour), 0 à retirer, 285 sans alerte.** Le monde 10 (et, à un moindre degré, 6, 8, 9) reste très dur : un joueur simulé attentif gagne 3 % du monde 10 ; mon avis : mur pour le monde 10, difficulté raide mais défendable pour 6, 8 et 9 (§ 5).

## 2. Compteurs

| | Niveaux (200) | Niveaux du jour (120) | Total (320) |
|---|---|---|---|
| Joués au doigt, 360×640 puis 320×568 | 200 + 200 | 120 + 120 | 640 parties |
| Gagnés (état `won`, victoire affichée, 3★, compteur juste), 360×640 | 200 | 120 | 320 |
| Gagnés, idem, 320×568 | 200 | 120 | 320 |
| En échec | 0 | 0 | 0 |
| **OK** | 166 | 119 | 285 |
| **À revoir** | 34 | 1 | 35 |
| **À retirer** | 0 | 0 | 0 |

Coups joués au doigt : 9143 par passe. Aucune erreur console, aucune requête réseau. « OK » = jouable, rendu sans anomalie, aucune alerte de § 6 ; cela ne dit rien du plaisir de jeu. Récapitulatif par motif : PIEGE 0, SILENCE 15, FACILE 3, COURBE 0, ETOILES 0, MUR 25, DUR 0 (un niveau peut cumuler).

## 3. Les 9 décisions : tenues ou non

| # | Décision | Tenue ? | Mesure (mes propres chiffres) |
|---|---|---|---|
| 1 | Pas de premier coup piégé (≤ 25 % ; 0 % pour les 3 premiers niveaux de chaque monde ; mystère : aucun fatal) | **Tenue** (à la lettre) | Premiers coups fatals max par monde : M1 0 %, M2 0 %, M3 0 %, M4 0 %, M5 13 %, M6 25 %, M7 0 %, M8 0 %, M9 25 %, M10 0 % (fiche : 0, 0, 0, 0, 13, 25, 0, 0, 25, 0, identique). Niveaux 1 à 3 de chaque monde : 0 fatal sur 30/30. Niveaux mystère : 0 premier coup fatal sur 1058 coups légaux, 80/80 niveaux. Recoupement : DFS indépendant (sans tri des tubes) sur les 200 niveaux, 200/200 niveaux identiques, 0 désaccord, 0 non conclu. N200 : mon solveur plafonnait (20 coups non classés), la recherche indépendante et un 2e passage (tools/qa/n200.js) prouvent 20/20 gagnables. **Réserve mystère** : « premier coup » seulement. À 2 coups, 8 % des suites perdent en moyenne (max N144 50 %, N188 38 %, N194 37 %, N157 33 %) et à 3 coups 14 % (max N188 62 %, N194 53 %, N157 45 %) : un joueur qui ne voit que les sommets devine encore au 2e et 3e coup sur ces niveaux (niveaux non mystère : 9 % et 11 %). |
| 2 | Courbe mesurée : médiane par monde qui ne baisse pas et ne monte pas de plus de 30 % ; aucun pic > 25 % hors 20e niveau | **Tenue pour la mesure de la fiche, pas pour un joueur attentif** | Difficulté fiche (solution + 40 × (1 − victoire au hasard)), remesurée : médianes 26, 31, 38, 45, 55, 61, 66, 67, 81, 92 (fiche : 26, 31, 37, 46, 55, 61, 66, 66, 82, 92) ; rapports d'un monde au suivant : ×1.20, ×1.21, ×1.18, ×1.22, ×1.12, ×1.08, ×1.02, ×1.22, ×1.13 : jamais < 1, max ×1.22 (≤ 1,30). Pics niveau à niveau : 0 niveau hors règle (max ×1.40 au N2, tolérance du plancher +3 points aux niveaux 2 et 3). **Mais** : longueur de solution seule : médianes 18.5, 25, 23, 22, 29.5, 26, 31, 30.5, 46.5, 52.5 (baisse aux mondes 3, 4, 6, 8) ; avec un joueur attentif simulé à la place du hasard (solution + 40 × (1 − victoire attentive)) : 19, 25, 32, 32, 37, 57, 56, 54, 76, 90 : ×1.54 du monde 5 au monde 6, ×1.40 du 8 au 9, baisse de 57 à 54 du monde 6 au 8. La règle est tenue par construction de sa métrique, pas par la difficulté perçue (§ 4.2). |
| 3 | Niveaux du jour : victoire au hasard entre 25 % et 60 % | **Tenue à la marge d'erreur près** | 120 niveaux, victoire au hasard (200 parties chacun) : min 27 %, moyenne 44 %, max 61 %. 1 niveau hors bande : J82 (61 %) (marge d'échantillonnage ±3,5 points ; la fiche mesure 55 % au plus avec d'autres graines). Écart d'un niveau du jour à l'autre : plus de 2 fois (27 % à 61 %) au lieu de 1 % à 97 % avant. |
| 4 | Repères d'étoiles = meilleure solution connue (13 solutions plus courtes reprises) | **Tenue** | A* complet sur 320 niveaux, aucun abandon : repère = optimum sur 320/320, 0 niveau où une solution plus courte existe (13 avant). Chaque solution de référence redonne 3★ au doigt, aux deux tailles. |
| 5 | « Partie mal engagée » après 2 × repère ou 3 retours sur une position | **Tenue avec réserve** | [MESURÉ] 0 fausse alerte en rejouant les 320 solutions ; seuil exact (message au coup 27 = 2 × 13 + 1) ; 3e revisite au bon coup ; pas déclenché par le va-et-vient coup/Annuler ; une seule fois par partie, de nouveau possible après Recommencer ; 4,5 s si le joueur ne fait rien ; tient dans sa zone à 360×640 et 320×568. Jamais : sur 11861 parties simulées perdues (19 200 parties), 0 sont restées sans aucun message (ni celui-ci ni « Plus aucun coup possible »). **Réserves** : (a) il disparaît dès que le joueur touche un tube (mesuré : effacé 80 ms après un tap), donc visible seulement pendant son temps de réaction ; (b) pour un joueur qui erre (simulation « naïf »), il apparaît tôt : médiane à 0.81 × le repère, 41 % des messages tombent alors que la partie est encore gagnable, 65 % des parties finalement gagnées l'ont reçu ; c'est la règle des 3 retours qui déclenche presque toujours (11346 sur 12821), pas le seuil de 2 × repère ; (c) le délai entre la perte réelle et le message : médiane 5 coups après le point de contrôle (p90 11). |
| 6 | Mystère : « Rejouer » / nouvelle partie d'un niveau gagné recachent ; révélées pendant une même partie | **Tenue** | 4 niveaux (N45, N130, N145, N185, un par monde mystère 3, 7, 8, 10) : départ = tout caché sauf les sommets (18, 24, 21, 32 cachées, DOM et état), 4 coups puis Recommencer puis rechargement : révélées conservées ; après victoire puis « Rejouer » : tout recaché (18, 24, 21, 32 ; DOM identique) ; changer de niveau puis revenir : nouvelle partie cachée ; « Reprendre » : même partie. Sonde de régression : défi ouvert sur le niveau mystère en cours puis retour par « Reprendre » : partie intacte (4 coups, 14 cachées avant et après). Ancien constat (0 à 1 cachée sur 12 à 36 après Rejouer) corrigé. |
| 7 | Défi : un seul objectif à l'écran ; « À N coups près » ; pas de lien sans `shareBaseUrl` hors http(s) | **Tenue** | Écran de défi : bandeau « Objectif : N coups ou moins » visible, ligne des étoiles masquée (360×640 et 320×568) ; défi perdu : « À 1 coup près » (singulier vérifié), plus de ligne « 3 étoiles en … ». Partage : sur file:// sans configuration → texte sans lien ; sur http(s) (page servie par interception) → lien `#defi-5-13` ; avec `shareBaseUrl` → lien sur cette base ; le texte du résultat ne contient jamais de lien ni de solution. Limite : sans lien, le défi est un simple texte (le destinataire ne peut pas l'ouvrir) : conforme à la décision, à savoir. |
| 8 | Rang « Maniaque » → « Perfectionniste » | **Tenue, mais le nouveau mot est tronqué à 320 px** | Plus aucune occurrence de « Maniaque » ni « Raté » dans le fichier. À 360×640 « Perfectionniste » s'affiche entier ; à **320×568 il est coupé en « Perfectionni… »** (largeur nécessaire 122 px pour 117 disponibles ; capture `dec/320x568-home-rank.png`, planche `sheets2/R.png`). Le rang est affiché sur l'accueil, l'écran le plus vu. |
| 9 | Les niveaux 1 à 10 peuvent changer | **Tenue** | Comparaison avec la version précédant la régénération (`e06f42a`) : 0 des 10 premiers niveaux inchangé. Nouveau niveau 1 : 3 tubes de hauteur 3, 1 tube vide, solution de 5 coups ; main animée vérifiée (§ 4.5). |

## 4. Ce qui s'est amélioré, ce qui reste, ce qui est nouveau (par rapport à la première recette)

### 4.1 Amélioré

- **Pièges au premier coup** : 33 niveaux ≥ 50 % de premiers coups fatals → 0 niveau > 25 % (max 25 %) ; niveau d'introduction du monde « un seul vide » : 3 coups fatals sur 4 → 0 sur 4 (N101). Niveaux avec au moins un premier coup qui affiche « Plus aucun coup possible » : 40 → 16.
- **Mystère** : plus aucun premier coup fatal (avant : jusqu'à 7 sur 9) ; billes recachées à chaque nouvelle partie.
- **Étoiles** : 13 repères non optimaux → 0.
- **Niveaux du jour** : victoire au hasard de 1–97 % → 27–61 % ; jours très durs (≤ 2 % de victoire) : 5 → 0.
- **Niveaux à revoir** : 66 (58 + 8) → 35 (34 + 1) ; positions perdues sans message ≥ 90 % : 16 → 15 niveaux ; pics de courbe : 4 + 1 pointe décroissante → 0.
- **Textes** : bandeau à deux objectifs (T1) supprimé ; « Raté de N coups » → « À N coups près » ; rang « Maniaque » remplacé ; lien de défi inutilisable en file:// supprimé. Message d'aide aux parties mal engagées ajouté.

### 4.2 Ce qui reste

- **Monde 10 : mur** (§ 5) et 15 niveaux à position perdue silencieuse (surtout mondes 8 à 10) ; le message de la décision 5 n'efface pas ce silence pour un joueur qui ne s'arrête pas.
- **Cliffs de difficulté pour un joueur attentif** malgré la décision 2 : du monde 5 au monde 6 (joueur attentif simulé : 81 % → 26 % de victoires ; hasard : 38 % → 8 %), du 8 au 9 (39 % → 20 %), du 9 au 10 (20 % → 3 %).
- **Devinette au 2e et 3e coup** sur quelques niveaux mystère (N144, N157, N188, N194 : 33 à 50 % des suites de 2 coups fatales) et sur le monde 6 non mystère (moyenne 25 % à 2 coups, N105 60 %, N108 56 %, N112 50 %).
- **Niveaux du jour** : l'écart se réduit mais 37 niveaux sur 120 se gagnent au hasard dans plus de la moitié des parties.
- **Textes jamais traités** (hors périmètre des décisions) : « Fouillis » / « Rangeur », « Pile poil » employé 4 fois, tutoiement, sous-titres de monde elliptiques (« hauts, un seul vide », « court et mystère »), absence d'espaces insécables avant « ! » et « : », apostrophes mixtes ; tous inchangés (T3, T5 à T8 de la première recette).

### 4.3 Nouveau

- **« Perfectionniste » tronqué à 320×568** (décision 8) : défaut introduit par la correction ; l'accueil affiche « Perfectionni… ».
- **Message « Partie mal engagée ? »** : se déclenche surtout par la règle des 3 retours, médiane à 0.81 × le repère pour un joueur qui erre ; effacé par le premier tap suivant ; tient dans 44 px à 360×640 mais sur 3 lignes (38 px à 320×568, 3 lignes aussi).
- **Table des mondes de la fiche légèrement inexacte** : le niveau 1 a 1 tube vide (la table dit 2) ; sans conséquence.
- **Ordre des mondes** : les mécaniques « un seul vide » arrivent plus tard (monde 6), après tube haut, mystère, tube court et couleurs : l'introduction de chaque mécanique est plus douce, mais le mur se déplace vers la fin.

### 4.4 Régressions : aucune trouvée dans le périmètre testé

- Comportements : 33/33 (passe 1) + 100/101 (passe 2, 2 à 4 niveaux par mécanique) + 35/36 (décisions) ; seuls échecs : « Perfectionniste » à 320 px et une impasse non atteinte par la marche au hasard (N25, tube haut à 2 vides ; sans gravité).

### 4.5 Captures regardées

Nouveau niveau 1 à 360×640 et 320×568 (`dec/*-N1-hand-1.png`, `-2.png`, planche `sheets/H.png`) : la main se pose sur la bille du dessus du tube 1, puis, une fois le tube choisi, sur le tube vide (position mesurée : dans l'écran, au-dessus du bon tube), puis disparaît après le coup ; elle montre le premier coup de la solution de référence (tube 0 vers tube 2). Elle recouvre en partie la bille visée, sans gêne. Deux niveaux par monde aux deux tailles (N10, 20, 30 … 200 ; N101, 121, 161, 181) : planches `sheets2/A360, B360, C360, A320, B320, C320` ; 12 niveaux du jour (planche `sheets2/D360` et planches de la première recette) ; écran de défi (`dec/*-challenge.png`, `*-challenge-lost.png`) ; message de la décision 5 (`dec/*-nudge.png`). Aucun défaut visuel autre que la troncature du rang.

## 5. Mondes 6, 8, 9, 10 : difficulté de fin de jeu acceptable ou mur ?

Question posée : un joueur au hasard y gagne moins de 10 % du temps. Ce chiffre seul ne dit pas si c'est un mur : un jeu de tri peut être difficile pour un joueur au hasard et facile pour un joueur qui réfléchit. J'ai donc ajouté mes propres mesures indépendantes du générateur.

| Monde | Mécanique | Solution médiane | Victoire au hasard | Victoire d'un joueur attentif simulé | Parties perdues sans message avant le coup 40 | Premiers coups fatals (max) | Suites de 2 coups fatales | Niveaux sans aucune victoire attentive (sur 100 parties) |
|---|---|---|---|---|---|---|---|---|
| 1 Le Tiroir | bases | 18.5 | 85 % | 99 % | 14 % | 0 % | 2 % | 0/20 |
| 2 Le Grenier | tube haut | 25 | 82 % | 98 % | 18 % | 0 % | 1 % | 0/20 |
| 3 La Brume | mystère | 23 | 64 % | 79 % | 28 % | 0 % | 3 % | 0/20 |
| 4 La Cave | tube court | 22 | 42 % | 72 % | 50 % | 0 % | 2 % | 0/20 |
| 5 L'Étagère | plus de couleurs | 29.5 | 38 % | 81 % | 52 % | 13 % | 6 % | 0/20 |
| 6 Le Placard **←** | un seul vide | 26 | 8 % | 26 % | 57 % | 25 % | 25 % | 2/20 |
| 7 Le Garage | court + mystère | 31 | 14 % | 34 % | 72 % | 0 % | 7 % | 0/20 |
| 8 Le Hangar **←** | un seul vide + mystère | 30.5 | 8 % | 39 % | 62 % | 0 % | 14 % | 0/20 |
| 9 L'Atelier **←** | haut + un seul vide | 46.5 | 7 % | 20 % | 68 % | 25 % | 16 % | 4/20 |
| 10 Pile Poil **←** | tout | 52.5 | 1 % | 3 % | 84 % | 0 % | 9 % | 8/20 |

**Le joueur attentif simulé** (`tools/qa/smart.js`) n'est pas un humain : glouton sur l'information visible, un peu de bruit (10 % de coups au hasard), ne joue jamais un coup qui ne laisse aucun coup légal, utilise Annuler (recule de 3 coups) quand il est coincé ou qu'il tourne en rond ; budget de 4 × solution + 30 coups, annulations comprises. Sur les niveaux mystère il ne lit que les sommets et les billes déjà révélées. Il gagne 98 à 99 % des mondes 1 et 2, 72 à 81 % des mondes 3 à 5 : il sait donc jouer.

**Mon avis, franc, avec les mesures sur lesquelles il repose :**

- **Monde 10 (Pile Poil) : mur, pas une difficulté de fin de jeu.** [MESURÉ] Joueur attentif simulé : 3 % de victoires, 8 niveaux sur 20 jamais gagnés en 100 parties ; hasard : 1 % ; 84 % des parties naïves en position perdue encore jouable avant le coup 40 ; solutions de 42 à 66 coups (soit 84 à 132 taps) avec billes cachées, tubes de 5, un seul vide et un tube court, dans un jeu de sessions de 1 à 3 minutes. À environ 1,3 s par tap (hypothèse), une solution parfaite médiane (52.5 coups, 105 taps) prend ~2.3 minutes sans une seule erreur. [SUPPOSÉ] Un joueur humain très patient avec Annuler illimité peut en venir à bout ; un client en démonstration ne le fera pas. 14 niveaux sur 20 sont signalés (MUR ou SILENCE).
- **Monde 9 (L'Atelier : tubes de 5 + un seul vide) : raide, à la limite.** Joueur attentif 20 %, hasard 7 %, solution médiane 46.5. Niveaux où mon joueur attentif ne gagne presque jamais (≤ 5 %) : N165, N166, N170, N175, N178, N179, N180 (soit 7 sur 20, dont le dernier niveau N180). Pas de bille cachée, donc l'information est complète : un joueur méthodique peut y arriver ; le saut depuis le monde 8 (×1.40 en difficulté pour le joueur attentif) est brutal et la solution médiane passe de 30.5 à 46.5 coups (+52 %).
- **Monde 8 (Le Hangar) : difficile mais défendable ; monde 6 (Le Placard) : difficile, avec une fin trop dure.** Joueur attentif 26 % et 39 %, solutions médianes 26 et 30.5 (comme les mondes précédents). **Mais le monde 6 contient 4 niveaux qui se comportent comme des murs pour mon joueur attentif (≤ 5 %) : N106, N111, N119, N120, dont ses deux derniers (N119, N120)** ; le monde 8 n'en contient aucun. Le monde 6 est la première fois qu'un seul tube vide apparaît : la marge d'erreur disparaît et 25 % des premiers coups restent fatals ; 25 % des suites de 2 coups perdent le niveau en moyenne. C'est une marche d'escalier plutôt qu'un mur : pour un joueur qui comprend « réfléchis avant de bouger » (message d'aide du niveau 101), c'est apprenable ; pour un joueur occasionnel c'est le point où il risque de décrocher. Le monde 8 ajoute des billes cachées au même mécanisme (premiers coups sûrs, mais 14 % de suites de 2 coups fatales en moyenne, jusqu'à 50 % au N144).
- **Pourquoi le 10 % de victoires au hasard est un mauvais critère** : le monde 7 (court + mystère, 2 vides + tube court), à 14 % au hasard, est gagné à 34 % par le joueur attentif ; le monde 3 (mystère, 64 % au hasard) reste à 79 %. Le hasard mesure la largeur de la zone « sans danger » du plateau, pas l'effort de raisonnement. Pour un jeu de tri, un joueur humain se situe entre les deux.
- **Recommandations de mesure, pas de correction** : (1) ne pas compter le monde 10 dans une démonstration ; (2) si le monde 10 doit rester, lui donner 8 à 10 niveaux de moins ou lui ajouter les mécaniques une à une comme les autres mondes ; (3) faire tester les mondes 6 et 9 par de vrais joueurs (je ne peux pas dire s'ils y renoncent) ; (4) la règle de médiane de la décision 2 devrait inclure une mesure de joueur attentif, sans quoi elle laisse passer des sauts de ×1,4 à ×1,5.

## 6. Niveaux « À revoir » et « À retirer »

**À retirer : aucun.** Les 320 niveaux sont gagnables (au doigt, aux deux tailles), conformes à la table de la fiche (0 écart de hauteur, vides, tube court, mystère, couleurs, longueur de solution), sans doublon, sans premier coup fatal au-dessus de 25 %.

Seuils [seuil] : piège = plus de 25 % de premiers coups fatals, ou un seul fatal parmi les 3 premiers niveaux d'un monde ou sur un niveau mystère (décision 1) ; silence = au moins 90 % des parties naïves en position perdue encore jouable avant le coup 40 ; facile = victoire au hasard ≥ 90 % (hors place 1 de chaque groupe de 5 et niveaux 1 à 5) ; courbe = difficulté (solution + 40 × (1 − victoire au hasard)) en hausse de plus de 25 % et plus de 3 points sur le niveau précédent (hors places 1 et 20) ; étoiles = repère ≠ optimum ; mur = joueur attentif simulé ≤ 5 % de victoires ; jour = victoire au hasard hors de 25 à 60 %.

| Niveau | Monde · place | Motif et mesure |
|---|---|---|
| N8 | 1 Le Tiroir · 8 | **FACILE** joueur au hasard gagne 96 % (solution 18 coups) en place 8 du monde 1 |
| N28 | 2 Le Grenier · 8 | **FACILE** joueur au hasard gagne 92 % (solution 24 coups) en place 8 du monde 2 |
| N106 | 6 Le Placard · 6 | **MUR** joueur « attentif » simulé : 3 % de victoires (au hasard : 9 %) |
| N111 | 6 Le Placard · 11 | **MUR** joueur « attentif » simulé : 2 % de victoires (au hasard : 3 %) |
| N114 | 6 Le Placard · 14 | **SILENCE** 95 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N119 | 6 Le Placard · 19 | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 1 %) |
| N120 | 6 Le Placard · 20 | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 2 %) |
| N123 | 7 Le Garage · 3 · mystère | **SILENCE** 93 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N125 | 7 Le Garage · 5 · mystère | **SILENCE** 93 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N139 | 7 Le Garage · 19 · mystère | **SILENCE** 90 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N143 | 8 Le Hangar · 3 · mystère | **SILENCE** 93 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N145 | 8 Le Hangar · 5 · mystère | **SILENCE** 90 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N162 | 9 L'Atelier · 2 | **SILENCE** 95 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) |
| N165 | 9 L'Atelier · 5 | **MUR** joueur « attentif » simulé : 5 % de victoires (au hasard : 1 %) |
| N166 | 9 L'Atelier · 6 | **MUR** joueur « attentif » simulé : 3 % de victoires (au hasard : 2 %) |
| N170 | 9 L'Atelier · 10 | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N175 | 9 L'Atelier · 15 | **SILENCE** 90 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **MUR** joueur « attentif » simulé : 1 % de victoires (au hasard : 2 %) |
| N178 | 9 L'Atelier · 18 | **SILENCE** 100 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N179 | 9 L'Atelier · 19 | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N180 | 9 L'Atelier · 20 | **SILENCE** 100 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N183 | 10 Pile Poil · 3 · mystère | **MUR** joueur « attentif » simulé : 4 % de victoires (au hasard : 5 %) |
| N185 | 10 Pile Poil · 5 · mystère | **SILENCE** 90 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N186 | 10 Pile Poil · 6 · mystère | **SILENCE** 93 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **MUR** joueur « attentif » simulé : 3 % de victoires (au hasard : 0 %) |
| N188 | 10 Pile Poil · 8 · mystère | **SILENCE** 98 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N189 | 10 Pile Poil · 9 · mystère | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 1 %) |
| N190 | 10 Pile Poil · 10 · mystère | **SILENCE** 98 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **MUR** joueur « attentif » simulé : 1 % de victoires (au hasard : 0 %) |
| N191 | 10 Pile Poil · 11 · mystère | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N192 | 10 Pile Poil · 12 · mystère | **MUR** joueur « attentif » simulé : 2 % de victoires (au hasard : 0 %) |
| N193 | 10 Pile Poil · 13 · mystère | **SILENCE** 90 % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message) ; **MUR** joueur « attentif » simulé : 1 % de victoires (au hasard : 0 %) |
| N194 | 10 Pile Poil · 14 · mystère | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N195 | 10 Pile Poil · 15 · mystère | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N198 | 10 Pile Poil · 18 · mystère | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| N199 | 10 Pile Poil · 19 · mystère | **MUR** joueur « attentif » simulé : 1 % de victoires (au hasard : 0 %) |
| N200 | 10 Pile Poil · 20 · mystère | **MUR** joueur « attentif » simulé : 0 % de victoires (au hasard : 0 %) |
| Jour 82 | 7 couleurs | **FACILE** niveau du jour : joueur au hasard gagne 61 % (décision 3 : 25 à 60 %) |

À surveiller (20 à 25 % de premiers coups fatals, 9 niveaux, dont 3 à exactement 25 %) : N106 (1/5), N107 (1/5), N108 (1/5), N111 (1/4), N113 (1/5), N116 (1/4), N166 (1/5), N171 (1/5), N173 (2/8).

## 7. Tableau par monde

Ordre de jeu après décisions. Impasse naïve = parties « naïf » finissant sur « Plus aucun coup possible » (moyenne). Perdu à 40 = impasse ou position perdue avant le coup 40. Attentif = joueur simulé de § 5.

| Monde | Mécanique | Solution min / médiane / max | Impasse naïve | Perdu à 40 | Premiers coups fatals moy. / max | Hasard | Attentif | Niveaux signalés / 20 | Plus petite bille à 320 px |
|---|---|---|---|---|---|---|---|---|---|
| 1 Le Tiroir | bases | 5 / 18.5 / 23 | 2 % | 15 % | 0 % / 0 % | 85 % | 99 % | 1 | 33 px (symbole 19.1 px) |
| 2 Le Grenier | tube haut | 18 / 25 / 27 | 3 % | 19 % | 0 % / 0 % | 82 % | 98 % | 1 | 27 px (symbole 15.7 px) |
| 3 La Brume | mystère | 18 / 23 / 30 | 12 % | 36 % | 0 % / 0 % | 64 % | 79 % | 0 | 33 px (symbole 19.1 px) |
| 4 La Cave | tube court | 18 / 22 / 32 | 8 % | 53 % | 0 % / 0 % | 42 % | 72 % | 0 | 33 px (symbole 19.1 px) |
| 5 L'Étagère | plus de couleurs | 24 / 29.5 / 41 | 22 % | 63 % | 1 % / 13 % | 38 % | 81 % | 0 | 33 px (symbole 19.1 px) |
| 6 Le Placard | un seul vide | 16 / 26 / 36 | 50 % | 92 % | 14 % / 25 % | 8 % | 26 % | 5 | 33 px (symbole 19.1 px) |
| 7 Le Garage | court + mystère | 25 / 31 / 39 | 22 % | 82 % | 0 % / 0 % | 14 % | 34 % | 3 | 33 px (symbole 19.1 px) |
| 8 Le Hangar | un seul vide + mystère | 24 / 30.5 / 42 | 53 % | 90 % | 0 % / 0 % | 8 % | 39 % | 2 | 33 px (symbole 19.1 px) |
| 9 L'Atelier | haut + un seul vide | 33 / 46.5 / 60 | 40 % | 90 % | 9 % / 25 % | 7 % | 20 % | 8 | 27 px (symbole 15.7 px) |
| 10 Pile Poil | tout | 42 / 52.5 / 66 | 27 % | 93 % | 0 % / 0 % | 1 % | 3 % | 14 | 27 px (symbole 15.7 px) |
| Jour (120) | 4 de haut, 2 vides | 17 / 26 / 33 | 13 % | 56 % | 0 % / 0 % | 44 % | 86 % | 1 / 120 | 33 px (symbole 19.1 px) |

### Courbe de longueur de solution

| Monde | Niveaux 1 à 20 (solution) |
|---|---|
| 1 | 5 · 7 · 9 · 11 · 13 · 15 · 13 · 18 · 18 · 20 · 18 · 21 · 21 · 22 · 20 · 19 · 22 · 22 · 22 · 23 |
| 2 | 25 · 24 · 18 · 25 · 26 · 25 · 24 · 24 · 25 · 22 · 23 · 24 · 25 · 23 · 25 · 21 · 26 · 26 · 26 · 27 |
| 3 | 21 · 25 · 28 · 26 · 23 · 22 · 19 · 23 · 18 · 22 · 24 · 23 · 20 · 27 · 28 · 25 · 27 · 22 · 22 · 30 |
| 4 | 20 · 23 · 24 · 22 · 22 · 21 · 20 · 18 · 21 · 22 · 18 · 20 · 21 · 24 · 24 · 22 · 24 · 26 · 21 · 32 |
| 5 | 27 · 25 · 31 · 33 · 27 · 25 · 29 · 24 · 28 · 34 · 30 · 24 · 35 · 39 · 35 · 28 · 30 · 26 · 30 · 41 |
| 6 | 18 · 24 · 26 · 29 · 26 · 18 · 21 · 22 · 26 · 28 · 18 · 26 · 24 · 28 · 32 · 16 · 26 · 26 · 31 · 36 |
| 7 | 29 · 29 · 28 · 36 · 30 · 31 · 25 · 33 · 33 · 33 · 30 · 29 · 29 · 35 · 35 · 31 · 32 · 31 · 37 · 39 |
| 8 | 25 · 25 · 26 · 28 · 33 · 34 · 24 · 27 · 31 · 34 · 30 · 26 · 31 · 36 · 38 · 28 · 26 · 33 · 39 · 42 |
| 9 | 35 · 37 · 48 · 43 · 45 · 34 · 41 · 46 · 57 · 50 · 35 · 44 · 48 · 50 · 55 · 33 · 48 · 47 · 53 · 60 |
| 10 | 44 · 47 · 51 · 54 · 57 · 44 · 48 · 50 · 57 · 63 · 42 · 49 · 56 · 62 · 64 · 46 · 51 · 58 · 65 · 66 |

### Difficulté (solution + 40 × (1 − victoire au hasard)), médiane remesurée

| Monde | Ma médiane | Médiane de la fiche | Rapport au monde précédent | Avec joueur attentif | Rapport |
|---|---|---|---|---|---|
| 1 | 26.1 | 26 |  | 19 |  |
| 2 | 31.2 | 31 | ×1.20 | 25 | ×1.35 |
| 3 | 37.9 | 37 | ×1.21 | 32 | ×1.26 |
| 4 | 44.6 | 46 | ×1.18 | 32 | ×1.02 |
| 5 | 54.6 | 55 | ×1.22 | 37 | ×1.14 |
| 6 | 61.0 | 61 | ×1.12 | 57 | ×1.54 |
| 7 | 65.7 | 66 | ×1.08 | 56 | ×0.99 |
| 8 | 66.8 | 66 | ×1.02 | 54 | ×0.96 |
| 9 | 81.4 | 82 | ×1.22 | 76 | ×1.40 |
| 10 | 91.7 | 92 | ×1.13 | 90 | ×1.18 |

## 8. Doublons

- [MESURÉ] 320 niveaux comparés deux à deux (filtre par invariants puis isomorphisme exact, tubes et couleurs permutables) : **0 doublon**, entre niveaux comme avec les niveaux du jour. Quasi-doublons à lettres identiques (au moins 4 tubes identiques) : 0.
- 11 groupes partagent seulement le multiset de profils de tubes (non isomorphes) : N14/J18 ; N17/J117 ; N18/J48 ; N54/J49 ; N77/J15/J66 ; J7/J19 ; J21/J99 ; J23/J77 ; J45/J63 ; J67/J82 ; J72/J108.

## 9. Autres familles mesurées

- **Positions perdues silencieuses** : 15 niveaux au-dessus de 90 % : N114, N123, N125, N139, N143, N145, N162, N175, N178, N180, N185, N186, N188, N190, N193 (avant : 16, surtout monde 10). Moyenne du monde 10 : 84 % (avant 87 %).
- **Niveaux trop faciles** : N8, N28 (victoire au hasard ≥ 90 % hors respirations) ; niveaux 1 à 5 : N1 100 %, N2 100 %, N3 100 %, N4 100 %, N5 100 %, compatibles avec « premiers niveaux très faciles ». Étoiles données : victoire au hasard avec 3★ ≥ 20 % sur N1 (100 %), N2 (37 %), N3 (31 %), N4 (23 %), N146 (24 %).
- **Doute sur N1** : 3★ si au plus 7 coups pour une solution de 5 ; gagné par tout joueur (tutoriel).
- **Repères d'étoiles** : repère = optimum (A* complet) sur 320/320 ; aucun repère inatteignable (3★ obtenus au doigt sur 640 parties).

## 10. Comportements vérifiés

Passe 1 (`behaviors.js`, niveaux 5, 20, 30, 45, 105 à 120, 130, 145, 185…) : 33/33. Passe 2 (`behaviors2.js`) : 100/101. Décisions (`decisions.js`) : 35/36.

| Mécanique | Niveaux testés | Contrôles passés | Écart |
|---|---|---|---|
| tube haut | N25, N35, N170 | 19/20 | N25 : impasse signalée (marche au hasard sans impasse atteinte : niveau à 2 vides, sans gravité) |
| un seul tube vide | N105, N110, N150 | 21/21 | aucun |
| tube court | N65, N70, N125, N190, N61, N63 | 30/30 | aucun |
| mystère | N45, N55, N130, N185 | 28/28 | aucun |
| tube court + mystère | N121, N122 | 2/2 | aucun |

Vérifié sur ces niveaux : coup interdit refusé avec message en français (« Même couleur ou tube vide seulement. », « Ce tube est plein. », « Tube court : 2 billes au plus. »), impasse signalée (« Plus aucun coup possible : annule ou recommence. », boutons Annuler et Recommencer mis en avant), Annuler ×2, Recommencer, quitter puis « Continuer », rechargement puis « Continuer », tube court qui refuse la 3e bille (sur 4 niveaux dont 2 mystère), bille mystère révélée quand la bille du dessus quitte le tube, sans couleur ni symbole dans le DOM avant.

Détail de la décision 5 et des décisions 6 à 8 :

| Décision | Contrôle | Résultat | Mesure |
|---|---|---|---|
| 5 | solution de référence : le message n'apparaît sur aucun des 320 niveaux | OK | 0 fausse alerte |
| 5 | seuil « plus de 2 × repère » (niveau 5, repère 13) : marche sans retour sur une position | OK | message au coup 27 (attendu 27 ou aucun si la marche finit avant), fin won au coup 46 |
| 5 | retours sur une position connue : message à la 3e revisite | OK | coups→message [[2,false],[3,false],[4,false],[5,true],[6,true],[7,true],[8,true],[9,true]] (P1 au coup 1, P2 au coup 2 ; revisites aux coups 3, 4, 5 : message attendu au coup 5) |
| 5 | durée d'affichage ≈ 4,5 s sans action | OK | [[0,true],[1000,true],[3000,true],[4300,true],[5200,false]] |
| 5 | le message disparaît dès que le joueur touche un tube (sélection) | OK | avant tap « Partie mal engagée ? Annule quelques coups ou recommence. », 80 ms après tap «  » |
| 5 | après Recommencer le compteur repart (message de nouveau possible) | OK | [false,false,false,true,true] |
| 5 | va-et-vient coup / Annuler ×8 ne déclenche pas le message | OK | {"seen":false,"moves":1} |
| 5 | message lisible à 360×640 (tient dans sa zone) | OK | {"t":"Partie mal engagée ? Annule quelques coups ou recommence.","sw":336,"cw":336,"sh":44,"ch":44,"lines":3} |
| 5 | message lisible à 320×568 (tient dans sa zone) | OK | {"t":"Partie mal engagée ? Annule quelques coups ou recommence.","sw":296,"cw":296,"sh":38,"ch":38,"lines":3} |
| 6 | N45 : même partie, billes révélées gardées (Recommencer, rechargement) | OK | départ 18/18, après 4 coups 14, après Recommencer 14, après rechargement 14 |
| 6 | N45 : « Rejouer » après victoire recache tout | OK | cachées 18 (état) / 18 (DOM), attendu 18 |
| 6 | N45 : quitter la partie pour un autre niveau puis revenir = nouvelle partie cachée ; « Reprendre » = même partie | OK | révélées en cours 15, après Reprendre 15, après changement de niveau 18/18 |
| 6 | N130 : même partie, billes révélées gardées (Recommencer, rechargement) | OK | départ 24/24, après 4 coups 20, après Recommencer 20, après rechargement 20 |
| 6 | N130 : « Rejouer » après victoire recache tout | OK | cachées 24 (état) / 24 (DOM), attendu 24 |
| 6 | N130 : quitter la partie pour un autre niveau puis revenir = nouvelle partie cachée ; « Reprendre » = même partie | OK | révélées en cours 21, après Reprendre 21, après changement de niveau 24/24 |
| 6 | N145 : même partie, billes révélées gardées (Recommencer, rechargement) | OK | départ 21/21, après 4 coups 17, après Recommencer 17, après rechargement 17 |
| 6 | N145 : « Rejouer » après victoire recache tout | OK | cachées 21 (état) / 21 (DOM), attendu 21 |
| 6 | N145 : quitter la partie pour un autre niveau puis revenir = nouvelle partie cachée ; « Reprendre » = même partie | OK | révélées en cours 18, après Reprendre 18, après changement de niveau 21/21 |
| 6 | N185 : même partie, billes révélées gardées (Recommencer, rechargement) | OK | départ 32/32, après 4 coups 28, après Recommencer 28, après rechargement 28 |
| 6 | N185 : « Rejouer » après victoire recache tout | OK | cachées 32 (état) / 32 (DOM), attendu 32 |
| 6 | N185 : quitter la partie pour un autre niveau puis revenir = nouvelle partie cachée ; « Reprendre » = même partie | OK | révélées en cours 29, après Reprendre 29, après changement de niveau 32/32 |
| 6 | défi ouvert sur le niveau mystère en cours : la partie en cours reste intacte (billes révélées, coups) | OK | avant : coups 4, cachées 14 ; défi : coups 0, cachées 18 ; reprise : coups 4, cachées 14, défi actif null |
| 7 | défi 360×640 : un seul objectif à l'écran | OK | {"goalVisible":false,"chalVisible":true,"chal":"Objectif : 28 coups ou moins","goal":"en 27 coups ou moins","stars":1} |
| 7 | défi perdu 360×640 : texte « À N coup(s) près », pas de ligne « 3 étoiles en… » | OK | {"chal":"À 1 coup près","rec":"","moves":"29","again":"Renvoyer le défi"} |
| 7 | défi 320×568 : un seul objectif à l'écran | OK | {"goalVisible":false,"chalVisible":true,"chal":"Objectif : 28 coups ou moins","goal":"en 27 coups ou moins","stars":1} |
| 7 | défi perdu 320×568 : texte « À N coup(s) près », pas de ligne « 3 étoiles en… » | OK | {"chal":"À 1 coup près","rec":"","moves":"29","again":"Renvoyer le défi"} |
| 7 | défi perdu de 1 coup : « À 1 coup près » (singulier) | OK | « À 1 coup près » |
| 7 | partage sur file:// sans configuration : pas de lien | OK | « Pile Poil · Niveau 5 en 13 coups. À toi de faire mieux ! » |
| 7 | partage sur file:// sans configuration : texte du résultat sans lien ni solution | OK | « Pile Poil · Niveau 5 en 13 coups ⭐⭐⭐ » |
| 7 | partage sur http(s) sans configuration : lien présent | OK | « Pile Poil · Niveau 5 en 13 coups. À toi de faire mieux ! http://qa.test/index.html#defi-5-13 » |
| 7 | partage sur http(s) sans configuration : texte du résultat sans lien ni solution | OK | « Pile Poil · Niveau 5 en 13 coups ⭐⭐⭐ » |
| 7 | partage avec shareBaseUrl : lien présent | OK | « Pile Poil · Niveau 5 en 13 coups. À toi de faire mieux ! https://exemple.test/jeu#defi-5-13 » |
| 7 | partage avec shareBaseUrl : texte du résultat sans lien ni solution | OK | « Pile Poil · Niveau 5 en 13 coups ⭐⭐⭐ » |
| 8 | rang affiché 360×640 (231 étoiles) | OK | {"t":"Perfectionniste","sw":137,"cw":137,"stars":"231 / 360 étoiles"} |
| 8 | plus aucune occurrence de « Maniaque » / « Raté » dans le fichier | OK | Maniaque:false Raté:false |
| 8 | rang affiché 320×568 (231 étoiles) | **ÉCHEC** | {"t":"Perfectionniste","sw":122,"cw":117,"stars":"231 / 360 étoiles"} |

## 11. Textes, écrans, rendu

Textes relus de nouveau (accueil, mondes, grille, badges, jeu, victoire, partage, défi ; inventaire dans `behaviors.json`). Aucune faute d'orthographe ni de grammaire trouvée dans les textes nouveaux : « Partie mal engagée ? Annule quelques coups ou recommence. », « À 1 coup près » / « À N coups près », « Perfectionniste ». Aucun texte tronqué sur les écrans parcourus **sauf** le rang « Perfectionniste » à 320×568.

| # | Statut | Texte | Constat |
|---|---|---|---|
| T1 | Réglé | Bandeau de défi | Un seul objectif (« Objectif : N coups ou moins »). |
| T2 | Réglé, défaut nouveau | Rang « Maniaque » → « Perfectionniste » | Mot moins risqué ; **tronqué en « Perfectionni… » à 320 px** (largeur 122 px pour 117). |
| T3 | Inchangé | « Fouillis » (rang 1), « Rangeur » (rang 4) | Inchangés ; avis de première recette maintenu [SUPPOSÉ]. |
| T4 | Réglé | « Raté de N coups » → « À N coups près » | Ton plus doux ; singulier correct (« À 1 coup près »). |
| T5 | Inchangé | « Pile poil » (jeu, titre, monde 10, rang 8) | Quatre emplois ; compréhension par le public visé non testée [SUPPOSÉ]. |
| T6 | Inchangé | Tutoiement | Cohérent, aussi dans le nouveau message ; décision de marque. |
| T7 | Inchangé | Sous-titres de monde | Toujours elliptiques (« hauts, un seul vide », « court et mystère »). |
| T8 | Inchangé | Typographie | 0 espace insécable dans le fichier ; apostrophes mixtes. |
| T9 | Réglé | Lien de défi | Sans lien hors http(s) sans configuration ; avec lien correct sinon. Défi sans lien = texte seul. |
| T11 | Nouveau, faible | Message de la décision 5 | Trois lignes dans une zone de 44 px (38 px à 320×568) : tient, sans marge ; effacé au premier tap suivant. |

Rendu : 0 anomalie sur 640 mesures (défilement, zoom, tube ou bille hors écran, chevauchements, titres tronqués, bille soulevée) ; largeur de tube minimale 44 px / 44 px ; plus petite bille 32 / 27 px ; plus petit symbole 18.5 / 15.7 px (inchangé : tubes de hauteur 5 denses, mondes 2, 9, 10). Victoire : carte et boutons dans l'écran sur 640 victoires (boutons ≥ 47.20654296875 px à 360×640, ≥ 46 px à 320×568). Couleurs : calculs inchangés (bleu/violet 1,6 en deutéranopie simulée, séparés par les symboles). Écran de victoire le plus chargé (rang + badges + défi) : revérifié à 320×568 (`winworst.js`).

## 12. Niveaux du jour (120)

- [MESURÉ] Conformes à la fiche (4 de haut, 2 vides, ni tube court ni mystère, 6 à 8 couleurs, 17 à 33 coups). Victoire au hasard : 27 % à 61 %, moyenne 44 % ; aucun premier coup fatal.
- Par nombre de couleurs : 6 couleurs : 40 niveaux, 47 % au hasard ; 7 couleurs : 40 niveaux, 43 % au hasard ; 8 couleurs : 40 niveaux, 41 % au hasard. Signalés : J82.
- La date de jeu dépend de l'horloge du téléphone ; testée seulement avec `setToday`.

## 13. Problèmes restants, classés par gravité

1. **Monde 10 : mur** (joueur attentif simulé 3 %, 8/20 niveaux jamais gagnés, 84 % de positions perdues sans message, 84 à 132 taps par solution). [MESURÉ ; effet sur un humain SUPPOSÉ]
2. **Décision 2 tenue seulement pour sa propre métrique** : pour un joueur attentif, ×1.54 du monde 5 au 6, ×1.40 du 8 au 9 ; marche d'escalier au monde 6 (premier « un seul vide »). [MESURÉ]
3. **« Perfectionniste » tronqué à 320×568** sur l'accueil (défaut introduit par la décision 8). [MESURÉ, capture]
4. **Message « Partie mal engagée » très furtif** (effacé au tap suivant, 41 % de messages tombant sur une partie encore gagnable pour un joueur qui erre) et déclenché surtout par les 3 retours, pas par 2 × repère. [MESURÉ]
5. **Devinette au 2e / 3e coup** sur des niveaux mystère (N144 50 %, N188 38 %/62 %, N194 37 %/53 %, N157 33 %/45 %) et au monde 6 (N105 60 %, N108 56 %, N112 50 %). [MESURÉ]
6. **15 niveaux à positions perdues silencieuses ≥ 90 %** (liste § 9). [MESURÉ]
7. **Défi sans lien = texte seul** : le destinataire ne peut pas ouvrir le niveau (conforme à la décision 7, mais la fonction « Défier » est dégradée hors http(s)). [MESURÉ]
8. **Jours trop faciles ou à la limite** : J82 ; 37 niveaux du jour se gagnent à plus de 50 % au hasard. [MESURÉ]
9. **Textes inchangés** : « Fouillis »/« Rangeur », « Pile poil » ×4, sous-titres de monde elliptiques, typographie (T3, T5, T7, T8). [SUPPOSÉ]
10. **Niveaux faciles hors respiration** : N8, N28. [MESURÉ]

## 14. Ce que je n'ai PAS pu vérifier

- **Appareil réel** : tout est en Chromium émulé (même moteur que les tests existants). Pas de vrai téléphone, pas de WebView d'entrée de gamme, pas de Safari iOS, pas de fluidité ni de mémoire, pas de ressenti du doigt sur 44 px.
- **Plaisir de jeu et difficulté humaine** : aucun jugement humain. « Joueur au hasard » et « joueur attentif » sont des simulations ; la seconde est ma construction et peut être trop faible ou trop forte. Mon avis sur les mondes 6, 8, 9, 10 repose sur elles et sur des durées estimées, pas sur des joueurs.
- **Messages de la décision 5 en jeu réel** : testé avec des coups simulés (`applyMove`) et des taps ; le comportement d'un vrai joueur qui hésite n'est pas mesuré (délais entre taps, lecture du message).
- **Couleurs et daltonisme** : calculs et simulation, aucun test sur écran réel ni sur des joueurs daltoniens.
- **Public d'Afrique francophone** : mes avis sur les mots sont des hypothèses.
- **Accessibilité** (clavier, lecteur d'écran, ordre de focus) : non testée.
- **Partage réel** : `navigator.share` simulé, repli presse-papiers non exercé ; page servie par interception pour tester http(s), pas sur un vrai domaine ni dans la webview de la super-app (là, `location.href` peut être non http).
- **Niveau du jour avec vraies dates**, fuseaux, minuit : seulement `setToday`. Série, jokers, rangs, badges : non rejoués ici (couverts par `npm test`, non relancé, consigne).
- **Les niveaux d'affilée par un humain** (déblocage progressif, fatigue, abandon) : chaque niveau est chargé directement par `loadLevel`.
- **Solveur** : mes chiffres de premiers coups fatals sont recoupés par un DFS indépendant sur les 200 niveaux (200/200 niveaux identiques, 0 désaccord, 0 non conclu), mais les taux de « position perdue » reposent sur 40 sondages par niveau (±8 points) et sur un plafond de 4000 états ; les suites de 3 coups sur 150 tirages. Les niveaux du jour n'ont pas de recoupement des premiers coups (aucun premier coup fatal chez moi non plus).
- **Opinion sur le contenu de la table de la fiche** : je ne l'ai pas validée comme « bonne » ; je l'ai comparée à mes mesures.

## Annexe A. Tous les niveaux, un par un

Taps 360 / 320 = solution jouée au doigt, 3★. Rendu = géométrie sans anomalie (360 / 320). Hasard = victoire du joueur naïf ; Att. = joueur attentif simulé ; Perdu 40 = impasse ou position perdue avant le coup 40 ; 1er fatal = premiers coups légaux qui perdent le niveau ; Opt. = optimum calculé.

| Niveau | Monde·pl. | Sol. | Opt. | Taps 360 | Taps 320 | Rendu | Hasard | Att. | Perdu 40 | 1er fatal | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| N1 | 1·1 | 5 | 5 | OK | OK | OK | 100 % | 100 % | 0 % | 0/2 | OK |
| N2 | 1·2 | 7 | 7 | OK | OK | OK | 100 % | 100 % | 0 % | 0/6 | OK |
| N3 | 1·3 | 9 | 9 | OK | OK | OK | 100 % | 100 % | 0 % | 0/8 | OK |
| N4 | 1·4 | 11 | 11 | OK | OK | OK | 100 % | 100 % | 0 % | 0/10 | OK |
| N5 | 1·5 | 13 | 13 | OK | OK | OK | 100 % | 100 % | 0 % | 0/8 | OK |
| N6 | 1·6 | 15 | 15 | OK | OK | OK | 98 % | 99 % | 0 % | 0/10 | OK |
| N7 | 1·7 | 13 | 13 | OK | OK | OK | 89 % | 100 % | 20 % | 0/8 | OK |
| N8 | 1·8 | 18 | 18 | OK | OK | OK | 96 % | 99 % | 15 % | 0/10 | À revoir (FACILE) |
| N9 | 1·9 | 18 | 18 | OK | OK | OK | 87 % | 99 % | 28 % | 0/10 | OK |
| N10 | 1·10 | 20 | 20 | OK | OK | OK | 83 % | 100 % | 30 % | 0/12 | OK |
| N11 | 1·11 | 18 | 18 | OK | OK | OK | 79 % | 100 % | 23 % | 0/10 | OK |
| N12 | 1·12 | 21 | 21 | OK | OK | OK | 87 % | 100 % | 18 % | 0/12 | OK |
| N13 | 1·13 | 21 | 21 | OK | OK | OK | 80 % | 99 % | 20 % | 0/12 | OK |
| N14 | 1·14 | 22 | 22 | OK | OK | OK | 77 % | 97 % | 23 % | 0/12 | OK |
| N15 | 1·15 | 20 | 20 | OK | OK | OK | 66 % | 97 % | 28 % | 0/12 | OK |
| N16 | 1·16 | 19 | 19 | OK | OK | OK | 83 % | 100 % | 15 % | 0/10 | OK |
| N17 | 1·17 | 22 | 22 | OK | OK | OK | 82 % | 100 % | 5 % | 0/12 | OK |
| N18 | 1·18 | 22 | 22 | OK | OK | OK | 79 % | 99 % | 18 % | 0/12 | OK |
| N19 | 1·19 | 22 | 22 | OK | OK | OK | 65 % | 96 % | 38 % | 0/12 | OK |
| N20 | 1·20 | 23 | 23 | OK | OK | OK | 55 % | 86 % | 28 % | 0/12 | OK |
| N21 | 2·1 | 25 | 25 | OK | OK | OK | 93 % | 100 % | 8 % | 0/10 | OK |
| N22 | 2·2 | 24 | 24 | OK | OK | OK | 89 % | 100 % | 3 % | 0/10 | OK |
| N23 | 2·3 | 18 | 18 | OK | OK | OK | 72 % | 96 % | 35 % | 0/8 | OK |
| N24 | 2·4 | 25 | 25 | OK | OK | OK | 84 % | 97 % | 13 % | 0/10 | OK |
| N25 | 2·5 | 26 | 26 | OK | OK | OK | 88 % | 98 % | 13 % | 0/10 | OK |
| N26 | 2·6 | 25 | 25 | OK | OK | OK | 96 % | 99 % | 10 % | 0/10 | OK |
| N27 | 2·7 | 24 | 24 | OK | OK | OK | 88 % | 100 % | 18 % | 0/10 | OK |
| N28 | 2·8 | 24 | 24 | OK | OK | OK | 92 % | 99 % | 28 % | 0/10 | À revoir (FACILE) |
| N29 | 2·9 | 25 | 25 | OK | OK | OK | 78 % | 99 % | 15 % | 0/10 | OK |
| N30 | 2·10 | 22 | 22 | OK | OK | OK | 76 % | 97 % | 30 % | 0/10 | OK |
| N31 | 2·11 | 23 | 23 | OK | OK | OK | 87 % | 99 % | 18 % | 0/10 | OK |
| N32 | 2·12 | 24 | 24 | OK | OK | OK | 87 % | 97 % | 8 % | 0/10 | OK |
| N33 | 2·13 | 25 | 25 | OK | OK | OK | 81 % | 100 % | 23 % | 0/10 | OK |
| N34 | 2·14 | 23 | 23 | OK | OK | OK | 77 % | 92 % | 23 % | 0/10 | OK |
| N35 | 2·15 | 25 | 25 | OK | OK | OK | 72 % | 94 % | 30 % | 0/10 | OK |
| N36 | 2·16 | 21 | 21 | OK | OK | OK | 84 % | 97 % | 15 % | 0/10 | OK |
| N37 | 2·17 | 26 | 26 | OK | OK | OK | 86 % | 100 % | 8 % | 0/10 | OK |
| N38 | 2·18 | 26 | 26 | OK | OK | OK | 76 % | 94 % | 28 % | 0/12 | OK |
| N39 | 2·19 | 26 | 26 | OK | OK | OK | 72 % | 99 % | 20 % | 0/12 | OK |
| N40 | 2·20 | 27 | 27 | OK | OK | OK | 65 % | 95 % | 40 % | 0/12 | OK |
| N41 | 3·1M | 21 | 21 | OK | OK | OK | 68 % | 88 % | 33 % | 0/12 | OK |
| N42 | 3·2M | 25 | 25 | OK | OK | OK | 81 % | 93 % | 30 % | 0/14 | OK |
| N43 | 3·3M | 28 | 28 | OK | OK | OK | 75 % | 73 % | 18 % | 0/16 | OK |
| N44 | 3·4M | 26 | 26 | OK | OK | OK | 77 % | 91 % | 20 % | 0/14 | OK |
| N45 | 3·5M | 23 | 23 | OK | OK | OK | 62 % | 72 % | 50 % | 0/12 | OK |
| N46 | 3·6M | 22 | 22 | OK | OK | OK | 63 % | 74 % | 33 % | 0/14 | OK |
| N47 | 3·7M | 19 | 19 | OK | OK | OK | 54 % | 69 % | 33 % | 0/10 | OK |
| N48 | 3·8M | 23 | 23 | OK | OK | OK | 64 % | 93 % | 33 % | 0/14 | OK |
| N49 | 3·9M | 18 | 18 | OK | OK | OK | 48 % | 61 % | 60 % | 0/10 | OK |
| N50 | 3·10M | 22 | 22 | OK | OK | OK | 50 % | 67 % | 43 % | 0/14 | OK |
| N51 | 3·11M | 24 | 24 | OK | OK | OK | 84 % | 96 % | 18 % | 0/14 | OK |
| N52 | 3·12M | 23 | 23 | OK | OK | OK | 62 % | 52 % | 35 % | 0/12 | OK |
| N53 | 3·13M | 20 | 20 | OK | OK | OK | 53 % | 72 % | 53 % | 0/12 | OK |
| N54 | 3·14M | 27 | 27 | OK | OK | OK | 69 % | 92 % | 45 % | 0/14 | OK |
| N55 | 3·15M | 28 | 28 | OK | OK | OK | 57 % | 78 % | 50 % | 0/16 | OK |
| N56 | 3·16M | 25 | 25 | OK | OK | OK | 79 % | 86 % | 35 % | 0/14 | OK |
| N57 | 3·17M | 27 | 27 | OK | OK | OK | 83 % | 96 % | 18 % | 0/14 | OK |
| N58 | 3·18M | 22 | 22 | OK | OK | OK | 61 % | 74 % | 43 % | 0/12 | OK |
| N59 | 3·19M | 22 | 22 | OK | OK | OK | 42 % | 65 % | 48 % | 0/12 | OK |
| N60 | 3·20M | 30 | 30 | OK | OK | OK | 58 % | 93 % | 35 % | 0/16 | OK |
| N61 | 4·1 | 20 | 20 | OK | OK | OK | 49 % | 86 % | 35 % | 0/10 | OK |
| N62 | 4·2 | 23 | 23 | OK | OK | OK | 54 % | 83 % | 35 % | 0/12 | OK |
| N63 | 4·3 | 24 | 24 | OK | OK | OK | 39 % | 79 % | 53 % | 0/12 | OK |
| N64 | 4·4 | 22 | 22 | OK | OK | OK | 46 % | 88 % | 50 % | 0/12 | OK |
| N65 | 4·5 | 22 | 22 | OK | OK | OK | 44 % | 86 % | 65 % | 0/12 | OK |
| N66 | 4·6 | 21 | 21 | OK | OK | OK | 60 % | 87 % | 28 % | 0/10 | OK |
| N67 | 4·7 | 20 | 20 | OK | OK | OK | 40 % | 69 % | 48 % | 0/10 | OK |
| N68 | 4·8 | 18 | 18 | OK | OK | OK | 31 % | 51 % | 53 % | 0/10 | OK |
| N69 | 4·9 | 21 | 21 | OK | OK | OK | 41 % | 69 % | 57 % | 0/10 | OK |
| N70 | 4·10 | 22 | 22 | OK | OK | OK | 30 % | 56 % | 80 % | 0/12 | OK |
| N71 | 4·11 | 18 | 18 | OK | OK | OK | 43 % | 88 % | 43 % | 0/10 | OK |
| N72 | 4·12 | 20 | 20 | OK | OK | OK | 46 % | 75 % | 48 % | 0/10 | OK |
| N73 | 4·13 | 21 | 21 | OK | OK | OK | 43 % | 62 % | 48 % | 0/10 | OK |
| N74 | 4·14 | 24 | 24 | OK | OK | OK | 29 % | 44 % | 70 % | 0/14 | OK |
| N75 | 4·15 | 24 | 24 | OK | OK | OK | 30 % | 61 % | 80 % | 0/12 | OK |
| N76 | 4·16 | 22 | 22 | OK | OK | OK | 59 % | 91 % | 30 % | 0/12 | OK |
| N77 | 4·17 | 24 | 24 | OK | OK | OK | 45 % | 74 % | 43 % | 0/12 | OK |
| N78 | 4·18 | 26 | 26 | OK | OK | OK | 45 % | 91 % | 65 % | 0/12 | OK |
| N79 | 4·19 | 21 | 21 | OK | OK | OK | 27 % | 47 % | 83 % | 0/10 | OK |
| N80 | 4·20 | 32 | 32 | OK | OK | OK | 34 % | 57 % | 50 % | 0/16 | OK |
| N81 | 5·1 | 27 | 27 | OK | OK | OK | 51 % | 92 % | 55 % | 0/14 | OK |
| N82 | 5·2 | 25 | 25 | OK | OK | OK | 44 % | 84 % | 63 % | 0/14 | OK |
| N83 | 5·3 | 31 | 31 | OK | OK | OK | 52 % | 95 % | 65 % | 0/18 | OK |
| N84 | 5·4 | 33 | 33 | OK | OK | OK | 47 % | 91 % | 53 % | 0/18 | OK |
| N85 | 5·5 | 27 | 27 | OK | OK | OK | 31 % | 66 % | 65 % | 0/14 | OK |
| N86 | 5·6 | 25 | 25 | OK | OK | OK | 56 % | 73 % | 57 % | 0/14 | OK |
| N87 | 5·7 | 29 | 29 | OK | OK | OK | 43 % | 88 % | 53 % | 0/16 | OK |
| N88 | 5·8 | 24 | 24 | OK | OK | OK | 28 % | 80 % | 85 % | 0/14 | OK |
| N89 | 5·9 | 28 | 28 | OK | OK | OK | 23 % | 64 % | 73 % | 0/16 | OK |
| N90 | 5·10 | 34 | 34 | OK | OK | OK | 35 % | 92 % | 68 % | 0/18 | OK |
| N91 | 5·11 | 30 | 30 | OK | OK | OK | 58 % | 82 % | 55 % | 0/16 | OK |
| N92 | 5·12 | 24 | 24 | OK | OK | OK | 42 % | 89 % | 55 % | 0/14 | OK |
| N93 | 5·13 | 35 | 35 | OK | OK | OK | 41 % | 91 % | 45 % | 0/18 | OK |
| N94 | 5·14 | 39 | 39 | OK | OK | OK | 55 % | 93 % | 38 % | 0/20 | OK |
| N95 | 5·15 | 35 | 35 | OK | OK | OK | 24 % | 74 % | 70 % | 0/18 | OK |
| N96 | 5·16 | 28 | 28 | OK | OK | OK | 54 % | 95 % | 40 % | 0/16 | OK |
| N97 | 5·17 | 30 | 30 | OK | OK | OK | 33 % | 81 % | 63 % | 2/16 | OK |
| N98 | 5·18 | 26 | 26 | OK | OK | OK | 18 % | 65 % | 88 % | 0/14 | OK |
| N99 | 5·19 | 30 | 30 | OK | OK | OK | 21 % | 87 % | 80 % | 0/16 | OK |
| N100 | 5·20 | 41 | 41 | OK | OK | OK | 6 % | 34 % | 93 % | 0/20 | OK |
| N101 | 6·1 | 18 | 18 | OK | OK | OK | 9 % | 36 % | 98 % | 0/4 | OK |
| N102 | 6·2 | 24 | 24 | OK | OK | OK | 22 % | 53 % | 75 % | 0/6 | OK |
| N103 | 6·3 | 26 | 26 | OK | OK | OK | 16 % | 43 % | 85 % | 0/5 | OK |
| N104 | 6·4 | 29 | 29 | OK | OK | OK | 25 % | 68 % | 85 % | 1/6 | OK |
| N105 | 6·5 | 26 | 26 | OK | OK | OK | 6 % | 20 % | 95 % | 1/6 | OK |
| N106 | 6·6 | 18 | 18 | OK | OK | OK | 9 % | 3 % | 95 % | 1/5 | À revoir (MUR) |
| N107 | 6·7 | 21 | 21 | OK | OK | OK | 9 % | 41 % | 98 % | 1/5 | OK |
| N108 | 6·8 | 22 | 22 | OK | OK | OK | 1 % | 7 % | 95 % | 1/5 | OK |
| N109 | 6·9 | 26 | 26 | OK | OK | OK | 4 % | 11 % | 93 % | 1/6 | OK |
| N110 | 6·10 | 28 | 28 | OK | OK | OK | 3 % | 24 % | 90 % | 1/7 | OK |
| N111 | 6·11 | 18 | 18 | OK | OK | OK | 3 % | 2 % | 93 % | 1/4 | À revoir (MUR) |
| N112 | 6·12 | 26 | 26 | OK | OK | OK | 14 % | 50 % | 80 % | 1/6 | OK |
| N113 | 6·13 | 24 | 24 | OK | OK | OK | 6 % | 48 % | 90 % | 1/5 | OK |
| N114 | 6·14 | 28 | 28 | OK | OK | OK | 5 % | 13 % | 95 % | 0/6 | À revoir (SILENCE) |
| N115 | 6·15 | 32 | 32 | OK | OK | OK | 4 % | 29 % | 90 % | 1/7 | OK |
| N116 | 6·16 | 16 | 16 | OK | OK | OK | 5 % | 18 % | 98 % | 1/4 | OK |
| N117 | 6·17 | 26 | 26 | OK | OK | OK | 14 % | 38 % | 88 % | 1/7 | OK |
| N118 | 6·18 | 26 | 26 | OK | OK | OK | 8 % | 16 % | 100 % | 1/6 | OK |
| N119 | 6·19 | 31 | 31 | OK | OK | OK | 1 % | 0 % | 98 % | 1/7 | À revoir (MUR) |
| N120 | 6·20 | 36 | 36 | OK | OK | OK | 2 % | 0 % | 100 % | 0/7 | À revoir (MUR) |
| N121 | 7·1M | 29 | 29 | OK | OK | OK | 23 % | 52 % | 63 % | 0/14 | OK |
| N122 | 7·2M | 29 | 29 | OK | OK | OK | 24 % | 35 % | 73 % | 0/14 | OK |
| N123 | 7·3M | 28 | 28 | OK | OK | OK | 12 % | 25 % | 93 % | 0/14 | À revoir (SILENCE) |
| N124 | 7·4M | 36 | 36 | OK | OK | OK | 28 % | 73 % | 65 % | 0/18 | OK |
| N125 | 7·5M | 30 | 30 | OK | OK | OK | 9 % | 39 % | 93 % | 0/16 | À revoir (SILENCE) |
| N126 | 7·6M | 31 | 31 | OK | OK | OK | 34 % | 46 % | 48 % | 0/16 | OK |
| N127 | 7·7M | 25 | 25 | OK | OK | OK | 8 % | 23 % | 90 % | 0/14 | OK |
| N128 | 7·8M | 33 | 33 | OK | OK | OK | 12 % | 40 % | 85 % | 0/16 | OK |
| N129 | 7·9M | 33 | 33 | OK | OK | OK | 9 % | 51 % | 85 % | 0/16 | OK |
| N130 | 7·10M | 33 | 33 | OK | OK | OK | 3 % | 16 % | 98 % | 0/16 | OK |
| N131 | 7·11M | 30 | 30 | OK | OK | OK | 30 % | 39 % | 70 % | 0/14 | OK |
| N132 | 7·12M | 29 | 29 | OK | OK | OK | 20 % | 23 % | 70 % | 0/14 | OK |
| N133 | 7·13M | 29 | 29 | OK | OK | OK | 4 % | 18 % | 90 % | 0/14 | OK |
| N134 | 7·14M | 35 | 35 | OK | OK | OK | 7 % | 16 % | 88 % | 0/18 | OK |
| N135 | 7·15M | 35 | 35 | OK | OK | OK | 3 % | 31 % | 88 % | 0/16 | OK |
| N136 | 7·16M | 31 | 31 | OK | OK | OK | 24 % | 44 % | 78 % | 0/16 | OK |
| N137 | 7·17M | 32 | 32 | OK | OK | OK | 22 % | 53 % | 80 % | 0/16 | OK |
| N138 | 7·18M | 31 | 31 | OK | OK | OK | 8 % | 30 % | 93 % | 0/16 | OK |
| N139 | 7·19M | 37 | 37 | OK | OK | OK | 5 % | 14 % | 95 % | 0/18 | À revoir (SILENCE) |
| N140 | 7·20M | 39 | 39 | OK | OK | OK | 1 % | 10 % | 98 % | 0/18 | OK |
| N141 | 8·1M | 25 | 25 | OK | OK | OK | 10 % | 53 % | 80 % | 0/6 | OK |
| N142 | 8·2M | 25 | 25 | OK | OK | OK | 7 % | 71 % | 95 % | 0/6 | OK |
| N143 | 8·3M | 26 | 26 | OK | OK | OK | 5 % | 44 % | 100 % | 0/6 | À revoir (SILENCE) |
| N144 | 8·4M | 28 | 28 | OK | OK | OK | 2 % | 10 % | 100 % | 0/6 | OK |
| N145 | 8·5M | 33 | 33 | OK | OK | OK | 10 % | 22 % | 90 % | 0/7 | À revoir (SILENCE) |
| N146 | 8·6M | 34 | 34 | OK | OK | OK | 37 % | 77 % | 60 % | 0/7 | OK |
| N147 | 8·7M | 24 | 24 | OK | OK | OK | 4 % | 31 % | 100 % | 0/6 | OK |
| N148 | 8·8M | 27 | 27 | OK | OK | OK | 2 % | 29 % | 100 % | 0/6 | OK |
| N149 | 8·9M | 31 | 31 | OK | OK | OK | 2 % | 61 % | 95 % | 0/7 | OK |
| N150 | 8·10M | 34 | 34 | OK | OK | OK | 0 % | 36 % | 100 % | 0/7 | OK |
| N151 | 8·11M | 30 | 30 | OK | OK | OK | 26 % | 53 % | 78 % | 0/7 | OK |
| N152 | 8·12M | 26 | 26 | OK | OK | OK | 6 % | 22 % | 93 % | 0/6 | OK |
| N153 | 8·13M | 31 | 31 | OK | OK | OK | 8 % | 45 % | 85 % | 0/8 | OK |
| N154 | 8·14M | 36 | 36 | OK | OK | OK | 5 % | 57 % | 88 % | 0/7 | OK |
| N155 | 8·15M | 38 | 38 | OK | OK | OK | 1 % | 8 % | 93 % | 0/8 | OK |
| N156 | 8·16M | 28 | 28 | OK | OK | OK | 21 % | 84 % | 70 % | 0/7 | OK |
| N157 | 8·17M | 26 | 26 | OK | OK | OK | 2 % | 9 % | 98 % | 0/6 | OK |
| N158 | 8·18M | 33 | 33 | OK | OK | OK | 4 % | 35 % | 90 % | 0/7 | OK |
| N159 | 8·19M | 39 | 39 | OK | OK | OK | 5 % | 31 % | 90 % | 0/8 | OK |
| N160 | 8·20M | 42 | 42 | OK | OK | OK | 1 % | 10 % | 100 % | 0/8 | OK |
| N161 | 9·1 | 35 | 35 | OK | OK | OK | 5 % | 19 % | 100 % | 0/5 | OK |
| N162 | 9·2 | 37 | 37 | OK | OK | OK | 3 % | 14 % | 95 % | 0/5 | À revoir (SILENCE) |
| N163 | 9·3 | 48 | 48 | OK | OK | OK | 21 % | 64 % | 88 % | 0/7 | OK |
| N164 | 9·4 | 43 | 43 | OK | OK | OK | 2 % | 16 % | 98 % | 1/7 | OK |
| N165 | 9·5 | 45 | 45 | OK | OK | OK | 1 % | 5 % | 90 % | 1/7 | À revoir (MUR) |
| N166 | 9·6 | 34 | 34 | OK | OK | OK | 2 % | 3 % | 98 % | 1/5 | À revoir (MUR) |
| N167 | 9·7 | 41 | 41 | OK | OK | OK | 12 % | 41 % | 73 % | 0/6 | OK |
| N168 | 9·8 | 46 | 46 | OK | OK | OK | 14 % | 15 % | 85 % | 1/7 | OK |
| N169 | 9·9 | 57 | 57 | OK | OK | OK | 30 % | 62 % | 65 % | 0/8 | OK |
| N170 | 9·10 | 50 | 50 | OK | OK | OK | 0 % | 0 % | 100 % | 1/7 | À revoir (MUR) |
| N171 | 9·11 | 35 | 35 | OK | OK | OK | 6 % | 41 % | 93 % | 1/5 | OK |
| N172 | 9·12 | 44 | 44 | OK | OK | OK | 13 % | 14 % | 85 % | 1/7 | OK |
| N173 | 9·13 | 48 | 48 | OK | OK | OK | 8 % | 32 % | 78 % | 2/8 | OK |
| N174 | 9·14 | 50 | 50 | OK | OK | OK | 2 % | 15 % | 95 % | 0/7 | OK |
| N175 | 9·15 | 55 | 55 | OK | OK | OK | 2 % | 1 % | 93 % | 0/7 | À revoir (SILENCE, MUR) |
| N176 | 9·16 | 33 | 33 | OK | OK | OK | 7 % | 10 % | 95 % | 0/5 | OK |
| N177 | 9·17 | 48 | 48 | OK | OK | OK | 24 % | 40 % | 73 % | 0/7 | OK |
| N178 | 9·18 | 47 | 47 | OK | OK | OK | 0 % | 0 % | 100 % | 1/6 | À revoir (SILENCE, MUR) |
| N179 | 9·19 | 53 | 53 | OK | OK | OK | 0 % | 0 % | 100 % | 1/8 | À revoir (MUR) |
| N180 | 9·20 | 60 | 60 | OK | OK | OK | 0 % | 0 % | 100 % | 1/7 | À revoir (SILENCE, MUR) |
| N181 | 10·1M | 44 | 44 | OK | OK | OK | 2 % | 6 % | 75 % | 0/14 | OK |
| N182 | 10·2M | 47 | 47 | OK | OK | OK | 1 % | 6 % | 98 % | 0/16 | OK |
| N183 | 10·3M | 51 | 51 | OK | OK | OK | 5 % | 4 % | 75 % | 0/16 | À revoir (MUR) |
| N184 | 10·4M | 54 | 54 | OK | OK | OK | 4 % | 19 % | 88 % | 0/18 | OK |
| N185 | 10·5M | 57 | 57 | OK | OK | OK | 0 % | 0 % | 100 % | 0/16 | À revoir (SILENCE, MUR) |
| N186 | 10·6M | 44 | 44 | OK | OK | OK | 0 % | 3 % | 93 % | 0/14 | À revoir (SILENCE, MUR) |
| N187 | 10·7M | 48 | 48 | OK | OK | OK | 1 % | 6 % | 90 % | 0/16 | OK |
| N188 | 10·8M | 50 | 50 | OK | OK | OK | 0 % | 0 % | 100 % | 0/16 | À revoir (SILENCE, MUR) |
| N189 | 10·9M | 57 | 57 | OK | OK | OK | 1 % | 0 % | 95 % | 0/18 | À revoir (MUR) |
| N190 | 10·10M | 63 | 63 | OK | OK | OK | 0 % | 1 % | 100 % | 0/20 | À revoir (SILENCE, MUR) |
| N191 | 10·11M | 42 | 42 | OK | OK | OK | 0 % | 0 % | 100 % | 0/14 | À revoir (MUR) |
| N192 | 10·12M | 49 | 49 | OK | OK | OK | 0 % | 2 % | 100 % | 0/16 | À revoir (MUR) |
| N193 | 10·13M | 56 | 56 | OK | OK | OK | 0 % | 1 % | 100 % | 0/18 | À revoir (SILENCE, MUR) |
| N194 | 10·14M | 62 | 62 | OK | OK | OK | 0 % | 0 % | 100 % | 0/20 | À revoir (MUR) |
| N195 | 10·15M | 64 | 64 | OK | OK | OK | 0 % | 0 % | 95 % | 0/20 | À revoir (MUR) |
| N196 | 10·16M | 46 | 46 | OK | OK | OK | 3 % | 6 % | 90 % | 0/16 | OK |
| N197 | 10·17M | 51 | 51 | OK | OK | OK | 0 % | 8 % | 100 % | 0/16 | OK |
| N198 | 10·18M | 58 | 58 | OK | OK | OK | 0 % | 0 % | 90 % | 0/18 | À revoir (MUR) |
| N199 | 10·19M | 65 | 65 | OK | OK | OK | 0 % | 1 % | 93 % | 0/20 | À revoir (MUR) |
| N200 | 10·20M | 66 | 66 | OK | OK | OK | 0 % | 0 % | 90 % | 0/20 | À revoir (MUR) |
| J0 | 6c | 21 | 21 | OK | OK | OK | 51 % | 97 % | 50 % | 0/12 | OK |
| J1 | 7c | 24 | 24 | OK | OK | OK | 34 % | 81 % | 73 % | 0/14 | OK |
| J2 | 8c | 30 | 30 | OK | OK | OK | 35 % | 80 % | 63 % | 0/16 | OK |
| J3 | 6c | 20 | 20 | OK | OK | OK | 54 % | 93 % | 48 % | 0/12 | OK |
| J4 | 7c | 28 | 28 | OK | OK | OK | 53 % | 71 % | 50 % | 0/14 | OK |
| J5 | 8c | 28 | 28 | OK | OK | OK | 43 % | 89 % | 65 % | 0/16 | OK |
| J6 | 6c | 22 | 22 | OK | OK | OK | 46 % | 82 % | 48 % | 0/12 | OK |
| J7 | 7c | 24 | 24 | OK | OK | OK | 46 % | 94 % | 60 % | 0/14 | OK |
| J8 | 8c | 25 | 25 | OK | OK | OK | 34 % | 75 % | 75 % | 0/16 | OK |
| J9 | 6c | 24 | 24 | OK | OK | OK | 54 % | 96 % | 50 % | 0/12 | OK |
| J10 | 7c | 27 | 27 | OK | OK | OK | 35 % | 91 % | 50 % | 0/14 | OK |
| J11 | 8c | 27 | 27 | OK | OK | OK | 50 % | 95 % | 43 % | 0/16 | OK |
| J12 | 6c | 20 | 20 | OK | OK | OK | 50 % | 89 % | 68 % | 0/12 | OK |
| J13 | 7c | 26 | 26 | OK | OK | OK | 40 % | 97 % | 50 % | 0/14 | OK |
| J14 | 8c | 31 | 31 | OK | OK | OK | 29 % | 56 % | 48 % | 0/16 | OK |
| J15 | 6c | 22 | 22 | OK | OK | OK | 42 % | 74 % | 57 % | 0/12 | OK |
| J16 | 7c | 26 | 26 | OK | OK | OK | 33 % | 90 % | 63 % | 0/14 | OK |
| J17 | 8c | 26 | 26 | OK | OK | OK | 46 % | 90 % | 63 % | 0/16 | OK |
| J18 | 6c | 22 | 22 | OK | OK | OK | 52 % | 95 % | 45 % | 0/12 | OK |
| J19 | 7c | 25 | 25 | OK | OK | OK | 52 % | 83 % | 65 % | 0/14 | OK |
| J20 | 8c | 27 | 27 | OK | OK | OK | 46 % | 71 % | 45 % | 0/16 | OK |
| J21 | 6c | 22 | 22 | OK | OK | OK | 45 % | 92 % | 40 % | 0/12 | OK |
| J22 | 7c | 25 | 25 | OK | OK | OK | 41 % | 83 % | 55 % | 0/14 | OK |
| J23 | 8c | 30 | 30 | OK | OK | OK | 29 % | 83 % | 53 % | 0/16 | OK |
| J24 | 6c | 21 | 21 | OK | OK | OK | 39 % | 84 % | 57 % | 0/12 | OK |
| J25 | 7c | 26 | 26 | OK | OK | OK | 39 % | 74 % | 58 % | 0/14 | OK |
| J26 | 8c | 29 | 29 | OK | OK | OK | 42 % | 81 % | 70 % | 0/16 | OK |
| J27 | 6c | 24 | 24 | OK | OK | OK | 41 % | 81 % | 58 % | 0/12 | OK |
| J28 | 7c | 25 | 25 | OK | OK | OK | 41 % | 83 % | 70 % | 0/14 | OK |
| J29 | 8c | 31 | 31 | OK | OK | OK | 47 % | 95 % | 45 % | 0/16 | OK |
| J30 | 6c | 22 | 22 | OK | OK | OK | 49 % | 96 % | 58 % | 0/12 | OK |
| J31 | 7c | 25 | 25 | OK | OK | OK | 39 % | 79 % | 63 % | 0/14 | OK |
| J32 | 8c | 32 | 32 | OK | OK | OK | 36 % | 79 % | 63 % | 0/16 | OK |
| J33 | 6c | 22 | 22 | OK | OK | OK | 51 % | 92 % | 53 % | 0/12 | OK |
| J34 | 7c | 25 | 25 | OK | OK | OK | 33 % | 86 % | 58 % | 0/14 | OK |
| J35 | 8c | 30 | 30 | OK | OK | OK | 35 % | 88 % | 63 % | 0/16 | OK |
| J36 | 6c | 22 | 22 | OK | OK | OK | 43 % | 95 % | 70 % | 0/12 | OK |
| J37 | 7c | 25 | 25 | OK | OK | OK | 28 % | 91 % | 80 % | 0/14 | OK |
| J38 | 8c | 30 | 30 | OK | OK | OK | 37 % | 86 % | 50 % | 0/16 | OK |
| J39 | 6c | 22 | 22 | OK | OK | OK | 43 % | 84 % | 53 % | 0/12 | OK |
| J40 | 7c | 26 | 26 | OK | OK | OK | 35 % | 57 % | 63 % | 0/14 | OK |
| J41 | 8c | 29 | 29 | OK | OK | OK | 46 % | 95 % | 68 % | 0/16 | OK |
| J42 | 6c | 23 | 23 | OK | OK | OK | 52 % | 88 % | 60 % | 0/12 | OK |
| J43 | 7c | 26 | 26 | OK | OK | OK | 51 % | 87 % | 28 % | 0/14 | OK |
| J44 | 8c | 29 | 29 | OK | OK | OK | 43 % | 82 % | 45 % | 0/16 | OK |
| J45 | 6c | 22 | 22 | OK | OK | OK | 49 % | 86 % | 55 % | 0/12 | OK |
| J46 | 7c | 28 | 28 | OK | OK | OK | 50 % | 85 % | 48 % | 0/14 | OK |
| J47 | 8c | 29 | 29 | OK | OK | OK | 38 % | 83 % | 57 % | 0/16 | OK |
| J48 | 6c | 24 | 24 | OK | OK | OK | 34 % | 77 % | 73 % | 0/12 | OK |
| J49 | 7c | 25 | 25 | OK | OK | OK | 53 % | 96 % | 53 % | 0/14 | OK |
| J50 | 8c | 28 | 28 | OK | OK | OK | 58 % | 95 % | 33 % | 0/16 | OK |
| J51 | 6c | 22 | 22 | OK | OK | OK | 52 % | 93 % | 55 % | 0/12 | OK |
| J52 | 7c | 24 | 24 | OK | OK | OK | 52 % | 99 % | 40 % | 0/14 | OK |
| J53 | 8c | 26 | 26 | OK | OK | OK | 31 % | 51 % | 53 % | 0/16 | OK |
| J54 | 6c | 23 | 23 | OK | OK | OK | 35 % | 90 % | 75 % | 0/12 | OK |
| J55 | 7c | 23 | 23 | OK | OK | OK | 51 % | 95 % | 60 % | 0/14 | OK |
| J56 | 8c | 27 | 27 | OK | OK | OK | 48 % | 90 % | 40 % | 0/16 | OK |
| J57 | 6c | 21 | 21 | OK | OK | OK | 52 % | 89 % | 50 % | 0/12 | OK |
| J58 | 7c | 27 | 27 | OK | OK | OK | 59 % | 91 % | 53 % | 0/14 | OK |
| J59 | 8c | 30 | 30 | OK | OK | OK | 34 % | 87 % | 63 % | 0/16 | OK |
| J60 | 6c | 22 | 22 | OK | OK | OK | 48 % | 91 % | 50 % | 0/12 | OK |
| J61 | 7c | 25 | 25 | OK | OK | OK | 28 % | 93 % | 55 % | 0/14 | OK |
| J62 | 8c | 28 | 28 | OK | OK | OK | 38 % | 80 % | 63 % | 0/16 | OK |
| J63 | 6c | 22 | 22 | OK | OK | OK | 52 % | 94 % | 63 % | 0/12 | OK |
| J64 | 7c | 26 | 26 | OK | OK | OK | 27 % | 77 % | 53 % | 0/14 | OK |
| J65 | 8c | 30 | 30 | OK | OK | OK | 35 % | 64 % | 50 % | 0/16 | OK |
| J66 | 6c | 22 | 22 | OK | OK | OK | 56 % | 82 % | 35 % | 0/12 | OK |
| J67 | 7c | 25 | 25 | OK | OK | OK | 31 % | 82 % | 85 % | 0/14 | OK |
| J68 | 8c | 30 | 30 | OK | OK | OK | 39 % | 81 % | 53 % | 0/16 | OK |
| J69 | 6c | 19 | 19 | OK | OK | OK | 55 % | 89 % | 50 % | 0/12 | OK |
| J70 | 7c | 26 | 26 | OK | OK | OK | 53 % | 84 % | 50 % | 0/14 | OK |
| J71 | 8c | 31 | 31 | OK | OK | OK | 59 % | 79 % | 50 % | 0/16 | OK |
| J72 | 6c | 21 | 21 | OK | OK | OK | 55 % | 92 % | 38 % | 0/12 | OK |
| J73 | 7c | 23 | 23 | OK | OK | OK | 55 % | 90 % | 35 % | 0/14 | OK |
| J74 | 8c | 29 | 29 | OK | OK | OK | 39 % | 88 % | 60 % | 0/16 | OK |
| J75 | 6c | 19 | 19 | OK | OK | OK | 39 % | 79 % | 65 % | 0/12 | OK |
| J76 | 7c | 26 | 26 | OK | OK | OK | 41 % | 79 % | 57 % | 0/14 | OK |
| J77 | 8c | 29 | 29 | OK | OK | OK | 49 % | 95 % | 53 % | 0/16 | OK |
| J78 | 6c | 22 | 22 | OK | OK | OK | 35 % | 79 % | 55 % | 0/12 | OK |
| J79 | 7c | 27 | 27 | OK | OK | OK | 51 % | 95 % | 45 % | 0/14 | OK |
| J80 | 8c | 29 | 29 | OK | OK | OK | 47 % | 91 % | 50 % | 0/16 | OK |
| J81 | 6c | 21 | 21 | OK | OK | OK | 42 % | 89 % | 60 % | 0/12 | OK |
| J82 | 7c | 25 | 25 | OK | OK | OK | 61 % | 93 % | 43 % | 0/14 | À revoir (FACILE) |
| J83 | 8c | 27 | 27 | OK | OK | OK | 48 % | 97 % | 48 % | 0/16 | OK |
| J84 | 6c | 21 | 21 | OK | OK | OK | 51 % | 92 % | 53 % | 0/12 | OK |
| J85 | 7c | 27 | 27 | OK | OK | OK | 53 % | 90 % | 35 % | 0/14 | OK |
| J86 | 8c | 30 | 30 | OK | OK | OK | 43 % | 77 % | 53 % | 0/16 | OK |
| J87 | 6c | 22 | 22 | OK | OK | OK | 40 % | 85 % | 75 % | 0/12 | OK |
| J88 | 7c | 27 | 27 | OK | OK | OK | 43 % | 92 % | 65 % | 0/14 | OK |
| J89 | 8c | 28 | 28 | OK | OK | OK | 33 % | 65 % | 73 % | 0/16 | OK |
| J90 | 6c | 22 | 22 | OK | OK | OK | 48 % | 76 % | 55 % | 0/12 | OK |
| J91 | 7c | 26 | 26 | OK | OK | OK | 37 % | 82 % | 57 % | 0/14 | OK |
| J92 | 8c | 30 | 30 | OK | OK | OK | 41 % | 78 % | 68 % | 0/16 | OK |
| J93 | 6c | 23 | 23 | OK | OK | OK | 40 % | 78 % | 60 % | 0/12 | OK |
| J94 | 7c | 27 | 27 | OK | OK | OK | 57 % | 89 % | 53 % | 0/14 | OK |
| J95 | 8c | 30 | 30 | OK | OK | OK | 42 % | 89 % | 53 % | 0/16 | OK |
| J96 | 6c | 23 | 23 | OK | OK | OK | 49 % | 82 % | 57 % | 0/12 | OK |
| J97 | 7c | 27 | 27 | OK | OK | OK | 42 % | 86 % | 53 % | 0/14 | OK |
| J98 | 8c | 31 | 31 | OK | OK | OK | 44 % | 86 % | 53 % | 0/16 | OK |
| J99 | 6c | 22 | 22 | OK | OK | OK | 52 % | 87 % | 63 % | 0/12 | OK |
| J100 | 7c | 28 | 28 | OK | OK | OK | 34 % | 73 % | 68 % | 0/14 | OK |
| J101 | 8c | 27 | 27 | OK | OK | OK | 39 % | 82 % | 68 % | 0/16 | OK |
| J102 | 6c | 22 | 22 | OK | OK | OK | 50 % | 85 % | 57 % | 0/12 | OK |
| J103 | 7c | 28 | 28 | OK | OK | OK | 60 % | 95 % | 55 % | 0/14 | OK |
| J104 | 8c | 29 | 29 | OK | OK | OK | 48 % | 95 % | 60 % | 0/16 | OK |
| J105 | 6c | 21 | 21 | OK | OK | OK | 32 % | 84 % | 70 % | 0/12 | OK |
| J106 | 7c | 26 | 26 | OK | OK | OK | 53 % | 91 % | 38 % | 0/14 | OK |
| J107 | 8c | 29 | 29 | OK | OK | OK | 56 % | 94 % | 40 % | 0/16 | OK |
| J108 | 6c | 22 | 22 | OK | OK | OK | 37 % | 93 % | 57 % | 0/12 | OK |
| J109 | 7c | 25 | 25 | OK | OK | OK | 55 % | 92 % | 45 % | 0/14 | OK |
| J110 | 8c | 30 | 30 | OK | OK | OK | 41 % | 85 % | 70 % | 0/16 | OK |
| J111 | 6c | 22 | 22 | OK | OK | OK | 56 % | 95 % | 48 % | 0/12 | OK |
| J112 | 7c | 27 | 27 | OK | OK | OK | 38 % | 83 % | 53 % | 0/14 | OK |
| J113 | 8c | 27 | 27 | OK | OK | OK | 28 % | 78 % | 80 % | 0/16 | OK |
| J114 | 6c | 17 | 17 | OK | OK | OK | 48 % | 86 % | 45 % | 0/12 | OK |
| J115 | 7c | 28 | 28 | OK | OK | OK | 34 % | 85 % | 73 % | 0/14 | OK |
| J116 | 8c | 28 | 28 | OK | OK | OK | 50 % | 89 % | 60 % | 0/16 | OK |
| J117 | 6c | 24 | 24 | OK | OK | OK | 52 % | 77 % | 57 % | 0/12 | OK |
| J118 | 7c | 26 | 26 | OK | OK | OK | 30 % | 82 % | 68 % | 0/14 | OK |
| J119 | 8c | 33 | 33 | OK | OK | OK | 38 % | 84 % | 63 % | 0/16 | OK |

## Annexe B. Outils ajoutés ou modifiés (`tools/qa/`)

Nouveaux : `smart.js` (joueur attentif), `nudge.js` (décision 5 en simulation), `deep.js` (2 et 3 premiers coups), `decisions.js` (décisions 5 à 8 dans le jeu), `hand.js` (main du niveau 1), `verdicts2.js`, `report2.js`, `n200.js`. Modifiés : `analyze.js` (table des mondes de la fiche), `sim.js` (`--seedoff`, `--out`), `crosscheck.js` (DFS indépendant, `--all`), `behaviors.js` et `behaviors2.js` (numéros de niveaux du nouvel ordre). Relance : `node tools/qa/play.js` (et `--w 320 --h 568`), `render.js`, `analyze.js`, `sim.js --seedoff 777`, `opt.js`, `nudge.js`, `smart.js`, `deep.js`, `decisions.js`, `behaviors.js`, `behaviors2.js`, `crosscheck.js --all`, puis `node tools/qa/report2.js`.
