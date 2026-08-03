# MSF capabilities explorer builder v1

Ce constructeur est une cinquième étape indépendante du pipeline capabilities.
Il ne modifie et n'importe ni le parser, ni le normalizer, ni l'indexer, ni le
publisher. Il lit uniquement leur publication Web validée, les présentations
officielles françaises et le catalogue de portraits déjà versionné.

## Entrées

- `docs/data/msf-capabilities/manifest.json`, puis les huit artefacts de sa
  génération immuable ;
- `data/msf-capabilities/raw/msf-character-abilities-fr.json` ;
- `docs/data/msf-characters.json` ;
- `data/msf-capabilities/source-manifest.json`.

`operations.json` est une entrée de construction uniquement. Aucun chemin
produit pour le navigateur ne le référence.

## Sorties

```text
docs/data/msf-capabilities-explorer/
├── manifest.json
└── generations/
    └── sha256-<payloadSetChecksum>/
        ├── generation-manifest.json
        ├── bootstrap.json
        ├── search.json
        ├── characters.json
        ├── mechanics.json
        ├── characters/<characterId>.json
        ├── mechanics/<mechanicId>.json
        ├── mechanic-results/<mechanicId>/<facet>-<page>.json
        └── routes/
            ├── abilities-<0..f>.json
            ├── operations-<0..f>.json
            └── actions-<0..f>.json
```

Le manifeste stable est le seul point d'entrée permanent. `bootstrap.json`
contient les comptes, le registre de preuve, les suggestions et les chemins
relatifs des index chargeables à la demande. Le manifeste de génération porte
l'inventaire exhaustif, les tailles et les SHA-256.

## Entités et relations

- **Character** : les 375 identifiants présents dans la présentation
  officielle sont jouables ; les autres Character du graphe sont techniques.
- **Ability** : jointure exacte sur `(characterId, abilityType)`. Une
  présentation officielle sans Ability reçoit un identifiant `prs_` stable et
  reste explicitement sans mécanique. Une Ability renforcée sans présentation
  reste explicitement sans texte ni icône officiels.
- **Effect / Mechanic** : une opération explicite n'est reliée qu'à son
  `effectId` résolu. Les actions préservées sont regroupées uniquement par leur
  type source exact. Les mentions textuelles reposent uniquement sur un
  lexique contrôlé et une correspondance littérale normalisée.
- **Spawn** : seules les jointures exactes publiées par l'indexer relient une
  invocation à une entité.
- **Operation / Context** : les projections Web conservent les identifiants,
  conditions, métriques, cibles et déclencheurs disponibles, sans simulation ni
  complétion implicite.
- **Action préservée** : la projection conserve `sourceActionId`, l’ordre,
  les contextes, la cible et le destinataire bruts, les conditions, le
  contrôle, les flags, les paramètres non interprétés et la source. Elle ne
  crée ni phase, ni héritage de cible, ni traduction de `direct_neighbor`,
  `stat_modifier`, `barrier`, `turn_meter` ou `count`.

## Preuve par occurrence

Les seules valeurs admises sont :

- `normalized` — « Mécanique vérifiée » ;
- `preserved_uninterpreted` — « Action détectée » ;
- `official_text_only` — « Mention dans le texte ».

La preuve globale d'une mécanique n'est jamais recopiée sur ses occurrences.
Une mention officielle sans opération liée reste donc textuelle même lorsque
le même effet est structuré ailleurs.

Le schéma de sortie `1.1.0` est une évolution additive. Le frontend V1 garde
son rendu, mais ordonne les occurrences par `actionOrder` lorsqu’il existe et
masque `selectionCount` tant qu’aucune règle spécifique au type d’action ne
permet de l’afficher honnêtement. Les progressions complètes restent dans les
shards même si l’interface choisit encore une valeur de niveau maximal pour
les métriques autorisées.

## Commandes

```bash
python -m scripts.msf_capabilities_explorer_builder.cli
python -m scripts.msf_capabilities_explorer_builder.cli --check
python -m unittest discover -s tests -p "test_msf_capabilities_explorer_builder.py" -v
```

La sérialisation est UTF-8 minifiée, avec clés triées, valeurs finies et saut
de ligne final. La génération ne dépend ni de l'heure, ni du réseau, ni de
l'ordre des collections assimilables à des ensembles.
