# Publication Web des capacités MSF

Ce dossier contient la génération publique des index de capacités MSF. Les
fichiers sont versionnés dans Git et servis directement par GitHub Pages depuis
`main` et `/docs`, comme le reste de la webapp.

Le petit `manifest.json` stable indique la génération courante :

```text
manifest.json
indexed/
└── sha256-<payloadSetChecksum>/
    ├── index-manifest.json
    ├── characters.json
    ├── abilities.json
    ├── contexts.json
    ├── operations.json
    ├── effects.json
    ├── spawns.json
    └── uninterpreted-actions.json
```

Le chemin immuable est dérivé du `payloadSetChecksum` recalculé à partir des
sept payloads. `manifest.json` fournit un chemin relatif, afin de conserver le
préfixe `/msf/` de GitHub Pages. Un futur chargeur devra lire ce pointeur avant
de choisir les payloads utiles ; il ne devra pas charger automatiquement les
fichiers volumineux.

Les huit fichiers d’une génération sont des copies exactes, octet par octet,
de `data/msf-capabilities/indexed/`. Le publisher valide auparavant :

- l’inventaire complet et l’absence de fichier supplémentaire ;
- le JSON, les clés dupliquées et les versions de schéma ;
- les audits de l’indexeur ;
- les tailles et SHA-256 déclarés ;
- le `payloadSetChecksum` ;
- le format et la cohérence croisée du `capabilitiesChecksum`.

La publication est atomique : la génération est intégralement préparée et
vérifiée, puis le manifeste stable est remplacé en dernier. Une seule génération
publique est conservée dans le dernier état du dépôt. Un répertoire immuable
existant n’est réutilisé que si ses huit fichiers sont strictement identiques.

Depuis la racine du dépôt :

```bash
python -m scripts.msf_capabilities_web_publisher.cli
python -m scripts.msf_capabilities_web_publisher.cli --check
```

Le mode `--check` n’écrit aucun octet. Ne modifier manuellement ni le manifeste
ni une génération. `mechanics.json` et `capabilities.json` ne sont jamais
publiés sous `docs/`.
