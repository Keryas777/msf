# Migration `health_redistribute` — corpus annoncé 10.6.3

## Résumé

Ce rapport migre vers les sources courantes les résultats des PR #225 et #251. Il ne reprend pas leurs audits : les preuves 10.5.0 restent dans [l’audit historique](health-redistribute-deep-audit-10.5.0.md), et les signatures ambiguës de la nouvelle référence sont enregistrées dans [`health-redistribute-review-ledger-10.6.3.json`](../../data/msf-capabilities/health-redistribute-review-ledger-10.6.3.json).

| Mesure | Corpus courant |
|---|---:|
| Actions `health_redistribute` | 230 |
| Capacités distinctes | 128 |
| Personnages / unités distincts | 81 |
| Actions sans `abilityId` | 26 |
| Comportements identifiés (`resolved=true`) | 211 |
| Comportements partiellement interprétés (`resolved=false`) | 0 |
| Comportements entièrement non résolus | 19 |
| Formules moteur non résolues | 230 |

La répartition des comportements identifiés est : 98 pertes de vie, 103 vols et redistributions de vie, 8 égalisations et 2 transferts entre alliés. Toutes les opérations gardent `percentageBasis: unresolved` et `engineFormula: unresolved`.

## Provenance et statut de version

Le manifeste du dépôt annonce `version: 10_6_3` et `build: 1674780`, mais conserve `versionVerified: false`. Les 11 ressources du catalogue sont attribuées à MagneticZero ; leurs champs `sourceGameVersion` sont nuls et `gameVersionVerified` est faux. Le contrôle local a recalculé taille, MD5 et SHA-256 : 11/11 ressources correspondent à leur manifeste. Cela établit la cohérence interne du jeu de fichiers, pas sa certification comme version officielle 10.6.3. Le statut non vérifié est conservé.

Le corpus historique comparé est celui de la référence 10.5.0 des PR précédentes : 203 actions, 122 capacités, 76 personnages et 23 actions sans `abilityId`. Son audit de provenance n’a pas été recommencé.

## Comparaison des actions

Les correspondances ont été établies par pointeur d’action, identifiant, capacité et JSON brut, sans transfert fondé seulement sur le nom d’un personnage ou d’une capacité.

| Résultat de comparaison | Nombre |
|---|---:|
| Actions historiques retrouvées avec pointeur et JSON brut identiques | 202 |
| Actions historiques modifiées | 1 |
| Nouvelles actions 10.6.3 | 27 |
| Actions disparues | 0 |
| Identifiants d’action et de capacité conservés pour les 203 actions retrouvées | 203 |

L’unique modification concerne `/Data/Oath/special/actions/0`. Son `only_if` passe de `mode: RAID` à une alternative incluant aussi une condition d’attaque en AVA avec au moins deux alliés Nightreaver. Les paramètres de drain et de destination restent présents. La signature 10.5.0 n’a pas été remplacée : une empreinte distincte est ajoutée pour cette variante.

La description française actuellement associée à la capacité dit explicitement que Oath vole 10 % de vie à la cible principale et la redistribue à soi. Cette preuve permet de rétablir la seule assertion de famille `health_steal_redistribute` pour cette signature. Elle ne démontre ni la formule ni l’assiette du pourcentage ; le nouvel enregistrement porte `sourceVersionVerified: false`.

Les 27 nouvelles actions se répartissent ainsi :

| Personnage / unité | Jouabilité | Actions | Interprétation appliquée |
|---|---|---:|---|
| Magik (Breaker) | Jouable | 10 | Perte de vie explicite (`heal_multi: 0`) selon la règle existante |
| PVE_Boss_Destroyer | Technique / non jouable | 10 | Perte de vie explicite selon la règle existante |
| PVE_Executioner_DestroyerBoss | Technique / non jouable | 2 | Perte de vie explicite selon la règle existante |
| PVE_LokiTeen_DestroyerBoss | Technique / non jouable | 1 | Non résolue |
| PVE_Odin_DestroyerBoss | Technique / non jouable | 4 | Non résolues |

Les 22 classifications de perte de vie réutilisent la règle de paramètres explicites déjà validée ; elles ne créent aucune nouvelle catégorie. Les unités PvE restent dans le corpus et sont séparées des personnages jouables.

Pointeurs des 27 nouvelles actions :

