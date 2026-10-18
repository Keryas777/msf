# Challenges LoSP — deuxième campagne d'audit éditorial international

**Démarrée le 18 octobre 2026, consolidée le 19 octobre 2026.**  
**Dépôt :** `Keryas777/msf`  
**PR :** [#296](https://github.com/Keryas777/msf/pull/296) — *brouillon non fusionné*  
**Base de travail déjà validée :** PR #284 (117 versions recoupées).

## Objectif, méthode et niveau de preuve

Chaque version est rattachée au texte de **la mission ou de la section concernée** d'une source identifiable. Une proposition de composition, un conseil de préparation, une victoire que rapporte un auteur et un combat effectivement reproduit par LoSP sont **quatre niveaux différents**. Les équipes de différentes personnes ne sont jamais réunies artificiellement.

**Limite importante :** l'ouverture automatisée directe de plusieurs pages Marvel Church renvoie toujours HTTP 402. La reprise s'appuie sur **les passages de leur contenu indexés par le moteur de recherche**, dont les sections de missions et textes détaillés. Cela ne constitue ni un visionnage intégral des vidéos, ni un succès rejoué, ni une certitude sur les cinq portraits lorsque le texte omet des personnages. Les réserves figurent dans `review.flags` et `provenance.sourceEvidence`. Des informations anciennes et des passages `[Archive]` demeurent identifiés comme historiques.

L'interface publique ne montre pas les auteurs ou les URL : les liens restent dans `docs/data/challenge-guide-sources.json`, qui n'est pas chargé par `docs/challenges.js`.

## Bilan des fichiers de la branche

| Indicateur | Valeur |
| --- | ---: |
| Événements conservés | 35 |
| Étapes conservées | 338 |
| Versions de stratégie conservées | 443 |
| Déjà recoupées dans PR #284, conservées à l'identique | 117 |
| **Versions supplémentaires recoupées dans cette campagne** | **314** |
| **Total `source_text_checked`** | **431** |
| **Restant `needs_source_audit`** | **12** |
| Sources répertoriées dans le catalogue éditorial | 59 |

### 314 recoupements nouveaux — répartition

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

### Sources associées

| ID interne | Document | Versions concernées |
| --- | --- | ---: |
| `marvel-spider-descent` | [Tour Spider-Man : Descente](https://www.marvel.church/spider-man-tower-descent/) | 40 |
| `marvel-blade` | [Tour de Blade](https://www.marvel.church/mighty-tower-blade/) | 24 |
| `marvel-kyln-whiplash` | [Kyln : Code Whiplash](https://www.marvel.church/escape-from-kyln-code-whiplash/) | 20 |
| `marvel-fear` | [Tour de la Peur](https://www.marvel.church/fear-tower/) | 20 |
| `marvel-kyln-polarity` | [Kyln : Polarity Shift](https://www.marvel.church/escape-from-kyln/) | 18 |
| `marvel-storm` | [Tour de Tornade (Puissante)](https://www.marvel.church/mighty-tower-storm/) | 12 |
| `marvel-war` | [Tour de Guerre — guide des 12 cellules](https://www.marvel.church/war-tower/) | 12 |
| `marvel-surfer` | [Breaker : Surfer d’argent](https://www.marvel.church/breaker-event-silver-surfer/) | 10 |
| `marvel-scorpion` | [Breaker : Scorpion](https://www.marvel.church/breaker-event-scorpion/) | 10 |
| `marvel-magik` | [First Breaker: Magik — préparation Orange Iso-8](https://www.marvel.church/first-breaker-magik/) | 10 |
| `marvel-oml` | [Épreuves d’Old Man Logan](https://www.marvel.church/old-man-logan-trials/) | 10 |
| `marvel-goblin` | [Épreuves du Bouffon vert (Classique)](https://www.marvel.church/green-goblin-classic-trials/) | 10 |
| `marvel-black-cat` | [Épreuves de Black Cat](https://www.marvel.church/black-cat-trials/) | 10 |
| `marvel-nova` | [Épreuves de Nova](https://www.marvel.church/nova-trials/) | 10 |
| `marvel-quasar` | [Invasion : Quasar](https://www.marvel.church/invasion-event-quasar/) | 10 |
| `marvel-blastaar` | [Invasion : Blastaar](https://www.marvel.church/invasion-event-blastaar/) | 10 |
| `marvel-blue-marvel` | [Target : Blue Marvel](https://www.marvel.church/target-blue-marvel/) | 10 |
| `famine-scourge` | [Fléau Famine — Malicia](https://www.marvel.church/best-team-for-famine-scourge-and-scourge-tier-list/) | 10 |
| `pestilence-scourge` | [Fléau Pestilence — Morgan Le Fay](https://www.marvel.church/pestilence-scourge-full-guide/) | 10 |
| `war-scourge` | [Fléau Guerre — Hulk rouge](https://www.marvel.church/war-scourge-comprehensive-guide-for-reaching-1-5-1-6-million-points-with-an-average-roster/) | 10 |
| `death-scourge` | [Fléau Mort — Archangel](https://www.marvel.church/death-scourge-optimal-clearing-and-scourges/) | 10 |
| `apocalypse-saga` | [Saga Apocalypse — prérequis et progression](https://www.marvel.church/apocalypse-saga/) | 9 |
| `marvel-kyln-blazes` | [Kyln : Code Blazes](https://www.marvel.church/escape-from-kyln-code-blazes/) | 5 |
| `marvel-dd8` | [Personnages pour la Dimension noire VIII](https://www.marvel.church/characters-for-dark-dimension-viii/) | 5 |
| `marvel-finding` | [Finding Xavier : Race to X](https://www.marvel.church/finding-xavier/) | 5 |
| `marvel-dd9` | [Personnages et préparation DD9](https://www.marvel.church/characters-for-dark-dimension-ix/) | 4 |

## Corrections les plus importantes

### Tours

- **Spider-Man Tower 10 :** les cinq portraits correspondent désormais à la variante réellement indiquée avec **Jean Grey** à la place de Spider-Woman (Julia).
- **Spider-Man Tower 19 :** la priorité est **Silver Surfer (Breaker)**, pas Blue Marvel.
- **Fear Tower 11 :** Thunderbolts + Méphisto, mais le Thunderbolt remplacé n'est pas explicitement mentionné. Équipe affichée partielle au lieu de cinq portraits incompatibles.
- **Spider-Man Tower 13 :** Nightstalkers avec Méphisto, membre remplacé non précisé. Même politique de portrait partiel ; d'autres étages conservent leurs réserves sur les substitutions.
- **Blade, Fear, Spider-Man, War, Storm** : recoupements étape par étape ; rotations ajoutées seulement lorsqu'expliquées par la publication ; pas de nouvelles victoires attribuées à tort à LoSP.

### Événements Kyln et Trials

- **Code Blazes :** le document associe une limite de trois personnages à des exemples de composition à cinq. Ne pas transformer ces exemples en trios prétendument vainqueurs.
- **Polarity Shift :** premières cellules sans trio précis, certaines équipes seulement désignées par leur famille, et exigences d'étoiles contradictoires dans les cellules 15–16.
- **Breaker Surfer, Scorpion, Nova, Black Cat, Bouffon vert et Old Man Logan** : séparation des compositions conseillées et des combats explicitement rapportés. Dans Nova, la Kestrel normale du parcours historique n'est jamais remplacée par Kestrel zombie sous prétexte de disposer d'un portrait.
- **Breaker Magik :** recommandations préalables par groupes de missions, **pas** victoires ni rotations vues en vidéo. La mission finale ne possède pas de cinq personnages officiellement établis par cette source.
- **Invasion Blastaar missions 3–4 :** la section propre à chaque mission confirme le groupe avec Blastaar, Quasar et trois Fantastiques MCU ; l'introduction suggère une autre route avec le Club des Damnés. Ces recommandations ne doivent pas être fusionnées. **Mission 10 :** en-tête d'équipe différent du corps du walkthrough, contradiction explicitement conservée.
- **Target Blue Marvel :** « Our Pick » et recommandations d'investissement, séparés des victoires de combat ; boss final à plusieurs équipes sans quintette gagnant unique.

### Scourges, Dimensions noires et Saga d'Apocalypse

- **Fléaux Famine, Pestilence, Guerre, Mort :** distinguer `Original Run` (historique) et `Update` (recommandations ultérieures). Les formations modernes ne sont pas des victoires d'époque.
- **DD8, DD9 et Finding Xavier :** recoupements des sections ou recommandations dont les textes sont identifiables, sans déguiser une liste d'équipement en récit de réussite.
- **Saga d'Apocalypse, nœuds 1–9 :** reprise depuis le guide historique. Nœud 1 : Darkhold ; 2 : Unlimited X-Men ; 3 : Gamma ; 4 : Death Seed ; 5 : Kestrel normale/Deathpool/Spider-Weaver (Kestrel sans portrait LoSP) ; 6 : quatre portraits plus Kestrel normale ; **7 : équipe complète Hulk, Archangel, Deathpool, Strange (sans cœur), Malicia**, avec indications ISO-8 et cibles ; **8 : quatre Cavaliers plus Apocalypse**, absent des anciens portraits ; 9 : cinq personnages non entièrement explicités dans le texte. Ne pas assimiler ce parcours d'archive au méta actuel.

## 12 versions encore à instruire

| Événement | Versions |
| --- | ---: |
| `dd9` | 4 |
| `shadow-king` | 2 |
| `dd1` | 1 |
| `dd2` | 1 |
| `dd3` | 1 |
| `dd4` | 1 |
| `dd5` | 1 |
| `dd7` | 1 |

Les blocages ne justifient **pas** de modifier arbitrairement le statut :
- **DD1 à DD5 et DD7 :** conseils génériques de préparation et descriptions de sections, sans origine individualisée à une stratégie gagnante.
- **DD9 :** certaines anciennes équipes alternatives ou sections finales ne sont pas explicitement étayées par la combinaison précise de cinq personnages et d'instructions présentes.
- **Shadow King :** deux variantes (missions 2 et 3) sont des reconstructions éditoriales de choix possibles, sans cinq membres joués démontrés.

## Contrôles de non-régression

- Fichiers JSON valides ; 443 IDs de versions conservés et uniques.
- 35 événements / 338 étapes ; chaque version renvoie à une étape existante, chaque `sourceId` à une source connue.
- Aucun tableau de portraits > 5 et aucun portrait non jouable (`player_Character === true`).
- Les 117 versions déjà recoupées dans #284 ont été préservées, et les versions encore non vérifiées n'ont pas été artificiellement promues.
- **Aucun changement aux fichiers HTML, CSS, JavaScript, service worker, GitHub Actions ou page d'accueil.**
- **Non réalisés :** simulation de victoire réelle, visionnage intégral des vidéos et tests tactiles physiques iOS Safari / Android Chrome / navigateur Discord / PWA.

**Décision éditoriale :** conserver les 12 versions en `needs_source_audit` plutôt que d'afficher une certitude fictive. Ne pas fusionner la PR #296 sans relecture des compositions partielles, contradictions et limitations d'accès aux sources.
