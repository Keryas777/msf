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

### Versions Maddoxx reçues et audit initial

Archives accessibles dans les pièces jointes, non destinées à GitHub :

| Archive | SHA-256 | Constat initial |
|---|---|---|
| `planificateur-evenements-2026-11-21(3).zip` | `233e9b67efcab7fab5ac2eb53d7c2c82256bb33acca3829655867bb7762d2716` | 37 fichiers; moteur backend CommonJS/ESM et interface React d’origine |
| `planificateur-evenements-2026-11-25.zip` | `39664f61c9cb22fe19786da96287c1e530267eb25229c24a94c78f7f8f423e84` | 45 fichiers; 10 ajouts, aucun fichier supprimé |

Le différentiel déjà identifié dans le classificateur est la prise en charge des libellés `Play Battles with …` (singulier/pluriel et article facultatif), absente le 21 novembre et ajoutée le 25 novembre. La nouvelle version ajoute aussi une analyse du **poste de commandement** (wrappers/feeders `lohub_wrapper`/`lohub_feeder`), la séparation des points de phase et des récompenses par paliers feeder, les indicateurs premium, le groupement d’événements et un plan de combats partagé. Les comportements exacts, les risques de complétion/double comptage et la compatibilité avec les garde-fous LoSP restent en cours d’audit avant portage.
Le ZIP ne contient pas de fichier de licence évident dans l’inventaire initial; les conditions d’utilisation doivent être vérifiées et le port restera différentiel, sans réintroduire React, Express ou des dépendances serveur.

La version exacte ayant servi à l’intégration initiale n’est pas encore prouvée par le seul nom de l’archive. Elle sera établie à partir de l’historique et de la comparaison des modules; à défaut, cette limite sera conservée explicitement.

### Travail confirmé dans #218 avant la phase

Le moteur vanilla existant comprend déjà classification EN des objectifs, résolution des personnages/traits, regroupement des combats, analyse des paliers et projections, planification dans un événement, ledger du stock/récompenses, inventaire personnel français, quantités nulles distinctes des inconnues, ressources statiques, objectifs regroupés/portraits, diagnostics et tests. L’analyse n’accepte une somme de compteurs partiels comme progression confirmée que lorsque tous les compteurs nécessaires sont connus; l’absence d’un compteur agrégé reste signalée.
Le module `classify.js` de la PR ne traite pas encore `Play Battles with Tech Characters` selon la correction du 25 novembre. Le cas Faim mutante doit rester une fixture et distinguer score actuel et projection.

### Prochaines tâches de reprise

1. Terminer la comparaison des algorithmes et des données du poste de commandement, puis porter seulement les règles compatibles avec le modèle Worker/vanilla.
2. Croiser les catalogues existants des deux branches, ressources Maddoxx, fixtures, manuel API et données du client 10.5.0 déjà fournies; publier uniquement des métadonnées statiques vérifiables.
3. Compléter le parseur ISO-8 et la matrice à partir de nomenclatures réellement validées, en conservant les identifiants inconnus et les quantités inconnues.
4. Fiabiliser l’analyse des objectifs, de la progression et des prérequis sans convertir une absence en zéro, ni inventer des coûts.
5. Ajouter les fixtures/tests ciblés, comparer les CI préexistantes, vérifier Chromium/WebKit synthétique, mettre à jour les deux PR et ce journal.
6. Rester sans fusion, déploiement, appel personnel Scopely, nouvelle PR ou changement de sécurité/rétention.

---

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


## Journal de reprise — 26 novembre 2026

### État retrouvé et changements effectivement poussés

Aucune modification locale perdue n’a été trouvée : le travail déjà réalisé se trouve dans les deux branches GitHub. La correction d’assertion signalée à la reprise est bien présente sur PR #739 : le test vérifie maintenant catalog.localization.fr.officialScopelyFrenchClaimed au lieu de chercher la propriété au mauvais niveau. Le commit 09cdac4264a0642c0f79d5caf919fa05efb1c50e est le SHA de code de #739; Planner owner link checks run #12 réussit.

Sur #218, les derniers commits poursuivent le travail existant : conservation de l’eventId demandé après initialisation de l’espace de session, assertions d’inventaire ciblées sur le bon panneau, correction des locateurs du parcours déconnecté, preuve inter-domaines synthétique et captures CI. Les derniers ajustements corrigent des assertions et fixtures de test; le moteur Maddoxx, l’authentification de production, les scopes et les appels personnels Scopely ne changent pas.

