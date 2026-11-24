'use strict';
/*
 * Source data of "Qui va où" (slug les-familles).
 *
 * TAGS   : every family name that can appear in a grid (id -> label shown in the game).
 * WORDS  : the honest table "this word can belong to these families". A word lists EVERY tag
 *          of TAGS it really fits, not only the one used by its grid. The verifier relies on it
 *          to prove that each grid has exactly one complete split.
 * GRIDS  : 20 grids, each 4 families [tag, [3 words]] ; the order of the 4 families is the
 *          colour order in the game (yellow, green, blue, purple).
 *
 * Content to be validated by a human before publication (see docs/contenu/les-familles.md).
 */

const TAGS = {
  fruit: 'Fruits', couleur: 'Couleurs', corps: 'Le corps', ferme: 'À la ferme',
  transp: 'Transports', legume: 'Légumes', cartable: 'Dans le cartable', meuble: 'Meubles',
  boisson: 'Boissons', sport: 'Sports', instru: 'Instruments de musique', meteo: "Le temps qu'il fait",
  metier: 'Métiers', sauvage: 'Animaux sauvages', habit: 'Habits', partie: "Parties d'une maison",
  famille: 'La famille', arbre: 'Arbres', ustensile: 'Ustensiles de cuisine', insecte: 'Insectes',
  poisson: 'Poissons', argent: "L'argent", piece: 'Pièces de la maison', percu: 'Percussions',
  matiere: "Matières à l'école", oiseau: 'Oiseaux', saveur: 'Saveurs', classe: 'Dans la classe',
  epice: 'Pour assaisonner', cereale: 'Céréales', cuisson: 'Façons de cuire', feculent: 'Féculents',
  jour: 'Jours de la semaine', corde: 'Instruments à cordes', fleur: 'Fleurs', moment: 'Moments de la journée',
  ciel: 'Dans le ciel', relief: 'Reliefs', eau: "Étendues d'eau", souffle: 'On souffle dedans',
  foot: 'Au football', mesure: 'Pour mesurer', marche: 'Au marché', champ: 'Outils du champ',
  bricol: 'Outils de bricolage', coiffe: 'Pour la tête', chaussure: 'Chaussures', plante: "Parties d'une plante",
  vehicule: "Pièces d'un véhicule", materiel: 'Matériel de sport',
};

