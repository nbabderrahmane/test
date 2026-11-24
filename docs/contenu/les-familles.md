# Qui va où (les-familles) — contenu

**À valider par un humain avant publication.**

20 grilles de 12 mots à ranger en 4 familles de 3 (3 erreurs permises, la 4e termine la partie). Source : `tools/les-familles/data.js` ; preuve d'unicité : `node tools/les-familles/verify.js` (relancé par `node tests/les-familles.spec.js`).

## Ce qui est contrôlé par script, et ce qui ne l'est pas

- Contrôlé : avec la table « famille → tous les mots du lot qui lui appartiennent » (`CATS` dans `data.js`, un mot qui va dans deux familles est listé dans les deux), chaque grille n'a qu'une seule répartition complète en 4 triples de mots partageant au moins une famille de la table. Deux grilles partagent au plus un mot ; aucune famille n'est reprise telle quelle ; tout mot de la table sert dans une grille ; mots de 9 lettres au plus, sans espace ni trait d'union.
- Non contrôlé : l'exhaustivité de la table. Elle est écrite à la main et relue famille par famille (après la première revue : tabouret/banc, piment/gingembre et soleil/orage, qui donnaient une autre répartition légitime, ont été retirés des grilles 9, 10 et 12). Seul un humain peut dire si un mot a une lecture oubliée ou si une famille est discutable. Mots à relire en priorité : plantain (fruit / féculent, niveau 17), bureau (meuble / pièce, 9), sifflet (on souffle dedans / au football, 13), mètre (unité / outil de bricolage, 14), basket (chaussure / sport, 15), maillot, gardien (métiers / football, 19), batterie (percussions / véhicule, 18), piment (assaisonner / légume, 10), muscade, balance, kaki et marron évités.
- Aucune marque, aucun nom de personne, rien de politique ni de religieux. Aucune compréhension régionale vérifiée : certains mots (sorgho évité, acajou, fromager, muscade, poireau) sont à confirmer pour l'Afrique francophone.
- Difficulté : niveaux 1-5 sans piège ; 6-15 un mot qui pourrait aller dans une autre famille ; 16-19 deux pièges ; 20 trois pièges. Aux niveaux 18, 19 et 20, les pièges s'enchaînent (un mot forcé en impose un autre).

## Niveau 1

- Croix ✚ — **Fruits** : mangue, banane, papaye
- Cœur ♥ — **Couleurs** : rouge, bleu, vert
- Étoile ✦ — **Le corps** : main, pied, tête
- Triangle ▲ — **À la ferme** : vache, chèvre, âne
- Pièges : aucun

## Niveau 2

- Croix ✚ — **Transports** : taxi, bus, train
- Cœur ♥ — **Légumes** : carotte, oignon, chou
- Étoile ✦ — **Dans le cartable** : cahier, stylo, gomme
- Triangle ▲ — **Meubles** : lit, chaise, armoire
- Pièges : aucun

## Niveau 3

- Croix ✚ — **Boissons** : eau, lait, jus
- Cœur ♥ — **Sports** : foot, judo, boxe
- Étoile ✦ — **Instruments de musique** : kora, flûte, guitare
- Triangle ▲ — **Le temps qu'il fait** : pluie, vent, orage
- Pièges : aucun

## Niveau 4

- Croix ✚ — **Métiers** : médecin, boulanger, chauffeur
- Cœur ♥ — **Animaux sauvages** : lion, girafe, zèbre
- Étoile ✦ — **Habits** : pagne, robe, chemise
- Triangle ▲ — **Parties d'une maison** : toit, mur, porte
- Pièges : aucun

## Niveau 5

- Croix ✚ — **La famille** : père, oncle, cousin
- Cœur ♥ — **Arbres** : baobab, palmier, manguier
- Étoile ✦ — **Ustensiles de cuisine** : marmite, cuillère, assiette
- Triangle ▲ — **Insectes** : fourmi, abeille, moustique
- Pièges : aucun

## Niveau 6

- Croix ✚ — **Fruits** : ananas, goyave, orange
- Cœur ♥ — **Couleurs** : jaune, noir, blanc
- Étoile ✦ — **Sports** : natation, course, lutte
- Triangle ▲ — **Poissons** : thon, sardine, carpe
- Pièges : orange (Fruits / Couleurs)

## Niveau 7

