'use strict';
/*
 * Source data of "Qui va où" (slug les-familles).
 *
 * TAGS   : every family name that can appear in a grid (id -> label shown in the game).
 * CATS   : the honest table, written by family: ALL the words of the pool that really belong to the
 *          family, so a word that fits two families is simply listed in both. WORDS (word -> tags)
 *          is derived from it. The verifier relies on it to prove that each grid has exactly one
 *          complete split. When adding a word, check it against EVERY family below.
 * GRIDS  : 20 grids, each 4 families [tag, [3 words]]; the order is the colour/shape order in the game.
 *
 * Content to be validated by a human before publication (see docs/contenu/les-familles.md).
 */

const TAGS = {
  fruit: 'Fruits', couleur: 'Couleurs', corps: 'Le corps', ferme: 'À la ferme', transp: 'Transports',
  legume: 'Légumes', cartable: 'Dans le cartable', meuble: 'Meubles', boisson: 'Boissons', sport: 'Sports',
  instru: 'Instruments de musique', meteo: "Le temps qu'il fait", metier: 'Métiers', sauvage: 'Animaux sauvages',
  habit: 'Habits', partie: "Parties d'une maison", famille: 'La famille', arbre: 'Arbres',
  ustensile: 'Ustensiles de cuisine', insecte: 'Insectes', poisson: 'Poissons', argent: "L'argent",
  piece: 'Pièces de la maison', percu: 'Percussions', matiere: "Matières à l'école", oiseau: 'Oiseaux',
  saveur: 'Saveurs', epice: 'Pour assaisonner', cereale: 'Céréales', cuisson: 'Façons de cuire',
  feculent: 'Féculents', jour: 'Jours de la semaine', fleur: 'Fleurs', moment: 'Moments de la journée',
  astre: 'Astres', relief: 'Reliefs', eau: "Étendues d'eau", souffle: 'On souffle dedans', foot: 'Au football',
  unite: 'Unités de mesure', marche: 'Au marché', champ: 'Outils du champ', bricol: 'Outils de bricolage',
  chaussure: 'Chaussures', plante: "Parties d'une plante", vehicule: "Pièces d'un véhicule", materiel: 'Matériel de sport',
};

const CATS = {
  fruit: 'mangue banane papaye ananas goyave orange avocat citron pastèque plantain raisin datte',
  couleur: 'rouge bleu vert jaune noir blanc gris violet beige rose orange turquoise doré pourpre bordeaux crème',
  corps: 'main pied tête',
  ferme: 'vache chèvre âne cochon cheval mouton coq poule lapin brebis veau',
  oiseau: 'aigle perroquet coq hibou vautour poule',
  transp: 'taxi bus train moto pirogue avion',
  legume: 'carotte oignon chou gombo aubergine piment poireau navet courgette patate',
  cartable: 'cahier stylo gomme crayon règle feuille',
  meuble: 'lit chaise armoire fauteuil étagère commode bureau',
  boisson: 'eau lait jus thé café soda',
  sport: 'foot judo boxe natation course lutte basket volley karaté handball',
  instru: 'kora flûte guitare djembé tambour balafon cymbale maracas batterie trompette saxophone',
  percu: 'djembé tambour balafon cymbale maracas batterie',
  souffle: 'trompette saxophone sifflet flûte',
  meteo: 'pluie vent orage brume grêle nuage soleil',
  astre: 'lune étoile soleil',
  metier: 'médecin boulanger chauffeur tailleur maçon pêcheur coiffeur infirmier avocat forgeron potier menuisier gardien',
  sauvage: 'lion girafe zèbre éléphant crocodile gazelle singe léopard buffle',
  habit: 'pagne robe chemise maillot',
  partie: 'toit mur porte',
  piece: 'salon chambre cuisine pièce grenier couloir bureau',
  famille: 'père oncle cousin tante frère sœur',
  arbre: 'baobab palmier manguier cocotier acajou fromager',
  ustensile: 'marmite cuillère assiette',
  insecte: 'fourmi abeille moustique termite criquet mouche',
  poisson: 'thon sardine carpe',
  argent: 'billet monnaie pièce',
  matiere: 'maths dessin histoire',
  saveur: 'sucré salé amer',
  epice: 'sel poivre muscade piment oignon',
  cereale: 'riz mil blé',
  cuisson: 'frire griller bouillir',
  feculent: 'manioc igname patate plantain riz mil blé',
  jour: 'lundi mardi samedi',
  fleur: 'hibiscus jasmin rose orchidée lys',
  moment: 'matin midi soir',
  relief: 'vallée falaise colline',
  eau: 'fleuve lac mare',
  foot: 'penalty tir corner sifflet but arbitre maillot ballon gardien dribble carton',
  unite: 'kilo litre mètre',
  marche: 'étal panier balance',
  champ: 'houe râteau faucille',
  bricol: 'marteau scie tournevis mètre',
  chaussure: 'sandale botte basket',
  plante: 'racine tige graine feuille',
  vehicule: 'moteur frein klaxon batterie',
  materiel: 'raquette haltère ballon corde tapis',
};

