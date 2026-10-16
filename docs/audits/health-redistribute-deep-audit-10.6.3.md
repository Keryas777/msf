# Migration `health_redistribute` — corpus annoncé 10.6.3

## Résumé

Ce rapport migre vers les sources courantes les résultats des PR #225 et #251. Il ne reprend pas leurs audits : les preuves 10.5.0 restent dans [l’audit historique](health-redistribute-deep-audit-10.5.0.md), et les signatures ambiguës de la nouvelle référence sont enregistrées dans [`health-redistribute-review-ledger-10.6.3.json`](../../data/msf-capabilities/health-redistribute-review-ledger-10.6.3.json).

| Mesure | Corpus courant |
|---|---:|
| Actions `health_redistribute` | 230 |
| Capacités distinctes | 128 |
| Personnages / unités distincts | 81 |
| Actions sans `abilityId` | 26 |
| Comportements identifiés (`resolved=true`) | 178 |
| Comportements partiellement interprétés (`resolved=false`) | 3 |
| Comportements entièrement non résolus | 49 |
| Formules moteur non résolues | 230 |

La répartition des comportements identifiés est : 98 pertes de vie, 70 vols et redistributions de vie, 8 égalisations et 2 transferts entre alliés. Toutes les opérations gardent `percentageBasis: unresolved` et `engineFormula: unresolved`.

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

178 actions ont une famille de comportement interprétée. Les 49 signatures textuelles confirmées de 10.5.0 restent identiques. La cinquantième, Oath, est réévaluée sur son nouveau JSON et son texte français courant, avec une empreinte versionnée séparément. Les classifications structurelles validées par la PR #225 sont conservées lorsqu’elles correspondent toujours aux paramètres.

### B — Interprétation partielle

Trois cas partiels (Kang, Morbius et Yellowjacket) restent `behavior: detected` et `resolved: false`. Deux cas Quasar ont quitté cette liste à la suite d’une validation humaine explicite de la restitution à Quasar ; cette décision d’interprétation est tracée séparément de la preuve officielle et ne confirme aucune formule moteur.

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

### C — Comportement non résolu

49 cas restent entièrement non résolus : les 44 signatures déjà étudiées en 10.5.0, plus les 5 nouvelles actions de boss PvE (LokiTeen ×1, Odin ×4). Les 44 signatures antérieures n’ont pas déclenché de nouvel audit : leur structure est identique et aucune preuve runtime nouvelle n’est disponible.

Les détails par action — personnage, capacité, identifiants, pointeur, empreinte, structure brute, éléments confirmés, inconnues, investigations antérieures, blocage, preuve nécessaire et priorité — se trouvent dans le registre lié au début du rapport. Il contient 52 entrées ambiguës : 3 niveau B et 49 niveau C. Il distingue les 30 cas C jouables des 19 cas C techniques/non jouables ; les trois cas B sont jouables.

### D — Formule moteur non résolue

Les 230 opérations conservent `percentageBasis` et `engineFormula` à `unresolved`. Les ressources examinées ne démontrent pas l’assiette de `drain_pct` ou `heal_multi`, l’ordre plafond/multiplicateur/soin, le partage entre receveurs, le surplus, ni les conséquences exactes de la mort. Le WASM précédemment examiné était stripped et ne fournissait pas de méthode exploitable. Les paramètres, sélecteurs, conditions, dépendances, valeurs et JSON bruts restent conservés.

## Priorités d’investigation restantes

1. Cas non résolus de personnages jouables (30 niveau C) : exiger une nouvelle preuve runtime ou une observation de combat contrôlée avant de modifier le Codex.
2. Cas partiels jouables (3 niveau B) : rechercher une description officielle qui relie explicitement le vol, sa destination et la restitution.
3. Cas de boss PvE (19 niveau C) : priorité basse ; les conserver et ne pas extrapoler leurs comportements aux personnages jouables.
4. Formules moteur : traiter seulement avec symboles/runtime exploitable ou comparaison contrôlée des états de combat ; aucune décompilation générale n’est justifiée par les données présentes.

Une signature déjà enregistrée ne doit pas relancer la même enquête lors d’une mise à jour, sauf changement de son empreinte ou apparition d’une preuve nouvelle.

## Validation

- `python -m unittest tests.test_msf_health_redistribute -v` — contrat exhaustif, conservation sans perte, empreintes héritées, cas Oath, provenance des 11 ressources, registre des inconnues et non-régression hors famille.
- Tests Builder Explorer et Web Publisher — projection, étiquettes, facettes et contenu préservé.
- Tests Normalizer, Parser et Indexer — contrats amont et non-régression.
- `git diff --check` et compilation Python des modules modifiés.

Aucun artefact public, source brute officielle, snapshot 10.5.0 ou manifeste source n’est écrasé. Le Codex garde ses catégories et facettes existantes.
