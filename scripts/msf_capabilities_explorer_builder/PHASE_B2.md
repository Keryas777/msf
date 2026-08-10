# Phase B2 — construction conservatrice des phases

## Compatibilité avec B1

La base B1 fournit un schéma Web `1.1.0`, 12 036 `ActionMapping`, dont
4 877 `preserved_uninterpreted`, et aucune phase. B2 est additive : les
projections B1 (`operations`, `actions`, cibles, conditions, contrôles, flags,
paramètres et sources) restent présentes sans réécriture. Le schéma Web passe
à `1.2.0` et embarque un contrat indépendant `AbilityPresentation` `1.0.0`.
Aucune incompatibilité du contrat B1 n'a été nécessaire.

## Contrat

Le schéma normatif est `ability-presentation.schema.json`. Une présentation
contient l'identité de la capacité, sa relation parentale éventuelle, les
contextes référencés, les phases ordonnées, les occurrences non assignées, les
segments du texte officiel et les diagnostics.

Une phase contient notamment :

- un ID déterministe dérivé de la première occurrence et de la règle de
  frontière ;
- les `contextIds`, `sourceActionIds` et `operationIds` ;
- la cible, les conditions, le trigger, le mode, le côté de combat et les
  conditions d'arrêt préservés ;
- un step par action source, même lorsque cette action produit plusieurs
  opérations ;
- une preuve par assertion, des références source et une confiance de
  rattachement.

Un step référence l'action source, son ordre, ses opérations, son JSON Pointer,
son contexte, sa cible et son destinataire originaux, ses conditions, son
contrôle, ses flags et ses paramètres préservés. Les valeurs volumineuses déjà
présentes dans `abilityActions` ou `abilityOperations` sont référencées au lieu
d'être recopiées.

## Règles de phase implémentées

Les occurrences sont d'abord reconstruites et triées par contexte, ordre
source, pointeur puis identifiant stable. Les frontières sont ensuite évaluées
dans cet ordre :

1. changement explicite de contexte ;
2. changement de branche conditionnelle ou de contrôle ;
3. nouvelle cible explicite ;
4. nouveau destinataire explicite ;
5. nouvelle action d'attaque lorsque plusieurs séquences d'attaque sont
   attestées dans le texte officiel ;
6. continuité de l'ordre source.

Une action `if_prev_ran` qui dépend explicitement de l'action immédiatement
précédente reste dans la séquence ouverte : cette dépendance constitue une
preuve de rattachement, pas une cible héritée. Tous les autres contrôles sont
conservés et peuvent ouvrir une branche. `actionCondition: always` ne crée pas
à lui seul une branche sémantique.

Les passifs sont séparés par contexte, trigger, `triggerFor`, mode, conditions
et branche. Les invocations conservent chaque entrée et chaque `poolIndex`, y
compris les personnages répétés.

## Texte et libellés

Le texte français est segmenté avec offsets, pointeur source et ID stable. Les
alignements sont `aligned_high`, `aligned_medium`, `text_only`, `ambiguous` ou
`unassigned`. L'alignement est monotone, sauf lorsqu'une phrase finale possède
un indice mécanique fort et unique — par exemple un arrêt sur contre-attaque
déjà présent dans la cible brute.

Le texte peut fournir le libellé, confirmer une cible, une condition ou une
valeur préservée, et distinguer des attaques successives. Il ne produit aucune
opération. Les libellés forts `Enchaînement`, `Rebond`, `Attaque répétée` et
`Attaque bonus` exigent une concordance textuelle. Sans elle,
`direct_neighbor` et `direct_neighbor_repeatable` restent « Cible adjacente ».
Les libellés « Attaque », « Défense » et « En guerre » peuvent provenir de
conditions mécaniques explicites contrôlées.

## Règles explicitement refusées

B2 ne déduit pas :