const WORDS = {
  // fruits and plants
  mangue: ['fruit'], banane: ['fruit'], papaye: ['fruit'], ananas: ['fruit'], goyave: ['fruit'],
  citron: ['fruit'], pastèque: ['fruit'], plantain: ['fruit', 'feculent'], orange: ['fruit', 'couleur'],
  avocat: ['fruit', 'metier'],
  carotte: ['legume'], oignon: ['legume', 'epice'], chou: ['legume'], gombo: ['legume'], aubergine: ['legume'],
  piment: ['epice', 'legume'], sel: ['epice'], poivre: ['epice'], gingembre: ['epice'],
  riz: ['cereale', 'feculent'], mil: ['cereale', 'feculent'], maïs: ['cereale', 'feculent'],
  manioc: ['feculent'], igname: ['feculent'],
  frire: ['cuisson'], griller: ['cuisson'], bouillir: ['cuisson'],
  sucré: ['saveur'], salé: ['saveur'], amer: ['saveur'],
  // colours
  rouge: ['couleur'], bleu: ['couleur'], vert: ['couleur'], jaune: ['couleur'], noir: ['couleur'],
  blanc: ['couleur'], gris: ['couleur'], violet: ['couleur'], rose: ['couleur', 'fleur'],
  hibiscus: ['fleur'], jasmin: ['fleur'],
  // body, family
  main: ['corps'], pied: ['corps'], tête: ['corps'],
  père: ['famille'], oncle: ['famille'], cousin: ['famille'],
  // animals
  poule: ['ferme', 'oiseau'], vache: ['ferme'], chèvre: ['ferme'], âne: ['ferme'], mouton: ['ferme'],
  coq: ['ferme', 'oiseau'], aigle: ['oiseau'], hibou: ['oiseau'], perroquet: ['oiseau'],
  lion: ['sauvage'], girafe: ['sauvage'], zèbre: ['sauvage'], éléphant: ['sauvage'],
  crocodile: ['sauvage'], gazelle: ['sauvage'], singe: ['sauvage'], léopard: ['sauvage'], buffle: ['sauvage'],
  fourmi: ['insecte'], abeille: ['insecte'], moustique: ['insecte'], termite: ['insecte'],
  criquet: ['insecte'], mouche: ['insecte'],
  thon: ['poisson'], sardine: ['poisson'], carpe: ['poisson'],
  // nature
  baobab: ['arbre'], palmier: ['arbre'], manguier: ['arbre'], cocotier: ['arbre'],
  racine: ['plante'], tige: ['plante'], graine: ['plante'], feuille: ['plante', 'cartable'],
  pluie: ['meteo'], vent: ['meteo'], orage: ['meteo'], brume: ['meteo'], soleil: ['meteo', 'ciel'],
  lune: ['ciel'], étoile: ['ciel'],
  vallée: ['relief'], falaise: ['relief'], colline: ['relief'],
  fleuve: ['eau'], lac: ['eau'], mare: ['eau'],
  matin: ['moment'], midi: ['moment'], soir: ['moment'],
  lundi: ['jour'], mardi: ['jour'], samedi: ['jour'],
  // drinks
  eau: ['boisson'], lait: ['boisson'], jus: ['boisson'], thé: ['boisson'], café: ['boisson'], soda: ['boisson'],
  // transport
  taxi: ['transp'], bus: ['transp'], train: ['transp'], moto: ['transp'], pirogue: ['transp'], avion: ['transp'],
  moteur: ['vehicule'], volant: ['vehicule'], frein: ['vehicule'], batterie: ['percu', 'instru', 'vehicule'],
  // jobs
  médecin: ['metier'], boulanger: ['metier'], chauffeur: ['metier'], tailleur: ['metier'],
  maçon: ['metier'], pêcheur: ['metier'], gardien: ['metier', 'foot'],
  // clothes
  pagne: ['habit'], robe: ['habit'], chemise: ['habit'], boubou: ['habit'], jupe: ['habit'], pantalon: ['habit'],
  foulard: ['habit', 'coiffe'], chapeau: ['coiffe'], casquette: ['coiffe'],
  sandale: ['chaussure'], botte: ['chaussure'], basket: ['chaussure', 'sport'],
  // house and school
  salon: ['piece'], chambre: ['piece'], cuisine: ['piece'], pièce: ['piece', 'argent'],
  toit: ['partie'], mur: ['partie'], porte: ['partie'],
  lit: ['meuble'], chaise: ['meuble'], armoire: ['meuble'], tabouret: ['meuble'], banc: ['meuble', 'classe'],
  table: ['meuble', 'classe'], tableau: ['classe'], craie: ['classe'],
  cahier: ['cartable'], stylo: ['cartable'], gomme: ['cartable'], crayon: ['cartable'],
  maths: ['matiere'], dessin: ['matiere'], histoire: ['matiere'],
  marmite: ['ustensile'], cuillère: ['ustensile'], assiette: ['ustensile'],
  // market, money, tools
  billet: ['argent'], monnaie: ['argent'],
  kilo: ['mesure'], litre: ['mesure'], mètre: ['mesure'], balance: ['mesure', 'marche'],
  étal: ['marche'], panier: ['marche'],
  houe: ['champ'], machette: ['champ'], râteau: ['champ'], marteau: ['bricol'], scie: ['bricol'], pelle: ['champ', 'bricol'],
  // sport and music
  foot: ['sport'], judo: ['sport'], boxe: ['sport'], natation: ['sport'], course: ['sport'], lutte: ['sport'],
  penalty: ['foot'], tir: ['foot'], corner: ['foot'], but: ['foot'], arbitre: ['foot'], ballon: ['materiel', 'foot'],
  raquette: ['materiel'], corde: ['materiel'], haltère: ['materiel'],
  kora: ['instru', 'corde'], guitare: ['instru', 'corde'], violon: ['instru', 'corde'],
  flûte: ['instru', 'souffle'], trompette: ['instru', 'souffle'], sifflet: ['souffle', 'foot'],
  djembé: ['instru', 'percu'], tambour: ['instru', 'percu'], balafon: ['instru', 'percu'], cymbale: ['instru', 'percu'],
};

