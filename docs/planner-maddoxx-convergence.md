# Maddoxx — convergence LoSP et journal permanent de la phase 1

> **État courant au 26 novembre 2026 — reprise en cours.** Les décisions et constats ci-dessous remplacent les choix d’architecture plus anciens conservés plus bas à titre d’historique. PR #218 et #739 restent ouvertes et en brouillon. Aucune fusion, aucun déploiement et aucun nouvel appel personnel Scopely.

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

## Historique antérieur

Les sections d’architecture et de migration ci-dessous consignent l’investigation de la reprise précédente. Elles ne sont plus des décisions actives : la décision définitive ci-dessus les remplace.

## Référentiel central des ressources

Nouveau fichier : docs/data/msf-resource-catalog.json. Les composants publics utilisent id stable, noms en/fr, catégorie, groupe, icône, provenance et propriétés vérifiées. Les étiquettes françaises sont explicitement des traductions LoSP lorsque Scopely n’a fourni qu’un nom anglais. Le planificateur lit le référentiel depuis Pages; aucun dictionnaire complet concurrent n’est ajouté au Worker.

Correspondances vérifiées dans l’archive publique /game/v1/items/{itemId} : modules CONSUMABLE_XPLVL20/40/60/80 vers L1–L4 Training Module, descriptions et icônes; ions ISO-8 T1, T2 (niveaux 1/4/5), T3 (1/4/5) et T4 (1) avec leurs noms. Le manuel API (2026-11-05) confirme Item.id/name/description/icon, et GET /player/v1/inventory accepte lang, page, perPage et since; la requête privée d’inventaire est maintenant faite en français, sans augmenter le nombre de requêtes.

Les IDs SC (or) et HC (noyaux) restent explicitement issus de la correspondance déjà portée par lib/resources.js, pas de nouvelle définition prétendument officielle. docs/data/iso-icons.json décrit des icônes de classe, pas des cristaux d’inventaire. L’archive R2 consultée ne contenait pas de définitions de cristaux ISO-8 permettant d’établir couleur, niveau, classe et statistique; les binaires 10.5 fournis sont des ressources Unity/wasm sans table texte d’items exploitable avec les outils disponibles. La matrice reste donc « données indisponibles »; aucun mapping ou icône n’est deviné. Les IDs inconnus ne sont visibles que sous « Diagnostic » replié.

## Planification : comportement Maddoxx observé

Les algorithmes portés sont laissés intacts. event-analysis.js contient déjà la mutualisation au sein d’un événement : mêmes personnages + modes ou mêmes traits + modes; le nombre d’actions restantes par groupe est le maximum requis parmi les lignes compatibles et les points par combat sont cumulés. plan.js projette les points d’actions classées faisables gratuitement et les ressources déjà prises en compte, compare les seuils et présente écarts, dépenses et leviers de roster. La couche UI indique maintenant explicitement « projection gratuite conditionnelle », conserve le score acquis distinct et montre les points restant non couverts.

Limites constatées : l’analyse porte sur un événement sélectionné et ne fabrique pas un calendrier global inter-événements. Les réponses publiques/personnelles ne donnent pas ici un calendrier fiable de combats à venir, d’énergie à gagner ni d’offre à réclamer. Les gains « gratuits » restent conditionnels aux compteurs, prérequis roster, plafonds, durée et actions reconnues. Il n’existe pas de preuve permettant de mutualiser un combat entre événements différents; le moteur ne le fait pas. Les améliorations de roster sont des leviers potentiels, pas une recommandation de dépense si leurs coûts ou ressources manquent. Une ressource n’est jamais additionnée à une autre famille incompatible.

### Référence Faim mutante (fixture uniquement)

Test exact ajouté aux tests du port : 65 300 points déjà acquis + 29 600 points d’actions gratuites conditionnelles = 94 900 points projetés. Le palier 18 à 95 000 reste à 100 points; le moteur laisse 100 points non couverts et ne le déclare pas atteignable. Les paliers 19 à 20 restent plus éloignés. Cette fixture ne contient aucun résultat personnel Scopely.

## État de conformité par rapport au cahier des charges