- une cible principale d'une cible absente ;
- une cible héritée pour l'action suivante ;
- `count = 100` comme « tous » ;
- `stat_modifier` comme dégâts mécaniquement vérifiés ;
- `barrier` ou `turn_meter` comme nouvelle opération normalisée ;
- `direct_neighbor` comme enchaînement sans texte concordant ;
- `direct_neighbor_repeatable` comme rebond sans texte concordant ;
- une répétition depuis deux actions identiques ;
- un doublon depuis deux opérations identiques ;
- `LockedDebuff` comme alias de Traumatisme ;
- `safety`, `counter: true` ou `assist: {}` comme mécanique joueur.

## Preuves et diagnostics

Les niveaux d'assertion sont `mechanically_verified`,
`mechanically_preserved`, `official_text_asserted`, `aligned_high`,
`aligned_medium`, `inferred_low` et `unknown`. Ils sont portés par les
assertions concernées, jamais promus en preuve globale de phase.

Les diagnostics sont conservés dans les shards et masqués par défaut dans le
frontend. Le registre comprend notamment les cibles principales implicites,
les héritages non prouvés, les segments ambigus ou non assignés, les actions
répétées non dédupliquées, les cibles sans confirmation textuelle, les labels
fallback et les contextes techniques non résolus.

## Variantes et capacités renforcées

`safety` et `safety_empower` sont des variantes techniques, liées par règle
contrôlée à `basic` et `basic_empower`. Leur contexte source et leurs actions
restent visibles dans le panneau technique ; elles ne sont pas ajoutées à la
barre des capacités officielles. Les capacités renforcées conservent
`parentAbilityId`, leur type propre et l'absence éventuelle de texte ou d'icône
officiels, sans réutilisation automatique de ceux du parent.

## Validation

La génération vérifie la conservation globale des actions et opérations, les
IDs stables, les offsets textuels, le déterminisme byte-for-byte et les
checksums. Le manifeste de génération contient `presentationAudit`, qui porte
les comptes quantitatifs exacts de la génération publiée.

### Mesures locales B1 → B2

Base B1 : `e1cfb823`. Les tailles gzip utilisent gzip niveau 9 avec
`mtime = 0`. Le temps et le RSS maximum proviennent d'un `cli --check` dans
un processus frais sur le même conteneur.

| Mesure | B1 | B2 | Écart |
|---|---:|---:|---:|
| Génération complète | 31 847 223 o | 60 370 809 o | +89,56 % |
| Génération complète gzip | 4 215 550 o | 7 236 807 o | +71,67 % |
| `characters/Abomination.json` | 38 264 o | 94 546 o | +147,09 % |
| Abomination gzip | 4 510 o | 10 700 o | +137,25 % |
| Plus gros shard personnage | BuckyBarnes, 140 383 o | BuckyBarnes, 426 219 o | +203,61 % |
| Plus gros shard gzip | BuckyBarnes, 9 542 o | BuckyBarnes, 33 398 o | +250,01 % |
| `bootstrap.json` | 2 552 o | 4 128 o | +1 576 o |
| `bootstrap.json` gzip | 1 203 o | 1 965 o | +762 o |
| Temps du check | 8,730690 s | 16,147489 s | +84,95 % |
| RSS maximum | 402 476 Kio | 607 920 Kio | +51,05 % |

Une URL profonde de capacité suit un graphe de cinq requêtes JSON : manifeste
stable, bootstrap, bucket de route, shard personnage, puis contrôle de
fraîcheur asynchrone. Aucun catalogue, index de recherche ou `operations.json`
n'est requis. Le smoke test navigateur vérifie ce compte lorsqu'un binaire
Chromium Playwright est disponible.

```bash
python -m scripts.msf_capabilities_explorer_builder.cli --check
python -m scripts.msf_capabilities_explorer_builder.verify_permuted_generation
python -m unittest discover -s tests -p "test_msf_capabilities_explorer_builder.py" -v
node --test tests/codex-core.test.mjs tests/codex-static.test.mjs
node tests/codex-browser-smoke.mjs
```
