'use strict';
/*
 * Source of the 100 questions of "Carton Plein" (slug cinq-sur-cinq): 20 levels x 5 questions.
 * Edit here, then run `node tools/cinq-sur-cinq/build.js` (rewrites the data block of the game
 * and docs/contenu/cinq-sur-cinq.md). a = right answer, w = three wrong ones,
 * c = certainty of the author: 3 = certain, 2 = very sure but worth a quick check.
 */
const L = (theme, qs) => ({ theme, qs });
const Q = (q, a, w, c) => ({ q, a, w, c: c || 3 });

module.exports = [
  L('Les bases', [
    Q('Combien de joueurs une équipe aligne-t-elle sur le terrain, gardien compris ?', '11', ['9', '10', '12']),
    Q('Qui peut toucher le ballon à la main dans sa surface de réparation, pendant le jeu ?', 'Le gardien', ['Le capitaine', 'Le défenseur central', 'L’attaquant']),
    Q('Combien de minutes dure un match, sans prolongation ni temps additionnel ?', '90', ['70', '80', '100']),
    Q('Combien de minutes dure une mi-temps ?', '45', ['30', '40', '60']),
    Q('Quel carton signifie l’expulsion immédiate d’un joueur ?', 'Le rouge', ['Le jaune', 'Le blanc', 'Le noir'])
  ]),
  L('Sur le terrain', [
    Q('À quelle distance du but est tiré un penalty ?', '11 mètres', ['7 mètres', '9 mètres', '14 mètres']),
    Q('Où se joue le coup d’envoi d’un match ?', 'Au centre du terrain', ['Dans la surface de réparation', 'Sur la ligne de touche', 'Près du poteau de corner']),
    Q('Quand le ballon sort sur le côté du terrain, comment le remet-on en jeu ?', 'Par une touche, à la main', ['Par un penalty', 'Par un corner', 'Par un coup de pied de but']),
    Q('Comment appelle-t-on trois buts marqués par un même joueur dans un match ?', 'Un triplé (hat-trick)', ['Un doublé', 'Un quadruplé', 'Un grand chelem']),
    Q('Que porte le capitaine d’une équipe au bras ?', 'Un brassard', ['Un bracelet rouge', 'Un ruban blanc', 'Un filet'])
  ]),
  L('Premiers mondiaux', [
    Q('Quel pays a organisé et gagné la toute première Coupe du monde, en 1930 ?', 'L’Uruguay', ['Le Brésil', 'L’Argentine', 'La France']),
    Q('Combien d’équipes ont joué la première Coupe du monde, en 1930 ?', '13', ['8', '24', '32'], 2),
    Q('Quel fut le premier pays africain à jouer une Coupe du monde, en 1934 ?', 'L’Égypte', ['Le Cameroun', 'Le Ghana', 'L’Algérie']),
    Q('Quel pays a gagné la Coupe du monde en 1934, puis de nouveau en 1938 ?', 'L’Italie', ['Le Brésil', 'L’Uruguay', 'L’Angleterre']),
    Q('Quel nom portait le trophée de la Coupe du monde jusqu’en 1970 ?', 'Coupe Jules-Rimet', ['Coupe Pelé', 'Coupe Henri-Delaunay', 'Coupe des Nations'])
  ]),
  L('Les débuts de la CAN', [
    Q('Quel pays a gagné la toute première Coupe d’Afrique des Nations, en 1957 ?', 'L’Égypte', ['Le Ghana', 'Le Nigeria', 'Le Maroc']),
    Q('Quel pays a gagné la CAN en 1963 puis en 1965 ?', 'Le Ghana', ['Le Cameroun', 'La Tunisie', 'Le Sénégal']),
    Q('Quel pays a gagné la CAN 1970, jouée chez lui ?', 'Le Soudan', ['Le Ghana', 'L’Égypte', 'La Guinée']),
    Q('Quel pays a gagné la CAN 1972, jouée au Cameroun ?', 'Le Congo (Brazzaville)', ['Le Mali', 'Le Nigeria', 'L’Algérie']),
    Q('Quel pays a accueilli la toute première CAN, en 1957 ?', 'Le Soudan', ['Le Maroc', 'Le Nigeria', 'La Côte d’Ivoire'])
  ]),
  L('Arbitre et sanctions', [
    Q('Que siffle l’arbitre après un hors-jeu ?', 'Un coup franc indirect', ['Un penalty', 'Un corner', 'Une touche']),
    Q('Que se passe-t-il quand un joueur reçoit deux cartons jaunes dans le même match ?', 'Il est expulsé', ['Il continue de jouer', 'Il est remplacé par l’arbitre', 'Son équipe perd 1 but']),
    Q('Combien de minutes dure chaque période de prolongation ?', '15', ['5', '10', '20']),
    Q('Combien de tirs tire chaque équipe au début d’une séance de tirs au but ?', '5', ['3', '7', '11']),
    Q('Combien de joueurs une équipe doit-elle avoir au minimum pour que le match continue ?', '7', ['4', '9', '10'], 2)
  ]),
  L('Surnoms de sélections', [
    Q('Quelle sélection est surnommée « les Lions Indomptables » ?', 'Le Cameroun', ['Le Sénégal', 'Le Maroc', 'Le Nigeria']),
    Q('Quelle sélection est surnommée « les Éléphants » ?', 'La Côte d’Ivoire', ['Le Ghana', 'Le Mali', 'Le Gabon']),
    Q('Quelle sélection est surnommée « les Lions de la Teranga » ?', 'Le Sénégal', ['Le Cameroun', 'La Guinée', 'Le Togo']),
    Q('Quelle sélection est surnommée « les Pharaons » ?', 'L’Égypte', ['La Tunisie', 'Le Soudan', 'La Libye']),
    Q('Quelle sélection est surnommée « les Super Eagles » ?', 'Le Nigeria', ['Le Ghana', 'Le Bénin', 'Le Congo'])
  ]),
  L('Mondiaux 1950-1970', [
    Q('Dans quelle ville se trouve le célèbre stade du Maracanã ?', 'Rio de Janeiro', ['São Paulo', 'Brasilia', 'Buenos Aires']),
    Q('Quel pays a gagné la Coupe du monde 1966, jouée chez lui ?', 'L’Angleterre', ['L’Italie', 'Le Brésil', 'La France']),
    Q('À quel âge Pelé a-t-il marqué en finale de la Coupe du monde 1958 ?', '17 ans', ['21 ans', '25 ans', '30 ans']),
    Q('Quel pays a gardé définitivement le trophée Jules-Rimet après sa victoire de 1970 ?', 'Le Brésil', ['L’Italie', 'L’Uruguay', 'L’Angleterre']),
    Q('Combien de buts le Français Just Fontaine a-t-il marqués à la Coupe du monde 1958 ?', '13', ['7', '9', '20'])
  ]),
  L('Records et légendes', [
    Q('Quel Camerounais est devenu en 1994 le plus vieux buteur de l’histoire de la Coupe du monde ?', 'Roger Milla', ['Samuel Eto’o', 'Thomas N’Kono', 'Rigobert Song'], 2),
    Q('Quel joueur brésilien est célèbre pour avoir gagné trois Coupes du monde (1958, 1962, 1970) ?', 'Pelé', ['Garrincha', 'Zico', 'Romário']),
    Q('Quel joueur portugais, né au Mozambique, fut meilleur buteur de la Coupe du monde 1966 ?', 'Eusébio', ['Cristiano Ronaldo', 'Luís Figo', 'Pauleta']),
    Q('Qui a reçu le tout premier Ballon d’or, en 1956 ?', 'Stanley Matthews', ['Pelé', 'Lev Yachine', 'Johan Cruyff']),
    Q('Quel gardien de but a reçu le Ballon d’or en 1963 ?', 'Lev Yachine', ['Gianluigi Buffon', 'Gordon Banks', 'Sepp Maier'])
  ]),
  L('Stades et clubs d’Europe', [
    Q('Dans quelle ville se trouve le stade Santiago-Bernabéu ?', 'Madrid', ['Barcelone', 'Séville', 'Valence']),
    Q('Quel club joue à Old Trafford ?', 'Manchester United', ['Liverpool', 'Arsenal', 'Chelsea']),
    Q('Quel club joue à Anfield ?', 'Liverpool', ['Manchester United', 'Tottenham', 'Chelsea']),
    Q('Dans quelle ville se trouve le stade Vélodrome ?', 'Marseille', ['Lyon', 'Lille', 'Bordeaux']),
    Q('Quel club a gagné les cinq premières Coupes d’Europe des clubs champions (1956 à 1960) ?', 'Le Real Madrid', ['Le FC Barcelone', 'Le Milan AC', 'Le Bayern Munich'])
  ]),
  L('CAN 1968-1986', [
    Q('Quel pays a gagné la CAN en 1968 puis en 1974 (alors appelé Congo-Kinshasa puis Zaïre) ?', 'La RD Congo', ['Le Congo (Brazzaville)', 'La Zambie', 'Le Gabon']),
    Q('Quel pays a gagné la CAN 1976 ?', 'Le Maroc', ['La Tunisie', 'L’Algérie', 'Le Sénégal']),
    Q('Quel pays a gagné la CAN 1980, jouée chez lui à Lagos ?', 'Le Nigeria', ['Le Ghana', 'Le Cameroun', 'L’Égypte']),
    Q('Quel pays a gagné la CAN 1984, jouée en Côte d’Ivoire ?', 'Le Cameroun', ['La Côte d’Ivoire', 'Le Sénégal', 'Le Mali']),
    Q('Quel pays a gagné la CAN 1986, jouée chez lui ?', 'L’Égypte', ['Le Maroc', 'La Tunisie', 'Le Soudan'])
  ]),
  L('Règles : cas particuliers', [
    Q('Quel autre nom donne-t-on au penalty ?', 'Coup de pied de réparation', ['Coup de pied de but', 'Coup de pied de coin', 'Coup franc indirect']),
    Q('Un défenseur passe volontairement le ballon du pied à son gardien. Que ne peut pas faire le gardien ?', 'Le prendre à la main', ['Le dégager du pied', 'Le passer de la tête', 'Courir avec le ballon']),
    Q('Le ballon sort derrière la ligne de but, touché en dernier par un défenseur. Que siffle l’arbitre ?', 'Un corner', ['Un penalty', 'Une touche', 'Un coup de pied de but']),
    Q('Le ballon sort derrière la ligne de but, touché en dernier par un attaquant. Que siffle l’arbitre ?', 'Un coup de pied de but', ['Un corner', 'Un penalty', 'Un coup franc direct']),
    Q('À quelle distance minimale du ballon doit se tenir le mur lors d’un coup franc ?', '9,15 mètres', ['3 mètres', '5 mètres', '20 mètres'])
  ]),
  L('Légendes du ballon', [
    Q('Quel est le vrai nom de Pelé ?', 'Edson Arantes do Nascimento', ['Diego Armando Maradona', 'Manuel dos Santos', 'Arthur Antunes Coimbra']),
    Q('Quel Allemand surnommé « le Kaiser » a gagné la Coupe du monde comme joueur puis comme entraîneur ?', 'Franz Beckenbauer', ['Gerd Müller', 'Jürgen Klinsmann', 'Lothar Matthäus']),
    Q('En 1995, quel Africain a reçu le Ballon d’or ?', 'George Weah', ['Roger Milla', 'Abedi Pelé', 'Samuel Eto’o']),
    Q('Avec quel club italien Diego Maradona a-t-il gagné deux titres de champion, en 1987 et 1990 ?', 'Naples', ['Milan', 'Turin', 'Rome']),
    Q('Combien de Ballons d’or Michel Platini a-t-il gagnés, de 1983 à 1985 ?', '3', ['1', '2', '5'])
  ]),
  L('Mondiaux 1974-1998', [
    Q('Quel pays a gagné la Coupe du monde 1978, jouée chez lui ?', 'L’Argentine', ['Le Brésil', 'Les Pays-Bas', 'L’Italie']),
    Q('Quel pays a gagné la Coupe du monde 1982, jouée en Espagne ?', 'L’Italie', ['La France', 'Le Brésil', 'L’Angleterre']),
    Q('Quel pays a organisé la Coupe du monde en 1970 et de nouveau en 1986 ?', 'Le Mexique', ['Le Brésil', 'L’Espagne', 'L’Argentine']),
    Q('Quel pays a organisé la Coupe du monde 1994 ?', 'Les États-Unis', ['Le Japon', 'Le Mexique', 'L’Afrique du Sud']),
    Q('Quel joueur a marqué deux buts de la tête en finale de la Coupe du monde 1998 ?', 'Zinédine Zidane', ['Thierry Henry', 'Ronaldo', 'Michel Platini'])
  ]),
  L('Clubs d’Afrique', [
    Q('Quel club guinéen a gagné trois fois la Coupe d’Afrique des clubs champions dans les années 1970 ?', 'Hafia FC', ['Étoile du Sahel', 'Canon de Yaoundé', 'Asante Kotoko'], 2),
    Q('Dans quelle ville de RD Congo joue le club TP Mazembe ?', 'Lubumbashi', ['Kinshasa', 'Goma', 'Kisangani']),
    Q('Dans quelle ville joue l’Espérance sportive, grand club tunisien ?', 'Tunis', ['Alger', 'Casablanca', 'Tripoli']),
    Q('Dans quelle ville se trouvent Al Ahly et Zamalek, deux grands clubs rivaux ?', 'Le Caire', ['Alexandrie', 'Khartoum', 'Tunis']),
    Q('Dans quelle ville joue l’ASEC Mimosas, grand club ivoirien ?', 'Abidjan', ['Accra', 'Dakar', 'Bamako'])
  ]),
  L('Surnoms de sélections 2', [
    Q('Quelle sélection est surnommée « les Fennecs » ?', 'L’Algérie', ['Le Maroc', 'La Tunisie', 'La Libye']),
    Q('Quelle sélection est surnommée « les Aigles de Carthage » ?', 'La Tunisie', ['Le Mali', 'Le Maroc', 'L’Algérie']),
    Q('Quelle sélection est surnommée « les Lions de l’Atlas » ?', 'Le Maroc', ['Le Cameroun', 'Le Sénégal', 'La Guinée']),
    Q('Quelle sélection est surnommée « les Black Stars » ?', 'Le Ghana', ['Le Nigeria', 'Le Togo', 'Le Gabon']),
    Q('Quelle sélection est surnommée « les Étalons » ?', 'Le Burkina Faso', ['Le Mali', 'Le Niger', 'La Guinée'])
  ]),
  L('Europe : sélections et clubs', [
    Q('Quel pays a gagné l’Euro 1984, joué chez lui, avec Michel Platini ?', 'La France', ['L’Espagne', 'L’Italie', 'Le Portugal']),
    Q('Quel pays a gagné l’Euro 1992 ?', 'Le Danemark', ['La Suède', 'Les Pays-Bas', 'La France']),
    Q('Quel club français a gagné la Ligue des champions en 1993 ?', 'L’Olympique de Marseille', ['Le Paris Saint-Germain', 'L’AS Monaco', 'Lyon']),
    Q('Quel pays a créé la surprise en gagnant l’Euro 2004 ?', 'La Grèce', ['Le Portugal', 'La Suisse', 'La Pologne']),
    Q('Quel Algérien a marqué du talon en finale de la Coupe d’Europe 1987 avec Porto ?', 'Rabah Madjer', ['Roger Milla', 'Abedi Pelé', 'Salif Keita'], 2)
  ]),
  L('Histoire du football', [
    Q('En quelle année ont été fixées les premières règles modernes du football, en Angleterre ?', '1863', ['1763', '1913', '1953']),
    Q('Dans quelle ville a été fondée la FIFA en 1904 ?', 'Paris', ['Londres', 'Zurich', 'Rome']),
    Q('Quel magazine a créé le Ballon d’or ?', 'France Football', ['Onze Mondial', 'Paris Match', 'Le Monde']),
    Q('Combien d’équipes ont joué la Coupe du monde 1998, pour la première fois à ce nombre ?', '32', ['16', '24', '48']),
    Q('Quels pays ont organisé ensemble la Coupe du monde 2002 ?', 'Le Japon et la Corée du Sud', ['La Chine et le Japon', 'L’Espagne et le Portugal', 'Les États-Unis et le Mexique'])
  ]),
  L('CAN 1990-2012', [
    Q('Quel pays a gagné la CAN 1990, jouée chez lui ?', 'L’Algérie', ['Le Nigeria', 'Le Maroc', 'La Tunisie']),
    Q('Quel pays a gagné sa première CAN en 1992, jouée au Sénégal ?', 'La Côte d’Ivoire', ['Le Ghana', 'Le Sénégal', 'Le Cameroun']),
    Q('Quel pays a gagné la CAN 1996, jouée chez lui ?', 'L’Afrique du Sud', ['Le Nigeria', 'L’Égypte', 'Le Ghana']),
    Q('Quel pays a gagné la CAN en 2000 puis en 2002 ?', 'Le Cameroun', ['L’Égypte', 'Le Sénégal', 'Le Mali']),
    Q('Quel pays a gagné la CAN 2012, jouée au Gabon et en Guinée équatoriale ?', 'La Zambie', ['Le Ghana', 'Le Gabon', 'Le Mali'])
  ]),
  L('L’Afrique au Mondial', [
    Q('Quelle équipe africaine a remporté la première victoire africaine en Coupe du monde, en 1978 ?', 'La Tunisie', ['Le Maroc', 'L’Algérie', 'Le Zaïre'], 2),
    Q('En 1990, quelle équipe africaine a atteint les quarts de finale de la Coupe du monde ?', 'Le Cameroun', ['Le Nigeria', 'L’Algérie', 'Le Maroc']),
    Q('Quel joueur a marqué le seul but du match d’ouverture de la Coupe du monde 2002, pour le Sénégal ?', 'Papa Bouba Diop', ['El Hadji Diouf', 'Henri Camara', 'Khalilou Fadiga'], 2),
    Q('Quel pays a organisé en 2010 la première Coupe du monde sur le sol africain ?', 'L’Afrique du Sud', ['Le Maroc', 'L’Égypte', 'Le Nigeria']),
    Q('Quel pays africain a gagné l’or olympique de football en 1996, à Atlanta ?', 'Le Nigeria', ['Le Ghana', 'Le Cameroun', 'Le Maroc'])
  ]),
  L('La grande finale', [
    Q('Quel joueur a marqué trois buts en finale de la Coupe du monde 1966 ?', 'Geoff Hurst', ['Bobby Charlton', 'Eusébio', 'Franz Beckenbauer']),
    Q('Quel pays a gagné la Coupe du monde 1950, au Brésil ?', 'L’Uruguay', ['Le Brésil', 'L’Argentine', 'L’Italie']),
    Q('Quel pays a gagné la Coupe du monde 1954, en Suisse ?', 'L’Allemagne de l’Ouest', ['L’Italie', 'L’Uruguay', 'Le Brésil']),
    Q('De quelle nationalité était Jules Rimet, le président de la FIFA qui a donné son nom au trophée ?', 'Français', ['Anglais', 'Brésilien', 'Suisse']),
    Q('Quel pays africain a gagné l’or olympique de football en 2000, à Sydney ?', 'Le Cameroun', ['Le Nigeria', 'Le Ghana', 'Le Sénégal'])
  ])
];
