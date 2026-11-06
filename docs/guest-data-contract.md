# Contrat de transmission de données — LoSP et alliances invitées

Ce contrat concerne **les données réellement collectées, autorisées et
disponibles**, pas la création de mesures que Scopely ou les collecteurs
n'ont pas fournies. L'ajout d'une alliance invitée ne doit jamais nécessiter
un nouveau `if (alliance === ...)` dans une page.

## Sources actives

| Famille | LoSP | Alliances invitées | Consommateurs |
| --- | --- | --- | --- |
| Fiches Infos complètes | `docs/data/infos.json` | `/api/secure/guest-infos` (R2, session Discord signée) | TCP, MVP, fiche joueur |
| Répertoire des membres | `docs/data/joueurs.json` (LoSP actuellement) | Dérivé des Infos ; fallback des rosters autorisés (accès privé actuellement) | Fiche joueur, ISO, classement des équipes |
| Rosters/ISO | `docs/data/rosters.json` | `/api/secure/guest-rosters?alliance=<key>` (R2, session signée) | Fiche joueur, ISO, classement des équipes |
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

**Cette cible est approuvée mais n'est pas encore déployée** : les sources
décrites dans le tableau ci-dessus restent celles du code actuel. Les
fiches Infos détaillées, les rosters, les puissances, les données ISO et
les historiques privés des invités ne sont pas publiés dans ce fichier.
Leur accès reste soumis aux autorisations et aux consentements existants,
notamment `rosterShare`. L'affichage filtré dans la WebApp ne rend pas
privés les pseudos déjà présents dans ce JSON public.

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

- La session et les rôles Discord sont revérifiés **côté Worker** ;
  les cases à cocher et l'aperçu administrateur ne donnent aucun droit.
- Seules les **données privées** des alliances invitées encore approuvées
  et liées à une clé WebApp peuvent être lues via le Worker. Les homonymes
  sont indexés par **`alliance + joueur`**.
- Seuls les pseudos et les clés d'alliance du répertoire commun peuvent
  être fusionnés dans le JSON public `docs/data/joueurs.json`. Les
  fiches Infos détaillées, rosters et autres données privées des invités
  ne sont ni publiés dans les JSON publics ni stockés dans le
  `localStorage` du navigateur.
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


## Évolution : conservation et visibilité des checkpoints

L'interface Évolution (détail + classement) est **la même** pour LoSP et les
invités. Les invités commencent leur chronologie au premier dimanche de
collecte effectivement réussie (au plus tôt le 8 novembre 2026). Deux
checkpoints véritables sont nécessaires pour calculer une progression.

**Exigence produit :** une fois un checkpoint valide enregistré pour la
WebApp, il ne doit pas disparaître *simplement parce qu'un nouvel état a été
collecté ou qu'une fenêtre glissante s'est écoulée*. Les périodes 1, 3, 6 et
12 mois et les dates personnalisées deviennent progressivement disponibles
selon les relevés réellement conservés, sans reconstituer le passé.

La WebApp GitHub Pages est statique : elle ne peut pas stocker elle-même des
données privées. La solution technique préparée garde une archive
**WebApp privée** sous un préfixe R2 distinct des reçus éphémères du
Roster Service, avec un index et **un fichier immutable par dimanche**.
Les pages existantes continuent à lire la même API signée et vérifient les
droits Discord. Aucun checkpoint ni historique privé invité n'est publié
dans `docs/data/` ; seul l'annuaire minimal décrit plus haut fait exception.

**Réserve contractuelle impérative avant activation :** les API Terms of Use
Scopely fournis dans le projet (3 mars 2022) indiquent une durée maximale
de 30 jours pour les données obtenues via les API, indépendamment de la
destination de stockage. Une conservation indéfinie de relevés individuels
requiert donc une autorisation/clarification écrite de Scopely. Le code
d'archivage durable est préparé derrière un drapeau explicitement désactivé
tant que cette question et le traitement de suppression sur demande ne
sont pas validés. Les exceptions d'effacement et de retrait de consentement
priment toujours sur le souhait de conserver l'historique.
