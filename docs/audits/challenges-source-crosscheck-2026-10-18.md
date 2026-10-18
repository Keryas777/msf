# Challenges LoSP — suite de l'audit éditorial (#284)

**Date :** 18 octobre 2026  
**Branche :** `feature/challenges-editorial-marvel-church-20261018`  
**PR d'intégration :** [#296](https://github.com/Keryas777/msf/pull/296) — brouillon, ne pas fusionner avant revue.

## Règles de recoupement et limites

Les 117 stratégies déjà contrôlées par la PR #284 sont conservées sans refaire leur audit. Pour cette reprise, les guides Marvel Church et leurs étapes ont été recherchés dans l'**index public du moteur de recherche** (les pages directes retournent HTTP 402 lors des essais automatisés). Le marqueur `source_text_checked` indique **un rapprochement de la fiche LoSP avec des passages de texte identifiés à l'étape**, pas une lecture vidéo, une victoire reproduite, ni une preuve que les cinq portraits exacts étaient la formation personnellement jouée par l'auteur.

Chaque version reprise possède `source_text_read_via_search_index_direct_url_402`. Des drapeaux supplémentaires précisent « composition conseillée seulement », « famille d'équipe reconstruite », « équipe incomplète », « ancienne victoire historique », « remplacement inconnu », etc.

Les identités des auteurs et leurs liens restent dans `challenge-guide-sources.json` (registre interne éditorial non chargé par la page) ; le contenu destiné au joueur est en français. Aucune URL externe n'a été ajoutée à `challenges.js`.

## Bilan vérifié sur les JSON de cette branche

| Indicateur | Valeur |
| --- | ---: |
| Événements | 35 |
| Étapes | 338 |
| Versions conservées | 443 |
| Recoupements hérités de #284 | 117 |
| Recoupements ajoutés dans cette reprise | **269** |
| Statut `source_text_checked` au total | **386** |
| Statut `needs_source_audit` | **57** |
| Références au registre des sources | 57 |

### 269 versions nouvellement contrôlées, par événement

| Événement | Nombre |
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
| `old-man-logan` | 10 |
| `green-goblin` | 10 |
| `black-cat` | 10 |
| `nova` | 10 |
| `invasion-quasar` | 10 |
| `scourge-famine` | 10 |
| `scourge-pestilence` | 10 |
| `scourge-war` | 10 |
| `scourge-death` | 10 |
| `invasion-blastaar` | 8 |
| `kyln-blazes` | 5 |

### Pages sources internes impliquées

