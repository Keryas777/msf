# Historique Arène — snapshots quotidiens

Ce chantier n'ajoute aucun appel Scopely. Il exploite les données enrichies
déjà importées dans docs/data/infos.json et la provenance vérifiée
.github/infos-r2-import-state.json.

## Relevé initial (31 octobre 2026)

- Première source réelle : campagne **2026-11-01-am** des six alliances.
- Publication Git : **2026-11-01T12:09:57Z**.
- Révision immuable : f7079efc3b5b498415644b78ecd13148b2196190.
- Date de classement demandée : **2026-10-31**.
- Attribution : backdated-from-first-next-day-collection.

Ce n'est **pas** une mesure prise le 31 octobre. Le champ sourceDay,
la campagne, la date de publication et attribution sont maintenus pour
éviter qu'un point rétrospectif soit présenté comme une vraie observation.

## Automatisation

.github/workflows/snapshot-arena.yml :
- Exécution quotidienne à **21:30 UTC** et déclenchement manuel.
- Lecture du main courant après l'import Infos déjà existant de 16:40 UTC.
- Snapshot journalier **seulement si toutes les alliances actives ont une
  campagne datée du jour**. Aucune valeur de la veille n'est copiée comme
  si elle venait du jour courant.
- Les rangs manquants / 0 sont exclus ; les ex æquo sont conservés.
- Chaque snapshot contient date, provenance, alliance, pseudo canonique,
  playerKey et arenaRank.
- Tests Node intégrés. Pas de modification de rosters, autres classements,
  ni d'appel API externe.

## Conservation permanente dans la WebApp

Chaque relevé valide est publié dans `docs/data/arena-history/snapshots/YYYY-MM-DD.json`.
Le fichier `docs/data/arena-history/index.json` référence toutes les dates.
La publication est append-only : aucune purge, aucune fenêtre glissante,
aucune réécriture d'un relevé déjà archivé. Les jours sans import frais
ne sont pas inventés. Les relevés existants ne sont pas supprimés.

Le workflow `.github/workflows/snapshot-arena.yml` génère les relevés
puis les commit dans `main` pour GitHub Pages, sans requête Scopely.
La politique de collecte et de rétention des fichiers source reste
du ressort du LoSP Roster Service, indépendamment de cet historique.

Pour tester localement :

    node --test tests/arena-snapshot.test.mjs
    node scripts/snapshot-arena.mjs --day=2026-11-01

Le script dépend de la présence du commit initial dans l'historique Git
(checkout non shallow) afin de reconstruire fidèlement la base.