- Magik (Breaker) : `/Data/MagikBreaker/ultimate/actions/{3,4,5,6,7,14,15,16,17,18}`.
- PVE_Boss_Destroyer : `/Data/PVE_Boss_Destroyer/basic/actions/{0,1,3,5,7,9,11,13,15}` et `/Data/PVE_Boss_Destroyer/safety/actions/0`.
- PVE_Executioner_DestroyerBoss : `/Data/PVE_Executioner_DestroyerBoss/special/actions/{4,8}`.
- PVE_LokiTeen_DestroyerBoss : `/Data/PVE_LokiTeen_DestroyerBoss/ultimate/actions/1`.
- PVE_Odin_DestroyerBoss : `/Data/PVE_Odin_DestroyerBoss/basic/actions/1`, `/Data/PVE_Odin_DestroyerBoss/passive_visuals/0/actions/16`, `/Data/PVE_Odin_DestroyerBoss/safety/actions/2` et `/Data/PVE_Odin_DestroyerBoss/ultimate/actions/4`.

## État des connaissances

### A — Comportement identifié

211 actions ont une famille de comportement interprétée. Les 49 signatures textuelles confirmées de 10.5.0 restent identiques. La cinquantième, Oath, est réévaluée sur son nouveau JSON et son texte français courant, avec une empreinte versionnée séparément. Les classifications structurelles validées par la PR #225 sont conservées lorsqu’elles correspondent toujours aux paramètres.

### B — Interprétation partielle

Aucune action ne reste au niveau B. Les cinq cas précédemment partiels sont désormais interprétés au niveau **famille de comportement seulement** : Quasar ×2 sur validation explicite du responsable du projet, et Kang, Morbius, Yellowjacket sur descriptions anglaises précisant leur restitution **à soi-même**. Cette clôture n'établit pas les formules de calcul du moteur.

### B bis — Décision de validation Quasar (16 octobre 2026)

Sur confirmation explicite du responsable du projet, deux signatures **inchangées**
de Quasar sont classées `health_steal_redistribute` avec restitution **à Quasar
lui-même** :

- `/Data/Quasar/basic/actions/3` — **Explosion quantique** : vol de vie sur
  une cible cosmique ;
- `/Data/Quasar/passive/4/actions/1` — **Chevalier galactique** : vol de vie
  sur un ennemi Exposé.

Les textes officiels confirment le vol de vie, mais n’expriment pas explicitement
le receveur dans ces deux actions. Cette validation du destinataire est donc
**une décision humaine documentée**, pas une déduction prouvée par le runtime.
La provenance est conservée dans `evidence.recipientEvidence:
"project_owner_validation"` ; `evidence.recipient: "self"` signifie
l'interprétation retenue, sans altérer le sélecteur JSON brut `to: ally`.
Les deux règles sont protégées par leur pointeur et leur empreinte SHA-256 exacte ;
un changement de source fait échouer l'interprétation spécifique.

Le **drain de vie** (`stat_modifier`, bonus de 25 % cité dans la passive) est
une mécanique distincte. Il n'est ni absorbé par ces deux actions ni
interprété comme un multiplicateur de `health_redistribute`. La formule moteur,
les bases de pourcentage et l'ordre des calculs restent non résolus.

### B ter — Descriptions anglaises explicites : trois restitutions à soi (16 octobre 2026)

Trois actions dont les textes français exploités par la PR #251 ne documentaient
pas suffisamment le receveur disposent d'une description anglaise non ambiguë
avec **« redistribute to self »** :

