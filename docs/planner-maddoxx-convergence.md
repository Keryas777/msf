# Convergence du planificateur Maddoxx vers la page Événements LoSP

État de préparation associé à PR #739 (interface de navigation) et PR #218 (services privés et interface expérimentale). PR conservées en brouillon; aucune fusion ou publication.

## Architecture examinée

| Solution | Authentification et session | Avantages | Contraintes, coût et risque | État |
|---|---|---|---|---|
| Interface servie par le Worker (actuel) | Cloudflare Access identifie l’administrateur; le Worker vérifie cet accès, puis le cookie capitaine HttpOnly; Secure; SameSite=Lax et ses scopes avant les données personnelles. | Même origine que l’API, session de premier niveau fiable sur Safari, aucun jeton OAuth dans le navigateur. | Page expérimentale distincte, duplication temporaire d’interface; ne satisfait pas la page unique dans msf/docs. | Référence transitoire; à conserver jusqu’à migration sûre. |
| Origine commune Pages + Worker | URL officielle msf/docs et API privée exposées sous le même hôte; Cloudflare route les chemins privés vers le Worker et le reste vers Pages, ou un Worker relaie les assets publics. Admin toujours vérifié côté Worker; session capitaine reste HttpOnly. | Une seule page, même origine pour appels, cookies, liens et Safari; pas de ticket dans le navigateur. | Demande un domaine contrôlé par LoSP et une configuration DNS/Pages/Worker; éventuel coût de domaine et consommation Cloudflare dépendant du compte, non vérifiable ici. Le routage/proxy et le maintien de base, cache, CSP et PWA ajoutent de la configuration. Ne pas supposer que github.io peut être routé via la zone Cloudflare de LoSP. | Option la plus simple à long terme si un domaine LoSP existant est disponible; non mise en place sans validation. |
| Session applicative / ticket temporaire | La page publique ne fait pas confiance à une session LoSP stockée par JavaScript. Le propriétaire ouvre d’abord une navigation de premier niveau du Worker, qui vérifie Cloudflare Access et la session capitaine, puis délivre une capacité opaque à usage unique / TTL court, limitée à l’origine et aux routes. Retour postMessage avec targetOrigin exact; API Worker échange/valide la capacité. OAuth reste serveur. | GitHub Pages statique peut rester l’interface; pas de cookie tiers requis pour chaque fetch; la capacité ne vaut pas jeton OAuth. Révocation possible avec TTL/état côté Durable Object existant. | Il faut gérer nonce, rejeu, TTL, échange atomique, origine exacte, CORS, erreurs et révocation; exposition d’une capacité en mémoire; davantage de code et de maintenance qu’une origine commune. Le Durable Object existant peut porter cet état, mais cette fonctionnalité n’existe pas encore. | Preuve partielle : Chromium valide le flux de ticket simulé; WebKit mobile valide l’interface mais ne transmet pas le cookie de session à la navigation popup dans le banc. L’échange de ticket n’est donc pas validé en WebKit et n’est pas implémenté. |
| Cookie Worker directement depuis github.io | La page appelle le Worker en credentials: include. | Peu de code et pas de nouvelle session applicative. | Origines cross-site; le cookie SameSite=Lax n’est pas joint au fetch intersite sur Chromium/WebKit. Le passer en SameSite=None rendrait le fonctionnement dépendant des cookies tiers, bloqués sur Safari et souvent Discord; ne pas affaiblir ce cookie. | Écartée pour la page finale. |

Le mécanisme LoSP existant distingue correctement deux identités : le garde GitHub Pages peut afficher l’entrée administrateur, mais l’autorisation réelle reste le JWT Cloudflare Access et l’allowlist propriétaire du Worker. Une session capitaine Scopely ne confère aucun droit administrateur. Le jeton OAuth et le refresh token restent dans le Worker / coffre chiffré.

### Preuve de faisabilité inter-domaines

tests/event-planner-cross-origin.spec.mjs ouvre https://keryas777.github.io/msf/ et https://losp-roster-service.deliriousfan7.workers.dev/ dans Chromium et WebKit. Toutes les routes, cookies et identités sont synthétiques et interceptées : pas de login, pas de requête Scopely, pas de données de joueur. Au SHA courant, Chromium confirme que le cookie Lax est absent du fetch intersite et présent sur la navigation Worker de premier niveau; l’échange postMessage vers l’origine Pages exacte puis l’en-tête de ticket fonctionne, sans ticket dans l’URL ni localStorage. WebKit 26.0 possède le cookie synthétique dans son cookie jar après bootstrap, mais le cookie n’apparaît pas dans les en-têtes de la navigation popup interceptée; le test s’arrête donc avant l’échange du ticket. Le banc ne permet pas de conclure à une incompatibilité réelle de Safari ni à sa compatibilité : une validation réelle iOS reste requise. La preuve est partielle, sans ticket de production.

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
