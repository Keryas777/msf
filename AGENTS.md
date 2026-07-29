# AGENTS.md — App MSF / LoSP

## Règles générales

- Application statique servie via GitHub Pages depuis le dossier `/docs`.
- Ne pas déplacer, renommer ou casser le dossier `/docs`.
- Ne pas casser les chemins relatifs vers `/docs/data`.
- Ne pas renommer les clés JSON existantes sans demande explicite.
- Ne pas supprimer de données sans demande explicite.
- Ne pas réécrire entièrement un fichier si une modification ciblée suffit.
- Préférer les petits patchs faciles à relire.
- Toujours expliquer clairement le diff final.

## Structure du projet

- Les fichiers principaux de l'application sont dans `/docs`.
- Les données JSON principales sont dans `/docs/data`.
- Le JavaScript principal peut contenir de la logique liée aux alliances, joueurs, rosters, teams, classements et filtres.

## Alliances

Les alliances connues sont :

- `zeus`
- `athena`
- `kronos`
- `dionysos`
- `poseidon`
- `hades`

Si un fichier `alliances.json` existe, l'utiliser comme source de vérité pour les labels, emojis, couleurs et métadonnées d'alliance, au lieu de recoder ces informations en dur.

## Données JSON

- Préserver les structures JSON existantes.
- Ne jamais changer un format de données sans expliquer l'impact.
- Ne pas modifier les données métiers sauf si la tâche le demande clairement.
- Vérifier que les `fetch()` pointent toujours vers les bons chemins relatifs.

## CSS et interface

- Ne pas modifier le CSS sauf demande explicite.
- Ne pas changer l'apparence globale sans validation.
- Préserver l'affichage mobile.

## Vérifications attendues

Après une modification JavaScript ou JSON :

- vérifier que les chemins vers `/docs/data/*.json` restent cohérents ;
- vérifier qu'aucune clé utilisée par l'application n'a été renommée ;
- signaler les zones risquées au lieu de les modifier silencieusement ;
- fournir un résumé des fichiers modifiés.
