# Historique LoSP — trophées et rangs d'alliance

Ce dossier définit le **contrat de données** des graphiques de la WebApp statique. Deux relevés réels (21 et 22 octobre 2026) sont désormais disponibles pour les trophées de guerre ; les classements de saison restent sur un seul point pour la dernière saison terminée.

## Organisation

- `index.json` : liste chronologique des captures disponibles, avec heure UTC exacte et chemin relatif. Le lecteur doit suivre cet index, **pas deviner des noms de fichiers** ni lister des répertoires GitHub.
- `config.json` : définition des trois séries et fréquences ; aucune alliance n'y est écrite en dur.
- `snapshots/<timestamp>.json` : un **instantané global** (toutes les alliances présentes) à chaque relevé, contenant les valeurs source et la couverture de capture. Utiliser le format UTC `YYYY-MM-DDTHHmmssSSSZ.json` ; l'horodatage `capturedAt` en ISO 8601 reste la référence.

Les clés `alliances[].key` sont celles de `../alliances.json`, qui fournit l'ordre, les noms, emojis et couleurs d'affichage. Les variantes Unicode du nom officiel (`nameAtCapture`) ne servent **jamais** de clé de rapprochement. Ne pas publier les empreintes internes `allianceFingerprint` ni les données de sessions OAuth.

## Mesures et saisons : règles de tracé

La WebApp n'interroge pas directement Scopely. Les fréquences de capture seront
définies dans un chantier séparé. Le contrat des graphiques est désormais :

| Courbe | Champ | Points affichés | Sens de lecture |
| --- | --- | --- | --- |
| Trophées de guerre | `warTrophies` | Chaque relevé disponible après une guerre (objectif : deux/semaine) | Plus = mieux |
| Classement raid | `raidRank` | **Un point par saison terminée identifiée** | Rang 1 = meilleur |
| Classement guerre | `warRank` | **Un point par saison terminée identifiée** | Rang 1 = meilleur |

Les rangs d'AllianceCard sont ceux de la **dernière saison achevée**.
Ce n'est **pas** le classement de la saison en cours au moment du relevé.
Si plusieurs relevés appartiennent à une même saison, conserver **un seul point**
pour ce `seasonId` ; privilégier le dernier relevé complet. Ne pas
calculer artificiellement « tous les 15 jours » à partir de `capturedAt`.
Les listes de dernières valeurs sous les courbes utilisent le **même
échantillon que leur graphique**, sans données supplémentaires.

Chaque capture garde sa date réelle `capturedAt` (celle des trophées),
mais ses rangs sont liés à la saison **achevée** grâce à :

- `seasonId` : clé stable de la période, p. ex. `2026-09-27/2026-10-11` ;
- `seasonVerified` : affectation validée par l'administrateur, et non par l'API ;
- `rankingSeason.startAt` et `rankingSeason.endExclusiveAt` : bornes
  **UTC**, borne finale exclusive ;
- `rankingSeason.identification: "user-confirmed"` :
  source de la qualification de saison ;
- `rankingSeason.timezone: "Europe/Paris"` : fuseau d'affichage.

L'API ne renvoie aucun identifiant de saison. Pour une capture non attribuable
avec certitude, laisser `seasonVerified:false` ; ne jamais deviner sa période.

### Relevé initial et passage à l'heure d'hiver

Le relevé du **21 octobre 2026, à 10:55:00 UTC**, contient les rangs guerre
et raid de la saison **du 27 septembre 2026 à 22 h (CEST) au 11 octobre
2026 à 21 h 59 (CEST)**, confirmé par l'administrateur. En UTC :

`[2026-09-27T20:00:00.000Z, 2026-10-11T20:00:00.000Z[`

Le total de trophées enregistré simultanément est, lui, celui du
**21 octobre**, et ne doit pas être reporté au 11 octobre.

La saison suivante est annoncée du **11 au 25 octobre 2026**. Sous
l'hypothèse (à confirmer côté MSF) d'un changement de saison conservé
à **20 h UTC**, elle se terminera le dimanche 25 octobre à **20 h 59,
heure française CET**, avec une saison suivante commençant à 21 h CET.
Le retour à l'heure d'hiver survient dans la nuit du 24 au 25 octobre.
Ne pas inscrire cette hypothèse comme saison vérifiée avant observation.

`warTrophies` reste un total de trophées, non un score saisonnier.
L'API ne fournit pas le total de points de saison raid.

Les captures partielles conservent `completeSessionScan:false` et leurs
compteurs de couverture ; aucune valeur manquante n'est transformée en zéro.

## Ajout d'un relevé

1. Capturer les cinq alliances avec leurs autorisations existantes, puis vérifier noms, nombres et heure de capture.
2. Créer **un nouveau fichier** sous `snapshots/`, sans réécrire les anciens. Conserver `capturedAt`, les champs numériques et la qualification de saison.
3. Ajouter **une seule entrée** à `index.json`, ordonnée par `capturedAt` et sans doublon.
4. Valider les clés dans `../alliances.json` et exécuter `node --test tests/alliance-standings-data.test.mjs`.
5. Vérifier la provenance de l'affectation de saison. Les graphiques existants lisent l'index et les captures, sans modification de l'accueil.

