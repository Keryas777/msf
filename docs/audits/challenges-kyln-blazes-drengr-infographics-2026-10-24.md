# Challenges LoSP — transcription des infographies DRENGR « Kyln : Code Blazes »

**Date de transcription :** 24 octobre 2026  
**Sources primaires :** trois infographies transmises dans la conversation par l'utilisateur (créateur indiqué : DRENGR).  
**Objet :** retranscrire les groupes de portraits de chaque cellule : encadré de gauche = équipe principale proposée ; encadrés de droite = alternatives indépendantes, un encadré étant une formation, sans les fusionner.

## Inventaire des images reçues

| Semaine | Cellules | Fichier reçu | SHA-256 |
| --- | --- | --- | --- |
| 1 | 1–5 | `Kyln_Code_Blazes_week_1.png` | `571bd0e432b0901f090254bce44ecee3109020e4c6de4994f3f1379bbf706841` |
| 2 | 6–10 | `image.jpeg` | `1f9732f36dd0e2533d0898c3ae6ea12c2b4694977df169d14c3e42239d21fa2e` |
| 3 | 11–15 | `Kyln_Code_Blazes_week_3.jpeg` | `34eca5499387d2b919a274da8fcb84f25edcac0b7e601e786e1aca9d72b14739` |

**Limitation d'archivage :** les originaux ont été fournis en pièces jointes de la conversation ChatGPT ; ce rapport ne prétend pas que les binaires de ces images ont été ajoutés au dépôt. Leurs noms et empreintes permettent de vérifier les mêmes fichiers lors d'une prochaine reprise. URL publique non inventée (`null` dans les nouvelles références de source).

## Méthode et interprétation

- Chaque groupe de cinq visages dessiné par DRENGR est ajouté comme **une version distincte**, avec cinq IDs de portraits officiels du catalogue LoSP : `source_visual_checked`, `kind: recommendation`.
- Aucun ordre de capacités, taux de victoire, difficulté, composition réellement jouée ou valeur d'ISO-8 n'est déduit des images.
- **Attention à la taille d'équipe :** les infographies montrent des groupes de cinq ; un autre guide (Marvel Church) affirme que cet événement autorise **trois combattants**. Les cinq visages ne prouvent donc pas qu'ils peuvent être utilisés simultanément. La contradiction est clairement mentionnée dans `challenges.json` et les nouvelles fiches.
- Les anciennes cinq fiches Marvel Church (cellules 1–5) sont conservées intégralement avec leur propre source et leurs tactiques, sans fusionner le contenu de publications différentes.
- Les cellules 16–20 restent non documentées et doivent demeurer des cases futures.
- **Rectificatif utilisateur du 24 octobre 2026 :** les deux portraits des alternatives **cellule 1, alternative 1**, et **cellule 13, alternative 2**, précédemment rapprochés de `OmegaSentinel`, représentent en réalité **Crécerelle (Kestrel)**, dont l'ID officiel jouable est `Sybil`. Les deux compositions sont corrigées ; le drapeau provisoire est remplacé par `portrait_identity_confirmed_by_user_sybil`. Il ne s'agit pas de `ZombieKestrel`.

## Transcription détaillée par cellule

| Cellule | Proposition principale, de gauche à droite | Autres formations |
| --- | --- | ---: |
| 1 | Thena · Gilgamesh · Circé · Kingo · Ikaris | 3 |
| 2 | Super Skrull · Tornade (Puissante) · Blade (Puissant) · Surfer d'argent (Briseur) · Scorpion (Briseur) | 2 |
| 3 | Super-Bouffon · Spider-Man supérieur · Scorpion · Ultron · Vision | 3 |
| 4 | Iron Fist · Iron Fist (2GM) · Serpent d’acier · Maître de l’épée · Lady Bullseye | 2 |
| 5 | Iron Monger · Whiplash · Ulysses Klaue · Yellowjacket · Crossbones | 1 |
| 6 | Super Skrull · Tornade (Puissante) · Blade (Puissant) · Surfer d'argent (Briseur) · Scorpion (Briseur) | 1 |
| 7 | Thena · Gilgamesh · Circé · Kingo · Ikaris | 1 |
| 8 | Super-Bouffon · Spider-Man supérieur · Scorpion · Ultron · Vision | 1 |
| 9 | Iron Fist · Iron Fist (2GM) · Serpent d’acier · Maître de l’épée · Lady Bullseye | 1 |
| 10 | Iron Monger · Whiplash · Ulysses Klaue · Yellowjacket · Crossbones | 1 |
| 11 | Super-Bouffon · Spider-Man supérieur · Scorpion · Diablo · Solar | 3 |
| 12 | Super Skrull · Tornade (Puissante) · Scorpion (Briseur) · Maestro · Véga | 3 |
| 13 | Iron Fist · Iron Fist (2GM) · Serpent d’acier · Maître de l’épée · Lady Bullseye | 3 |
| 14 | Surfer d'argent (Briseur) · Gilgamesh · Circé · Kingo · Ikaris | 4 |
| 15 | Iron Monger · Whiplash · Ulysses Klaue · Yellowjacket · Crossbones | 1 |

Les -180 formations alternatives sont conservées séparément dans `docs/data/challenge-strategies.json`, par ordre de lecture de l'infographie de gauche à droite puis de haut en bas. Chaque groupe est répertorié avec ses cinq IDs : il ne faut pas fusionner les portraits de cases voisines, ni utiliser `alternatives` pour aplatir plusieurs équipes.

### Contrôles techniques

- Nombre de stratégies précédent : 443. Ajout : **45** (15 principales + 30 alternatives). Total : **488**.
- Nombre de cellules décrites dans `challenges.json` : **15** (sur 20 prévues). Leurs IDs restent des chaînes « 1 » à « 15 ».
- Tous les portraits des nouvelles compositions appartiennent à `msf-characters.json` avec `player_Character === true` ; aucun groupe n'affiche plus de cinq portraits.
- Aucune des cinq anciennes versions Marvel Church n'est effacée.
- Trois entrées de catalogue de sources ajoutées, URLs externes inexistantes non inventées.
- Le statut visuel a une étiquette explicite dans `challenges.js`, différente de la vérification textuelle ; les images ne sont pas converties en victoires.
- La référence JavaScript est actualisée dans `challenges-category.html` (`?v=7`) pour réduire les risques de vieux script en cache iOS.
- Test de syntaxe du JavaScript et vérifications JSON/ID : réalisés. Test tactile réel iOS / Android / PWA : **non effectué**.

## Travail éventuel ultérieur

Confronter la taille d'équipe réellement autorisée à l'interface du jeu, conserver des équipes supplémentaires indépendantes plutôt que les fusionner, et intégrer les cellules 16–20 une fois les visuels disponibles. L'identification des deux portraits Crécerelle (`Sybil`) a été corrigée et confirmée par l'utilisateur.
