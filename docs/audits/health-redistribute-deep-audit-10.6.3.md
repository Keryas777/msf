# Migration `health_redistribute` — corpus annoncé 10.6.3

## Résumé

Ce rapport migre vers les sources courantes les résultats des PR #225 et #251. Il ne reprend pas leurs audits : les preuves 10.5.0 restent dans [l’audit historique](health-redistribute-deep-audit-10.5.0.md), et les signatures ambiguës de la nouvelle référence sont enregistrées dans [`health-redistribute-review-ledger-10.6.3.json`](../../data/msf-capabilities/health-redistribute-review-ledger-10.6.3.json).

| Mesure | Corpus courant |
|---|---:|
| Actions `health_redistribute` | 230 |
| Capacités distinctes | 128 |
| Personnages / unités distincts | 81 |
| Actions sans `abilityId` | 26 |
| Comportements identifiés (`resolved=true`) | 176 |
| Comportements partiellement interprétés (`resolved=false`) | 5 |
| Comportements entièrement non résolus | 49 |
| Formules moteur non résolues | 230 |

La répartition des comportements identifiés est : 98 pertes de vie, 68 vols et redistributions de vie, 8 égalisations et 2 transferts entre alliés. Toutes les opérations gardent `percentageBasis: unresolved` et `engineFormula: unresolved`.

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

176 actions ont une famille de comportement interprétée. Les 49 signatures textuelles confirmées de 10.5.0 restent identiques. La cinquantième, Oath, est réévaluée sur son nouveau JSON et son texte français courant, avec une empreinte versionnée séparément. Les classifications structurelles validées par la PR #225 sont conservées lorsqu’elles correspondent toujours aux paramètres.

### B — Interprétation partielle

Les 5 cas déjà documentés (Kang, Morbius, Quasar ×2 et Yellowjacket) ont des signatures brutes identiques à 10.5.0. Ils restent `behavior: detected` et `resolved: false`. Leur texte mentionne un vol de vie, mais ne prouve pas toute la destination ou la restitution.

### C — Comportement non résolu

49 cas restent entièrement non résolus : les 44 signatures déjà étudiées en 10.5.0, plus les 5 nouvelles actions de boss PvE (LokiTeen ×1, Odin ×4). Les 44 signatures antérieures n’ont pas déclenché de nouvel audit : leur structure est identique et aucune preuve runtime nouvelle n’est disponible.

Les détails par action — personnage, capacité, identifiants, pointeur, empreinte, structure brute, éléments confirmés, inconnues, investigations antérieures, blocage, preuve nécessaire et priorité — se trouvent dans le registre lié au début du rapport. Il contient 54 entrées ambiguës : 5 niveau B et 49 niveau C. Il distingue les 30 cas C jouables des 19 cas C techniques/non jouables ; les cinq cas B sont jouables.

### D — Formule moteur non résolue

Les 230 opérations conservent `percentageBasis` et `engineFormula` à `unresolved`. Les ressources examinées ne démontrent pas l’assiette de `drain_pct` ou `heal_multi`, l’ordre plafond/multiplicateur/soin, le partage entre receveurs, le surplus, ni les conséquences exactes de la mort. Le WASM précédemment examiné était stripped et ne fournissait pas de méthode exploitable. Les paramètres, sélecteurs, conditions, dépendances, valeurs et JSON bruts restent conservés.

## Priorités d’investigation restantes

1. Cas non résolus de personnages jouables (30 niveau C) : exiger une nouvelle preuve runtime ou une observation de combat contrôlée avant de modifier le Codex.
2. Cas partiels jouables (5 niveau B) : rechercher une description officielle qui relie explicitement le vol, sa destination et la restitution.
3. Cas de boss PvE (19 niveau C) : priorité basse ; les conserver et ne pas extrapoler leurs comportements aux personnages jouables.
4. Formules moteur : traiter seulement avec symboles/runtime exploitable ou comparaison contrôlée des états de combat ; aucune décompilation générale n’est justifiée par les données présentes.

Une signature déjà enregistrée ne doit pas relancer la même enquête lors d’une mise à jour, sauf changement de son empreinte ou apparition d’une preuve nouvelle.

## Validation

- `python -m unittest tests.test_msf_health_redistribute -v` — contrat exhaustif, conservation sans perte, empreintes héritées, cas Oath, provenance des 11 ressources, registre des inconnues et non-régression hors famille.
- Tests Builder Explorer et Web Publisher — projection, étiquettes, facettes et contenu préservé.
- Tests Normalizer, Parser et Indexer — contrats amont et non-régression.
- `git diff --check` et compilation Python des modules modifiés.

Aucun artefact public, source brute officielle, snapshot 10.5.0 ou manifeste source n’est écrasé. Le Codex garde ses catégories et facettes existantes.