## Provenance et conservation

Le premier relevé est le JSON fourni par l'administrateur depuis le Roster Service officiel OAuth (`source: /player/v1/alliance/card`). Une capture d'écran du site officiel confirme séparément **les trois valeurs de Zeus** au 21 octobre : 2 875 trophées, rang guerre 322, rang raid 77. Elle ne constitue pas une vérification indépendante des quatre autres alliances.

**Point de conformité à résoudre avant de mettre en place un historique permanent** : les *Marvel Strike Force API Terms of Use* (clause « maximum 30-day TTL », version du 3 mars 2022) s'appliquent explicitement aux données obtenues par leur API. Le fait de déposer le fichier dans un autre dépôt ou que certains chiffres soient visibles sur le site ne prouve pas une dérogation à cette clause. L'historique Git ne garantit pas l'effacement. Une source indépendante autorisée ou l'accord de Scopely est à vérifier pour des archives durables. Cette documentation ne prétend pas que la conservation historique indéfinie de captures OAuth est autorisée.

Aucune automatisation de récupération, aucun accès aux tokens et aucune modification du Roster Service ne sont réalisés ici.

## Calendrier validé pour les prochaines collectes (22 octobre 2026)

`config.json` contient un calendrier **prévisionnel** partagé pour les rangs de
guerre et de raid : cycle normal de **14 jours**, ancré sur la borne confirmée
du **11 octobre 2026 à 20:00 UTC**. Une nouvelle saison commence à cette borne
et s'achève 14 jours après. L'horodatage reste en UTC, l'affichage dans
`Europe/Paris` (y compris autour du changement d'heure).

Le sélecteur `resolveRankingSeason` calcule la **dernière saison achevée**,
avec 60 minutes de réserve pour la publication des rangs par Scopely.
Les saisons calculées portent `identification: "schedule-derived"` et
`seasonVerified: false`, sans se faire passer pour des données vérifiées.
Un snapshot possédant `seasonVerified: true` conserve toujours ses dates
et son identifiant confirmés. Les captures non qualifiées sont regroupées
par saison calculée, à raison d'un point par saison, avec préférence aux
captures complètes. Si le calendrier s'avère incorrect, le corriger dans
`config.json` **avant** d'importer de nouvelles captures. Ne jamais fabriquer
de rangs ni de trophées.

**Trophées de guerre** : le planning retenu est le **mercredi et le vendredi
à 21:00 UTC**, soit 23:00 en été / 22:00 en hiver en France.
La zone 4 doit avoir terminé sa guerre (19:00 UTC) et la zone 1 ne doit
pas encore avoir lancé la suivante (01:00 UTC le lendemain du mercredi,
01:00 UTC le mardi suivant après le vendredi).
Ce planning est une **configuration de consommation pour le futur collecteur** :
il ne déclenche actuellement aucune requête ni aucun cron. Pour chaque
capture, vérifier la date UTC réelle, l'actualisation des résultats et
`completeSessionScan`. Ne pas antidater une capture obtenue trop tard.
Si Scopely modifie les horaires des guerres ou la longueur des saisons,
ajuster la configuration et ses tests avant la collecte.

**Attention** : les données d'AllianceCard proviennent de l'API officielle.
La limite de conservation de 30 jours mentionnée plus haut demeure à
résoudre avant d'automatiser un archivage durable. La configuration de
collecte n'autorise pas à elle seule la conservation illimitée.

## Relevé manuel du 22 octobre 2026

Le relevé à **2026-10-22T12:02:08.591Z** (14:02 heure française) a été transmis par
l'administrateur via la capture `/player/v1/alliance/card` de l'interface
privée du Roster Service. Couverture : 9 sessions valides sur 9, 5 alliances,
`completeSessionScan: true`. Les trophées ont évolué pour toutes les alliances :
Zeus 2 806, Athéna 2 604, Kronos 2 684, Dionysos 2 663, Poséidon 2 264.
Les rangs retournés n'ont pas changé par rapport au 21 octobre ;
`seasonVerified: false` est conservé conformément à la capture source.
Le calendrier déjà présent dans la WebApp attribue ces rangs à la dernière
saison achevée, sans ajouter de point saisonnier : le premier relevé confirmé
est conservé en priorité. Pour les trophées, **les deux observations réelles**
sont affichées, sans interpolation.

Cette capture ponctuelle a eu lieu **hors du créneau futur configuré à 21h UTC** ;
le fichier conserve l'heure réelle et ne prétend pas qu'une collecte planifiée
a été exécutée. Aucun jeton, empreinte privée ni donnée de session n'est publié.
Les réserves contractuelles de conservation des données de l'API restent applicables.