### SHA et état Git

| Dépôt / PR | Branche | SHA courant avant cette note | État |
|---|---|---|---|
| Keryas777/losp-roster-service #218 | work/maddoxx-convergence-ui | f31986035cb65ab8b0645cc0e29e9ece69c5ff39 | Ouverte, brouillon; tests ciblés verts, preuve inter-domaines WebKit partielle. |
| Keryas777/msf #739 | work/maddoxx-convergence-owner-entry | 09cdac4264a0642c0f79d5caf919fa05efb1c50e | Ouverte, brouillon; la présente note crée le commit de suivi suivant. |

Au contrôle du 26 novembre, main de msf est b2462a3b04676eb2422ba4e92f9c94d6f003b27d. La branche #739 est à 8 commits en avance et 18 en retard; son merge-base est 291e63c44adc6e5a2fb86ace7a6648fd09fdd375. Les 17 fichiers modifiés sur main depuis ce merge-base ne recoupent aucun des 11 fichiers de #739. L’API GitHub indique mergeable=true : pas de conflit de contenu détecté. Le blocage affiché comme non fusionnable vient de l’état brouillon et des contrôles requis en échec, tandis que la branche est aussi en retard sur main. Le texte de PR qui disait « synchronisée avec main » décrit un état historique dépassé.

### Résultats des vérifications sur #218