| Domaine | État réel | Évidence / limite |
|---|---|---|
| Une page Événements unique dans msf/docs | Partielle | PR #739 garde l’entrée propriétaire, mais renvoie encore vers la page Worker. La migration n’est pas faite. |
| Données personnelles sécurisées dans le Worker | Réalisée dans le modèle actuel | Routes privées restent derrière Access + allowlist propriétaire + session capitaine/scopes; aucune publication ni modification de ces contrôles dans cette PR. |
| Contrainte Safari iOS inter-domaines | Partielle, migration bloquée | Chromium valide le flux du ticket simulé; WebKit 26.0 mobile valide l’interface, mais le cookie n’est pas exposé sur la navigation popup interceptée malgré sa présence en cookie jar. Pas de test réel sur Safari iOS et aucun ticket de production. |
| Réutiliser les règles publiques d’événements | Partielle | Le planificateur exploite le snapshot/calendrier public et l’ID stable pour filtrer et présenter, mais la page officielle et la page privée sont encore deux documents. |
| Données événementielles, roster, inventaire Scopely | Réalisée avant cette PR, conservée | Le code reste sur les appels existants; aucun accès personnel nouveau pour ce chantier. Test réel antérieur rapporté par le propriétaire; non rejoué ici. |
| Français des événements et objectifs | Partielle | Libellés structurés pour actions usuelles et données françaises Scopely/catalogue; identifiants inconnus signalés génériquement. Un lexique exhaustif de toutes les phrases/objectifs ne peut être prouvé avec les données fournies. |
| Progression, objectifs et prérequis distincts | Réalisée partiellement | Objectifs groupés et compteurs inconnus sans barre zéro; palier terminé distinct d’objectif terminé; tests synthétiques. L’exactitude de structures réelles n’est pas revalidée sans données personnelles. |
| Plan d’action concret Maddoxx | Partielle | Mutualisation par personnage/trait + mode dans un événement, coûts/leviers et récompenses selon données connues; pas de calendrier de disponibilités ni de mutualisation multi-événements. |
| Non-double-comptage global des combats et ressources | Partielle | Calculs partagés dans le groupe d’un événement et ledger stock existant; aucune planification multi-événements. N’affirme pas une garantie globale. |
| Référence Faim mutante exacte | Réalisée en fixture | 65 300 + 29 600 = 94 900; palier 18 à 95 000, écart non couvert de 100. |
| Stock prioritaire mobile | Partielle | Résumé par or, noyaux, modules N1–N4 et ions; tableau compact et recherche française; valeurs manquantes explicites. Le rendu des cristaux reste bloqué faute de définition vérifiée. |
| Matrice ISO-8 | Bloquée par les données publiques disponibles | R2 fournit des ions/monnaies mais aucune correspondance cristal → couleur/niveau/classe/statistique; l’archive Unity fournie n’a pas livré de mapping exploitable. Solution : archiver des définitions complètes /game/v1/items/{id} ou un catalogue Scopely structuré et les ajouter avec provenance. |
| Isolation du stock manuel / événements ignorés | Réalisée au niveau session, partielle au niveau compte durable | Partition par hash du cookie capitaine aléatoire, effacement en mémoire à la déconnexion et changement de session testés. Pas d’identifiant compte stable exploitable sans appel personnel supplémentaire; une réauthentification crée une partition vierge. |
| Captures ergonomiques quatre onglets | Réalisées sous Chromium | Quatre PNG synthétiques des onglets Événements, Objectifs, Planifier et Mon stock, à 390 px, issus du SHA f31986035cb65ab8b0645cc0e29e9ece69c5ff39; aucune capture personnelle. Artefact Actions #15088646035, expiration le 10 décembre 2026. |
| Page Événements publique / expérience membres | Non modifiée par PR #739 | Aucune modification des composants publics dans cette PR; elle ajoute la centralisation du catalogue et la note d’architecture. La page privée reste owner-only. |
| Déploiement/migration/retrait de l’interface Worker | Non réalisé et volontairement hors état actuel | PR en brouillon; aucun merge, déploiement ou changement d’autorisation n’a été demandé. |

## Ordre de migration proposé