- `/Data/KangTheConqueror/passive/0/actions/3` — **Kang**, *Time Warlord* /
  *Seigneur de guerre temporel*, 3 % de vie volée aux ennemis, restituée à Kang.
  Description anglaise reproduite sur [MSF Base](https://www.msfbase.com/characters/KangTheConqueror/).
  **Provenance** : reproduction communautaire d'une description en anglais, à ne
  pas présenter comme certification indépendante de la source officielle.
- `/Data/Morbius/basic/actions/1` — **Morbius**, *Sanguine Slash* /
  *Entaille sanglante*, vol de vie conditionné par Saignement, restituée à Morbius.
  Preuve : [blog officiel Scopely du 13 octobre 2026](https://marvelstrikeforce.com/en/updates/blog-update-10-13-26).
- `/Data/Yellowjacket/special/actions/0` — **Yellowjacket**, *Spiteful Sting* /
  *Piqûre perfide*, vie volée à la cible principale, restituée à Yellowjacket.
  Preuve : [fiche officielle du personnage](https://marvelstrikeforce.com/en/characters/Yellowjacket/abilities).

Les trois règles utilisent un pointeur et l'empreinte SHA-256 du JSON source.
L'assertion ajoute `evidence.recipient: "self"` et
`evidence.recipientEvidence` (officiel ou description anglaise publiée) avec
`evidence.sourceUrl`. Elle ne remplace pas le sélecteur brut `to: ally`
et **n'extrapole ni quantité, ni allocation mathématique, ni formule moteur**.
Une nouvelle version de l'action non couverte par l'empreinte redevient
`detected`.

### B quater — Confrontation MSF Base et normalisation par empreinte (17 octobre 2026)

Le [rapport exhaustif des 49 actions](health-redistribute-msfbase-crosscheck-10.6.3.md)
distingue **18 descriptions directement concordantes** (dont 12
actions de personnages possédés confirmées par le texte officiel de Scopely)
et **12 variantes techniques corroborées** (10 `safety`, un
`passive_visuals` et une ultime qui emprunte la spéciale).
Ces 30 actions deviennent `health_steal_redistribute` à signature SHA-256
exacte ; leur niveau de preuve est `confirmed` pour les directes et
`corroborated` pour les techniques. Les contextes restent séparés.
Aucune action de boss ou entité technique n'est reclassée par analogie.
Les formules moteur des 230 opérations demeurent non résolues.

### C — Comportement non résolu

19 cas techniques ou PvE restent entièrement non résolus après la confrontation MSF Base : 15 analogues PvE non validés et 4 unités sans preuve textuelle directe. Les 30 actions jouables du registre précédent (18 directes et 12 corroborées au niveau technique) sont désormais identifiées au seul niveau de la famille de comportement, sans résolution du moteur.

Les détails par action — personnage, capacité, identifiants, pointeur, empreinte, structure brute, éléments confirmés, inconnues, investigations antérieures, blocage, preuve nécessaire et priorité — se trouvent dans le registre lié au début du rapport. Il contient 19 entrées ambiguës : 0 niveau B et 19 niveau C, toutes techniques ou non jouables. L’audit détaillé des 49 signatures et les justifications de la classification de 30 d'entre elles figurent dans [le rapport comparatif MSF Base](health-redistribute-msfbase-crosscheck-10.6.3.md).

### D — Formule moteur non résolue

Les 230 opérations conservent `percentageBasis` et `engineFormula` à `unresolved`. Les ressources examinées ne démontrent pas l’assiette de `drain_pct` ou `heal_multi`, l’ordre plafond/multiplicateur/soin, le partage entre receveurs, le surplus, ni les conséquences exactes de la mort. Le WASM précédemment examiné était stripped et ne fournissait pas de méthode exploitable. Les paramètres, sélecteurs, conditions, dépendances, valeurs et JSON bruts restent conservés.

## Priorités d’investigation restantes

1. Les 30 actions jouables ont une famille de comportement classée après vérification des descriptions et signatures exactes ; garder un niveau de preuve distinct pour les 12 variantes techniques, ne pas réinventer leurs formules moteur.
2. Les cinq anciens cas partiels (Quasar ×2, Kang, Morbius et Yellowjacket) n'exigent plus de recherche sur le destinataire ; réouvrir uniquement sur changement de signature ou contradiction documentée.
3. 19 cas PvE/techniques niveau C : priorité basse, poursuivre uniquement sur preuve propre à l’unité et ne pas extrapoler les versions jouables. Le rapport distingue 15 analogues et 4 sans preuve directe.
4. Formules moteur : traiter seulement avec symboles/runtime exploitable ou comparaison contrôlée des états de combat ; aucune décompilation générale n’est justifiée par les données présentes.

Une signature déjà enregistrée ne doit pas relancer la même enquête lors d’une mise à jour, sauf changement de son empreinte ou apparition d’une preuve nouvelle.

## Validation

- Tests spécialisés mis à jour (`python -m unittest tests.test_msf_health_redistribute -v`) : 30 signatures comparatives et leurs empreintes, 19 actions PvE conservées, destination et contextes, échec fermé sur source modifiée, conservation sans perte et non-régression du Drain. Exécution encore requise avant fusion.
- Tests Builder Explorer et Web Publisher : exécution encore requise avant fusion.
- Tests Normalizer, Parser et Indexer : exécution encore requise avant fusion.
- Aucun build ni publication des artefacts du Codex n'a été déclenché par cette PR.

Aucun artefact public, source brute officielle, snapshot 10.5.0 ou manifeste source n’est écrasé. Le Codex garde ses catégories et facettes existantes.