- Event planner tests, run #56 : réussite.
- Event planner mobile browsers, run #56 : Chromium 141 réussit la preuve inter-domaines et le parcours mobile; WebKit 26.0 réussit le parcours mobile, mais échoue uniquement à observer le cookie de session synthétique sur la navigation popup. Les deux parcours mobiles vérifient les largeurs 320, 360, 390 et 430 px; aucun débordement horizontal.
- Les quatre captures Chromium sont dans l’artefact [Actions run #45756968551](https://github.com/Keryas777/losp-roster-service/actions/runs/45756968551), lié à ce SHA et valable jusqu’au 10 décembre 2026. Elles montrent les onglets Événements, Objectifs, Planifier et Mon stock avec données fictives.
- Worker OAuth tests, run #817 : 885/900 passent, 15 échouent. Comparaison par nom avec le run de référence main #45507035749 : exactement les mêmes 15 tests, portant sur collecte PM, collecte invité, files DD9, budgets partagés et lectures/autorisation R2. Aucun échec nouveau lié au planificateur.
- PR #739 : Planner owner link checks #12 et Events R2 validation #139 passent. Guest LoSP access checks #500 échoue à 106/107 sur l’identité placeholder; Validate unified season history PR #169 échoue à 76/80 sur quatre tests d’autres pages. Ces fichiers ne sont pas touchés par #739.
- Tests réalisés sur fixtures synthétiques; aucun appel personnel Scopely n’a été fait.

### Décision d’architecture reprise

1. La cible reste une interface intégrée dans msf/docs, avec les routes et données personnelles dans le Worker sécurisé.
2. Une origine LoSP commune est l’option cible la plus simple pour Safari si LoSP contrôle un domaine et peut router les assets Pages et routes Worker sous le même hôte. Ce domaine et sa configuration n’ont pas été confirmés; aucun DNS, routage ni déploiement n’a été modifié.
3. Si l’origine commune n’est pas possible, le ticket à usage unique/TTL court peut être étudié : vérification côté Worker, origine exacte, capacité non réutilisable/révocable, échange hors URL et localStorage. Seule la démonstration Chromium est verte. La preuve WebKit n’est pas concluante.
4. En attendant cette preuve, conserver l’interface Worker transitoire, le cookie HttpOnly; Secure; SameSite=Lax, Cloudflare Access, l’allowlist propriétaire et les scopes. Ne pas passer à SameSite=None, ne pas transmettre de jeton OAuth au navigateur et ne pas retirer les contrôles existants.

### Conformité — état au terme de cette reprise

| Exigence | État | Résultat / blocage restant |
|---|---|---|
| Interface convergée dans msf/docs | Non achevée | #739 n’ajoute que l’entrée propriétaire vers la page Worker; la page unique n’est pas migrée. |
| Données et services personnels restent sécurisés dans le Worker | Conforme au modèle actuel | Access, allowlist propriétaire, session capitaine et scopes conservés; aucun affaiblissement ou déploiement. |
| Authentification inter-domaines compatible Safari iOS | Partielle | Démonstration ticket Chromium réussie; WebKit mobile réussi mais cookie de la popup non observé par le banc. Safari iOS réel reste à valider. |
| Pas de jeton OAuth Scopely dans le navigateur | Conforme | OAuth et refresh token restent côté Worker/coffre; l’entrée transmet uniquement eventId. |
| Architecture Pages/Worker étayée | Étude réalisée | Origine commune recommandée si domaine LoSP disponible; ticket bref comme option; aucune option de production activée. |
| Catalogue central de ressources MSF | Partiel | docs/data/msf-resource-catalog.json est ajouté sur #739 avec identifiants, noms, catégories, provenance et correspondances vérifiées; pas de catalogue complet pour tous les objets. |
| Référentiels existants, API, manuel et ressources client 10.5 | Analysés | Manuel endpoints, référentiels R2/Pages et fichiers Unity/wasm examinés. Les binaires fournis révèlent des chaînes/types ISO-8 mais pas de table exploitable complète item→cristal. |
| Interface française, anglais interne conservé | Partiel | Libellés structurés et catalogue français disponibles; les codes restent internes. Traduction exhaustive de tous les noms/objectifs inconnus non démontrée. |
| Objectifs regroupés par personnage | Réalisé et testé | Regroupement, portrait compact partagé, barres seulement si compteurs connus; tests navigateur. |
| Progression par personnage et prérequis roster | Partiel | Progression connue et prérequis affichés; structures réelles Scopely non revalidées avec un nouveau compte. |
| Inventaire compact et filtrable | Réalisé et testé | Recherche française, filtres, groupes repliables, détails techniques masqués, valeurs inconnues distinctes de zéro. |
| Matrice ISO-8 couleur/niveau/classe/stat | Bloquée par les données | Ions séparés; matrice de cristaux non fabriquée faute de définitions publiques vérifiées. Il faut archiver les définitions complètes des items ou un référentiel Scopely structuré. |
| Stocks manuels et événements ignorés isolés par compte | Partiel | Partition par espace de session Worker et tests de bascule; pas d’identité durable de compte, donc une nouvelle session crée une partition vide. |
| Planification intelligente | Partielle | Mutualisation conservée par personnage/trait et mode dans l’événement sélectionné; pas de calendrier global multi-événements ni de calendrier fiable des combats/énergies à venir. |
| Mutualisation des actions | Partielle | Partage des combats compatibles au sein d’un événement; aucune mutualisation entre événements distincts. |
| Prévention du double comptage | Partielle | Ledger et ressources d’un événement pris en compte; aucune garantie globale inter-événements faute de planificateur multi-événements. |
| Faim mutante | Conforme en fixture | 65 300 acquis + 29 600 gratuits conditionnels = 94 900; palier 18 à 95 000, reste 100 non couverts. |
| Non-régression | Partielle | Tests ciblés Maddoxx et Worker verts; 15 échecs généraux inchangés par rapport à main; contrôles d’accès #739 avec échecs préexistants hors changements. |
| Validation mobile | Réalisée avec fixtures | Parcours Chromium et WebKit à 320/360/390/430 px sans overflow; captures Chromium synthétiques fournies. |
| Isolation données personnelles / déploiement | Conforme à la consigne | Pas d’appel Scopely personnel, fusion, publication Pages ou déploiement Worker. |

### Éléments nécessaires avant une validation d’intégration

- Confirmer la disponibilité d’un domaine LoSP contrôlé pour la future origine commune, ou choisir explicitement le mécanisme de ticket après une preuve WebKit/Safari concluante.
- Fournir une source structurée et vérifiable pour la matrice complète des cristaux ISO-8.
- Définir une identité stable de capitaine utilisable sans nouveau scope personnel avant de promettre une persistance par compte entre réauthentifications.
- Achever l’intégration de la page unique et élargir les traductions/règles de mutualisation seulement quand les référentiels fiables sont disponibles.

Aucune fusion, aucun déploiement, aucune nouvelle PR et aucun nouvel appel personnel Scopely n’ont été effectués pendant cette reprise.
