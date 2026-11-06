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


## Évolution : checkpoints cumulés pour les invités

Les pages Évolution individuelles et collectives utilisent les mêmes périodes
et les mêmes calculs pour les alliances invitées et pour LoSP. Chaque alliance
invitée commence son histoire à son **premier checkpoint réel** (au plus tôt
le dimanche 8 novembre 2026). Deux checkpoints sont nécessaires pour une
comparaison ; aucun relevé antérieur n'est inventé.

Le collecteur Roster Service alimente un tampon R2 temporaire.
L'**historique de la WebApp est indépendant de ce tampon** : il possède
un index cumulatif et un fichier de checkpoint par dimanche sous
`webapp-evolution/v1/`, distinct du préfixe temporaire
`roster-batches/v1/`. L'archivage cumulatif est activé par
`GUEST_EVOLUTION_LONG_TERM_AUTHORIZED=true` dans `wrangler.jsonc`.
Il n'y a **pas de fenêtre glissante de 29 ou 30 jours dans Évolution**.

Un checkpoint enregistré est immuable : si un enregistrement est interrompu
après l'écriture du fichier mais avant celle de l'index, l'exécution suivante
vérifie et récupère l'archive existante au lieu de la réécrire. Les objets
corrompus ou incohérents sont signalés, jamais silencieusement remplacés.

Les **checkpoints d'Évolution invités**, distincts des rosters courants
publiés, ne sont pas publiés dans les JSON publics de GitHub Pages.
Leur lecture nécessite une session Discord signée et l'approbation
administrative de l'alliance. **Un joueur absent du dernier recensement d'alliance n'apparaît
plus** dans les listes, classements ou comparaisons de la WebApp ; ses anciens
checkpoints restent enregistrés, sans suppression automatique liée au départ.
La révocation et la suppression des données sur demande restent du ressort
du Roster Service.