- Croix ✚ — **L'argent** : billet, monnaie, pièce
- Cœur ♥ — **Pièces de la maison** : salon, chambre, cuisine
- Étoile ✦ — **Percussions** : djembé, tambour, balafon
- Triangle ▲ — **Matières à l'école** : maths, dessin, histoire
- Pièges : pièce (Pièces de la maison / L'argent)

## Niveau 8

- Croix ✚ — **Oiseaux** : aigle, perroquet, coq
- Cœur ♥ — **À la ferme** : cochon, cheval, mouton
- Étoile ✦ — **Boissons** : thé, café, soda
- Triangle ▲ — **Saveurs** : sucré, salé, amer
- Pièges : coq (À la ferme / Oiseaux)

## Niveau 9

- Croix ✚ — **Meubles** : fauteuil, étagère, commode
- Cœur ♥ — **Pièces de la maison** : grenier, couloir, bureau
- Étoile ✦ — **Transports** : moto, pirogue, avion
- Triangle ▲ — **Métiers** : tailleur, maçon, pêcheur
- Pièges : bureau (Meubles / Pièces de la maison)

## Niveau 10

- Croix ✚ — **Pour assaisonner** : sel, poivre, muscade
- Cœur ♥ — **Légumes** : gombo, aubergine, piment
- Étoile ✦ — **Céréales** : riz, mil, blé
- Triangle ▲ — **Façons de cuire** : frire, griller, bouillir
- Pièges : piment (Légumes / Pour assaisonner)

## Niveau 11

- Croix ✚ — **Fleurs** : hibiscus, jasmin, rose
- Cœur ♥ — **Couleurs** : gris, violet, beige
- Étoile ✦ — **Moments de la journée** : matin, midi, soir
- Triangle ▲ — **Animaux sauvages** : éléphant, crocodile, gazelle
- Pièges : rose (Couleurs / Fleurs)

## Niveau 12

- Croix ✚ — **Astres** : lune, étoile, soleil
- Cœur ♥ — **Le temps qu'il fait** : brume, grêle, nuage
- Étoile ✦ — **Reliefs** : vallée, falaise, colline
- Triangle ▲ — **Étendues d'eau** : fleuve, lac, mare
- Pièges : soleil (Le temps qu'il fait / Astres)

## Niveau 13

- Croix ✚ — **On souffle dedans** : trompette, saxophone, sifflet
- Cœur ♥ — **Au football** : penalty, tir, corner
- Étoile ✦ — **Arbres** : cocotier, acajou, fromager
- Triangle ▲ — **Insectes** : termite, criquet, mouche
- Pièges : sifflet (On souffle dedans / Au football)

## Niveau 14

- Croix ✚ — **Unités de mesure** : kilo, litre, mètre
- Cœur ♥ — **Outils de bricolage** : marteau, scie, tournevis
- Étoile ✦ — **Outils du champ** : houe, râteau, faucille
- Triangle ▲ — **Au marché** : étal, panier, balance
- Pièges : mètre (Unités de mesure / Outils de bricolage)

## Niveau 15

- Croix ✚ — **Chaussures** : sandale, botte, basket
- Cœur ♥ — **Sports** : volley, karaté, handball
- Étoile ✦ — **Légumes** : poireau, navet, courgette
- Triangle ▲ — **La famille** : tante, frère, sœur
- Pièges : basket (Sports / Chaussures)

## Niveau 16

- Croix ✚ — **Dans le cartable** : crayon, règle, feuille
- Cœur ♥ — **Parties d'une plante** : racine, tige, graine
- Étoile ✦ — **Oiseaux** : hibou, vautour, poule
- Triangle ▲ — **À la ferme** : lapin, brebis, veau
- Pièges : feuille (Dans le cartable / Parties d'une plante) ; poule (À la ferme / Oiseaux)

## Niveau 17

- Croix ✚ — **Fruits** : citron, pastèque, plantain
- Cœur ♥ — **Couleurs** : turquoise, doré, orange
- Étoile ✦ — **Féculents** : manioc, igname, patate
- Triangle ▲ — **Animaux sauvages** : singe, léopard, buffle
- Pièges : plantain (Fruits / Féculents) ; orange (Fruits / Couleurs)

## Niveau 18

- Croix ✚ — **Percussions** : cymbale, maracas, batterie
- Cœur ♥ — **Pièces d'un véhicule** : moteur, frein, klaxon
- Étoile ✦ — **Matériel de sport** : raquette, haltère, ballon
- Triangle ▲ — **Au football** : but, arbitre, maillot
- Pièges : batterie (Instruments de musique / Percussions / Pièces d'un véhicule) ; ballon (Au football / Matériel de sport)

## Niveau 19

- Croix ✚ — **Matériel de sport** : corde, tapis, ballon
- Cœur ♥ — **Au football** : dribble, carton, gardien
- Étoile ✦ — **Métiers** : forgeron, potier, menuisier
- Triangle ▲ — **Jours de la semaine** : lundi, mardi, samedi
- Pièges : ballon (Au football / Matériel de sport) ; gardien (Métiers / Au football)

## Niveau 20

- Croix ✚ — **Fruits** : raisin, datte, orange
- Cœur ♥ — **Couleurs** : pourpre, bordeaux, crème
- Étoile ✦ — **Fleurs** : orchidée, lys, rose
- Triangle ▲ — **Métiers** : coiffeur, infirmier, avocat
- Pièges : orange (Fruits / Couleurs) ; rose (Couleurs / Fleurs) ; avocat (Fruits / Métiers)

