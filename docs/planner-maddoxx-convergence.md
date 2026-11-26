# Maddoxx — convergence LoSP et journal permanent de la phase 1

> **État courant au 26 novembre 2026 — bilan de phase 1 avant validation finale.** Les décisions et constats ci-dessous remplacent les choix d’architecture plus anciens conservés plus bas à titre d’historique. PR #218 et #739 restent ouvertes et en brouillon. Aucune fusion, aucun déploiement et aucun nouvel appel personnel Scopely.

## Décision d’architecture définitive

La WebApp LoSP reste répartie sur les deux infrastructures existantes, avec navigation entre elles.

- **losp-roster-service / Worker Cloudflare** conserve Maddoxx et toutes ses données et opérations personnelles : passerelle Scopely et son URL enregistrée, OAuth, sessions, consentements/scopes, collecte/distribution, R2 et rétention existante (30 jours maximum), événements, objectifs, progression et inventaire personnels, moteur et interface du planificateur. Aucun historique Scopely additionnel ne sera ajouté.
- **msf / GitHub Pages** conserve les outils communautaires/statistiques et l’entrée propriétaire vers la page Maddoxx du Worker. Il continue de consommer les données du roster-service selon les intégrations existantes; aucune nouvelle passerelle Scopely.
- L’accès propriétaire, Cloudflare Access, l’allowlist, les scopes et les règles OAuth restent inchangés. Aucun jeton OAuth n’est envoyé au navigateur.
- La page Événements publique et son expérience actuelle sont hors périmètre de cette phase; la convergence graphique et la migration éventuelle de cette page sont reportées.
- Les expériences ajoutées par ces PR pour ticket inter-domaines, origine commune, hébergement Maddoxx dans msf/docs ou migration d’infrastructure sont abandonnées. Elles ne justifient ni domaine, ni Worker, ni passerelle supplémentaire. Le lien propriétaire vers le Worker est conservé.
- Les mécanismes génériques d’authentification, de session ou de stockage déjà utilisés par d’autres fonctionnalités ne doivent pas être supprimés ni modifiés.

## Phase 1 — périmètre et point de reprise

Phase en cours : actualisation différentielle du moteur Maddoxx du 25 novembre, référentiel indépendant des inventaires personnels, identification ISO-8, inventaire, normalisation des objectifs/progression, fondations de faisabilité et validation. Pas de refonte graphique, mutualisation multi-événements, calendrier global, optimisation globale, persistance supplémentaire ou ouverture à d’autres joueurs.

### État Git récupéré avant modification

| Dépôt / PR | Branche | SHA de tête constaté | État |
|---|---|---|---|
| `Keryas777/losp-roster-service` #218 | `work/maddoxx-convergence-ui` | `f31986035cb65ab8b0645cc0e29e9ece69c5ff39` | ouverte, brouillon, `mergeable=true`; aucun retard de base signalé par l’API PR au point de contrôle |
| `Keryas777/msf` #739 | `work/maddoxx-convergence-owner-entry` | `7a6150a5c64aa1fd01caa62bd57b448191d41707` | ouverte, brouillon, `mergeable=true`; 18 commits derrière main, sans conflit de contenu signalé. Les contrôles requis en échec bloquent l’intégration même si le calcul de fusion est positif. |

Les deux PR ont été relues avec leurs diffs actuels. Les discussions, soumissions de revue et fils de revue sont vides. Les SHA ci-dessus sont le point de départ avant les modifications de cette phase. Les mises à jour seront limitées à ces branches.

### CI de référence avant modification

