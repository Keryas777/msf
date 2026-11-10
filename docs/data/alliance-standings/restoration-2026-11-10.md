# Rétablissement des historiques d’alliances — 10 novembre 2026

## Diagnostic vérifié

| Périmètre | Cause identifiée | Correction | État final |
|---|---|---|---|
| MARINES — trophées | Le lecteur de la page ne sollicitait pas le endpoint public de trophées du Worker. Les données live étaient filtrées hors du graphe avant toute association à la clé canonique. | Le lecteur fusionne désormais la projection publique du Worker avec les archives statiques, puis applique l’autorisation de l’utilisateur. L’association passe par la clé d’alliance approuvée ou un identifiant public enregistré ; un nom ambigu reste refusé. | **Corrigé mais publication en attente.** La présence des captures MARINES dans le R2 courant reste à confirmer après publication du lecteur. |
| EGR Orange — trophées | Même rupture commune dans le lecteur. Le Worker publie une clé invitée canonique lorsqu’elle est actuellement approuvée ; la WebApp n’appelait pas cette projection. | Même correctif partagé ; aucun cas spécifique à Orange. | **Corrigé mais publication en attente.** Présence des captures R2 à confirmer après publication. |
| QP — trophées | Même rupture commune dans le lecteur ; les données de trophées n’étaient pas intégrées depuis la projection Worker. | Même correctif partagé, avec filtrage par autorisation après association à l’alliance canonique. | **Corrigé mais publication en attente.** Présence des captures R2 à confirmer après publication. |
| EGR Red — trophées | Le constat antérieur indique que Red manque dans certaines captures du 9 novembre ; ce chantier n’a pas réexaminé la découverte de session. | Aucun rapprochement par pseudo ni session n’a été ajouté. Le lecteur accepte uniquement une liaison canonique fournie par la projection approuvée. | **Non résolu.** Dépend de la disponibilité d’une capture Red admissible ; vérifier après le chantier distinct de découverte des sessions. |
| LoSP — saison Guerre | La saison terminée 2026-10-25/2026-11-08 n’est pas dans l’index GitHub, alors que l’import R2 du 9 novembre a terminé avec succès. La validation a ensuite échoué au test d’idempotence incrémentale (3 !== 2) avant l’étape de commit. | Le test compare désormais le nombre final au nombre préexistant plus les deux captures ajoutées. Après fusion, relancer l’import ciblé existant pour le 9 novembre ; il réutilise les captures R2 déjà archivées. | **Corrigé mais publication en attente.** Classement LoSP de la saison disponible dans la source R2 au moment de l’exécution du 9 novembre ; à la date du constat, le délai de conservation de sept jours n’était pas écoulé. Rien n’est encore publié dans GitHub. |
| LoSP — saison Raid | Même rupture de publication que pour Guerre : la saison terminée n’a pas été consolidée dans GitHub. Le même import R2 contient les deux rangs officiels. | Même correctif de test et même republication ciblée ; aucune valeur extrapolée. | **Corrigé mais publication en attente.** Rang LoSP de la saison disponible dans la source R2 au moment de l’exécution du 9 novembre ; à la date du constat, le délai de conservation de sept jours n’était pas écoulé. Rien n’est encore publié dans GitHub. |

## Preuves d’archives et de lecture

- docs/data/alliance-standings/index.json référence des captures de trophées LoSP jusqu’au 7 novembre. Ces captures réelles contiennent six alliances LoSP, sans données invitées.
- docs/data/alliance-standings/season-history.json s’arrête pour LoSP à la saison terminée le 25 octobre.
- docs/data/alliance-standings/guest-season-history.json contient déjà la saison terminée le 8 novembre pour Orange, MARINES et QP, avec les rangs Guerre et Raid réellement capturés. Red n’y a pas de relevé pour cette saison.
- Le workflow Pull completed-season LoSP rankings from private R2, exécuté le 9 novembre, a réussi l’import et la consolidation ; le job a échoué ensuite pendant les tests et n’a donc pas commité ses fichiers. Le défaut de test était une assertion absolue qui ignorait une entrée de saison déjà présente.
- Le lecteur de page chargeait l’archive unifiée de saison, mais ne consommait ni LoSPTrophyLive.merge ni LoSPGuestSeasonLive.fromCloudflare. Les deux adaptateurs et leurs contrôles d’identité existaient déjà. C’est pourquoi les archives de saison invitées sont visibles dans le JSON alors que les trophées invités restent absents du graphe.
- Le Worker expose les projections en lecture seule sous /api/public/trophy-history et /api/public/guest-season-ranks. Cette enquête n’a lancé aucune collecte, aucun appel Scopely, aucune écriture R2 et aucune republication.

## Après fusion

Pour publier les classements LoSP encore retenus dans R2, lancer le workflow existant Pull completed-season LoSP rankings from private R2 depuis main, avec date=2026-11-09 et publish=true. Il exige la variable LOSP_R2_HISTORY_PUBLICATION_APPROVED=true et les secrets R2 déjà configurés. La procédure relit seulement les captures R2 présentes et publie les snapshots/index/historique existants.

Après publication du lecteur GitHub Pages, vérifier les trophées invités via les projections publiques du Worker. Si Red reste absente, ne pas lui attribuer une capture par pseudo : la résolution dépend du chantier distinct sur la découverte des sessions.