1. Valider ce travail et les captures.
2. Valider l’une des architectures inter-domaines, idéalement une origine LoSP commune si un domaine contrôlé existe.
3. Garder l’entrée d’administration owner-only pendant toute la phase pilote.
4. Intégrer les composants dans msf/docs/evenements.html après preuve sécurisée d’origine/session; conserver le Worker comme API privée.
5. Tester sur Safari/WebKit, puis comparer l’expérience de la page publique avant activation propriétaire.
6. Ne retirer /admin/events-planner qu’après validation complète; ne pas ouvrir aux membres sans autorisation distincte.


## Journal de reprise — 26 novembre 2026 — audit comparatif Maddoxx et fiabilisation

### Décision et état de sûreté

La décision d’architecture définitive ci-dessus est appliquée aux documents : Maddoxx reste sur losp-roster-service; msf conserve le lien propriétaire; l’ancienne preuve ticket/cookie inter-domaines est abandonnée. Aucun changement OAuth, Access, allowlist, scopes, rétention R2, collecte, stockage serveur ou adresse Scopely. Aucun appel Scopely personnel, aucune fusion et aucun déploiement n’ont eu lieu.

### Sources examinées et traçabilité

| Source | SHA-256 / version | Résultat |
|---|---|---|
| planificateur-evenements-2026-11-21(3).zip | 233e9b67efcab7fab5ac2eb53d7c2c82256bb33acca3829655867bb7762d2716 | Base originale de l’intégration |
| planificateur-evenements-2026-11-25.zip | 39664f61c9cb22fe19786da96287c1e530267eb25229c24a94c78f7f8f423e84 | Version comparée |
| Manuel API LoSP, 5 novembre | 0f18b8c0f58f71c48619c41a6cdc1f55224419ae3bd8f3b7184edb863da5e4a7 | Accessible et lu |
| Spécification vivante | 76027c706eab5a843fdf856d15c06ad0ddaf86c53098c8db23b765c5259265e5 | Accessible et lue |
| Client MSF 10.5 framework.js | fe355449318734f471ef44af956d72087b8b130a8d6312697b4262800f539331 | Fichier lisible en JS brut malgré l’extension .gz |
| Client MSF 10.5 data | 8263126da3a767f42d3306d9f7045f98aeab8d5ff69014cf8a194ac1f88c2c2d | UnityWebData1.0, non compressé gzip |
| Client MSF 10.5 wasm | afc7ca7391af7c5d3ef5526cf150b4c1cd64b46c92f31c97934ca72f10f1666a | WebAssembly brut |

Les trois fichiers client ont été scannés pour les chaînes d’identifiants ISOITEM_; aucune définition de cristal exploitable n’y apparaît. Le framework et la spécification exposent des classes ISO-8 de combat distinctes des classes de personnage. Les fichiers joints n’ont pas fourni la nomenclature complète item → couleur/niveau/classe/statistique. L’exemple ISOITEM_GREEN_SUPPORT_HEALTH_1 n’est pas présent dans les données examinées; une seule forme d’exemple ne prouve ni toutes les variations ni les exceptions.

### Bilan différentiel du moteur Maddoxx

- Base initiale : l’intégration du 23 novembre, commit 824229edc85a, reprend la version du 21 novembre. plan.js et subjects.js sont identiques à l’original; classify.js porte l’import du référentiel statique; ledger.js contient les corrections LoSP qui préservent les compteurs/paliers inconnus.
- Correction intégrée du 25 novembre : reconnaître Play Battles with … avec article facultatif et formes Battle/Battles. Des tests couvrent les variantes et le trait Tech.
- Poste de commandement : le code source du 25 novembre définit lohub_wrapper/lohub_feeder, le rapprochement par nom/dates, les périodes quotidiennes/hebdomadaires/événement, rewardTier − 1, et la séparation des objets EVTA_META_* (points de phase) des autres récompenses.
- Incrément adapté : une fonction pure groupe les séries identifiées en cours sous leur wrapper, et présente leurs compteurs seulement quand leurs plafonds et avancements sont connus. Les feeders correspondant à un wrapper ne sont pas dupliqués dans la liste principale. Les tests mobile vérifient le parcours PC.
- isPremium est préservé et affiché comme indicateur informatif, y compris pour une ligne non analysée. Il n’est ni traité comme coût ni comme condition nécessaire.
- Non-porté : buildCombatPlan, déjà couvert pour les événements habituels par le regroupement de combat et ledger LoSP; composants React/CSS; services serveur, stockage fichier et nouveaux parcours API. Le nouveau service Maddoxx déclenche deux lectures des événements (EN/FR), une lecture roster et des détails supplémentaires; cela n’est pas nécessaire à l’intégration par étapes.
- Garde-fous non repris : la version source convertit des valeurs absentes de points/soFar en zéro. Le moteur LoSP conserve l’état inconnu. Le cache de détails d’origine peut survivre jusqu’à une semaine après l’événement; aucun cache/historique Scopely supplémentaire n’est ajouté.
- Limite : le code Maddoxx explique la règle PC, mais l’archive ne contient pas de fixture détaillée PC vérifiée. L’incrément n’implémente donc pas encore les points par feeder, les paliers atteignables ni les récompenses consolidées du poste. Cette limite est explicite dans l’interface et les tests empêchent d’affirmer une complétion sur compteurs absents.

