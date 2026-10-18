# Challenges — état d'audit au 19 octobre 2026

**Dépôt :** `Keryas777/msf`  
**PR :** [#296](https://github.com/Keryas777/msf/pull/296)  
**Base :** PR #284 déjà fusionnée

## Bilan depuis #284

| Indicateur | Nombre |
| --- | ---: |
| Événements | 35 |
| Étapes | 338 |
| Versions totales | 443 |
| Recoupées avant #296 | 117 |
| Nouvelles recoupées dans #296 | **314** |
| Total `source_text_checked` | **431** |
| Encore en attente | **12** |

### Méthode et niveau de preuve

- Les sourceIds désignent des publications originales, non les auteurs ou les liens affichés dans l'application.
- Les articles Marvel Church sont lisibles par extraits détaillés de l'**index public de recherche**, mais les ouvertures directes de pages continuent à renvoyer HTTP 402. Le drapeau `source_text_read_via_search_index_direct_url_402` rend cette limite vérifiable.
- `source_text_checked` signifie qu'un extrait identifiant le nœud / la section et le contenu a été retrouvé ; cela **ne garantit jamais une victoire reproduite**, ni que l'auteur a gagné avec cette variante précise.
- Les documents de préparation (`Our Pick`) prouvent seulement une **recommandation de sélection**. Toutes ces fiches portent `recommendation_not_a_proven_clear` ou drapeau équivalent. Ne jamais présenter ces suggestions comme un journal de combat.
- Aucun visionnage intégral de vidéo, simulation de réussite, ou test mobile tactile réel n'a été réalisé.

### Répartition des versions reprises

| Événement | Versions |
| --- | ---: |
| `spider-descent` | 40 |
| `blade` | 24 |
| `kyln-whiplash` | 20 |
| `fear` | 20 |
| `kyln-polarity` | 18 |
| `storm` | 12 |
| `war` | 12 |
| `surfer-breaker` | 10 |
| `scorpion-breaker` | 10 |
| `magik-breaker` | 10 |
| `old-man-logan` | 10 |
| `green-goblin` | 10 |
| `black-cat` | 10 |
| `nova` | 10 |
| `invasion-quasar` | 10 |
| `invasion-blastaar` | 10 |
| `target-blue-marvel` | 10 |
| `scourge-famine` | 10 |
| `scourge-pestilence` | 10 |
| `scourge-war` | 10 |
| `scourge-death` | 10 |
| `apocalypse-saga` | 9 |
| `kyln-blazes` | 5 |
| `dd8` | 5 |
| `finding-xavier` | 5 |
| `dd9` | 4 |

## Nouveaux contrôles du 19 octobre

### Invasion Blastaar (10/10)

- Les missions 3 et 4 contiennent toutes deux le quintette explicite **Blastaar, Mister Fantastic (MCU), Femme invisible (MCU), Franklin, Quasar**, avec une rotation décrite : Franklin/Fléau zombie et Quasar/Hellverine en mission 3 ; Franklin/Phénix et Quasar/Arès en mission 4.
- L'introduction du guide cite une route **Hellfire Club + Quasar** : variante différente, pas une contradiction imposant le rejet des missions 3 et 4.
- En mission 10, l'en-tête source propose une équipe Sinister Six, tandis que son walkthrough décrit réellement quatre Brimstone + Blastaar. La fiche conserve cette contradiction et utilise le déroulement explicitement décrit.

### Finding Xavier (5/5)

Cinq regroupements de personnages `Our Pick` ont été appariés exactement : Ville, Mondial vilains, Mondial héros, Cosmique vilains, Cosmique héros. Il s'agit de **préparation G20 par section**, et non de cinq batailles avec rotations vérifiées.

### DD8 (5/5 versions héritées)

Quintettes nominativement identiques à la publication **Characters for Dark Dimension VIII**, couvrant Ville héros, Ville vilains, Mondial héros, Mondial vilains, Cosmique/Légendaires. Le registre ajoute `marvel-dd8`. Les six autres variantes DD8 avaient déjà été prises en charge avant ce nouveau chantier.

### First Breaker: Magik (10/10)

Les suggestions `Our Pick` correspondent aux 5 portraits de LoSP pour les missions 1–5 (Ville), 6–7 (Mondial) et 8–9 (Cosmique). Mission 10 : **aucun quintette exact ni victoire déclarée dans la source** ; la fiche conserve les portraits vides. Le guide est une préparation Orange Iso-8 niveau 3, pas un journal de victoires. Un mod neutralise les dégâts basés sur le pourcentage de PV max sur 1–3 et 8–10.

### Target: Blue Marvel (10/10)

Correspondance des cinq suggestions des missions 2–5, 6–7 et 8–9 avec `Our Pick` de la source. Mission 1 : reprise conseillée des personnages admissibles ensuite ; mission 10 : plusieurs équipes de la section précédente, sans composition ni rotation uniques. Tous les statuts restent **recommandation non prouvée comme victoire**.

### DD9 (4 nouvelles fiches)

Quatre quintettes `best team (in our opinion)` recoupés exactement dans le guide : Ville, Cosmique, Légendaires, Mythiques. Le choix Mondial LoSP n'est **pas identique** à celui de la publication : Lady Deathstrike est proposée comme alternative, tandis que le quintette principal de la source contient Whiplash. La fiche Mondial reste en attente ; pareil pour la finale et les deux variantes reconstituées.

## Restant à auditer : 12 versions

| Événement | En attente |
| --- | ---: |
| `dd9` | 4 |
| `shadow-king` | 2 |
| `dd1` | 1 |
| `dd2` | 1 |
| `dd3` | 1 |
| `dd4` | 1 |
| `dd5` | 1 |
| `dd7` | 1 |

Les causes sont significatives : absence d'équipe nominative dans les anciens DD, synthèses d'origine non rattachées à un combat particulier, neuf nœuds de Saga Apocalypse désormais recoupés séparément (avec réserves selon les sections), variantes Shadow King ou DD9 reconstruites. **Aucune des entrées encore en attente n'a été convertie de force en source vérifiée.**

## Contrôles statiques sur la branche

- 443 IDs uniques, 35 événements, 338 étapes.
- Tous les `eventId/stageId` existent dans `challenges.json`.
- Toutes les références `provenance.sourceIds` sont présentes dans le catalogue éditorial.
- Tous les portraits `characters` correspondent à `player_Character === true` ; aucune équipe de plus de cinq personnages.
- Toute stratégie déclarée `source_text_checked` possède une référence ; aucune `needs_source_audit` n'est faussement attribuée.
- `docs/challenges.js` ne charge pas le catalogue éditorial ni de lien Marvel Church.
- Pas de changements nécessaires aux HTML/CSS/JS ni à `sw.js`.

**Avant fusion :** relire les réserves de qualité et, si possible, tester la page Challenges sur iOS Safari, Android Chrome et le navigateur Discord. Le corpus des 21 restants doit faire l'objet d'une investigation ciblée sans inverser la charge de la preuve.
