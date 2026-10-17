# Confrontation MSF Base × Codex — 49 actions `health_redistribute`

Audit : 17 octobre 2026. Corpus du dépôt : version annoncée `10_6_3`,
`versionVerified:false`. Source initiale : registre de 49 actions non résolues
de `main`, sans refaire l'audit historique des PR #225, #251 et #257.

## Synthèse et décision

| Preuve | Actions | Décision |
|---|---:|---|
| A : concordance directe entre texte et JSON | 18 | Famille `health_steal_redistribute`, empreinte exacte |
| B : correspondance technique corroborée | 12 | Même famille, preuve `corroborated`, contexte conservé |
| C : analogue PvE non démontré | 15 | `detected` |
| D : aucune preuve propre | 4 | `detected` |
| **Total** | **49** | **30 nouvellement classées ; 19 restent inconnues** |

Résultat visé sur 230 actions : **211 familles identifiées**, **19**
non résolues, dont aucune nouvelle interprétation de boss. 
**Les 230 valeurs `engineFormula` et `percentageBasis` restent
`unresolved`.** Les preuves attestent la famille, pas l'assiette,
l'ordre des effets, les plafonds runtime ni l'allocation du soin.

## Vérification des 18 correspondances directes

**12 passives sous possession (Ancient One, Doctor Strange, Emma Frost X-Men,
Moondragon, chacune 3 actions)** — [texte Scopely, First Nightmare](https://marvelstrikeforce.com/en/characters/ShadowKing/abilities)
indiquant explicitement le vol de 5 % de la vie maximale de l'ennemi le plus
blessé et la restitution **au personnage possédé**, et non forcément à
Shadow King. Toutes les actions sont verrouillées à leur signature contenant
les conditions `Possessed` et `ShadowKing_Passive_2` ; les 12 contextes
restent distincts. Le Drain 50 % lié à l'attaque perçante est séparé.

**Gilgamesh (1)** — [Timeless Strikes](https://www.msfbase.com/characters/Gilgamesh/) :
vol de 2 à 10 % sur cible principale restitué à Gilgamesh, séparé
du `Drain` distribué à l'équipe Timeless Eternals.

**Quasar (1)** — [Quantum Blast](https://www.msfbase.com/characters/Quasar/) :
en attaque de guerre, vol de 10 % même si la cible n'est pas cosmique.
Condition `AVA/offense` et exclusion des cibles cosmiques préservées.
La restitution à soi reprend l'interprétation retenue précédemment pour la
basique ; le texte de cette variante ne fournit pas de nouvelle formule.

**Thena (4)** — [Eternal Arsenal](https://www.msfbase.com/characters/Thena/) :
vol de vie rendu à Thena, sur cible principale et secondaires, plafond
décrit à 30 % de sa vie maximale. Les deux branches `offense`/`defense`,
les sélecteurs et les flags `assist`/`counter` restent séparés.

## Audit des 12 correspondances indirectes : `safety` et contextes

**Source interne déjà validée :**
[MSF_CAPABILITIES_PIPELINE.md](../../MSF_CAPABILITIES_PIPELINE.md).
Le parser documente que `safety` est une variante technique liée à
`basic` pour les informations d'assistance/contre-attaque : 
477 entités `safety` possèdent `basic` dans le snapshot cartographié.
Ces contextes gardent `classification:technical-review`, et **ne sont pas**
fusionnés avec les capacités joueur. La règle n'est jamais générale :
chaque action a un pointeur + SHA-256 contrôlé.

- **10 actions `safety`** : Gilgamesh, Morbius, Morgan Le Fay, Nemesis,
  Odin, Omega Red, Quasar ×2, Satana, Symbiote Quicksilver.
  Les pourcentages et conditions sont confrontés aux lignes
  `ISO-8 / Counter / Assist` des [fiches MSF Base](https://www.msfbase.com/).
- **Odin `passive_visuals` (1)** : réplication technique de la basique
  à l'occasion des déclenchements de Gungnir.
- **Yellowjacket ultime (1)** : en défense de guerre avec Spider-Man
  (Big Time), la description prévoit explicitement les effets
  supplémentaires de sa spéciale [Spiteful Sting](https://www.msfbase.com/characters/Yellowjacket/).

Divergences à préserver : Satana `drain_pct:7` et `heal_multi` variable,
Nemesis ciblant Deathseed, Quasar distinguant cible cosmique et non cosmique
en attaque de guerre, Gilgamesh dont le `Drain` de dégâts est un autre effet.
Le contexte `technical-review` continue d'être visible, et les preuves sont
marquées `corroborated` plutôt que démonstration du moteur.

## Audit séparé des 19 variantes PvE et techniques

**15 analogues non validés :**
Roi d'Ombre Chaos/Saga (3+3), Ebony Maw Gauntlet (5), Odin boss
Destructeur (4). Les branches possèdent des conditions et paramètres propres.
Ebony Maw PvE plafonne `max_drain_pct:25`, différent du plafond
30 % du personnage jouable. L'ultime Odin boss possède des champs de
mort/résurrection (`victim_cant_revive:true`) qui ne doivent pas être copiés.

**4 sans correspondance pertinente :**
DarkPhoenix, PVE_LokiTeen_DestroyerBoss, VampireSupport et Void.
Loki boss prélève sur des **alliés Bifrost** (`from:ally`) :
le ranger dans le vol de vie sur ennemi serait incorrect.
Void technique utilise un transfert **entre alliés**, pas la passive du Sentry
jouable. Les quatre restent non résolus.

**Aucune des 19 signatures PvE n'est classée par analogie.**
Une description ou observation propre aux unités techniques serait nécessaire.

## Les 49 pointeurs et décisions

A = directe ; B = technique corroborée ; C = analogue PvE ; D = sans preuve.
Les empreintes SHA-256 originales sont conservées dans le normaliseur pour
A/B et dans le registre pour C/D. Les pourcentages sont les valeurs brutes
de `drain_pct`, **pas une formule moteur démontrée**.

| # | Personnage / unité | Pointeur exact | Classe | `drain_pct` | Contexte | Bénéficiaire interprété |
|---:|---|---|:---:|---|---|---|
| 1 | Ancien | `/Data/AncientOne/passive/1/actions/2` | A | `[5]` | direct | possessed_character |
| 2 | Ancien | `/Data/AncientOne/passive/10/actions/2` | A | `[5]` | direct | possessed_character |
| 3 | Ancien | `/Data/AncientOne/passive/8/actions/2` | A | `[5]` | direct | possessed_character |
| 4 | Docteur Strange | `/Data/DoctorStrange/passive/11/actions/2` | A | `[5]` | direct | possessed_character |
| 5 | Docteur Strange | `/Data/DoctorStrange/passive/7/actions/2` | A | `[5]` | direct | possessed_character |
| 6 | Docteur Strange | `/Data/DoctorStrange/passive/9/actions/2` | A | `[5]` | direct | possessed_character |
| 7 | Emma Frost (X-Men) | `/Data/EmmaFrostXMen/passive/3/actions/2` | A | `[5]` | direct | possessed_character |
| 8 | Emma Frost (X-Men) | `/Data/EmmaFrostXMen/passive/5/actions/2` | A | `[5]` | direct | possessed_character |
| 9 | Emma Frost (X-Men) | `/Data/EmmaFrostXMen/passive/7/actions/2` | A | `[5]` | direct | possessed_character |
| 10 | Gilgamesh | `/Data/Gilgamesh/basic/actions/2` | A | `[0,2,2,2,5,5,10]` | direct | self |
| 11 | Gilgamesh | `/Data/Gilgamesh/safety/actions/2` | B | `[0,1,1,1,3,3,7]` | safety_assist_counter | self |
| 12 | Dragon-Lune | `/Data/Moondragon/passive/1/actions/2` | A | `[5]` | direct | possessed_character |
| 13 | Dragon-Lune | `/Data/Moondragon/passive/4/actions/2` | A | `[5]` | direct | possessed_character |
| 14 | Dragon-Lune | `/Data/Moondragon/passive/6/actions/2` | A | `[5]` | direct | possessed_character |
| 15 | Morbius | `/Data/Morbius/safety/actions/1` | B | `[0,0,0,5,5,5,10]` | safety_assist_counter | self |
| 16 | Morgan Le Fay | `/Data/MorganLeFay/safety/actions/3` | B | `[0,0,0,0,5,5,10]` | safety_assist_counter | self |
| 17 | Némésis | `/Data/Nemesis/safety/actions/1` | B | `[0,0,0,0,0,5]` | safety_assist_counter | self_and_deathseed_allies |
| 18 | Odin | `/Data/Odin/passive_visuals/0/actions/16` | B | `3` | passive_visuals | self |
| 19 | Odin | `/Data/Odin/safety/actions/2` | B | `3` | safety_assist_counter | self |
| 20 | Omega Red | `/Data/OmegaRed/safety/actions/1` | B | `[0,0,3,3,3,3,7]` | safety_assist_counter | self |
| 21 | Quasar | `/Data/Quasar/basic/actions/4` | A | `[0,0,0,0,0,0,0,10]` | direct | self |
| 22 | Quasar | `/Data/Quasar/safety/actions/3` | B | `[0,5,5,5,10,10,10]` | safety_assist_counter | self |
| 23 | Quasar | `/Data/Quasar/safety/actions/4` | B | `[0,0,0,0,0,0,10]` | safety_assist_counter | self |
| 24 | Satana | `/Data/Satana/safety/actions/1` | B | `[7]` | safety_assist_counter | self_and_accursed_allies |
| 25 | Vif-Argent (Symbiote) | `/Data/SymbioteQuicksilver/safety/actions/2` | B | `[0,0,5,5,5,5,10]` | safety_assist_counter | self |
| 26 | Thena | `/Data/Thena/ultimate/actions/1` | A | `[5,5,10,10,10,15,20]` | direct | self |
| 27 | Thena | `/Data/Thena/ultimate/actions/4` | A | `[5,5,10,10,10,15,15]` | direct | self |
| 28 | Thena | `/Data/Thena/ultimate/actions/6` | A | `[5,5,10,10,10,15,20]` | direct | self |
| 29 | Thena | `/Data/Thena/ultimate/actions/9` | A | `[5,5,10,10,10,15,15]` | direct | self |
| 30 | Yellowjacket | `/Data/Yellowjacket/ultimate/actions/8` | B | `[5,10,10,15,15,20,30]` | cross_ability_ultimate | self |
| 31 | Phénix noir | `/Data/DarkPhoenix/special/actions/0` | D | `[5,5,5,20,20,20,20]` | PvE / unité technique | non certifié |
| 32 | Roi d’ombre (Chaos) | `/Data/PVE_ChaosRaid_ShadowKing/passive/2/actions/2` | C | `[0,5]` | PvE / unité technique | non certifié |
| 33 | Roi d’ombre (Chaos) | `/Data/PVE_ChaosRaid_ShadowKing/passive/3/actions/2` | C | `[0,5]` | PvE / unité technique | non certifié |
| 34 | Roi d’ombre (Chaos) | `/Data/PVE_ChaosRaid_ShadowKing/passive/5/actions/2` | C | `[0,5]` | PvE / unité technique | non certifié |
| 35 | Ebony Maw | `/Data/PVE_EbonyMaw_Gauntlet/ultimate/actions/0` | C | `[3]` | PvE / unité technique | non certifié |
| 36 | Ebony Maw | `/Data/PVE_EbonyMaw_Gauntlet/ultimate/actions/1` | C | `[3]` | PvE / unité technique | non certifié |
| 37 | Ebony Maw | `/Data/PVE_EbonyMaw_Gauntlet/ultimate/actions/2` | C | `[3]` | PvE / unité technique | non certifié |
| 38 | Ebony Maw | `/Data/PVE_EbonyMaw_Gauntlet/ultimate/actions/3` | C | `[3]` | PvE / unité technique | non certifié |
| 39 | Ebony Maw | `/Data/PVE_EbonyMaw_Gauntlet/ultimate/actions/4` | C | `[3]` | PvE / unité technique | non certifié |
| 40 | Loki (Adolescent) | `/Data/PVE_LokiTeen_DestroyerBoss/ultimate/actions/1` | D | `100` | PvE / unité technique | non certifié |
| 41 | Odin | `/Data/PVE_Odin_DestroyerBoss/basic/actions/1` | C | `3` | PvE / unité technique | non certifié |
| 42 | Odin | `/Data/PVE_Odin_DestroyerBoss/passive_visuals/0/actions/16` | C | `3` | PvE / unité technique | non certifié |
| 43 | Odin | `/Data/PVE_Odin_DestroyerBoss/safety/actions/2` | C | `3` | PvE / unité technique | non certifié |
| 44 | Odin | `/Data/PVE_Odin_DestroyerBoss/ultimate/actions/4` | C | `10` | PvE / unité technique | non certifié |
| 45 | Roi d’ombre (Saga) | `/Data/PVE_SagaBoss_ShadowKing/passive/2/actions/2` | C | `[0,5]` | PvE / unité technique | non certifié |
| 46 | Roi d’ombre (Saga) | `/Data/PVE_SagaBoss_ShadowKing/passive/3/actions/2` | C | `[0,5]` | PvE / unité technique | non certifié |
| 47 | Roi d’ombre (Saga) | `/Data/PVE_SagaBoss_ShadowKing/passive/5/actions/2` | C | `[0,5]` | PvE / unité technique | non certifié |
| 48 | Occultiste vampire | `/Data/VampireSupport/special/actions/0` | D | `[5,5,5,10,10,15,20]` | PvE / unité technique | non certifié |
| 49 | Void | `/Data/Void/passive/3/actions/0` | D | `[10]` | PvE / unité technique | non certifié |

## Règles et vérifications

- Normaliser uniquement si `sourcePointer` **et empreinte de tout `rawAction`** concordent ; revenir à `detected` sinon.
- Garder le JSON source, les sélecteurs, les conditions, les plafonds et les flags, y compris `safety`, `passive_visuals` et `only_if`.
- Conserver les `stat_modifier` de Drain séparés.
- Tester le nombre total de 230, les 30 empreintes, la rétrogradation si altérées, et les 19 signatures PvE restant `detected`.
- Repasser les tests exhaustifs Python du pipeline avant fusion ; reconstruire le Codex public via GitHub Actions **après** fusion.

MSF Base est une publication communautaire, non une preuve indépendante du
runtime ni une certification de la version du corpus.
