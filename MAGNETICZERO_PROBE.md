# MagneticZero — exploration des 11 fichiers combat_data en lecture seule

Ce prototype vérifie la récupération directe des **11 sources officielles** utilisées
par le Codex LoSP, sans modifier les sources ni les artefacts publiés.

## Exécution

Depuis la racine du dépôt :

```bash
python -m unittest discover -s tests -p test_probe_magneticzero.py -v
python scripts/probe_magneticzero.py
# Optionnel : ne contrôler qu'une source
python scripts/probe_magneticzero.py --file characters.json
```

Le workflow `.github/workflows/probe-msf-magneticzero.yml` exécute la même
vérification sur GitHub Actions, avec `contents: read`.

## Sources étudiées

`ai_filter.json`, `ai_selector.json`, `battlefield_effects.json`,
`characters.json`, `combat_mods.json`, `constants.json`,
`iso8skills.json`, `missiontraits.json`, `overpower_bonuses.json`,
`places.json` et `procs.json`.

## Procédure

1. Lit la page publique `/file/combat_data/<fichier>` et identifie un lien
   `/view/combat_data/<fichier>/<sha256>`. L'ordre observé des liens du site
   est utilisé pour sélectionner la révision courante ; il ne constitue pas
   une API contractuelle.
2. Télécharge cette page `view` par HTTP et extrait son JSON du bloc `<pre>`.
   La page renvoie `text/html`, pas `application/json`.
3. Vérifie `Data`, `ForceImportVersion`, `Name` ainsi que le SHA-256 de la
   sérialisation JSON indentée de deux espaces avec saut de ligne final.
4. Vérifie indépendamment les octets locaux (MD5 + SHA-256) par rapport au
   `data/msf-capabilities/source-manifest.json` versionné.
5. Compare le JSON distant au JSON local **sémantiquement**. Le rapport liste
   le nombre d'entrées, les clés ajoutées, supprimées et modifiées, ainsi que
   quelques identifiants correspondants. Les différences ne sont pas publiées.
6. Affiche un rapport JSON récapitulatif, y compris les erreurs de récupération.

## Garanties et limites

- **Aucune écriture** dans `data/msf-capabilities`, `docs` ou `main`.
- Aucune dépendance Python externe, session MSF, token ni navigateur automatisé.
- Les fichiers obtenus via MagneticZero sont reformatés : un SHA-256 différent
  des octets du CDN ne prouve pas une différence de contenu.
- La structure HTML, la sérialisation et l'ordre des révisions peuvent évoluer.
  Une erreur de structure ou d'intégrité arrête la vérification du fichier ;
  jamais de remplacement implicite.
- L'égalité avec l'état actuel de LoSP ne prouve ni la fraîcheur ni le statut
  « actif en jeu » de l'instantané MagneticZero.
- Le passage de MagneticZero en **source principale de production** et le
  fallback manuel via l'extension Chrome constituent une étape séparée.