- #218 : Event planner tests #56 passe. Le parcours mobile #56 passe aux largeurs 320/360/390/430 px sous Chromium et WebKit; seul le test expérimental de ticket/cookie inter-domaines échoue sous WebKit, sans prouver le comportement réel de Safari iOS. Worker OAuth tests #817 : 885/900; les 15 échecs sont identiques au run main de référence #45507035749.
- #739 : Planner owner link checks #13 et Events R2 validation #140 passent. Guest LoSP access #502 et unified season history #170 échouent; leurs journaux sont à rapprocher des runs main pour établir le détail et leur relation avec cette PR.
- Les quatre captures synthétiques Chromium déjà produites sont dans l’artefact [Actions #45756968551](https://github.com/Keryas777/losp-roster-service/actions/runs/45756968551), qui expire le 10 décembre 2026. Elles ne sont pas une validation Safari iOS réelle.

### Versions Maddoxx reçues et audit différentiel conclu

Les deux archives jointes sont accessibles et ont été examinées; aucune n’est publiée dans GitHub.

| Archive | Version annoncée | SHA-256 | Résultat |
|---|---:|---|---|
| planificateur-evenements-2026-11-21(3).zip | 21 novembre 2026 | 233e9b67efcab7fab5ac2eb53d7c2c82256bb33acca3829655867bb7762d2716 | 37 fichiers |
| planificateur-evenements-2026-11-25.zip | 25 novembre 2026 | 39664f61c9cb22fe19786da96287c1e530267eb25229c24a94c78f7f8f423e84 | 45 fichiers, 10 ajouts, aucun retrait |

La version ayant servi de base à l’intégration initiale est identifiée comme celle du 21 novembre : le commit d’intégration du 23 novembre 824229edc85a correspond au moteur de cette archive. plan.js et subjects.js sont identiques; classify.js diffère par l’import JSON adapté au Worker/navigateur; ledger.js contient les garde-fous LoSP ajoutés pour conserver les compteurs et paliers inconnus au lieu de les convertir en zéro.

Entre les ZIP du 21 et du 25, les modules purs partagés (plan, ledger, subjects, ressources et service événements) ne changent pas. La correction fonctionnelle du classificateur ajoute la reconnaissance de Play Battles with …, avec ou sans article, au singulier ou au pluriel. Les 10 ajouts du 25 comprennent les services PC (commande, calcul et groupement) et le plan de combat partagé, ainsi que les composants React/CSS correspondants et l’indicateur Premium.

Aucun fichier LICENSE ni condition de redistribution explicite n’a été trouvé dans le ZIP. Aucun module React, serveur Express, cache fichier ou service original n’est recopié dans les branches LoSP; les adaptations sont ciblées et le moteur vanilla ainsi que ses protections restent la base.

### Travail existant conservé et incréments de la phase

Avant cette phase, #218 contient déjà le Worker protégé, la progression Maddoxx, l’analyse de faisabilité, le regroupement personnage/action, les portraits partagés, les barres seulement lorsque fiables, le ledger du stock/récompenses, l’inventaire compact français, la séparation stock connu/nul/inconnu, les diagnostics et l’isolation locale par session. Le scénario Faim mutante est une fixture, pas une règle de production.

La phase ajoute la reconnaissance du libellé de combat corrigé le 25 novembre, conserve isPremium comme information fournie par l’API sans en tirer une obligation payante, et groupe les séries du poste de commandement sous leur carte parente. Le nouveau module ne fait aucun appel; il utilise la liste déjà chargée, n’affirme la fin que si tous les plafonds et compteurs nécessaires sont numériques, et conserve les valeurs manquantes comme inconnues. Le Worker autorise explicitement ce module sous le même contrôle de session existant.

La preuve de faisabilité inter-domaines a été retirée du workflow actif avec son script de test; aucune route/ticket réel n’avait été ajouté. Le lien propriétaire de navigation existant est conservé dans #739. Les menus et la page Événements publique ne sont pas refaits.

### Travail restant au point de reprise

1. Terminer la validation Chromium/WebKit après le dernier ajustement du parcours de test.
2. Mettre à jour la documentation d’intégration, le journal et les descriptions des deux PR avec les résultats CI finaux.
3. Auditer la matrice cristaux ISO-8 lorsque les définitions structurées d’objets ou un corpus vérifiable seront disponibles; ne pas inventer de parser à partir d’un identifiant d’exemple.
4. Compléter les projections PC et récompenses seulement avec une fixture de détails anonymisée/synthétique qui confirme le modèle des paliers et le comportement Scopely. Le calcul de points PC n’est pas déclaré implémenté dans cet incrément.
5. Poursuivre la normalisation des objectifs, la traduction et l’analyse de faisabilité dans les données effectivement disponibles, sans nouveau stockage personnel ni nouvel appel Scopely.

## Audit final de la reprise — 26 novembre 2026

Les notes de progression antérieures qui suivaient ce titre ont été condensées ici. Elles restent accessibles dans les commits précédents de la branche. Le présent état reflète les diffs, les tests et les fichiers effectivement récupérés sur GitHub.

### Comparaison du moteur et traçabilité

- Les archives originales examinées sont planificateur-evenements-2026-11-21(3).zip (SHA-256 233e9b67efcab7fab5ac2eb53d7c2c82256bb33acca3829655867bb7762d2716, 37 fichiers) et planificateur-evenements-2026-11-25.zip (SHA-256 39664f61c9cb22fe19786da96287c1e530267eb25229c24a94c78f7f8f423e84, 45 fichiers).
- L’intégration initiale du 23 novembre, commit 824229edc85a, dérive du moteur du 21 novembre. plan.js et subjects.js correspondent; classify.js adapte le chargement au module statique LoSP; ledger.js contient le garde-fou LoSP contre la conversion des valeurs inconnues en zéro.
- Du 21 au 25 novembre, le moteur pur plan/ledger/subjects/resources et le service événement restent inchangés. La correction de classification des combats avec personnages ajoute Battle/Battles et un article facultatif à Play Battles with … . isPremium reste une métadonnée et ne signifie pas que l’action est payante ou indispensable.
- L’archive du 25 ajoute 10 fichiers, dont le poste de commandement, le groupement des séries, le plan partagé et l’interface React/CSS. Les composants React, Express, caches de fichiers et requêtes supplémentaires ne sont pas portés.
- Règles PC identifiées dans le source : wrapper lohub_wrapper et séries lohub_feeder; rapprochement par nom nettoyé et fenêtre de dates; périodes d’action; interprétation des récompenses de palier; séparation des objets EVTA_META_* (points) des autres récompenses. Le source ne fournit pas de fixture détaillée suffisamment vérifiable pour valider le total de points, les paliers atteints et les récompenses agrégées.
- Intégration adaptée : groupement des séries en cours sous le wrapper existant; aucune duplication des feeders dans la liste principale; état inconnu préservé; aucune requête détail automatique durant le rendu. Les points/récompenses PC ne sont pas projetés, et l’interface l’explique. Les tests vérifient le groupement, les compteurs inconnus, l’absence d’appel au rendu et le parcours synthétique.
- Le moteur d’origine convertit certains champs de progression absents en zéro et peut maintenir un cache de détails jusqu’à une semaine après l’événement. Ces comportements ne sont pas repris. Aucun fichier de licence ou de conditions de redistribution explicites n’a été trouvé dans les archives; aucun module tiers n’a été copié intégralement. Une revue juridique n’a pas été réalisée.

### Ressources, client 10.5 et inventaire

Sources réellement accessibles et examinées : manuel API LoSP 2026-11-05 (SHA-256 0f18b8c0f58f71c48619c41a6cdc1f55224419ae3bd8f3b7184edb863da5e4a7); spécification vivante (76027c706eab5a843fdf856d15c06ad0ddaf86c53098c8db23b765c5259265e5); framework JS 10.5 (fe355449318734f471ef44af956d72087b8b130a8d6312697b4262800f539331); data bundle 10.5 (8263126da3a767f42d3306d9f7045f98aeab8d5ff69014cf8a194ac1f88c2c2d); wasm 10.5 (afc7ca7391af7c5d3ef5526cf150b4c1cd64b46c92f31c97934ca72f10f1666a). Les extensions .gz ne correspondent pas au contenu réel des trois assets client : JS lisible brut, data UnityWebData1.0, wasm brut.

- Le catalogue partagé docs/data/msf-resource-catalog.json de #739 contient 15 IDs distincts : 12 identifications confirmées par des définitions publiques officielles (4 modules d’entraînement et 8 entrées d’ions ISO-8) et 3 correspondances déjà observées dans le moteur LoSP (SC, HC, énergie Campagne). Chaque statut est explicite; les 3 observations historiques ne sont pas qualifiées d’officielles.
- Aucun décompte exhaustif des ressources inconnues n’est possible : le corpus fourni n’est pas une liste complète de définitions d’items. Aucune des 15 lignes du catalogue n’a un statut « inconnu »; cela ne prouve pas l’exhaustivité du jeu.
- La terminologie ISO-8 de combat n’est pas confondue avec les classes des personnages. Les fichiers client fournis ne contiennent pas d’identifiant ISOITEM de cristal exploitable. L’exemple ISOITEM_GREEN_SUPPORT_HEALTH_1 n’y figure pas. Les ions ne sont pas des cristaux; aucune règle de couleur/classe/stat/niveau ne peut être confirmée.
- Une matrice des cristaux et un parseur des identifiants restent bloqués par l’absence de source structurée. Aucune correspondance ou quantité n’est inventée. La capture Mon stock montre cet état indisponible; elle ne représente pas une matrice de stock opérationnelle.
- L’inventaire existant reste compact et filtrable, distingue zéro, inconnu et quantité déclarée manuellement, garde les ressources inconnues consultables et ne cumule pas les ions de familles/niveaux différents. Aucun appel personnel n’a été fait pendant la reprise; aucun historique de stock n’a été créé.

### Objectifs, progression, faisabilité et Faim mutante

- Les modèles et comportements existants sont préservés : descriptions anglaises et IDs côté moteur, libellés français disponibles côté interface, objectifs regroupés par personnage avec portrait unique, barres seulement quand un compteur est fiable, statuts inconnus explicites, prérequis et ledger des ressources. La portée de cette passe n’a pas livré un normaliseur universel pour toutes les structures possibles Scopely.
- Les objectifs dépourvus de compteur ou de coût vérifiable restent non déterminés; ils ne sont pas déclarés terminés, à zéro action ou matériellement réalisables. Les recommandations restent limitées aux champs connus et à l’analyse Maddoxx existante.
- Faim mutante demeure une fixture de test, sans valeur codée dans le moteur de production : score confirmé 65 300; projection gratuite conditionnelle +29 600; total projeté 94 900. Palier 13 à 70 000 : 4 700 manquants depuis le score actuel. Palier 18 à 95 000 : 100 manquants après projection. Palier 19 : 5 100 manquants; palier 20 : 10 100. Le score acquis et la projection restent séparés; les points acquis ne sont pas recomptés.
- Poste de commandement : le parcours de groupement est couvert par tests. Une comparaison chiffrée des quatre moteurs, l’atteignabilité des paliers, les plafonds et récompenses PC attendent une fixture de détail anonymisée fiable. Aucune règle métier PC n’est extrapolée.

### Sécurité, conservation et architecture

Les décisions de phase 0 sont appliquées à la documentation et aux liens : Maddoxx demeure dans le Worker existant et MSF garde le lien propriétaire. Les essais d’authentification inter-domaines, tickets, migration vers msf/docs, origine commune et nouveau service sont abandonnés. Les contrôles Access, OAuth, sessions, scopes, URL Scopely, limites d’appels et rétention R2 ne sont pas modifiés. Aucun jeton ou résultat personnel n’est transmis à GitHub Pages; aucun nouvel endpoint de collecte, cache, persistance, fixture brute ou historique n’est ajouté. Aucune demande personnelle Scopely, fusion ou publication Worker/Pages n’a été effectuée.

Le stock manuel et les événements ignorés restent partitionnés par session propriétaire selon l’implémentation existante. Ce n’est pas une identité de compte durable : une nouvelle session peut créer une partition distincte. Aucune persistance par compte n’est ajoutée pendant cette phase, conformément aux contraintes de données et au périmètre de personnalisation ultérieur.

### Résultats de validation

- Tests locaux Maddoxx/ressources/faisabilité : 22/22 réussis.
- Tests locaux du catalogue MSF : 5/5 réussis.
- #218, Event planner tests #61 sur le commit de branche bc9e2d1d140361bd29290a64557323ef6a3ec2ba : 119/119 réussis.
- #218, Event planner mobile browsers #61 sur le commit bc9e2d1d140361bd29290a64557323ef6a3ec2ba : Chromium et WebKit réussis à 320, 360, 390 et 430 px, sans débordement horizontal; parcours PC synthétique. Un test Playwright WebKit n’équivaut pas à une validation sur Safari iOS réel.
- Captures Chromium à 390 px issues du parcours synthétique : Événements, Objectifs, Planifier, Mon stock et Poste de commandement. Artefact Actions 15092414723, SHA-256 sha256:ea26c462a2dc3cef12ef3b0d95cb88b41c335dfc06d8131570e917aaa9aa1b6c, expiration 10 décembre 2026.
- #218, Worker OAuth tests #822 : 891/906 réussis, 15 échoués. Le run main de référence #45507035749 échoue également sur ces mêmes 15 assertions, avec 882/897 réussis. Les erreurs couvrent deux tests de collecte tardive/invitée, trois tests d’enqueue DD9, deux budgets partagés et huit tests de lecture R2. Aucun test Maddoxx n’échoue.
- #739, Planner owner link checks #16 et Events R2 validation #143 réussissent. Guest LoSP access #507 échoue sur un test qui attend joueur.js?v=7 dans une page non modifiée par cette PR; l’erreur est une assertion de version de script, pas une assertion sur l’identité du joueur. Unified season history #173 échoue sur quatre tests hors fichiers de la PR : alliance-history-charts attend alliance-history-data.js?v=6 et 9 bandes (valeur observée 11), puis deux tests season-history échouent sur « Invalid or duplicate season rank ». Le code de ces pages, la logique de trophées et les données d’historique ne sont pas modifiés par #739. Ces contrôles restent rouges; leur classification comme non-régression Maddoxx n’est pas établie par les seuls logs.
- La correction du test de localisation demandée lors de la conversation interrompue est présente sur #739 : l’assertion lit catalog.localization.fr.officialScopelyFrenchClaimed (commit 09cdac4264a0642c0f79d5caf919fa05efb1c50e). Les tests propriétaire #16 et catalogue local 5/5 réussissent.

### État des PR, fichiers et reprise

| PR | Branche | SHA de branche au dernier relevé | État et constat |
|---|---|---|---|
| Keryas777/losp-roster-service #218 | work/maddoxx-convergence-ui | bc9e2d1d140361bd29290a64557323ef6a3ec2ba | ouverte, brouillon; GitHub mergeable=true; pas de conflit. Le commit bc9e est documentaire après le SHA code de34dad5f84fb41aeea179efe3d5352523a97255. |
| Keryas777/msf #739 | work/maddoxx-convergence-owner-entry | 5a96d996dbf3fc10e884d960ac820fe955988381 avant la présente mise à jour du journal | ouverte, brouillon; GitHub mergeable=true malgré 18 commits de retard sur main; 12 commits en avance avant ce commit (13 après lui). Aucun conflit de contenu; contrôles requis en échec comme détaillé ci-dessus. Le commit de cette édition crée le nouveau point de reprise. |

Discussions et revues GitHub des deux PR : aucune. La correction de localization.fr vérifiée plus haut n’est pas perdue. Toutes les évolutions observées dans cette reprise sont committées sur les deux branches; aucun fichier de travail local non poussé de la conversation précédente n’était disponible à comparer, donc une modification temporaire non committée d’alors ne peut pas être exclue.

Diff complet de la PR #218 contre main (inclut les travaux antérieurs à cette reprise) :
.github/workflows/event-planner-browser.yml; docs/event-planner-maddoxx-integration.md; public/event-planner/app.js; public/event-planner/index.html; public/event-planner/lib/classify.js; public/event-planner/lib/command-center.js; public/event-planner/lib/event-analysis.js; public/event-planner/lib/index.js; public/event-planner/styles.css; src/event-planner-api.js; src/event-planner-cache.js; src/event-planner-page.js; tests/event-planner-api.test.mjs; tests/event-planner.browser.spec.mjs; tests/event-planner/analyze.test.js; tests/event-planner/classify.test.js; tests/event-planner/command-center.test.js; tests/event-planner/references.test.js.

Diff complet de la PR #739 contre main (inclut les travaux antérieurs à cette reprise; pendant cette passe, seul le journal, le catalogue et son test ont été modifiés dans ce dépôt) :
.github/workflows/planner-owner-link.yml; docs/auth-guard.js; docs/data/msf-resource-catalog.json; docs/evenements.css; docs/evenements.html; docs/evenements.js; docs/planner-maddoxx-convergence.md; docs/planner-owner-link.mjs; tests/evenements-objectives.test.mjs; tests/msf-resource-catalog.test.mjs; tests/planner-owner-link.test.mjs.

### Conformité synthétique au cahier des charges

| Exigence | État | Preuve ou limite |
|---|---|---|
| Utiliser les deux PR existantes, sans en créer | Conforme | PR #218 et #739 uniquement |
| Aucune fusion, aucun déploiement, aucun appel personnel Scopely | Conforme | Actions et dépôts vérifiés; aucun appel effectué |
| Architecture Pages/Worker indépendante, Maddoxx sur Worker, lien propriétaire conservé | Conforme | Architecture définitive documentée, lien owner-only laissé |
| Retirer seulement l’expérimentation inter-domaines | Conforme | Test et job retirés; aucune auth partagée retirée |
| Comparer l’intégration originale et Maddoxx du 25 novembre | Réalisé | Archives et SHA-256 notés; modules et changements comparés |
| Intégrer les corrections du 25 novembre sans remplacement total | Partiel réalisé | Classifieur/plural/article, Premium informatif, groupe PC; logique de points PC attend fixture |
| Respecter règles PC et éviter double comptage | Partiel | Séries groupées et inconnues conservées; projection PC non implémentée faute de données |
| Référentiel central avec provenance/niveau de confiance | Partiel | 15 IDs, 12 officiels et 3 hérités LoSP; pas d’inventaire exhaustif |
| Parseur et matrice cristaux ISO-8 | Bloqué par les sources | Pas de cristal ISOITEM confirmé dans le corpus; pas d’interprétation spéculative |
| Inventaire compact, nul distinct d’inconnu, IDs diagnostics | Préservé | Capture synthétique et tests; aucune donnée personnelle ajoutée |
| Objectifs structurés exhaustivement selon chaque schéma | Partiel | Moteur existant conservé; les champs absents ne sont pas inventés |
| Progression et projections distinctes, pas de zéro artificiel | Conforme aux données disponibles | Tests de compteurs manquants et fixture Faim mutante |
| Faisabilité et prérequis sans coût inventé | Partiel, fondations existantes | Conditions connues exploitées; coûts et certaines progressions inconnus |
| Faim mutante 65 300 + 29 600 = 94 900 | Conforme en fixture | 100 points restent jusqu’au palier 18; aucun double comptage |
| Traduction française fonctionnelle | Partielle | Lexique connu et correction de test; traduction exhaustive/officialité non affirmée |
| Accès owner-only, OAuth, Access, rétention et absence de données personnelles publiques | Conforme selon les changements examinés | Aucune modification des gardes; tests d’accès existants et owner-link réussis |
| Tests unitaires/non-régression | Partiel | Ciblés verts; 15 échecs Worker préexistants et contrôles #739 hors périmètre restent rouges |
| Chromium et WebKit sur 320/360/390/430 px | Conforme au run #61 | Aucun débordement global; WebKit CI n’est pas Safari iOS réel |
| Stock manuel et événements ignorés isolés durablement par compte | Partiel existant | Partition session, pas identifiant stable de compte; pas de stockage supplémentaire |
| Mutualisation globale multi-événements et optimisation | Reporté | Hors phase; mutualisation Maddoxx par événement préservée |
| Page publique Événements et convergence graphique | Non modifiées / reportées | Conforme au périmètre de phase 1 |
| Journal permanent et PR actualisées | Journal mis à jour et descriptions PR synchronisées | Le commit du journal est le nouveau point de reprise de #739 |

### Données manquantes, blocages et phase 2

Blocages réels : définitions structurées des cristaux ISO-8; corpus complet d’items pour compter les IDs inconnus; fixture PC détaillée anonymisée permettant de calculer points/plafonds/récompenses; certaines progressions, coûts et prérequis manquants; validation réelle sur iPhone Safari; tests #739 et 15 échecs généraux du Worker à distinguer des comportements préexistants sans modifier ces fonctionnalités hors périmètre.

Phase 2 — intelligence individuelle, après validation de la phase 1 : compléter les données sources vérifiables; analyser l’éligibilité personnage par personnage, les coûts connus et les prérequis; améliorer les projections individuelles sans déclarer réalisable un coût inconnu; obtenir une fixture PC fiable et finaliser son calcul; vérifier les règles de rétention et d’autorisation avant toute extension des données personnelles. Ne pas commencer la mutualisation multi-événements avant la phase 3.

Les deux PR doivent rester ouvertes et en brouillon. Aucun merge ni déploiement avant validation explicite.


## Suite ciblée — correspondances LoSP/Maddoxx et ISO-8 (26 novembre 2026)

### Réutiliser → faire correspondre → compléter

- Roster et personnages : le planificateur continue de recevoir les IDs, noms, portraits et traits par le catalogue LoSP déjà utilisé; `event-analysis.js` réutilise `createSubjectResolver`, `classifyObjective`, `RESOURCES` et `planEvent` dans le module partagé `lib/index.js`. Aucun référentiel parallèle de personnages/traits/équipes n’a été créé.
- Correspondance des classes ISO de combat : `docs/evolution-visuals.js` sur MSF main traduit Attaquant/Fantassin/Tirailleur/Soigneur/Fortificateur et décode le niveau continu 1–20 en palier/couleur (vert, bleu, violet, orange) et niveau 1–5. L’importeur `scripts/lib/roster-r2-import.mjs` lit le CSV ISO du roster, normalise la classe active et les niveaux explicitement fournis; les valeurs absentes ne sont pas inférées comme zéro. `workers/msf-upload/worker.js` réutilise cette convention dans les imports roster.
- Ces fonctions décrivent la classe ISO de combat attribuée à un personnage, pas son stock de cristaux. Les dépôts doivent rester indépendants au runtime; l’adaptateur vanilla `public/event-planner/lib/iso-crystals.js` de #218 ne charge pas un module de l’autre dépôt et interprète uniquement les IDs ISOITEM d’inventaire.
- Classes de personnages confirmées par le propriétaire : Cogneur, Tireur, Contrôleur, Protecteur, Soutien. Elles restent distinctes des cinq classes ISO de combat. Les termes Vie, Dégâts, Armure, Focalisation, Résistance et paliers P1 vert/P2 bleu/P3 violet/P4 orange sont repris dans le parseur et l’interface.
- Le parseur reconnaît la nomenclature strictement validée et garde l’ID original. Un seul identifiant concret est attesté à cette date : `ISOITEM_GREEN_SUPPORT_HEALTH_1` (exemple fourni par le propriétaire). Les autres combos structurés sont classés comme déduits de la nomenclature, pas comme IDs observés ni définitions officielles individuelles. Les IDs ambigus ou inconnus restent non classifiés.
- Quantités ISO : nombres entiers et chaînes numériques sûres sont normalisés; absence, format ambigu et doublon contradictoire restent inconnus. Les IDs identiques avec casse différente ne sont pas additionnés. Un zéro explicite est conservé comme zéro.
- La matrice fonctionnelle accepte P1–P4 et niveaux 1–5, cinq classes personnage et cinq catégories. Elle conserve « zéro connu » séparé de « quantité inconnue », et expose les ressources non classifiées à part. Le moteur expose aussi une évaluation par classe personnage/palier/niveau : éligible seulement lorsque les cinq catégories sont connues et positives; non éligible si une catégorie est connue à zéro; indéterminé quand l’une des quantités manque. Cette évaluation donne le niveau de combat éligible, séparément du niveau réellement attribué fourni par le roster. Elle n’affirme ni que la classe a été améliorée, ni que les coûts ou monnaies supplémentaires sont couverts; coûts = inconnus.
- Fixture métier fournie : Tireur/P4/niveau cristaux 1, stocks 16/26/17/42/16, total 117. Le total et les quantités sont testés comme données synthétiques. Les cinq IDs orange générés pour ce test ne comptent pas comme IDs réellement observés.

### Comptage et limites des données

- Catalogue statique MSF : 15 IDs de ressources distincts déjà recensés (12 définitions publiques officielles, 3 mappings hérités LoSP). Ce nombre est une couverture du catalogue, pas le nombre d’items rencontrés dans un inventaire.
- Identifiants de cristaux réellement examinés : 1 ID concret fourni et parseable. Cristaux identifiés dans des données d’inventaire personnel consultées : 0. Correspondances de cristaux confirmées par corpus d’inventaire : 0. Combinaisons déduites à la volée : toutes les autres combinaisons syntaxiquement valides du parseur. Nombre exhaustif d’IDs inconnus : inconnu, faute d’un relevé personnel ou d’un corpus complet d’items. Aucun nouvel appel personnel Scopely n’a eu lieu.
- Le manuel API décrit déjà l’endpoint existant `GET /player/v1/inventory` et sa pagination/langue, et #218 réutilise le mécanisme existant avec `lang=fr`; le nombre de pages et les IDs personnels actuels ne sont pas présents dans les fixtures publiques consultées. Pas de nouvel endpoint, de mécanisme de collecte, de persistance ni de changement de rétention.
- Si une confrontation avec un inventaire réel est souhaitée, l’unique autorisation nécessaire serait un rafraîchissement via ce endpoint existant, limité au compte propriétaire déjà autorisé et aux pages ISOITEM du relevé courant, pour obtenir IDs/quantités et vérifier la matrice contre la fixture 117. Aucun appel ne sera effectué sans autorisation explicite; aucune date de cache ou nombre de pages actuels ne peut être certifié depuis GitHub seul.

### Poste de commandement

Les modifications Maddoxx du 25 novembre et leur groupement de séries restent ceux documentés plus haut. Les calculs de points, plafonds, paliers et récompenses ne sont pas validés sans détail/fixture vérifiable. La nouvelle matrice cristaux n’ajoute aucune hypothèse au calcul PC et aucun double comptage n’est introduit.

### Synchronisation et contrôles

- Synchronisation prudente de la branche #739 avec `main` : main était `968db3ae3fa5d2600093cba5361b1c67b9936f85`; l’ancien head #739 était `4be13fe74160021cea57f0a2592d765e01c05bd5`; la base commune `291e63c44adc6e5a2fb86ace7a6648fd09fdd375). Les 30 chemins évolués sur main et les 11 chemins du diff PR n’avaient aucun chevauchement. Un merge commit de branche `23d55a4be2b27065d0fa19b3005a74a395f20140` a gardé l’ancien head comme premier parent, main comme second parent, et réappliqué les 11 blobs PR sur l’arbre de main. C’était une synchronisation, pas une fusion de PR.
- #218 : adaptateur, matrice et nouvel examen du statut ISO manquant modifient uniquement les modules/tests/docs Maddoxx. Un niveau ISO absent ne produit plus un levier depuis zéro; une valeur active explicitement à zéro demeure zéro.
- Les workflows doivent être relus sur les nouveaux heads avant validation finale. Dernier état connu avant les derniers commits : tests unitaires #218 passaient; le parcours mobile était encore en cours; les contrôles owner-link et R2 de #739 passaient, tandis que les 1+4 échecs non-Maddoxx connus restaient à comparer au run de référence indépendant sur main.
- PR #218 et #739 restent ouvertes en brouillon. Aucun merge, aucun déploiement et aucun nouvel appel personnel Scopely.


## Point de reprise final — 26 novembre 2026

### État des deux branches

- #218 `work/maddoxx-convergence-ui` : head `719ac67e10549a4aedf584365dc5c0d3c53fdb36`. Tests planificateur : 125/125. Worker OAuth : 897/912; les 15 échecs connus restent les tests de collecte tardive/invitée (2), enqueue DD9 (3), budgets (2), accès R2 (8). Même ensemble fonctionnel en échec que la référence main `5af430a10cd636badb0f18d9055e44693a96ef90`; aucune assertion Maddoxx nouvelle ne casse.
- Parcours mobile #218 : sur head immédiatement précédent `899286eb2bc4db9d34de90efa87ade2f30bede60`, Chromium 141.0 et WebKit 26.0 ont réussi; le scénario vérifie les quatre largeurs 320/360/390/430 px sans débordement global, le poste de commandement simulé, l’inventaire, la matrice et le parcours d’accès. Le commit `719ac67` ne change que la capture complète de la table; son exécution navigateur est en cours au moment de l’écriture de ce point de reprise.
- Artefact mobile précédent : run Actions `45780834228`, SHA `899286e`, digest `sha256:c2b7d327ea0a4509ad2698bb362ca9cb8a9bcfcf8e93ba4a0a8512092af7cb13`, expiration 10 décembre 2026. Il contient six captures synthétiques des quatre onglets, du poste de commandement et de la matrice affichée dans la page. Run `719ac67` ajoute une capture séparée de la table entière à 800 px, une fois ses jobs terminés.
- #739 `work/maddoxx-convergence-owner-entry` : après synchronisation, head `3e5531e889c972b5b5051631466b56412ca9f183`, `main` `968db3ae3fa5d2600093cba5361b1c67b9936f85), 16 commits en avance et aucun en retard. Main et PR n’ont aucun conflit de fichiers. Merge commit de synchronisation `23d55a4be2b27065d0fa19b3005a74a395f20140`; aucun merge de PR. Checks après synchronisation : owner-link et Events R2 réussis; Guest LoSP 106/107; Unified season history 76/80.
- Les cinq assertions rouges de #739 portent sur : `joueur.js?v=7` attendu par `tests/scoped-roster-pages.test.mjs`; cache-busting `alliance-history-data.js?v=6`; 9 bandes attendues/11 observées; deux validations de rangs qui lèvent `Invalid or duplicate season rank`. Les fichiers `tests/scoped-roster-pages.test.mjs`, `tests/alliance-history-charts.test.mjs`, `tests/season-history.test.mjs`, `scripts/lib/season-history.mjs` et `docs/data/war-season-rules.json` ont les mêmes blobs sur `main` et #739; aucun n’est modifié par le diff #739. Les workflows concernés sont déclenchés par `pull_request` (l’historique ne fournit donc pas un run push-main indépendant). Cela classe les échecs hors PR par comparaison des sources et données actuelles, sans prétendre à un nouveau run indépendant sur main.

### Comptages d’identification

- Référentiel MSF : 15 IDs de ressources distincts, 12 confirmés via définitions publiques officielles, 3 mappings historiques LoSP. Pas de couverture exhaustive.
- Cristaux ISOITEM concrets examinés : 1 ID fourni par le propriétaire; identifiants de cristaux lus dans un inventaire Scopely personnel pendant cette phase : 0. Le cas Tireur/P4/niveau 1 utilise cinq IDs de test synthétiques, total 117; ces cinq IDs ne sont pas comptés comme réellement observés. D’autres combinaisons sont reconnues comme déduites du motif, pas confirmées individuellement. Le nombre réel d’IDs inconnus ne peut pas être établi sans inventaire.
- La matrice et l’évaluation d’éligibilité sont partielles mais exploitables : quantité explicite zéro, quantité absente/invalide et conflit demeurent distincts; les coûts de fusion/pose/amélioration restent `null`/inconnus. La classe ISO de combat et son niveau réellement attribué viennent du roster; l’éligibilité calculée depuis les cristaux ne les remplace pas.

### Cache personnel et autorisation éventuelle

Le dépôt permet de vérifier le parcours existant : `GET /player/v1/inventory?itemType=ISOITEM&lang=fr`, via le même `PERSONAL_EVENT_CACHE`, avec pagination existante (budget maximal 20 pages) et `since=meta.asOf` lorsque disponible. Les réponses et scopes personnels actuels ne sont pas exposés par GitHub ni par les données consultées pendant cette reprise. Aucun cache personnel n’a donc été lu directement, et aucun appel Scopely personnel n’a eu lieu.

Pour comparer aux captures du propriétaire, la seule requête éventuelle est une actualisation manuelle owner-only de ce endpoint existant, limitée à `itemType=ISOITEM`, `lang=fr`, avec au plus 20 lectures de page; le nombre réel dépendra des métadonnées de pagination ou d’un `unchanged`. Elle n’ajoute aucune collecte ni persistance. Cette autorisation reste en attente; ne pas appeler avant validation explicite.

### État de livraison

Les corrections de provenance française de #739 sont présentes, le lien owner-only est conservé, le journal reste ici, les descriptions PR ont été actualisées. Les deux PR sont ouvertes et en brouillon. Aucun nouveau dépôt/PR, aucun merge, aucun déploiement, aucune page publique Événements modifiée, aucun secret ou inventaire personnel publié. La validation finale du propriétaire reste attendue.


## Résultats finaux — runs déclenchés par la mise à jour du journal

- PR #218, head vérifié `719ac67e10549a4aedf584365dc5c0d3c53fdb36`: Event planner tests (run 45781327870) réussis, 125/125; Event planner mobile browsers (run 45781327893) réussi sur Chromium 141.0 et WebKit 26.0, aux largeurs 320/360/390/430 px. Les captures synthétiques sont dans l’artefact Actions 15099015239, SHA-256 `514d3a7fdd11876a89a1d211d19eddc2d95257febf4fc434847834b2e74d619d`, expiration 10 décembre 2026. WebKit CI n’équivaut pas à un essai réel sur iPhone Safari.
- Worker OAuth (run 45781328180) reste à 897/912 avec les mêmes 15 tests non-Maddoxx en échec que la référence main déjà documentée; aucune régression dans les tests du planificateur.
- PR #739, head au déclenchement `481d28d3f7ae508415ad6f6e5fa7760e1bac527c`: Planner owner link checks (run 45781731456) et Events R2 validation (run 45781731169) réussis. Guest LoSP (run 45781731348) : 106/107; assertion qui attend `joueur.js?v=7` alors que le fichier servi référence une version de cache différente. Unified season history (run 45781731197) : 76/80; attend `alliance-history-data.js?v=6`, observe 11 bandes au lieu de 9, et deux tests lèvent `Invalid or duplicate season rank`.
- Les cinq défaillances de #739 sont comparées aux mêmes contenus de fichiers sur `main` et ne concernent aucun chemin modifié dans le diff #739. Leur caractère préexistant est établi par comparaison des blobs identiques et du périmètre du diff; aucun run indépendant supplémentaire sur `main` n’est revendiqué.
- État immédiatement après ce relevé : les deux PR restent ouvertes et en brouillon. Ce paragraphe fixe le résultat observé avant le commit de journal qu’il documente; les éventuels contrôles relancés par ce commit sont à lire séparément sur le head mis à jour.


## Validation sur données réelles — 26 novembre 2026

### Inventaire ISO-8 : appel autorisé non exécuté

- Le Worker Cloudflare `losp-roster-service` existe; le contrôle Cloudflare en lecture seule indique une dernière modification du script le 24 novembre 2026 à 23:07:04 UTC. Les PR #218 et #739 sont restées ouvertes; aucun déploiement n’a eu lieu pendant cette validation.
- Le parcours existant owner-only est protégé par Cloudflare Access. La tentative d’ouverture aboutit à la page de connexion Access; aucune session n’était présente dans ce navigateur de travail. Aucun identifiant, code ou jeton n’a été saisi.
- Différence déterminante avant tout appel Scopely : le code de `src/event-planner-cache.js` sur `main` transmet encore `lang=none` à `GET /player/v1/inventory`, tandis que la branche #218 transmet le paramètre demandé `lang=fr`. Un rafraîchissement exécuté par le Worker déployé actuel ne garantirait donc pas la requête autorisée telle quelle. La correction existe dans #218, mais n’est pas déployée.
- En conséquence, aucun appel personnel Scopely n’a été effectué et aucun contenu privé du Durable Object n’a été lu via l’API Cloudflare (ce qui contournerait le parcours owner-only du service). Les nombres d’entrées, IDs distincts, cristaux, inconnus et le taux de reconnaissance sur données réelles restent non mesurés. Les seules données ISO disponibles restent l’ID d’exemple déjà attesté et la fixture synthétique de 117 cristaux.
- La correction confirmée par données réelles reste à faire après autorisation explicite d’un déploiement du code #218 sur le Worker existant (sans fusion). La requête précise visée sera l’actualisation owner-only de `/player/v1/inventory?itemType=ISOITEM&lang=fr`; le service suivra les métadonnées de pagination et s’arrêtera dès la dernière page, dans son plafond existant de 20 pages. Aucune page non nécessaire ne sera appelée.

### Autres données et poste de commandement

- Le code existant accepte deux types d’inventaire personnels pour le planificateur : `ISOITEM` et `CONSUMABLE`. Aucun appel `CONSUMABLE` n’est inclus dans l’autorisation ISOITEM et aucun n’a été fait. L’existence d’IDs ne permet pas encore d’affirmer que toutes les monnaies, pièces d’équipement, matériaux d’entraînement ou capacités sont incluses dans une même catégorie API. La catégorie et le champ réellement retournés devront être vérifiés sur documentation/réponse; ne pas inventer ce mapping.
- L’état du cache personnel existant et ses éventuelles réponses d’événements ne sont pas exposés dans la connexion GitHub/Cloudflare utilisée. Aucun endpoint ou ID d’événement PC n’a été découvert dans un cache accessible. Aucun appel événementiel supplémentaire n’a été fait.
- Si aucune donnée détail PC valable n’existe après accès owner-only, la proposition préalable à toute requête supplémentaire est : résoudre l’ID cible via `GET /player/v1/events?lang=fr` (endpoint existant, pagination jusqu’à 8 pages au maximum), puis appeler une seule fois `GET /player/v1/events/{eventId}?lang=fr&objRewards=full` pour cet ID. Cela représente 1 à 9 appels amont selon pagination, avant tout rafraîchissement éventuel d’inventaire; aucun n’est autorisé ou effectué à ce stade. Un appel pour `CONSUMABLE` serait séparé, jusqu’à 20 pages selon pagination, et nécessite une autorisation supplémentaire.

Aucune modification de sécurité, d’OAuth, d’Access, de rétention, de collecte ou de cache n’a été réalisée. Le seul changement permanent de cette reprise est cette note de suivi sans données personnelles. PR #218/#739 restent en brouillon; aucun merge ni déploiement.


### Prévention des appels non autorisés pendant l’interface

L’inspection du `public/event-planner/app.js` de #218 a trouvé que le démarrage de l’analyse charge ensemble les listes d’événements en anglais et français, le roster, `CONSUMABLE` et `ISOITEM`; le bouton d’actualisation de stock appelle lui aussi `CONSUMABLE` et `ISOITEM`. Avec des caches expirés, ces actions peuvent engendrer des appels personnels additionnels. Elles ne seront pas déclenchées pour la validation à périmètre ISOITEM seule. Une validation iPhone du parcours complet devra attendre soit une collecte de données additionnelles autorisée, soit une préparation en code qui ne charge que les sources autorisées/nécessaires; aucun changement UI n’est inclus dans cette reprise.


## Autorisation de validation réelle et précontrôles — 26 novembre 2026

### Périmètre autorisé par le propriétaire

Le propriétaire a autorisé un déploiement temporaire, sans fusion, de la PR #218 sur le Worker existant, ainsi que les lectures ponctuelles `ISOITEM` (20 pages max), `CONSUMABLE` (20 pages max), liste d’événements français (8 pages max) et une fiche PC française avec `objRewards=full`. Le roster doit venir du cache autorisé existant. Les plafonds sont des maximums; arrêter toute pagination à la dernière page. Aucune autre requête Scopely personnelle n’est autorisée. Cette autorisation n’a pas été exécutée tant que les contrôles préalables ne sont pas satisfaits.

### Worker actif et retour arrière

- Relevé Cloudflare en lecture seule : déploiement actif `8789c2d8-62ab-46e4-81f8-cb8b285aa601`, à 100 % sur la version `1706e375-159f-4c7b-9940-0776895a61c2` (version 235), créée le 24 novembre 2026 à 23:07 UTC. Cloudflare ne fournit pas de SHA Git dans les métadonnées consultées.
- Retour arrière adjacent préparé : déploiement précédent `b69a4a7f-d505-4cd5-845a-efc6ab5062a9`, version 234 `b3a34398-71ea-4e5b-a7b6-fca9d459478d`.
- Les deux versions exposent les mêmes 33 bindings, noms de variables (sans lecture de valeurs secrètes), trois namespaces Durable Objects et leurs classes, mêmes liaisons R2/service/Assets et compatibilité. Aucun changement de migration DO n’est nécessaire pour revenir à la version 234. Le workflow de publication contrôlé de la branche reste le chemin de déploiement; il n’a pas été lancé.
- Aucun déploiement de cette PR n’a eu lieu. L’URL du Worker, OAuth, Access, secrets, scopes, consentements, collecte et rétention restent inchangés.

### État de #218 et contrôles

- #218 reste ouverte, en brouillon, `mergeable=true`, base `main` au SHA `5af430a10cd636badb0f18d9055e44693a96ef90`. Le head initial de cette reprise était `719ac67e10549a4aedf584365dc5c0d3c53fdb36`.
- `4e8e81d61ab5c20d29a56a4cb37e9343f5b2fada` limite les lectures à la langue française, garde le roster en cache-only, mutualise les lectures au sein de la page, interdit les actualisations supplémentaires déclenchées par les boutons et borne le détail à une série PC. Cette correction ne modifie pas OAuth, Access, les scopes, les bindings, les migrations ni la rétention.
- Le premier contrôle navigateur après `4e8e81d` a mis en évidence une régression réelle : le déplacement des lectures personnelles avait omis l’attente du chargement statique du calendrier/catalogue. Les cartes n’étaient donc pas produites. Correction dans `12a87b5ce4fef9ec8ed6a2152a18a9b18e8a44d5` : calendrier et catalogues statiques sont à nouveau attendus en parallèle des lectures, sans appel Scopely additionnel.
- Le contrôle suivant a détecté deux attentes de test trop fortes sur la séquence UI (« chargement » déjà terminé pour une fiche sans appel détail; navigation retour répétée après sélection PC). Elles ont été ajustées dans `69c948f9b5cc97d977814645e91b883f0dc12dea` et `a856e6a53f6df4189295dc5d502f7b2de4f76cdd`; aucun comportement utilisateur n’a été modifié pour ces deux assertions.
- Suite locale ciblée après ces changements : 128/128 réussies, `node --check` et `git diff --check` réussis. Le run de tests unitaires sur le dernier head est réussi. Chromium/WebKit sur le head `a856e6a` sont en cours à la dernière vérification; leurs résultats et captures doivent être consignés dans un append ultérieur avant validation finale.
- La suite Worker OAuth du head `a856e6a` reste à 15 échecs. La liste des 15 sous-tests en échec est identique à la baseline `719ac67` et porte uniquement sur récupération tardive/invitée (2), enqueues DD9 (3), budgets partagés (2) et lecture R2 (8). Aucun des tests Maddoxx ne figure dans cette liste; ces échecs sont hors périmètre de la PR.

### Condition de droit d’utilisation non satisfaite

Les documents de suivi antérieurs indiquent qu’aucun fichier LICENSE ni condition explicite de redistribution n’a été trouvé dans les archives Maddoxx. La recherche ciblée des commentaires de PR et des fichiers du projet n’a pas trouvé de permission écrite de l’auteur. Aucun avis juridique n’a été fait. Cette vérification demandée est donc non concluante; la présence des archives ou leur transmission ne suffit pas à établir l’autorisation de republier le code dans le Worker.

Par prudence, le déploiement reste bloqué jusqu’à preuve d’une licence appropriée ou confirmation écrite de Maddoxx autorisant l’usage du moteur dans ce projet et sur ce Worker. Cette condition est indépendante de l’autorisation du propriétaire à déployer. Aucun appel Scopely personnel n’a été effectué : 0 endpoint, 0 page; aucun cache personnel n’a été lu. Les quantités, IDs rencontrés, résultats de matrice, compteurs de progression et fiche du poste de commandement demeurent donc non validés sur données réelles.

### État de #739

#739 `work/maddoxx-convergence-owner-entry` reste ouverte, en brouillon, head `c149969aa1e7b95a07710aa01eddcd6a49792f91`, base `main` `968db3ae3fa5d2600093cba5361b1c67b9936f85`, `mergeable=true`. Cette mise à jour ajoute uniquement ce journal; la branche n’a pas été synchronisée ou fusionnée et aucun déploiement Pages n’a eu lieu.
