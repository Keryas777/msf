# Contrat de transmission de données — LoSP et alliances invitées

Ce contrat concerne **les données réellement collectées, autorisées et
disponibles**, pas la création de mesures que Scopely ou les collecteurs
n'ont pas fournies. L'ajout d'une alliance invitée ne doit jamais nécessiter
un nouveau `if (alliance === ...)` dans une page.

## Sources actives

| Famille | LoSP | Alliances invitées | Consommateurs |
| --- | --- | --- | --- |
| Fiches Infos complètes | `docs/data/infos.json` | `/api/secure/guest-infos` (R2, session Discord signée) | TCP, MVP, fiche joueur |
| Répertoire des membres | `docs/data/joueurs.json` (LoSP actuellement) | Infos autorisées et noms présents dans les rosters publiés de l'alliance | Fiche joueur, ISO, classement des équipes |
| Rosters/ISO | `docs/data/rosters_<alliance>.json` | `docs/data/rosters_<alliance>.json` après publication GitHub ; R2 privé signé en repli temporaire avant le premier import | Fiche joueur, ISO, classements, contres |
| Arène quotidienne | `/api/public/arena-history` | `/api/secure/guest-arena-history` | Classement Arène |
| Rangs de saison Guerre/Raid | données de saison publiées | `/api/public/guest-season-ranks` | Historique d'alliances |
| Trophées | historique public | historique public avec liaison explicite | Historique d'alliances |

## Cible validée : annuaire public commun

Un unique `docs/data/joueurs.json` doit à terme contenir le répertoire
des **alliances LoSP et invitées**, sans traitement différent selon leur
groupement. Les entrées publiées sont limitées à la structure minimale
existante : `player` (pseudo en jeu) et `alliance` (clé WebApp canonique).
Ce fichier est public et sa consultation ne requiert pas de session Discord.

Le répertoire est généré automatiquement à partir des données d'alliances
collectées et validées par le Roster Service, via un processus de
synchronisation adapté à GitHub Pages (et non par une écriture depuis le
navigateur). `alliance-data.js` reste le point d'accès commun aux pages.
L'ajout d'une alliance ne doit nécessiter aucun branchement codé en dur.
Un échec de collecte ne doit pas effacer silencieusement les joueurs
précédemment publiés.

**L'annuaire commun n'est pas encore déployé** : `joueurs.json` reste
l'annuaire LoSP. Les rosters de chaque alliance, invitée comprise, sont
désormais compilés dans leurs fichiers individuels GitHub (après la première
publication complète), puis fusionnés dans `rosters.json` pour les outils
de traitement. Les lecteurs navigateur chargent les fichiers individuels.
Les fichiers GitHub Pages sont **publics par URL**, même si les menus
de la WebApp utilisent les droits Discord pour déterminer quoi charger.
Le consentement `rosterShare` doit être appliqué avant la publication.
Les fiches Infos détaillées et les archives privées R2 ne sont pas intégrées
à `joueurs.json`.

## Même structure Infos

Les champs historiques et enrichis de l'importeur LoSP sont conservés
lorsqu'ils sont présents dans une fiche Scopely valide :
`name`, `alliance`, `tcp`, `war_mvp`, `icon`, `frame`,
`rank`, `rosterShare`, `level`, `stp`, `charactersCollected`,
`daysInAlliance`, `charactersAtMaxStarRank`, `bestArena`,
`latestArena`, `latestBlitz`, `blitzWins`, `wwPoints`,
`qualifications`, `aid`, `profileStatus`.

L'alliance invitée reçoit une **clé WebApp canonique**, pas un nom stylisé
ambigu. Les membres avec `rosterShare === false` restent visibles dans le
répertoire et les Infos, mais leurs **rosters ne sont pas divulgués**.

## Accès et fraîcheur

- La session et les rôles Discord sont revérifiés **côté Worker** pour les
  données privées R2 ; les cases à cocher et l'aperçu administrateur ne
  donnent aucun droit supplémentaire sur ces API.
- Seules les **données privées** des alliances invitées encore approuvées
  et liées à une clé WebApp peuvent être lues via le Worker. Les homonymes
  sont indexés par **`alliance + joueur`**.
- Les rosters ayant reçu le consentement de partage sont publiés dans les
  fichiers individuels et le fichier consolidé GitHub Pages : leur accès
  direct par URL n'est pas protégé par Discord. Le lecteur navigateur
  applique le filtre de session avant le téléchargement, et garde les
  fichiers uniquement en mémoire de la page (pas en `localStorage`).
  Les autres données privées invitées restent dans le service sécurisé.
- Les collectes utilisent les permissions `rosterShare` et les fenêtres de
  rétention R2 existantes ; pas de nouvelle requête Scopely pour l'affichage.
- Quand aucune collecte complète valide n'existe, l'interface signale
  l'absence de données au lieu d'afficher un chiffre inventé.

## Données historiques : sources distinctes à ne pas inventer

