# Sources de capacités MSF

Ce dossier reçoit les 11 fichiers JSON officiels validés par
`scripts/update_msf_capabilities.py`, ainsi que leur manifeste de provenance.
Il reste hors de `docs/` et n’est donc pas publié par GitHub Pages.

`bootstrap-sources.tar.gz` est une amorce temporaire contenant le premier jeu de
sources dont les MD5 ont été vérifiés avec le catalogue SQLite du 21 juillet
2026. La première exécution réussie du workflow l’extrait, versionne les JSON
dans `raw/`, produit `source-manifest.json`, puis supprime automatiquement
l’archive. Les mises à jour suivantes réutilisent un fichier seulement si son
MD5 correspond encore au catalogue actif ; sinon elles téléchargent et
valident la nouvelle version depuis le CDN officiel.
