# Qui va où (les-familles) — contenu

**À valider par un humain avant publication.**

20 grilles de 12 mots à ranger en 4 familles de 3 (3 erreurs permises, la 4e termine la partie). Source : `tools/les-familles/data.js` ; preuve d'unicité : `node tools/les-familles/verify.js` (relancé par `node tests/les-familles.spec.js`).

## Ce qui est prouvé, et ce qui ne l'est pas

- Prouvé : avec la table « ce mot peut appartenir à ces familles » (`WORDS` dans `data.js`), chaque grille n'a qu'une seule répartition complète en 4 triples de mots partageant au moins une famille de la table.
- Non prouvé : l'exhaustivité de la table elle-même. Elle est remplie à la main, honnêtement, mais seul un humain peut dire si un mot a une lecture qu'on a oubliée, ou si une famille est discutable. Les mots « pièges » (à relire en priorité) sont listés pour chaque grille.
- Aucune marque, aucun nom de personne, rien de politique ni de religieux. Mots de 9 lettres au plus, sans espace ni trait d'union, accents conservés à l'affichage.
- Difficulté : niveaux 1-5 sans piège ; 6-13 un mot qui pourrait aller dans une autre famille ; 14-19 deux pièges ; 20 trois pièges. Aux niveaux 18, 19 et 20, les pièges s'enchaînent (un mot forcé en impose un autre).
- À relire en priorité (lectures discutables) : plantain (fruit / féculent, niveau 17), banc (meuble / dans la classe, niveau 9), basket (chaussure / sport, niveau 15), foulard (pour la tête / habit, niveau 15), sifflet (on souffle dedans / au football, niveau 13), gardien (au football / métier, niveau 19), batterie (percussions / véhicule, niveau 18), piment (pour assaisonner / légume, niveau 10), balance (pour mesurer / au marché, niveau 14), pelle (outil du champ / de bricolage, niveau 14), « daba », « bissap » et autres mots très régionaux ont été évités.

## Niveau 1

- Jaune ● — **Fruits** : mangue, banane, papaye
- Vert ■ — **Couleurs** : rouge, bleu, vert
- Bleu ▲ — **Le corps** : main, pied, tête
- Violet ◆ — **À la ferme** : poule, vache, chèvre
- Pièges : aucun

## Niveau 2

- Jaune ● — **Transports** : taxi, bus, train
- Vert ■ — **Légumes** : carotte, oignon, chou
- Bleu ▲ — **Dans le cartable** : cahier, stylo, gomme
- Violet ◆ — **Meubles** : lit, chaise, armoire
- Pièges : aucun

## Niveau 3

- Jaune ● — **Boissons** : eau, lait, jus
- Vert ■ — **Sports** : foot, judo, boxe
- Bleu ▲ — **Instruments de musique** : kora, flûte, guitare
- Violet ◆ — **Le temps qu'il fait** : pluie, vent, orage
- Pièges : aucun

## Niveau 4

- Jaune ● — **Métiers** : médecin, boulanger, chauffeur
- Vert ■ — **Animaux sauvages** : lion, girafe, zèbre
- Bleu ▲ — **Habits** : pagne, robe, chemise
- Violet ◆ — **Parties d'une maison** : toit, mur, porte
- Pièges : aucun

## Niveau 5

- Jaune ● — **La famille** : père, oncle, cousin
- Vert ■ — **Arbres** : baobab, palmier, manguier
- Bleu ▲ — **Ustensiles de cuisine** : marmite, cuillère, assiette
- Violet ◆ — **Insectes** : fourmi, abeille, moustique
- Pièges : aucun

## Niveau 6

- Jaune ● — **Fruits** : ananas, goyave, orange
- Vert ■ — **Couleurs** : jaune, noir, blanc
- Bleu ▲ — **Sports** : natation, course, lutte
- Violet ◆ — **Poissons** : thon, sardine, carpe
- Pièges : orange (Fruits / Couleurs)

## Niveau 7