const GRIDS = [
  // 1-5: four plain families, no word fits two of them
  [['fruit', ['mangue', 'banane', 'papaye']], ['couleur', ['rouge', 'bleu', 'vert']], ['corps', ['main', 'pied', 'tête']], ['ferme', ['poule', 'vache', 'chèvre']]],
  [['transp', ['taxi', 'bus', 'train']], ['legume', ['carotte', 'oignon', 'chou']], ['cartable', ['cahier', 'stylo', 'gomme']], ['meuble', ['lit', 'chaise', 'armoire']]],
  [['boisson', ['eau', 'lait', 'jus']], ['sport', ['foot', 'judo', 'boxe']], ['instru', ['kora', 'flûte', 'guitare']], ['meteo', ['pluie', 'vent', 'orage']]],
  [['metier', ['médecin', 'boulanger', 'chauffeur']], ['sauvage', ['lion', 'girafe', 'zèbre']], ['habit', ['pagne', 'robe', 'chemise']], ['partie', ['toit', 'mur', 'porte']]],
  [['famille', ['père', 'oncle', 'cousin']], ['arbre', ['baobab', 'palmier', 'manguier']], ['ustensile', ['marmite', 'cuillère', 'assiette']], ['insecte', ['fourmi', 'abeille', 'moustique']]],
  // 6-11: one word that could go elsewhere
  [['fruit', ['ananas', 'goyave', 'orange']], ['couleur', ['jaune', 'noir', 'blanc']], ['sport', ['natation', 'course', 'lutte']], ['poisson', ['thon', 'sardine', 'carpe']]],
  [['argent', ['billet', 'monnaie', 'pièce']], ['piece', ['salon', 'chambre', 'cuisine']], ['percu', ['djembé', 'tambour', 'balafon']], ['matiere', ['maths', 'dessin', 'histoire']]],
  [['ferme', ['vache', 'âne', 'mouton']], ['oiseau', ['aigle', 'perroquet', 'coq']], ['boisson', ['thé', 'café', 'soda']], ['saveur', ['sucré', 'salé', 'amer']]],
  [['classe', ['tableau', 'craie', 'banc']], ['meuble', ['lit', 'armoire', 'tabouret']], ['transp', ['moto', 'pirogue', 'avion']], ['metier', ['tailleur', 'maçon', 'pêcheur']]],
  [['epice', ['sel', 'poivre', 'gingembre']], ['legume', ['gombo', 'aubergine', 'piment']], ['cereale', ['riz', 'mil', 'maïs']], ['cuisson', ['frire', 'griller', 'bouillir']]],
  [['couleur', ['noir', 'gris', 'violet']], ['fleur', ['hibiscus', 'jasmin', 'rose']], ['moment', ['matin', 'midi', 'soir']], ['sauvage', ['éléphant', 'crocodile', 'gazelle']]],
  // 12-17: neighbouring families, one or two traps
  [['ciel', ['lune', 'étoile', 'soleil']], ['meteo', ['pluie', 'orage', 'brume']], ['relief', ['vallée', 'falaise', 'colline']], ['eau', ['fleuve', 'lac', 'mare']]],
  [['souffle', ['trompette', 'flûte', 'sifflet']], ['foot', ['penalty', 'tir', 'corner']], ['arbre', ['baobab', 'manguier', 'cocotier']], ['insecte', ['termite', 'criquet', 'mouche']]],
  [['mesure', ['kilo', 'litre', 'mètre']], ['marche', ['étal', 'panier', 'balance']], ['champ', ['houe', 'machette', 'râteau']], ['bricol', ['marteau', 'scie', 'pelle']]],
  [['coiffe', ['chapeau', 'casquette', 'foulard']], ['habit', ['boubou', 'jupe', 'pantalon']], ['chaussure', ['sandale', 'botte', 'basket']], ['sport', ['judo', 'boxe', 'natation']]],
  [['cartable', ['crayon', 'gomme', 'feuille']], ['plante', ['racine', 'tige', 'graine']], ['oiseau', ['aigle', 'hibou', 'poule']], ['ferme', ['vache', 'chèvre', 'âne']]],
  [['fruit', ['mangue', 'goyave', 'plantain']], ['couleur', ['noir', 'gris', 'orange']], ['feculent', ['manioc', 'igname', 'riz']], ['sauvage', ['singe', 'léopard', 'buffle']]],
  // 18-20: chains of traps
  [['percu', ['djembé', 'cymbale', 'batterie']], ['vehicule', ['moteur', 'volant', 'frein']], ['materiel', ['raquette', 'haltère', 'ballon']], ['foot', ['but', 'arbitre', 'corner']]],
  [['materiel', ['raquette', 'corde', 'ballon']], ['foot', ['penalty', 'corner', 'gardien']], ['metier', ['boulanger', 'maçon', 'pêcheur']], ['jour', ['lundi', 'mardi', 'samedi']]],
  [['fruit', ['mangue', 'goyave', 'orange']], ['couleur', ['noir', 'gris', 'violet']], ['fleur', ['hibiscus', 'jasmin', 'rose']], ['metier', ['tailleur', 'maçon', 'avocat']]],
];

module.exports = { TAGS, WORDS, GRIDS };
