# MagneticZero prioritaire — collecte Codex LoSP

## Sources et fonctionnement

Source principale : https://msf-datamines.magneticzero.dev

Le collecteur `scripts/update_msf_magneticzero.py` exploite les pages publiques
`/file/combat_data/<nom>`, puis `/view/combat_data/<nom>/<sha256>`.
Ces pages sont du HTML, **pas des téléchargements JSON bruts** : l'extraction
du bloc `<pre>` utilise uniquement `html.parser` (bibliothèque Python standard).

Onze sources `combat_data` sont suivies. Elles doivent toutes être accessibles
et conformes avant toute écriture. Chaque révision est vérifiée par le SHA-256
de la sérialisation affichée par MagneticZero, et chaque JSON passe les contrôles
structurels du collecteur LoSP officiel. Le manifeste local est contrôlé par
SHA-256 et MD5 avant le moindre appel réseau.

Le collecteur :
- conserve les octets des fichiers qui sont sémantiquement identiques ;
- ne modifie jamais une source lorsque la collecte échoue ;
- rejette une révision déjà connue si le site présente une révision plus ancienne ;
- enregistre l'URL exacte, le hash de révision et les nouveaux MD5/SHA-256 ;
- écrit les 11 sources puis le manifeste **seulement après validation globale** ;
- ne relance le Codex que si les sources ou leur provenance ont changé ;
- n'utilise aucun token de session MSF, Chrome, Selenium ou dépendance Python externe.

**Important :** MagneticZero ne garantit pas que la dernière datamine est déjà
active dans le jeu. Le manifeste garde l'historique de la dernière version MSF
vérifiée par Chrome, mais pose `game.versionVerified=false` pour une révision
MagneticZero. Le builder masque alors les anciennes valeurs de version/build
plutôt que d'afficher un rattachement de version non démontré.

## Exécution

```bash
# Vérification sans écriture
python -m scripts.update_msf_magneticzero

# Mise à jour volontaire des 11 sources et de leur manifeste
python -m scripts.update_msf_magneticzero --apply

# Tests hors réseau
python -m unittest discover -s tests -p 'test_probe_magneticzero.py' -v
python -m unittest discover -s tests -p 'test_update_msf_magneticzero.py' -v
```

Workflow `.github/workflows/update-msf-magneticzero.yml` :
- consultation quotidienne à 06:23 UTC et déclenchement manuel ;
- sur PR : tests, collecte dry-run et reconstruction simulée dans le runner,
  **sans push** ;
- sur `main` après merge : collecte validée, parser, normalizer, indexer,
  publisher, Explorer, tests de non-régression et contrôles `--check`,
  puis un commit regroupant sources et artefacts si tout réussit ;
- erreur de téléchargement, d'intégrité ou d'audit : **aucune publication**.

Attention : le workflow conserve pour les **données générées** la convention
de publication automatique déjà employée par les workflows existants de LoSP.
Le code lui-même n'est jamais changé sur `main` sans PR.

## Secours Chrome

La chaîne actuelle reste disponible :
extension Chrome -> Worker Cloudflare -> `update-msf-capabilities.yml`.

Lors d'une demande via l'extension, ce workflow vérifie d'abord les onze
sources sur MagneticZero. Si elles sont accessibles et valides, l'extension
ne les remplace pas. Si elles sont indisponibles, la mise à jour Chrome
est autorisée **à condition** que sa version MSF soit au moins égale à la
dernière version vérifiée et, pour la même version, que son build soit
strictement plus récent. Cette règle est délibérément conservatrice :
une date fiable associant une datamine à un build MSF n'est pas disponible.

Un secours accepté reconstruit et valide le Codex avant d'enregistrer les
sources et les sorties ensemble. Les workflows de publication partagent
un même groupe de concurrence GitHub Actions.

## Limites

- La sélection de la première révision proposée par le site dépend de son
  ordre d'affichage actuel ; un changement du site doit entraîner un échec
  fermé, pas un fallback silencieux vers un mauvais fichier.
- Les différentes pages ne fournissent pas d'instantané global signé d'une
  version MSF. Une cohérence parfaite entre catégories reste à vérifier
  grâce aux audits du parser / normalizer / indexer / publisher.
- Les métadonnées MD5 de fichiers sérialisés depuis MagneticZero ne sont
  **pas** présentées comme des MD5 officiels du CDN Scopely.
- La publication automatique est conditionnée au succès des tests actuels
  et pourra refuser des nouvelles mécaniques tant qu'elles ne sont pas
  reconnues correctement, ce qui est préférable à une régression.