### Référentiel et inventaire

Le catalogue central sur #739 compte désormais 15 identifiants distincts : 12 issus de définitions publiques officielles (4 modules d’entraînement et 8 monnaies d’ions) et 3 correspondances observées dans l’intégration LoSP (SC, HC, énergie de campagne). Le champ identificationStatus distingue official-confirmed et legacy-observed; localization.fr.officialScopelyFrenchClaimed reste false. Les noms français sont des libellés LoSP quand aucune preuve de libellé Scopely français n’existe.

La table resources.js du moteur conserve aussi quatre catégories d’actions sans itemId exploitable dans le stock (Dreadmarks, énergie Campagne/ISO/Incursion, énergie préhistorique, énergie Doomsday). Elles restent des actions reconnues, pas des correspondances d’inventaire confirmées.

Le catalogue n’identifie aucun cristal ISO-8. Les ions ne sont pas des cristaux. iso8CrystalMatrix reste explicitement indisponible; aucun parseur spéculatif ni matrice quantité/couleur/niveau/classe/stat n’est ajouté. Les données de quantité personnelles n’ont pas été relues dans cette phase et aucun stock personnel brut n’est commité. Une quantité d’inventaire absente garde l’état inconnu; zéro reste distinct.

### Objectifs, progression et faisabilité

Le moteur existant garde les descriptions EN pour classer les actions et réutilise le français disponible pour l’affichage. Les objectifs groupés, portraits uniques, prérequis roster, états faisable/bloqué/ressource/inconnu, ledger et états de progression sont préservés. L’incrément garde isPremium en métadonnée et rend visibles les feeders PC sans lancer automatiquement leurs détails.

Les tests Faim mutante conservent le cas fixture exact : 65 300 confirmés + 29 600 projetés sous conditions = 94 900; palier 13 à 70 000, palier 18 à 95 000 (100 manquants après projection), palier 19 à 100 000 (5 100 manquants), palier 20 à 105 000 (10 100 manquants). Les valeurs projetées restent séparées du score acquis et ne sont pas codées en dur dans le moteur de production.

Les données de progression détaillées du poste de commandement et les détails d’objets restent la principale donnée manquante. Il n’est pas établi que les objectifs PC consommés par l’API ont des compteurs complets sur toutes les langues/familles; aucune recommendation de palier PC n’est donc présentée comme certaine.

### Modifications de cette reprise et validations

#218 :
- Correction du classificateur, métadonnée Premium, groupement pur des séries PC, filtres de doublons sous wrapper et fixtures unit/browser.
- Ajout du module PC dans la liste explicite des assets Worker, sans changer son garde d’accès.
- Retrait du test et de l’étape CI de preuve inter-domaines; l’expérience était simulée, non concluante sous WebKit, et hors architecture.
- Note d’intégration mise à jour pour la décision définitive et l’audit différentiel.

#739 :
- Catalogue enrichi du statut de preuve par entrée et énergie de campagne venant du mapping LoSP déjà observé.
- Test de catalogue vérifiant les 15 identifiants, les 12 sources publiques, les 3 mappings historiques et l’absence de faux catalogue cristaux.
- La correction antérieure localization.fr.officialScopelyFrenchClaimed est confirmée committée (09cdac4264a0642c0f79d5caf919fa05efb1c50e); le workflow propriétaire passe.