const WORDS = {};
for (const [tag, list] of Object.entries(CATS)) {
  for (const w of list.split(' ')) (WORDS[w] = WORDS[w] || []).push(tag);
}

const G = (...fams) => fams.map(([tag, ws]) => [tag, ws.split(' ')]);
const GRIDS = [
  // 1-5: four plain families, no word fits two of them
  G(['fruit', 'mangue banane papaye'], ['couleur', 'rouge bleu vert'], ['corps', 'main pied tête'], ['ferme', 'vache chèvre âne']),
  G(['transp', 'taxi bus train'], ['legume', 'carotte oignon chou'], ['cartable', 'cahier stylo gomme'], ['meuble', 'lit chaise armoire']),
  G(['boisson', 'eau lait jus'], ['sport', 'foot judo boxe'], ['instru', 'kora flûte guitare'], ['meteo', 'pluie vent orage']),
  G(['metier', 'médecin boulanger chauffeur'], ['sauvage', 'lion girafe zèbre'], ['habit', 'pagne robe chemise'], ['partie', 'toit mur porte']),
  G(['famille', 'père oncle cousin'], ['arbre', 'baobab palmier manguier'], ['ustensile', 'marmite cuillère assiette'], ['insecte', 'fourmi abeille moustique']),
  // 6-15: one word that could go elsewhere
  G(['fruit', 'ananas goyave orange'], ['couleur', 'jaune noir blanc'], ['sport', 'natation course lutte'], ['poisson', 'thon sardine carpe']),
  G(['argent', 'billet monnaie pièce'], ['piece', 'salon chambre cuisine'], ['percu', 'djembé tambour balafon'], ['matiere', 'maths dessin histoire']),
  G(['oiseau', 'aigle perroquet coq'], ['ferme', 'cochon cheval mouton'], ['boisson', 'thé café soda'], ['saveur', 'sucré salé amer']),
  G(['meuble', 'fauteuil étagère commode'], ['piece', 'grenier couloir bureau'], ['transp', 'moto pirogue avion'], ['metier', 'tailleur maçon pêcheur']),
  G(['epice', 'sel poivre muscade'], ['legume', 'gombo aubergine piment'], ['cereale', 'riz mil blé'], ['cuisson', 'frire griller bouillir']),
  G(['fleur', 'hibiscus jasmin rose'], ['couleur', 'gris violet beige'], ['moment', 'matin midi soir'], ['sauvage', 'éléphant crocodile gazelle']),
  G(['astre', 'lune étoile soleil'], ['meteo', 'brume grêle nuage'], ['relief', 'vallée falaise colline'], ['eau', 'fleuve lac mare']),
  G(['souffle', 'trompette saxophone sifflet'], ['foot', 'penalty tir corner'], ['arbre', 'cocotier acajou fromager'], ['insecte', 'termite criquet mouche']),
  G(['unite', 'kilo litre mètre'], ['bricol', 'marteau scie tournevis'], ['champ', 'houe râteau faucille'], ['marche', 'étal panier balance']),
  G(['chaussure', 'sandale botte basket'], ['sport', 'volley karaté handball'], ['legume', 'poireau navet courgette'], ['famille', 'tante frère sœur']),
  // 16-20: two or three traps, the last grids chain them
  G(['cartable', 'crayon règle feuille'], ['plante', 'racine tige graine'], ['oiseau', 'hibou vautour poule'], ['ferme', 'lapin brebis veau']),
  G(['fruit', 'citron pastèque plantain'], ['couleur', 'turquoise doré orange'], ['feculent', 'manioc igname patate'], ['sauvage', 'singe léopard buffle']),
  G(['percu', 'cymbale maracas batterie'], ['vehicule', 'moteur frein klaxon'], ['materiel', 'raquette haltère ballon'], ['foot', 'but arbitre maillot']),
  G(['materiel', 'corde tapis ballon'], ['foot', 'dribble carton gardien'], ['metier', 'forgeron potier menuisier'], ['jour', 'lundi mardi samedi']),
  G(['fruit', 'raisin datte orange'], ['couleur', 'pourpre bordeaux crème'], ['fleur', 'orchidée lys rose'], ['metier', 'coiffeur infirmier avocat']),
];

module.exports = { TAGS, CATS, WORDS, GRIDS };