Les checkpoints historiques de `data/roster-history` et les anciennes
statistiques de guerre LoSP ne sont pas contenus dans les campagnes R2 Infos
ou dans le dernier manifeste de roster invité. Leur transmission exige
une **vraie collection/autorisation d'historique invité** avec rétention
conforme et lecture authentifiée, et non la copie publique de l'historique
LoSP ou la réutilisation d'un joueur au même pseudo.

Les pages réservées au groupement LoSP par `auth-guard.js` conservent leurs
permissions : parité de données collectées ne signifie pas accorder aux
invités l'accès aux rapports internes des autres alliances.


## Évolution : publication statique LoSP et alliances invitées

Les pages `evolution.html` et `evolution-classement.html` lisent les historiques
depuis GitHub Pages. Les historiques invités ne sont plus lus par le navigateur
dans `/api/secure/guest-evolution` et ne requièrent aucun jeton Discord signé.
Les contrôles LoSPAccess filtrent toujours les alliances visibles dans l’interface ;
ils ne protègent pas les fichiers publics.

### Source R2 et synchronisation

Le Roster Service conserve l’archive cumulative validée sous
`webapp-evolution/v1/<fingerprint>/` : un index et un fichier immuable par
checkpoint réel. Le tampon `roster-batches/v1/guest-evolution/` n’est pas la
source de publication. L’export ne lance aucune collecte Scopely.

Le workflow `publish-guest-evolution.yml` relit les approbations R2, le registre
canonique `docs/data/alliances.json`, les consentements `rosterShare` courants
et les archives cumulées. Il s’exécute toutes les six heures et peut être lancé
manuellement. La publication reste désactivée tant que la variable Actions
`LOSP_R2_GUEST_EVOLUTION_PUBLICATION_APPROVED` n’est pas réglée à `true`.
Les identifiants R2 en lecture seule réutilisent les secrets existants
`LOSP_R2_ACCOUNT_ID`, `LOSP_R2_ACCESS_KEY_ID`,
`LOSP_R2_SECRET_ACCESS_KEY` et `LOSP_R2_BUCKET`.

Les fichiers invités sont séparés par clé d’alliance pour éviter les collisions :

- `docs/data/roster-history/guests/<alliance>/index.json`
- `docs/data/roster-history/guests/<alliance>/group/<date>.json`
- `docs/data/roster-history/guests/<alliance>/players/<playerKey>/<date>.json`
- `docs/data/roster-history/guests/<alliance>/infos.json` (données visuelles accessoires)

Les identifiants sont `g_<alliance>__<joueur-normalisé>`. Chaque checkpoint conserve
sa date réelle, son horodatage source, ses personnages, puissances et ISO. Un
premier checkpoint donne une disponibilité sans progression ; deux relevés réels
sont nécessaires pour calculer une évolution.

### Consentement et révocations

Avant publication, l’export exige un reçu Infos valide et récent (moins de sept
jours), une autorisation d’alliance approuvée et une clé canonique présente dans
`alliances.json`. Il ne publie que les joueurs dont le dernier reçu confirme
`rosterShare === true`. Si le reçu est absent, expiré, invalide ou inaccessible,
l’alliance est ignorée et ses fichiers précédents sont conservés. Une révocation
de partage individuelle retire ce joueur de tous les checkpoints exportés lors
de la prochaine synchronisation. Une approbation d’alliance retirée supprime son
répertoire statique lors de la prochaine synchronisation.

Les exports valides sont préparés et contrôlés avant remplacement des fichiers
d’une alliance. Une panne R2 temporaire ou un checkpoint incohérent ne supprime
pas l’historique valide d’une autre alliance. Les exports sont idempotents.
Les métadonnées publiques excluent les empreintes R2, identifiants Discord,
jetons, secrets et autres champs privés.

### Confidentialité, intégration et reprise

Tout JSON sous GitHub Pages est public et téléchargeable directement. Le filtre
Discord de l’interface ne constitue pas une barrière d’accès. L’activation de la
variable de publication doit donc correspondre à une autorisation explicite de
rendre ces historiques publics selon les règles de consentement applicables.
Supprimer un fichier de la version courante ne retire pas les anciennes copies
des commits Git, des caches ou des téléchargements déjà effectués : l’effacement
rétroactif n’est pas garanti.

Une nouvelle alliance est intégrée sans changement de JavaScript ou de workflow
dès qu’elle est approuvée, liée dans les registres canoniques, visible dans
`alliances.json`, et possède un premier checkpoint cumulatif ainsi qu’un reçu
de consentement vérifiable. Les progressions deviennent calculables à son second
checkpoint réel.

En cas d’échec, consulter le résumé et les journaux de l’action. Corriger la
cause R2 ou le registre, puis relancer le workflow ; l’export relit les archives
existantes sans relancer de collecte. Une prévisualisation locale s’effectue
avec `node scripts/publish-guest-evolution.mjs --dry-run`. Le mode d’écriture
nécessite explicitement `--write` et la variable d’approbation ci-dessus.
