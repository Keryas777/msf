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

## Stockage et rétention

**Ne pas publier d'historique individuel permanent dans Git :** les
conditions d'utilisation de l'API Scopely limitent à 30 jours la
conservation des données issues de cette API.

1. Chaque exécution produit un **artefact GitHub Actions** éphémère ;
   la rétention est limitée à 30 jours, et raccourcie quand l'artefact
   contient le premier relevé réattribué au 31 octobre.
2. Un historique cumulatif glissant, utilisable ensuite par le graphique,
   peut être publié dans **R2 privé**, objet :
   arena-history/v1/rolling.json.
   Le script garde au plus 30 dates (jour courant et 29 jours précédents)
   et évite de réécrire les relevés des jours déjà conservés.
3. Configurer une **règle de lifecycle Cloudflare R2** supprimant les
   objets du préfixe arena-history/v1/ après 30 jours : protection
   indispensable si les workflows cessent de fonctionner.
4. R2 est facultatif tant que ces secrets GitHub Actions ne sont pas
   fournis : LOSP_R2_ARENA_ACCESS_KEY_ID et
   LOSP_R2_ARENA_SECRET_ACCESS_KEY (jeton R2 S3 lecture/écriture limité au
   stockage autorisé), en plus de LOSP_R2_ACCOUNT_ID et LOSP_R2_BUCKET
   déjà utilisés ailleurs. L'Action signale clairement ce mode dégradé.
5. L'interface statique et son futur graphique devront lire une
   **projection autorisée** de ce fichier via un Worker / service existant,
   jamais des identifiants R2 exposés dans le navigateur. La présente PR
   n'implémente pas encore cette interface.

Pour tester localement :

    node --test tests/arena-snapshot.test.mjs
    node scripts/snapshot-arena.mjs --day=2026-11-01

Le script dépend de la présence du commit initial dans l'historique Git
(checkout non shallow) afin de reconstruire fidèlement la base.
