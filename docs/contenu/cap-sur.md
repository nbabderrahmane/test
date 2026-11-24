# cap-sur (Girouette) : contenu

> **À valider par un humain avant publication.** Les coordonnées ont été écrites de mémoire (une décimale, soit ~10 km de précision) et n'ont été vérifiées contre aucune source externe.

Source de vérité : `tools/cap-sur/cities.txt` et `tools/cap-sur/levels.txt` ; `node tools/cap-sur/build.js` régénère le jeu et cette fiche.

## Règles de contenu

- 123 villes d'Afrique, avec pays, latitude et longitude (degrés décimaux, une décimale).
- Aucune ville de territoire au statut disputé. Aucune ville de territoire d'outre-mer d'un autre continent.
- Pas de carte, pas de frontière dessinée. Noms de pays en français d'usage courant.
- Distance : formule de haversine (rayon 6371 km), arrondie au km. Direction : 8 flèches (nord, nord-est, est, sud-est, sud, sud-ouest, ouest, nord-ouest) depuis la ville proposée vers la ville à trouver.
- Proximité : 100 % si c'est la bonne ville, sinon `100 × (1 − distance / 9000 km)` arrondi, borné à 0-99 %.

## Les 20 niveaux (question : « Quelle est cette ville ? » ; réponse)

| Niveau | Réponse | Pays | Type | Latitude | Longitude |
|---|---|---|---|---|---|
| 1 | Nairobi | Kenya | capitale | -1.3 | 36.8 |
| 2 | Dakar | Sénégal | capitale | 14.7 | -17.5 |
| 3 | Le Caire | Égypte | capitale | 30.0 | 31.2 |
| 4 | Alger | Algérie | capitale | 36.8 | 3.1 |
| 5 | Kinshasa | RD Congo | capitale | -4.3 | 15.3 |
| 6 | Windhoek | Namibie | capitale | -22.6 | 17.1 |
| 7 | Niamey | Niger | capitale | 13.5 | 2.1 |
| 8 | Lilongwe | Malawi | capitale | -14.0 | 33.8 |
| 9 | Casablanca | Maroc | grande ville | 33.6 | -7.6 |
| 10 | Lagos | Nigeria | grande ville | 6.5 | 3.4 |
| 11 | Le Cap | Afrique du Sud | grande ville | -33.9 | 18.4 |
| 12 | Douala | Cameroun | grande ville | 4.1 | 9.7 |
| 13 | Dar es Salaam | Tanzanie | grande ville | -6.8 | 39.3 |
| 14 | Alexandrie | Égypte | grande ville | 31.2 | 29.9 |
| 15 | Kumasi | Ghana | grande ville | 6.7 | -1.6 |
| 16 | Lubumbashi | RD Congo | grande ville | -11.7 | 27.5 |
| 17 | Marrakech | Maroc | grande ville | 31.6 | -8.0 |
| 18 | Durban | Afrique du Sud | grande ville | -29.9 | 31.0 |
| 19 | Bobo-Dioulasso | Burkina Faso | grande ville | 11.2 | -4.3 |
| 20 | Toamasina | Madagascar | grande ville | -18.1 | 49.4 |

## Les 123 villes proposées (saisie et suggestions)

