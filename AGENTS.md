# Mini-jeux HTML5 — règles de construction (à lire avant de coder)

Petits jeux originaux, courts, à tester sur mobile puis à intégrer dans une super-app (webview, téléphones d'entrée de gamme, réseau lent).

## Dispositif
1. **Étude** → `docs/ETUDE.md` (ce qui retient, ce qui se partage).
2. **Fiche du jeu** → `docs/jeux/<jeu>.md` : la règle en cinq lignes, validée avant le code.
3. **Build** : un agent par jeu, dans `games/<jeu>/index.html`. Un agent ne touche qu'à son dossier.
4. **Recette mobile** : `npm test` (Playwright, viewport téléphone, tactile). Rien n'est livré rouge.
5. **Intégration** : seulement après validation du propriétaire du produit.

## Rôles (décision du propriétaire du produit, 24 novembre)
- **Session principale** : orchestre, conçoit (fiche et architecture du lot), supervise. Ne code pas les jeux.
- **Sonnet** : code, un agent par lot, dans son seul périmètre.
- **Opus** : revue du code de chaque lot avant livraison (justesse, règles ci-dessous, simplicité). Ses remarques retournent à Sonnet.
- **Haiku** : contrôles d'ensemble en fin de lot (`npm test`, poids, absence de réseau, cohérence entre jeux, docs à jour).
Un lot n'est livré que revue et contrôles passés.

## Règles non négociables
1. **Un jeu = un seul fichier** `index.html`, CSS et JS en ligne, vanilla. Aucune dépendance, aucune requête réseau, aucune police ni image externe.
2. **Moins de 150 Ko**. Dessin par CSS, SVG ou canvas 2D ; pas de WebGL, pas de flou ni d'ombre coûteuse.
3. **Mobile d'abord, portrait** : jouable de 320 à 430 px de large sans défilement, cibles tactiles ≥ 44 px, événements `pointer`, `touch-action: manipulation`, pas de zoom, pas de survol, zones sûres (`env(safe-area-inset-*)`).
4. **Hors ligne** : progression en `localStorage` sous la clé `mj:<jeu>:v1`, toujours dans un `try/catch` ; le jeu marche sans stockage.
5. **Tout niveau est gagnable**, et un test le prouve (solveur ou solution rejouée).
6. **Jeu original** : nom, habillage et niveaux à nous. On reprend un genre, jamais un jeu existant.
7. **Texte en français**, court. Code et commentaires en anglais.
8. **Couleurs jamais seules** : chaque couleur porte aussi un symbole (daltonisme, écrans faibles).
9. **Une action, une réponse immédiate** ; annuler et recommencer toujours possibles ; aucune impasse sans issue visible.
10. **Crochets de test** : `window.__game` expose l'état (`state()`), les niveaux (`levels`), et `loadLevel(n)`. Les solutions ne sont jamais embarquées dans le jeu.
11. **Crochet d'intégration** : le jeu ne parle à la page hôte que par `window.parent.postMessage({source:'mini-jeu', game, event, …}, '*')`, avec les seuls événements listés dans la fiche du jeu, sans donnée personnelle. Rien d'autre ne sort.

## Ressorts à intégrer (issus de l'étude)
Sessions de 1 à 3 min · difficulté progressive, premiers niveaux très faciles · reprise instantanée là où on s'est arrêté · partage du résultat sans spoiler (`navigator.share`, repli presse-papiers) · le simple d'abord.
