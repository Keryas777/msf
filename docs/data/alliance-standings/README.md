# Historique LoSP — trophées et rangs d'alliance

Ce dossier définit le **contrat de données** des futurs graphiques de la WebApp statique. Le jeu de données du 21 octobre 2026 est un premier relevé, pas encore une série chronologique permettant de tracer des courbes.

## Organisation

- `index.json` : liste chronologique des captures disponibles, avec heure UTC exacte et chemin relatif. Le lecteur doit suivre cet index, **pas deviner des noms de fichiers** ni lister des répertoires GitHub.
- `config.json` : définition des trois séries et fréquences ; aucune alliance n'y est écrite en dur.
- `snapshots/<timestamp>.json` : un **instantané global** (toutes les alliances présentes) à chaque relevé, contenant les valeurs source et la couverture de capture. Utiliser le format UTC `YYYY-MM-DDTHHmmssSSSZ.json` ; l'horodatage `capturedAt` en ISO 8601 reste la référence.

Les clés `alliances[].key` sont celles de `../alliances.json`, qui fournit l'ordre, les noms, emojis et couleurs d'affichage. Les variantes Unicode du nom officiel (`nameAtCapture`) ne servent **jamais** de clé de rapprochement. Ne pas publier les empreintes internes `allianceFingerprint` ni les données de sessions OAuth.

## Fréquences des futures courbes

Une capture deux fois par semaine suffit à alimenter **les trois métriques**, sans effectuer trois collectes redondantes :

| Courbe | Champ | Points affichés | Sens de lecture |
| --- | --- | --- | --- |
| Trophées de guerre | `warTrophies` | Tous les relevés (objectif : 2/semaine) | Plus = mieux |
| Classement raid | `raidRank` | Un relevé réel environ tous les 15 jours | **Plus petit = mieux** |
| Classement guerre | `warRank` | Un relevé réel environ tous les 15 jours | **Plus petit = mieux** |

Les points « tous les 15 jours » seront sélectionnés parmi les **dates réellement capturées**, sans interpolation ni ajout de valeurs supposées. Le filtre doit rester déterministe par date UTC. L'affichage des rangs inversera l'axe vertical ou explicitera que le rang 1 est le meilleur.

## Saisons et fiabilité

L'API `/player/v1/alliance/card` renvoie les **derniers rangs connus**, mais **pas l'identifiant de saison**. Ainsi, `seasonId:null` et `seasonVerified:false` sont des informations substantielles : ne pas inventer une saison à partir de la date du relevé, ni tracer une continuité trompeuse entre deux saisons sans avoir identifié la transition.

`warTrophies` est le niveau de trophées détenu par l'alliance ; **ce n'est pas le score de classement d'une saison de guerre**. Aucun champ de points saisonniers de raid n'est présent dans le relevé.

Un instantané incomplet garde `completeSessionScan:false` et ses compteurs de couverture ; les alliances manquantes restent manquantes (pas de valeur 0 ou de reprise implicite d'une capture antérieure).

## Ajout d'un relevé

1. Capturer les cinq alliances avec leurs autorisations existantes, puis vérifier noms, nombres et heure de capture.
2. Créer **un nouveau fichier** sous `snapshots/`, sans réécrire les anciens. Conserver `capturedAt`, les champs numériques et la qualification de saison.
3. Ajouter **une seule entrée** à `index.json`, ordonnée par `capturedAt` et sans doublon.
4. Valider les clés dans `../alliances.json` et exécuter `node --test tests/alliance-standings-data.test.mjs`.
5. Les graphiques seront créés plus tard ; aucun code actuel de classement, PWA, roster ou guerre n'est modifié dans cette première étape.

## Provenance et conservation

Le premier relevé est le JSON fourni par l'administrateur depuis le Roster Service officiel OAuth (`source: /player/v1/alliance/card`). Une capture d'écran du site officiel confirme séparément **les trois valeurs de Zeus** au 21 octobre : 2 875 trophées, rang guerre 322, rang raid 77. Elle ne constitue pas une vérification indépendante des quatre autres alliances.

**Point de conformité à résoudre avant de mettre en place un historique permanent** : les *Marvel Strike Force API Terms of Use* (clause « maximum 30-day TTL », version du 3 mars 2022) s'appliquent explicitement aux données obtenues par leur API. Le fait de déposer le fichier dans un autre dépôt ou que certains chiffres soient visibles sur le site ne prouve pas une dérogation à cette clause. L'historique Git ne garantit pas l'effacement. Une source indépendante autorisée ou l'accord de Scopely est à vérifier pour des archives durables. Cette documentation ne prétend pas que la conservation historique indéfinie de captures OAuth est autorisée.

Aucune automatisation de récupération, aucun accès aux tokens et aucune modification du Roster Service ne sont réalisés ici.