| Ville | Pays | Latitude | Longitude | Capitale |
|---|---|---|---|---|
| Alger | Algérie | 36.8 | 3.1 | oui |
| Luanda | Angola | -8.8 | 13.2 | oui |
| Porto-Novo | Bénin | 6.5 | 2.6 | oui |
| Gaborone | Botswana | -24.7 | 25.9 | oui |
| Ouagadougou | Burkina Faso | 12.4 | -1.5 | oui |
| Yaoundé | Cameroun | 3.9 | 11.5 | oui |
| Praia | Cap-Vert | 14.9 | -23.5 | oui |
| Bangui | Centrafrique | 4.4 | 18.6 | oui |
| N'Djamena | Tchad | 12.1 | 15.0 | oui |
| Moroni | Comores | -11.7 | 43.3 | oui |
| Brazzaville | Congo | -4.3 | 15.3 | oui |
| Kinshasa | RD Congo | -4.3 | 15.3 | oui |
| Yamoussoukro | Côte d'Ivoire | 6.8 | -5.3 | oui |
| Djibouti | Djibouti | 11.6 | 43.1 | oui |
| Le Caire | Égypte | 30.0 | 31.2 | oui |
| Malabo | Guinée équatoriale | 3.8 | 8.8 | oui |
| Asmara | Érythrée | 15.3 | 38.9 | oui |
| Addis-Abeba | Éthiopie | 9.0 | 38.7 | oui |
| Libreville | Gabon | 0.4 | 9.5 | oui |
| Banjul | Gambie | 13.5 | -16.6 | oui |
| Accra | Ghana | 5.6 | -0.2 | oui |
| Conakry | Guinée | 9.5 | -13.7 | oui |
| Bissau | Guinée-Bissau | 11.9 | -15.6 | oui |
| Nairobi | Kenya | -1.3 | 36.8 | oui |
| Maseru | Lesotho | -29.3 | 27.5 | oui |
| Monrovia | Libéria | 6.3 | -10.8 | oui |
| Tripoli | Libye | 32.9 | 13.2 | oui |
| Antananarivo | Madagascar | -18.9 | 47.5 | oui |
| Lilongwe | Malawi | -14.0 | 33.8 | oui |
| Bamako | Mali | 12.6 | -8.0 | oui |
| Nouakchott | Mauritanie | 18.1 | -15.9 | oui |
| Port-Louis | Maurice | -20.2 | 57.5 | oui |
| Rabat | Maroc | 34.0 | -6.8 | oui |
| Maputo | Mozambique | -26.0 | 32.6 | oui |
| Windhoek | Namibie | -22.6 | 17.1 | oui |
| Niamey | Niger | 13.5 | 2.1 | oui |
| Abuja | Nigeria | 9.1 | 7.4 | oui |
| Kigali | Rwanda | -1.9 | 30.1 | oui |
| Dakar | Sénégal | 14.7 | -17.5 | oui |
| Freetown | Sierra Leone | 8.5 | -13.2 | oui |
| Mogadiscio | Somalie | 2.0 | 45.3 | oui |
| Pretoria | Afrique du Sud | -25.7 | 28.2 | oui |
| Khartoum | Soudan | 15.5 | 32.5 | oui |
| Juba | Soudan du Sud | 4.9 | 31.6 | oui |
| Mbabane | Eswatini | -26.3 | 31.1 | oui |
| Dodoma | Tanzanie | -6.2 | 35.7 | oui |
| Lomé | Togo | 6.1 | 1.2 | oui |
| Tunis | Tunisie | 36.8 | 10.2 | oui |
| Kampala | Ouganda | 0.3 | 32.6 | oui |
| Lusaka | Zambie | -15.4 | 28.3 | oui |
| Harare | Zimbabwe | -17.8 | 31.0 | oui |
| São Tomé | Sao Tomé-et-Principe | 0.3 | 6.7 | oui |
| Victoria | Seychelles | -4.6 | 55.5 | oui |
| Douala | Cameroun | 4.1 | 9.7 |  |
| Maroua | Cameroun | 10.6 | 14.3 |  |
| Garoua | Cameroun | 9.3 | 13.4 |  |
| Sarh | Tchad | 9.1 | 18.4 |  |
| Pointe-Noire | Congo | -4.8 | 11.9 |  |
| Lubumbashi | RD Congo | -11.7 | 27.5 |  |
| Kisangani | RD Congo | 0.5 | 25.2 |  |
| Kananga | RD Congo | -5.9 | 22.4 |  |
| Matadi | RD Congo | -5.8 | 13.5 |  |
| Abidjan | Côte d'Ivoire | 5.3 | -4.0 |  |
| Bouaké | Côte d'Ivoire | 7.7 | -5.0 |  |
| Korhogo | Côte d'Ivoire | 9.5 | -5.6 |  |
| Alexandrie | Égypte | 31.2 | 29.9 |  |
| Assouan | Égypte | 24.1 | 32.9 |  |
| Louxor | Égypte | 25.7 | 32.6 |  |
| Dire Dawa | Éthiopie | 9.6 | 41.9 |  |
| Bahir Dar | Éthiopie | 11.6 | 37.4 |  |
| Port-Gentil | Gabon | -0.7 | 8.8 |  |
| Kumasi | Ghana | 6.7 | -1.6 |  |
| Tamale | Ghana | 9.4 | -0.8 |  |
| Kankan | Guinée | 10.4 | -9.3 |  |
| Mombasa | Kenya | -4.0 | 39.7 |  |
| Kisumu | Kenya | -0.1 | 34.8 |  |
| Toamasina | Madagascar | -18.1 | 49.4 |  |
| Mahajanga | Madagascar | -15.7 | 46.3 |  |
| Blantyre | Malawi | -15.8 | 35.0 |  |
| Tombouctou | Mali | 16.8 | -3.0 |  |
| Kayes | Mali | 14.4 | -11.4 |  |
| Nouadhibou | Mauritanie | 21.0 | -17.0 |  |
| Casablanca | Maroc | 33.6 | -7.6 |  |
| Marrakech | Maroc | 31.6 | -8.0 |  |
| Fès | Maroc | 34.0 | -5.0 |  |
| Tanger | Maroc | 35.8 | -5.8 |  |
| Agadir | Maroc | 30.4 | -9.6 |  |
| Beira | Mozambique | -19.8 | 34.8 |  |
| Nampula | Mozambique | -15.1 | 39.3 |  |
| Zinder | Niger | 13.8 | 9.0 |  |
| Agadez | Niger | 17.0 | 8.0 |  |
| Lagos | Nigeria | 6.5 | 3.4 |  |
| Kano | Nigeria | 12.0 | 8.5 |  |
| Ibadan | Nigeria | 7.4 | 3.9 |  |
| Port Harcourt | Nigeria | 4.8 | 7.0 |  |
| Saint-Louis | Sénégal | 16.0 | -16.5 |  |
| Touba | Sénégal | 14.9 | -15.9 |  |
| Johannesburg | Afrique du Sud | -26.2 | 28.0 |  |
| Le Cap | Afrique du Sud | -33.9 | 18.4 |  |
| Durban | Afrique du Sud | -29.9 | 31.0 |  |
| Bloemfontein | Afrique du Sud | -29.1 | 26.2 |  |
| Port-Soudan | Soudan | 19.6 | 37.2 |  |
| Dar es Salaam | Tanzanie | -6.8 | 39.3 |  |
| Arusha | Tanzanie | -3.4 | 36.7 |  |
| Mwanza | Tanzanie | -2.5 | 32.9 |  |
| Zanzibar | Tanzanie | -6.2 | 39.2 |  |
| Sfax | Tunisie | 34.7 | 10.8 |  |
| Sousse | Tunisie | 35.8 | 10.6 |  |
| Entebbe | Ouganda | 0.1 | 32.5 |  |
| Gulu | Ouganda | 2.8 | 32.3 |  |
| Ndola | Zambie | -13.0 | 28.6 |  |
| Livingstone | Zambie | -17.8 | 25.9 |  |
| Bulawayo | Zimbabwe | -20.2 | 28.6 |  |
| Cotonou | Bénin | 6.4 | 2.4 |  |
| Parakou | Bénin | 9.3 | 2.6 |  |
| Bobo-Dioulasso | Burkina Faso | 11.2 | -4.3 |  |
| Oran | Algérie | 35.7 | -0.6 |  |
| Constantine | Algérie | 36.4 | 6.6 |  |
| Tamanrasset | Algérie | 22.8 | 5.5 |  |
| Ghardaïa | Algérie | 32.5 | 3.7 |  |
| Lobito | Angola | -12.4 | 13.5 |  |
| Huambo | Angola | -12.8 | 15.7 |  |
| Bujumbura | Burundi | -3.4 | 29.4 |  |