- Jaune ● — **L'argent** : billet, monnaie, pièce
- Vert ■ — **Pièces de la maison** : salon, chambre, cuisine
- Bleu ▲ — **Percussions** : djembé, tambour, balafon
- Violet ◆ — **Matières à l'école** : maths, dessin, histoire
- Pièges : pièce (Pièces de la maison / L'argent)

## Niveau 8

- Jaune ● — **À la ferme** : vache, âne, mouton
- Vert ■ — **Oiseaux** : aigle, perroquet, coq
- Bleu ▲ — **Boissons** : thé, café, soda
- Violet ◆ — **Saveurs** : sucré, salé, amer
- Pièges : coq (À la ferme / Oiseaux)

## Niveau 9

- Jaune ● — **Dans la classe** : tableau, craie, banc
- Vert ■ — **Meubles** : lit, armoire, tabouret
- Bleu ▲ — **Transports** : moto, pirogue, avion
- Violet ◆ — **Métiers** : tailleur, maçon, pêcheur
- Pièges : banc (Meubles / Dans la classe)

## Niveau 10

- Jaune ● — **Pour assaisonner** : sel, poivre, gingembre
- Vert ■ — **Légumes** : gombo, aubergine, piment
- Bleu ▲ — **Céréales** : riz, mil, maïs
- Violet ◆ — **Façons de cuire** : frire, griller, bouillir
- Pièges : piment (Pour assaisonner / Légumes)

## Niveau 11

- Jaune ● — **Couleurs** : noir, gris, violet
- Vert ■ — **Fleurs** : hibiscus, jasmin, rose
- Bleu ▲ — **Moments de la journée** : matin, midi, soir
- Violet ◆ — **Animaux sauvages** : éléphant, crocodile, gazelle
- Pièges : rose (Couleurs / Fleurs)

## Niveau 12

- Jaune ● — **Dans le ciel** : lune, étoile, soleil
- Vert ■ — **Le temps qu'il fait** : pluie, orage, brume
- Bleu ▲ — **Reliefs** : vallée, falaise, colline
- Violet ◆ — **Étendues d'eau** : fleuve, lac, mare
- Pièges : soleil (Le temps qu'il fait / Dans le ciel)

## Niveau 13

- Jaune ● — **On souffle dedans** : trompette, flûte, sifflet
- Vert ■ — **Au football** : penalty, tir, corner
- Bleu ▲ — **Arbres** : baobab, manguier, cocotier
- Violet ◆ — **Insectes** : termite, criquet, mouche
- Pièges : sifflet (On souffle dedans / Au football)

## Niveau 14

- Jaune ● — **Pour mesurer** : kilo, litre, mètre
- Vert ■ — **Au marché** : étal, panier, balance
- Bleu ▲ — **Outils du champ** : houe, machette, râteau
- Violet ◆ — **Outils de bricolage** : marteau, scie, pelle
- Pièges : balance (Pour mesurer / Au marché) ; pelle (Outils du champ / Outils de bricolage)

## Niveau 15

- Jaune ● — **Pour la tête** : chapeau, casquette, foulard
- Vert ■ — **Habits** : boubou, jupe, pantalon
- Bleu ▲ — **Chaussures** : sandale, botte, basket
- Violet ◆ — **Sports** : judo, boxe, natation
- Pièges : foulard (Habits / Pour la tête) ; basket (Chaussures / Sports)

## Niveau 16

- Jaune ● — **Dans le cartable** : crayon, gomme, feuille
- Vert ■ — **Parties d'une plante** : racine, tige, graine
- Bleu ▲ — **Oiseaux** : aigle, hibou, poule
- Violet ◆ — **À la ferme** : vache, chèvre, âne
- Pièges : feuille (Parties d'une plante / Dans le cartable) ; poule (À la ferme / Oiseaux)

## Niveau 17

- Jaune ● — **Fruits** : mangue, goyave, plantain
- Vert ■ — **Couleurs** : noir, gris, orange
- Bleu ▲ — **Féculents** : manioc, igname, riz
- Violet ◆ — **Animaux sauvages** : singe, léopard, buffle
- Pièges : plantain (Fruits / Féculents) ; orange (Fruits / Couleurs)

## Niveau 18

- Jaune ● — **Percussions** : djembé, cymbale, batterie
- Vert ■ — **Pièces d'un véhicule** : moteur, volant, frein
- Bleu ▲ — **Matériel de sport** : raquette, haltère, ballon
- Violet ◆ — **Au football** : but, arbitre, corner
- Pièges : batterie (Percussions / Instruments de musique / Pièces d'un véhicule) ; ballon (Matériel de sport / Au football)

## Niveau 19

- Jaune ● — **Matériel de sport** : raquette, corde, ballon
- Vert ■ — **Au football** : penalty, corner, gardien
- Bleu ▲ — **Métiers** : boulanger, maçon, pêcheur
- Violet ◆ — **Jours de la semaine** : lundi, mardi, samedi
- Pièges : ballon (Matériel de sport / Au football) ; gardien (Métiers / Au football)

## Niveau 20

- Jaune ● — **Fruits** : mangue, goyave, orange
- Vert ■ — **Couleurs** : noir, gris, violet
- Bleu ▲ — **Fleurs** : hibiscus, jasmin, rose
- Violet ◆ — **Métiers** : tailleur, maçon, avocat
- Pièges : orange (Fruits / Couleurs) ; rose (Couleurs / Fleurs) ; avocat (Fruits / Métiers)

