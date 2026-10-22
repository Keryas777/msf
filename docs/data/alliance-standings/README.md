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

**Trophées de guerre** : la WebApp récupère les données **le jeudi et le samedi
à 06:40 UTC**, après les campagnes existantes du Roster Service
(02:00–06:00 UTC le lendemain des guerres du mercredi et du vendredi).
La WebApp **lit le R2 privé** et n'ajoute aucune requête Scopely ;
le Roster Service n'envoie rien à la WebApp.

Contrairement au **classement temporaire de saison**, les trophées sont des
totaux persistants : l'intervalle entre fin de zone 4 et début de zone 1
n'est **pas** une contrainte de collecte des trophées. Selon les horaires
précisés par l'administrateur, la guerre s'achève à **18:00 UTC** et la
préparation de la guerre suivante débute le lendemain à **15:00 UTC**.
Avec une marge configurable de **deux heures de chaque côté**, la fenêtre
prudente est de **20:00 UTC après la guerre à 13:00 UTC le lendemain**.
La fenêtre 02:00–06:00 UTC du lendemain s'y trouve aussi : le système
récupère les fiches **déjà archivées** pendant cette plage, après 06:00.

Ces horaires, le décalage jusqu'au lendemain et les marges sont définis
dans `config.json` sous `capture.trophies.window`, indépendamment du
calendrier de 14 jours des classements. Ces valeurs sont la convention
opérationnelle LoSP, sans prétendre vérifier un horaire officiel Scopely.
Le workflow **pull-alliance-standings-r2.yml** est installé côté WebApp,
mais son exécution programmée reste désactivée par défaut et la publication
nécessite une validation explicite. Une capture issue d'archives R2 est
composée des dernières fiches valides disponibles dans la plage 02:00–06:00,
avec l'horodatage réel de chaque alliance. Cela **ne garantit pas** le même
niveau de couverture qu'un scan simultané de 9 sessions ; le champ
`completeSessionScan` reste donc `false`, même si toutes les alliances
actives ont leur relevé. Aucune valeur absente n'est inventée.
Ne jamais antidater une capture. Si Scopely modifie les horaires,
ajuster la configuration et ses tests.

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

Cette capture ponctuelle n'a pas été exécutée au créneau récurrent de
21:00 UTC, mais le jeudi **22 octobre à 12:02 UTC** se situe dans la
fenêtre prudente suivant la guerre du mercredi (**20:00 UTC mercredi –
13:00 UTC jeudi**). Le fichier conserve l'heure réelle et ne prétend pas
qu'une collecte automatique a été exécutée. Aucun jeton, empreinte privée
ni donnée de session n'est publié.
Les réserves contractuelles de conservation des données de l'API restent applicables.

## Importation passive depuis R2 — préparation GitHub Actions

Le dépôt `Keryas777/msf` est **l'initiateur de toutes les lectures**.
Le service `losp-roster-service` n'est pas modifié ; aucun webhook, POST,
cron supplémentaire côté Worker ou appel Scopely n'est ajouté.
L'import s'exécute côté **GitHub Actions**, pas dans `alliance-history.js`
(compatible GitHub Pages et navigateur iOS).

1. Dans Cloudflare R2, créer des **identifiants S3 de lecture seule**
   limités au bucket `losp-roster-sessions` (ne jamais utiliser les secrets
   OAuth ou la clé de chiffrement des sessions capitaines).
   **Attention : le bucket contient aussi des informations privées** ;
   contrôler soigneusement les permissions, les environnements Actions et
   les personnes pouvant modifier les workflows.
2. Dans les **GitHub Actions Secrets** de `Keryas777/msf`, définir :
   `LOSP_R2_ACCOUNT_ID`, `LOSP_R2_ACCESS_KEY_ID`,
   `LOSP_R2_SECRET_ACCESS_KEY`, `LOSP_R2_BUCKET` et
   `LOSP_R2_ALLIANCE_MAP_JSON`. Cette dernière valeur est un objet JSON
   privé `{"cle_registre":"empreinte_sha256_de_l_AID"}` pour chaque
   alliance active de `docs/data/alliances.json`. Ne jamais committer
   les empreintes ni les données brutes d'alliance.
3. Le bouton GitHub Actions **Pull LoSP alliance history from private R2**
   permet une vérification manuelle **sans écriture** (`publish=false`).
   Une date passée au format UTC `YYYY-MM-DD` peut être fournie pour
   jeudi/samedi, tant que les objets R2 existent encore.
4. Avant toute publication automatique et conservation durable, **résoudre
   les droits de rétention et de redistribution des données Scopely** :
   les conditions API du 3 mars 2022 imposent un TTL maximum de 30 jours.
   Un historique permanent dans Git reste problématique sans autorisation
   explicite ou source indépendante autorisée. Après validation,
   `LOSP_R2_HISTORY_PUBLICATION_APPROVED=true` déverrouille l'option
   `publish=true` ; `LOSP_R2_HISTORY_IMPORT_ENABLED=true` active en plus
   les horaires du cron (jeudi/samedi 06:40 UTC). Ces variables de dépôt
   ne constituent pas, en elles-mêmes, une dérogation contractuelle.

Le lecteur R2 n'utilise que les objets
`roster-batches/v1/<fingerprint>/<run>/provider-source/<uuid>/alliance-card.json`,
vérifie la signature de l'AID stable, les bornes UTC et les valeurs numériques,
et n'écrit **que** le petit JSON public nettoyé si toutes les alliances
actives possèdent une capture valide. Chaque alliance conserve son
`capturedAt` distinct, le `capturedAt` global désigne le plus récent.
On ne prétend donc pas avoir effectué un scan complet de sessions OAuth.

Un jour de collecte déjà présent dans `index.json` est ignoré (idempotence) ;
les anciens relevés ne sont pas écrasés. Les rangs utilisent toujours le
calendrier de 14 jours existant, sans ajouter de saison fictive.
Les archives brutes restent dans R2 avec leur durée de vie propre.
