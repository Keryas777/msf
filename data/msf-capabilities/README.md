# Sources de capacités MSF

Ce dossier reçoit les 11 fichiers JSON officiels validés par
`scripts/update_msf_capabilities.py`, ainsi que leur manifeste de provenance.
Il reste hors de `docs/` et n’est donc pas publié par GitHub Pages.

La première exécution réelle du workflow a réussi le 22 juillet 2026 : elle a
remplacé l’amorce temporaire par les 11 JSON versionnés dans `raw/` et a produit
`source-manifest.json`. Les mises à jour suivantes réutilisent un fichier
seulement si son MD5 correspond encore au catalogue actif ; sinon elles
téléchargent et valident la nouvelle version depuis le CDN officiel.
