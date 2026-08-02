# Index v1.1 des capacités

L’indexeur lit exclusivement :

```text
../normalized/capabilities.json
```

Il produit huit JSON déterministes :

```text
index-manifest.json
characters.json
abilities.json
contexts.json
operations.json
effects.json
spawns.json
uninterpreted-actions.json
```

Les JSON sont des artefacts régénérables ignorés par Git. Seul ce README est
versionné dans le dossier. Ils restent hors de `docs/` : aucune interface Web,
copie GitHub Pages, PWA ou intégration Service Worker n’est réalisée par le
package de l’indexeur v1. La copie publique appartient au publisher Web,
dans une quatrième étape indépendante.

Depuis la racine du dépôt :

```bash
python -m scripts.msf_capabilities_parser.cli
python -m scripts.msf_capabilities_normalizer.cli
python -m scripts.msf_capabilities_indexer.cli
python -m scripts.msf_capabilities_indexer.cli --check
python -m scripts.msf_capabilities_web_publisher.cli
python -m scripts.msf_capabilities_web_publisher.cli --check
```

Le mode `--check` ne crée aucun dossier et n’écrit aucun octet. Il reconstruit
les huit artefacts en mémoire, vérifie la liste exacte des JSON, leur contenu,
leur taille, leurs SHA-256, le `payloadSetChecksum`, les compteurs et l’audit.
Le `--check` du publisher vérifie séparément que la génération versionnée sous
`docs/` correspond exactement à ces huit artefacts.

## Contrat des payloads

- `characters.json` regroupe les références d’Ability, Context, Operation,
  spawn, actions préservées et effets par `characterId` ;
- `abilities.json` utilise l’identifiant `abilities[].id` comme `abilityId` et
  conserve les déclencheurs passifs et alternatives dans leur Ability exacte ;
- `contexts.json` contient tous les Context, y compris les contextes
  techniques, sans fabriquer d’Ability ;
- `operations.json` expose tous les champs normalisés contrôlés, mais ne
  recopie ni `rawParameters`, ni `rawEffectEntry` ;
- `effects.json` sépare catalogue proc, références proc, références
  battlefield, sélecteurs génériques et résolutions `controlled_alias` ;
- `spawns.json` distingue chaque invocation de ses `effect_apply` de pool et
  ne joint un personnage invoqué que par égalité exacte de `characterId` ;
- `uninterpreted-actions.json` conserve toutes les actions
  `preserved_uninterpreted`, accessibles exactement par `sourceActionId`, avec
  ordre, contexte, cible, destinataire, conditions, contrôle, flags,
  paramètres non interprétés et pointeur source.

Toutes les références croisées emploient des identifiants canoniques. Aucun
ordinal de tableau n’est exposé. Les listes assimilables à des ensembles sont
triées lexicalement ; les progressions, conditions, chemins de contexte et
pools conservent leur ordre fonctionnel.

Depuis le schéma `1.1.0`, les trois facettes structurelles sont disponibles :

```json
{
  "facetAvailability": {
    "conditionPresence": "available",
    "targetPresence": "available",
    "dependencyPresence": "available"
  }
}
```

Aucun index secondaire `bySourcePointer` n’est produit. Le pointeur exact reste
présent dans chaque record.

L’indexeur ne déduit aucune mécanique de ces structures et ne recopie toujours
pas `rawParameters` dans `operations.json`. `preserved_uninterpreted` signifie
que la sémantique gameplay n’est pas normalisée, pas que la structure source
doit être supprimée.

## Déterminisme et audit

La sérialisation utilise UTF-8, `ensure_ascii=false`, des clés triées, un JSON
minifié et un saut de ligne final. Les valeurs non finies sont interdites.
Aucune date réelle, UUID, donnée réseau, correction de casse, d’espace ou
d’Unicode n’est ajoutée.

Les invariants généraux sont toujours exécutés. Les assertions numériques de
l’instantané validé ne s’appliquent que lorsque le SHA-256 de
`capabilities.json` vaut exactement :

```text
444b7792300504927909155f4360be60b91a5a05aeca6b9c032d3ce3f9cd186c
```

Le manifest est remplacé en dernier. Il décrit les sept payloads, leurs tailles
et SHA-256, le checksum de l’entrée, celui de `mechanics.json` recopié depuis
l’entrée, le `payloadSetChecksum`, les compteurs, l’audit, les diagnostics et
les limites intentionnelles. Il ne contient ni timestamp, ni son propre
checksum.
