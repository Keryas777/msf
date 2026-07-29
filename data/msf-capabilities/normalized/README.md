# Intermédiaire normalisé des capacités

`capabilities.json` est généré exclusivement depuis
`../parsed/mechanics.json`. Son contrat v1 est validé. Il normalise les
primitives reconnues, conserve les autres actions sans les interpréter et sert
d’unique entrée à l’indexeur v1.

Depuis la racine du dépôt :

```bash
python -m scripts.msf_capabilities_parser.cli
python -m scripts.msf_capabilities_normalizer.cli
python -m scripts.msf_capabilities_normalizer.cli --check
python -m scripts.msf_capabilities_indexer.cli
python -m scripts.msf_capabilities_indexer.cli --check
```

Ne pas modifier `capabilities.json` manuellement. Les références au parser et
les JSON Pointers vers les sources brutes permettent d’expliquer chaque
opération. Cet artefact régénérable reste hors de `docs/` et n’est pas
versionné. L’indexeur ne relit ni `mechanics.json`, ni les fichiers `raw/`.

## Objets du contrat

- une **Ability** représente une capacité jouable autonome (`basic`, `special`,
  `ultimate`, `passive` ou variante `*_empower`) et référence ses contextes et
  opérations sans recopier leurs détails ;
- un **Context** représente un conteneur d’exécution. Les déclencheurs passifs
  sont des enfants de leur Ability ; `safety`, `counter`,
  `safety_empower` et `counter_empower` restent des contextes techniques ;
- un **ActionMapping** correspond à exactement une action du parser. Il
  référence ses opérations ou porte le statut `preserved_uninterpreted` quand
  aucune interprétation contrôlée n’existe ;
- une **Operation** représente une primitive normalisée et conserve l’action,
  le contexte, l’ordre, les conditions, le contrôle, les paramètres bruts et
  les pointeurs source.

`empty_result` produit une opération de contrôle du même nom. Cette présence
garantit la traçabilité de l’action, sans la renommer en sélection, test,
branche ou condition et sans lui attribuer de mécanique de jeu.

Une action `spawn` produit toujours une opération `spawn` représentant
l’invocation complète. Les procs de `pool[].procs[]` produisent séparément des
opérations `effect_apply` avec le scope `spawn_pool`. L’invocation et les effets
appliqués aux entités invoquées ne sont donc jamais confondus.

## Alias d’identifiants

La politique `effect-id-aliases-v1` autorise une seule correspondance exacte :

```text
"Empower " → "Empower"
```

Elle n’applique aucun `trim`, aucune correction silencieuse et aucune autre
règle implicite. Chaque utilisation conserve `rawValue`, `resolvedValue`, la
méthode `controlled_alias`, l’origine de la règle et le JSON Pointer exact dans
`controlledAliasResolutions`. Cette collecte couvre aussi les références
imbriquées dans les conditions et les blocs `stat_modifier`. Les diagnostics
stricts du parseur restent inchangés dans `inputDiagnostics` ; ils retracent
l’étape précédente et ne remplacent pas la résolution contrôlée du
normaliseur.