Résultats locaux ciblés : 22/22 tests Maddoxx/ressources/feasibility passent; 5/5 tests du référentiel passent. Les navigateurs ne sont pas disponibles dans l’exécuteur local; la CI GitHub Actions reste la validation Chromium/WebKit de référence et ne doit pas être appelée Safari iOS réel.

### Points GitHub au checkpoint

| Dépôt / PR | Branche | SHA au checkpoint | État |
|---|---|---|---|
| Keryas777/losp-roster-service #218 | work/maddoxx-convergence-ui | 4596d2d519d5908974000c8a09eefb586547635c | ouverte, brouillon, API GitHub mergeable=true |
| Keryas777/msf #739 | work/maddoxx-convergence-owner-entry | e14193d06c63d77d97f38941266a6e67c4155356 | ouverte, brouillon, API GitHub mergeable=true; 18 commits en retard sur main |

Aucun conflit de contenu n’est signalé par GitHub. La PR #739 est signalée comme non fusionnable par ses contrôles requis en échec et son retard sur main, pas par un conflit de fichiers. Le dernier run de #218 après le correctif est encore en cours pour le navigateur au moment de cette note; les résultats seront remplacés dans ce journal lorsque terminés. Le run Worker générique conserve 15 échecs préexistants, même nombre que main. Les détails finaux des runs #739 sont à reporter après comparaison aux checks de main.

### Conformité et blocages restants

| Exigence phase 1 | Statut au checkpoint | Constat |
|---|---|---|
| Architecture indépendante Pages/Worker et lien propriétaire | Conforme | Maddoxx reste dans le Worker; MSF garde le lien; aucune migration/ticket/origine nouvelle |
| Comparaison original, 25 novembre et intégration | Réalisée | Base 21 novembre prouvée par l’historique et les modules |
| Correction Maddoxx 25 novembre | Partiellement intégrée | Classifieur et métadonnée Premium; aucune réécriture du moteur |
| Poste de commandement | Partiel | Séries regroupées et progrès sûrs; points/récompenses non calculés sans fixture vérifiable |
| Référentiel central | Partiel, fiabilisé | 15 IDs; 12 définitions officielles, 3 mappings LoSP |
| Parsing/matrice des cristaux ISO-8 | Bloqué par source manquante | Aucun ID cristal exploitable dans les assets examinés |
| Inventaire et distinction nul/inconnu | Préservé | Aucun nouvel appel ni stockage; catalogue découplé du stock personnel |
| Objectifs et prérequis | Partiel, moteur existant conservé | Données texte/scoring, niveaux structurés limités par les sources |
| Progression et Faim mutante | Conforme aux fixtures | Valeurs acquises/projetées séparées; 100 points restent manquants au palier 18 |
| Faisabilité personnelle | Partiellement prête | États et prérequis existants; coûts inconnus restent inconnus |
| Sécurité et rétention | Conforme aux contraintes | Aucun changement aux contrôles, scopes, OAuth, R2 ou données personnelles |
| Tests unitaires/non-régression | Partiel | Ciblés verts; contrôles générales hors chantier à comparer à main |
| Chromium/WebKit mobile | En cours au checkpoint | CI à 320/360/390/430 px; aucun résultat réel iPhone Safari |
| Événements ignorés et stock manuel isolés par compte | Partiel existant | Partition par session; aucune identité durable ou stockage serveur ajouté |
| Mutualisation multi-événements | Reportée | Le moteur existant mutualise dans une phase; globalement reporté comme prévu |

### Prochaines actions avant compte rendu final

1. Récupérer les résultats finaux de l’e2e Chromium/WebKit et les artefacts de captures.
2. Comparer les échecs non liés de #739 aux exécutions de main; ne pas réparer des fichiers hors périmètre.
3. Mettre à jour ce journal et les descriptions PR avec les derniers résultats et les SHA finaux.
4. Laisser les deux PR ouvertes/en brouillon; ne pas fusionner ni déployer.
5. Attendre la validation explicite du propriétaire avant toute intégration ou publication.
