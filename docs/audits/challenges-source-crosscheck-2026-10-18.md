# Challenges LoSP — reprise éditoriale et recoupements de guides (18 octobre 2026)

## Périmètre et méthode

Continuation de la PR [#284](https://github.com/Keryas777/msf/pull/284), déjà fusionnée, **sans reprendre les 117 stratégies recoupées précédemment**. La branche de travail est `feature/challenges-editorial-marvel-church-20261018`.

Une stratégie est liée à **une publication identifiable et une étape donnée**, jamais à une source seulement parce qu'elle parle du même événement. Les recommandations, compositions reconstruites, victoires décrites par un auteur et succès réellement rejoués par LoSP restent distincts. Aucun nom d'auteur, lien de source ni URL externe n'a été ajouté à l'interface joueurs.

**Méthode de lecture et limite majeure :** les walkthroughs Marvel Church sont retrouvés à travers leur **texte indexé par le moteur de recherche** ; l'ouverture directe automatisée reste refusée (HTTP 402). Le marquage `source_text_checked` signifie *rattachement de la version au texte de la mission et recoupement éditorial dans cet index*. Il **ne signifie ni accès direct garanti à l'article intégral, ni visionnage de vidéo, ni combat rejoué par LoSP**. Le drapeau `source_text_read_via_search_index_direct_url_402` est posé sur chacune des versions traitées pendant cette reprise. Les contenus de source incomplets, les membres inférés et les rotations non décrites restent réservés.

## Bilan chiffré exact de cette branche

| Mesure | Nombre |
| --- | ---: |
| Événements | 35 |
| Nœuds / étapes | 338 |
| Stratégies (versions distinctes) | 443 |
| Recoupées avant cette reprise (PR #284) | 117 |
| Recoupées dans cette reprise | 171 |
| Total classé `source_text_checked` | 288 |
| Encore `needs_source_audit` | 155 |
| Références au catalogue des sources | 57 |

Les 171 recoupements correspondent à des **versions héritées** ; aucune stratégie supplémentaire n'a été créée, et les 117 de la PR #284 restent présentes.

## Versions héritées traitées

| Événement | Versions recoupées |
| --- | ---: |
| `spider-descent` | 40 |
| `blade` | 24 |
| `kyln-whiplash` | 20 |
| `fear` | 20 |
| `kyln-polarity` | 18 |
| `storm` | 12 |
| `war` | 12 |
| `scorpion-breaker` | 10 |
| `invasion-quasar` | 10 |
| `kyln-blazes` | 5 |

### Sources utilisées et portée

- [Marvel Church — Code Whiplash](https://www.marvel.church/escape-from-kyln-code-whiplash/) : cellules 1–20.
- [Marvel Church — Code Blazes](https://www.marvel.church/escape-from-kyln-code-blazes/) : cellules 1–5 ; **règle des 3 personnages contredite par des compositions recommandées à 5**. Aucun trio non mentionné n'a été inventé.
- [Marvel Church — Polarity Shift](https://www.marvel.church/escape-from-kyln/) : cellules 1–18 ; 1–2 n'ont pas de trio identifiable ; 5–8 nomment des familles et non toujours leurs trois membres ; contradictions d'étoiles pour 15–16.
- [Marvel Church — Blade Tower](https://www.marvel.church/mighty-tower-blade/) : 24 étages hérités, distincts des versions Rayge ajoutées dans #284.
- [Marvel Church — Spider-Man Tower](https://www.marvel.church/spider-man-tower-descent/) : étages 1–40 ; compositions incomplètes traitées comme telles.
- [Marvel Church — Fear Tower](https://www.marvel.church/fear-tower/) : étages 1–20 ; versions Rayge/FullMetalCOS de #284 laissées indépendantes.
- [Marvel Church — Storm Tower](https://www.marvel.church/mighty-tower-storm/) : étages 1–12 ; Maudits + Knull reste une sélection de membres inférée.
- [Marvel Church — War Tower](https://www.marvel.church/war-tower/) : 12 cellules ; nouvelle entrée interne `marvel-war` ajoutée au registre.
- [Marvel Church — Invasion Quasar](https://www.marvel.church/invasion-event-quasar/) : missions 1–10, difficulté 10.
- [Marvel Church — Breaker Scorpion](https://www.marvel.church/breaker-event-scorpion/) : missions 1–10, difficulté 4 Omega ; une composition exacte à cinq reste à confirmer dans le texte.

## Corrections éditoriales apportées (sans modifications de la page elle-même)

1. **Fear Tower étage 11** : Thunderbolts + Méphisto. Les cinq anciens portraits Thunderbolts étaient trompeurs : l'article ne nomme pas le remplacement. Seul Méphisto reste illustré jusqu'à confirmation d'une composition complète.
2. **Spider-Man Tower étage 13** : même correction pour Nightstalkers + Méphisto ; ne pas afficher abusivement cinq Nightstalkers sans Méphisto.
3. **Spider-Man Tower étage 10** : la variante réellement expliquée par le guide emploie **Jean Grey à la place de Spider-Woman (Julia)**. Portrait corrigé.
4. **Spider-Man Tower étage 19** : priorité du guide = **Surfer (Briseur)**, et non Blue Marvel. Texte corrigé.
5. **Spider-Man Tower étages 7, 8, 14** : les formations décrites n'énumèrent pas tous les personnages / remplacements ; les portraits incomplets et les avertissements conservent cette incertitude.
6. **Blade Tour, missions 2–6** : précisions d'ouverture et de cibles à partir des passages du guide. Certaines autres rotations restent non documentées.
7. **Code Blazes cellules 2 et 4** : consignes détaillées recoupées, mais taille d'équipe toujours **non résolue**.
8. **Invasion Quasar mission 10** : charges du Chevalier noir et dernière vague de Méphisto précisées.
9. **Breaker Scorpion** : distinction entre les conseils alternatifs, l'ordre des tours et les formations directement rapportées.

## Ce qui reste à auditer — 155 anciennes versions

| Événement | Nombre |
| --- | ---: |
| `surfer-breaker` | 10 |
| `magik-breaker` | 10 |
| `old-man-logan` | 10 |
| `green-goblin` | 10 |
| `black-cat` | 10 |
| `nova` | 10 |
| `invasion-blastaar` | 10 |
| `target-blue-marvel` | 10 |
| `scourge-famine` | 10 |
| `scourge-pestilence` | 10 |
| `scourge-war` | 10 |
| `scourge-death` | 10 |
| `apocalypse-saga` | 9 |
| `dd9` | 8 |
| `dd8` | 5 |
| `finding-xavier` | 5 |
| `shadow-king` | 2 |
| `dd1` | 1 |
| `dd2` | 1 |
| `dd3` | 1 |
| `dd4` | 1 |
| `dd5` | 1 |
| `dd7` | 1 |

### Priorités et blocages

- **Invasion Blastaar (10 versions)** : la page annonce notamment *Hellfire Club + Quasar* pour certaines missions alors que des portraits hérités présentent d'autres compositions. **Ne pas rattacher arbitrairement** sans établir la variante exacte et la période de l'événement.
- **Surfer / Magik Breaker, OML, Goblin, Black Cat, Nova, Invasions** : obtenir une source de difficulté et de nœud exacts ; les guides transversaux ne suffisent pas.
- **DD1–DD9** : certaines anciennes propositions sont des conseils d'investissement ou des reconstitutions, non des combats relatés.
- **Scourges (40 versions), Apocalypse Saga (9)** : rechercher des guides mission-spécifiques et distinguer les règles historiques des éditions postérieures.
- **Shadow King (2 alternatives)** : leurs cinq personnages ont été reconstruits à partir d'options, sans victoire à ces formations documentée ; la version principale a déjà été vérifiée par PR #284.
- **Vidéos / MSF Base** : aucune nouvelle transcription ni victoire communautaire indépendante certifiée. Sources inaccessibles ou chargées dynamiquement à traiter sans extrapolation.

## Contrôles effectués

- JSON des stratégies et sources analysables ; 443 versions préservées.
- 35 événements / 338 étapes, identifiants de stratégies uniques et étapes existantes.
- Chaque `provenance.sourceIds` correspond à une entrée existante du catalogue, chaque fiche vérifiée dispose d'une source ; aucune version encore en attente ne revendique une source certaine.
- Aucun personnage invalide ou non jouable dans les 443 `characters`; nouveaux portraits JeanGrey, Mephisto, LivingMummy et JeffTheLandShark présents et jouables.
- Aucun tableau de portraits contenant plus de cinq personnages.
- `docs/challenges.js` ne télécharge pas `challenge-guide-sources.json` et n'injecte pas d'URL Marvel Church ; structure UI inchangée.
- **Non exécutés** : simulation de bataille, intégralité des vidéos, tests visuels mobiles réels iOS Safari/Android/Discord/PWA ; comportement du JS non modifié dans cette branche.

## Livraison

Uniquement `docs/data/challenge-strategies.json`, `docs/data/challenge-guide-sources.json` et ce rapport sont modifiés / créés. Aucun changement aux workflows, au service worker, à la page d'accueil, au JS de Challenges ou à la navigation. PR à relire avant fusion, notamment les compositions partielles et la distinction *texte indexé* versus *page directement consultée*.
