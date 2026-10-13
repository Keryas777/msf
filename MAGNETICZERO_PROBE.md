# MagneticZero — exploration en lecture seule

Ce prototype explore la collecte directe de `combat_data/characters.json` et
`combat_data/procs.json`, **sans** remplacer les sources présentes dans LoSP.

Depuis la racine du dépôt :

```bash
python -m unittest discover -s tests -p test_probe_magneticzero.py -v
python scripts/probe_magneticzero.py
```

Fonctionnement :

1. Lit l'historique public `/file/combat_data/<fichier>` et choisit le premier lien
   `/view/combat_data/<fichier>/<sha256>`.
2. Extrait le JSON contenu dans le bloc HTML `<pre>` de cette révision.
3. Vérifie `Data`, `ForceImportVersion`, `Name` et le SHA-256 du JSON
   formaté avec deux espaces et un saut de ligne final.
4. Compare **sémantiquement** au JSON LoSP : tailles et clés ajoutées/supprimées.
   Ne confond pas l'empreinte Scopely avec celle de la sérialisation MagneticZero.
5. Affiche un rapport JSON ; aucun fichier n'est modifié.

Ce test ne met pas en production une nouvelle source : il confirme d'abord
l'accès direct depuis GitHub Actions et la cohérence de deux fichiers de base.
La structure HTML du site, l'ordre des liens et la sérialisation ne sont pas
des contrats publics garantis. En cas d'erreur réseau, de parsing ou de hash,
le programme échoue sans écraser les données existantes.
