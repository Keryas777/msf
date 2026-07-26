# Intermédiaire structurel des capacités

`mechanics.json` est généré depuis les octets versionnés de
`../raw/characters.json` et `../raw/procs.json`.

Ne pas le modifier manuellement. Depuis la racine du dépôt :

```bash
python -m scripts.msf_capabilities_parser.cli
python -m scripts.msf_capabilities_parser.cli --check
```

Les sources brutes restent la source de vérité. Cet intermédiaire est audité et
volontairement exhaustif ; il n’est pas encore le fichier compact destiné à la
WebApp et n’est pas versionné.