| Référence du registre | Source | Nombre |
| --- | --- | ---: |
| `marvel-kyln-whiplash` | [Kyln : Code Whiplash](https://www.marvel.church/escape-from-kyln-code-whiplash/) | 20 |
| `marvel-kyln-blazes` | [Kyln : Code Blazes](https://www.marvel.church/escape-from-kyln-code-blazes/) | 5 |
| `marvel-kyln-polarity` | [Kyln : Polarity Shift](https://www.marvel.church/escape-from-kyln/) | 18 |
| `marvel-blade` | [Tour de Blade](https://www.marvel.church/mighty-tower-blade/) | 24 |
| `marvel-spider-descent` | [Tour Spider-Man : Descente](https://www.marvel.church/spider-man-tower-descent/) | 40 |
| `marvel-fear` | [Tour de la Peur](https://www.marvel.church/fear-tower/) | 20 |
| `marvel-storm` | [Tour de Tornade (Puissante)](https://www.marvel.church/mighty-tower-storm/) | 12 |
| `marvel-war` | [Tour de Guerre — guide des 12 cellules](https://www.marvel.church/war-tower/) | 12 |
| `marvel-quasar` | [Invasion : Quasar](https://www.marvel.church/invasion-event-quasar/) | 10 |
| `marvel-scorpion` | [Breaker : Scorpion](https://www.marvel.church/breaker-event-scorpion/) | 10 |
| `marvel-surfer` | [Breaker : Surfer d’argent](https://www.marvel.church/breaker-event-silver-surfer/) | 10 |
| `marvel-black-cat` | [Épreuves de Black Cat](https://www.marvel.church/black-cat-trials/) | 10 |
| `marvel-goblin` | [Épreuves du Bouffon vert (Classique)](https://www.marvel.church/green-goblin-classic-trials/) | 10 |
| `marvel-nova` | [Épreuves de Nova](https://www.marvel.church/nova-trials/) | 10 |
| `famine-scourge` | [Fléau Famine — Malicia](https://www.marvel.church/best-team-for-famine-scourge-and-scourge-tier-list/) | 10 |
| `pestilence-scourge` | [Fléau Pestilence — Morgan Le Fay](https://www.marvel.church/pestilence-scourge-full-guide/) | 10 |
| `war-scourge` | [Fléau Guerre — Hulk rouge](https://www.marvel.church/war-scourge-comprehensive-guide-for-reaching-1-5-1-6-million-points-with-an-average-roster/) | 10 |
| `death-scourge` | [Fléau Mort — Archangel](https://www.marvel.church/death-scourge-optimal-clearing-and-scourges/) | 10 |
| `marvel-oml` | [Épreuves d’Old Man Logan](https://www.marvel.church/old-man-logan-trials/) | 10 |
| `marvel-blastaar` | [Invasion : Blastaar](https://www.marvel.church/invasion-event-blastaar/) | 8 |

## Corrections et réserves critiques

1. **Kyln Code Blazes :** règle à trois combattants mais recommandations parfois décrites à cinq ; pas de trio inventé, problème explicite sur les cinq cellules.
2. **Kyln Polarity Shift :** cellules 1–2 sans trio exact, cellules 5–8 avec groupes non énumérés, cellules 15–16 avec exigences d'étoiles contradictoires. Aucune déduction présentée comme un test de combat.
3. **Fear Tower 11 :** Thunderbolts + Méphisto, sans identification du Thunderbolt à écarter ; les cinq portraits Thunderbolts d'origine ont été retirés pour ne pas promettre une composition incorrecte.
4. **Spider-Man Tower 7/8/13/14 :** formations de cinq membres non entièrement explicitées. Au 13, Nightstalkers + Méphisto ne peut pas être illustré honnêtement par cinq Nightstalkers sans Méphisto.
5. **Spider-Man Tower 10 :** composition publiée avec **Jean Grey à la place de Spider-Woman (Julia)**, portrait corrigé.
6. **Spider-Man Tower 19 :** la priorité source est **Surfer (Briseur)**, non Blue Marvel ; conseil rectifié.
7. **Tour de Blade :** rotations décrites lorsque la source apporte les actions et cibles, mais avertissements conservés sur les cas non détaillés.
8. **Invasion Quasar 10 :** les dix charges du Chevalier noir et l'apparition finale de Méphisto avec deux Diablo sont précisées.
9. **Scorpion Breaker :** distinguer option proposée et équipe réellement jouée ; composition exacte des cinq du nœud 3 à préciser.
10. **Surfer Breaker 1 :** la formation Odin/Knull/Méphisto/Blastaar/Thunderstrike est un **choix alternatif conseillé**, pas la victoire personnelle documentée avec Guerriers audacieux + Odin.
11. **Nova 5/9 :** la source historique contient Kestrel normale, tandis que Photon est une alternative : ne pas les confondre.
12. **Black Cat :** des équipes affichées sont des recommandations et non la variante exacte jouée par l'auteur ; le cinquième Bagarreur peut dépendre du déblocage préalable de Black Cat.
13. **Bouffon vert classique :** certains personnages proposés sont des substitutions de premier déblocage ; le nœud 10 peut demander deux attaques distinctes.
14. **Fléaux de Famine, Pestilence, Guerre, Mort :** séparation systématique entre **Original Run** et **Update** sur les guides historiques ; les équipes modernes représentent des propositions, pas les victoires enregistrées lors de la première édition. Le manque de portraits Kestrel normale reste explicite.

15. **Old Man Logan :** les dix missions sont reliées aux paragraphes de leur guide ; les conseils concernant les variantes Cabale avec Emma Frost ne sont pas assimilés à un sixième membre.
16. **Invasion Blastaar :** huit missions recoupées. Missions **3 et 4 non attribuées** faute de composition suffisamment concordante. Mission 10 : l'en-tête annonce Blastaar et quatre Sinister Six alors que le déroulement décrit quatre Brimstone et Blastaar ; LoSP suit la description détaillée et signale la contradiction.

## File résiduelle : 57 stratégies sans vérification individuelle suffisante

| Événement | Versions |
| --- | ---: |
| `magik-breaker` | 10 |
| `target-blue-marvel` | 10 |
| `apocalypse-saga` | 9 |
| `dd9` | 8 |
| `dd8` | 5 |
| `finding-xavier` | 5 |
| `shadow-king` | 2 |
| `invasion-blastaar` | 2 |
| `dd1` | 1 |
| `dd2` | 1 |
| `dd3` | 1 |
| `dd4` | 1 |
| `dd5` | 1 |
| `dd7` | 1 |

**Priorités de reprise :**
- **Invasion Blastaar, missions 3 et 4 uniquement :** retrouver la formation exacte et son éventuel contexte de variante ; la mission 10 est liée à la source avec contradiction éditoriale explicitée.
- **Breaker Magik (10)** : le guide visible est essentiellement préparatoire, pas un journal de dix victoires confirmées. Ne pas convertir ses suggestions d'Orange ISO-8 en compositions jouées.
- **Target Blue Marvel (10), Finding Xavier (5)** : séparer préparation et témoignages par nœud ; certaines sources concernent des versions antérieures de l'événement.
- **Apocalypse Saga (9) et DD1–DD9 (19)** : obtenir des témoignages de combat exacts sans confondre éligibilité, conseils d'investissement et victoire.
- **Shadow King (2)** : les deux alternatives reconstituées ne sont toujours pas attestées nominativement.

## Vérification technique

Contrôles de structure : JSON valide, 443 IDs de versions sans doublon, 35 événements et 338 étapes, existence de toutes les étapes et de toutes les références de source, aucune équipe > 5, aucun portrait non jouable (catalogue `player_Character`), aucune fiche non auditée prétendant une provenance certaine. Le JS public `docs/challenges.js` ne charge pas `challenge-guide-sources.json`.

**Non vérifiés :** déroulement réel des batailles, intégralité des vidéos, tests tactiles physiques dans Safari iOS / Android Chrome / navigateur Discord / PWA. Aucun JS/CSS/HTML, service worker, workflow ou cache n'a été modifié dans la PR.

Cette PR est une **étape de vérification éditoriale** sur 269 stratégies. **57 restent ouvertes**, et `source_text_checked` ne doit jamais être converti en « victoire garantie » dans l'interface.
