# Sources de capacités MSF

Ce dossier reçoit les 11 fichiers JSON officiels validés par
`scripts/update_msf_capabilities.py`, ainsi que leur manifeste de provenance.
Il reste hors de `docs/` et n’est donc pas publié par GitHub Pages.

La première exécution réelle du workflow a réussi le 22 juillet 2026 : elle a
remplacé l’amorce temporaire par les 11 JSON versionnés dans `raw/` et a produit
`source-manifest.json`. Les mises à jour suivantes réutilisent un fichier
seulement si son MD5 correspond encore au catalogue actif ; sinon elles
téléchargent et valident la nouvelle version depuis le CDN officiel.

Le parseur structurel lit uniquement `raw/characters.json` et
`raw/procs.json`, puis génère l’intermédiaire audité
`parsed/mechanics.json`. Le normaliseur v1 consomme ensuite cet intermédiaire
et génère `normalized/capabilities.json`. L’indexeur v1 lit exclusivement ce
dernier fichier et produit un manifest et sept payloads spécialisés dans
`indexed/` :

```bash
python -m scripts.msf_capabilities_parser.cli
python -m scripts.msf_capabilities_parser.cli --check
python -m scripts.msf_capabilities_normalizer.cli
python -m scripts.msf_capabilities_normalizer.cli --check
python -m scripts.msf_capabilities_indexer.cli
python -m scripts.msf_capabilities_indexer.cli --check
python -m scripts.msf_capabilities_web_publisher.cli
python -m scripts.msf_capabilities_web_publisher.cli --check
```

Ne modifier manuellement ni `parsed/mechanics.json`, ni
`normalized/capabilities.json`, ni les huit JSON de `indexed/`. Les fichiers
`raw/` restent la source de vérité ; toute mise à jour doit passer par les
trois commandes de génération. Ces artefacts régénérables ne sont pas
versionnés sous `data/`.

Le publisher Web reste une quatrième étape strictement séparée. Il consomme
uniquement les huit sorties existantes de l’indexeur, les valide, puis copie
leurs octets sous le chemin immuable courant de
`docs/data/msf-capabilities/`. Il ne lance et n’importe aucune étape amont.
Les artefacts publics sous `docs/` sont, eux, versionnés dans Git.
