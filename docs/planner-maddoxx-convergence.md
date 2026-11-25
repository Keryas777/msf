# Convergence du planificateur Maddoxx vers la page Événements LoSP

État de préparation associé à PR #739 (interface de navigation) et PR #218 (services privés et interface expérimentale). PR conservées en brouillon; aucune fusion ou publication.

## Architecture examinée

| Solution | Authentification et session | Avantages | Contraintes, coût et risque | État |
|---|---|---|---|---|
| Interface servie par le Worker (actuel) | Cloudflare Access identifie l’administrateur; le Worker vérifie cet accès, puis le cookie capitaine HttpOnly; Secure; SameSite=Lax et ses scopes avant les données personnelles. | Même origine que l’API, session de premier niveau fiable sur Safari, aucun jeton OAuth dans le navigateur. | Page expérimentale distincte, duplication temporaire d’interface; ne satisfait pas la page unique dans msf/docs. | Référence transitoire; à conserver jusqu’à migration sûre. |
| Origine commune Pages + Worker | URL officielle msf/docs et API privée exposées sous le même hôte; Cloudflare route les chemins privés vers le Worker et le reste vers Pages, ou un Worker relaie les assets publics. Admin toujours vérifié côté Worker; session capitaine reste HttpOnly. | Une seule page, même origine pour appels, cookies, liens et Safari; pas de ticket dans le navigateur. | Demande un domaine contrôlé par LoSP et une configuration DNS/Pages/Worker; éventuel coût de domaine et consommation Cloudflare dépendant du compte, non vérifiable ici. Le routage/proxy et le maintien de base, cache, CSP et PWA ajoutent de la configuration. Ne pas supposer que github.io peut être routé via la zone Cloudflare de LoSP. | Option la plus simple à long terme si un domaine LoSP existant est disponible; non mise en place sans validation. |
| Session applicative / ticket temporaire | La page publique ne fait pas confiance à une session LoSP stockée par JavaScript. Le propriétaire ouvre d’abord une navigation de premier niveau du Worker, qui vérifie Cloudflare Access et la session capitaine, puis délivre une capacité opaque à usage unique / TTL court, limitée à l’origine et aux routes. Retour postMessage avec targetOrigin exact; API Worker échange/valide la capacité. OAuth reste serveur. | GitHub Pages statique peut rester l’interface; pas de cookie tiers requis pour chaque fetch; la capacité ne vaut pas jeton OAuth. Révocation possible avec TTL/état côté Durable Object existant. | Il faut gérer nonce, rejeu, TTL, échange atomique, origine exacte, CORS, erreurs et révocation; exposition d’une capacité en mémoire; davantage de code et de maintenance qu’une origine commune. Le Durable Object existant peut porter cet état, mais cette fonctionnalité n’existe pas encore. | Faisabilité navigateur prouvée avec ticket simulé; non implémentée, décision différée. |
| Cookie Worker directement depuis github.io | La page appelle le Worker en credentials: include. | Peu de code et pas de nouvelle session applicative. | Origines cross-site; le cookie SameSite=Lax n’est pas joint au fetch intersite sur Chromium/WebKit. Le passer en SameSite=None rendrait le fonctionnement dépendant des cookies tiers, bloqués sur Safari et souvent Discord; ne pas affaiblir ce cookie. | Écartée pour la page finale. |

Le mécanisme LoSP existant distingue correctement deux identités : le garde GitHub Pages peut afficher l’entrée administrateur, mais l’autorisation réelle reste le JWT Cloudflare Access et l’allowlist propriétaire du Worker. Une session capitaine Scopely ne confère aucun droit administrateur. Le jeton OAuth et le refresh token restent dans le Worker / coffre chiffré.

### Preuve de faisabilité inter-domaines

tests/event-planner-cross-origin.spec.mjs ouvre https://keryas777.github.io/msf/ et https://losp-roster-service.deliriousfan7.workers.dev/ dans Chromium et WebKit. Toutes les routes et identités sont synthétiques et interceptées : pas de login, pas de requête Scopely, pas de données de joueur. Le test observe la différence entre la navigation de premier niveau (cookie présent) et le fetch GitHub Pages → Worker (cookie absent). Puis il simule un ticket retourné avec postMessage au seul targetOrigin https://keryas777.github.io, et son usage en header sous CORS à origine exacte. Il vérifie que le ticket n’est ni dans l’URL ni dans localStorage. Cela prouve une voie possible, pas l’implémentation d’une authentification par ticket.

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
| Contrainte Safari iOS inter-domaines | Réalisée comme preuve, migration bloquée | WebKit synthétique montre que le cookie Lax ne joint pas un fetch tiers; ticket simulé fonctionne. Aucun ticket de production n’est implémenté. |
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
| Captures ergonomiques quatre onglets | En cours CI | Le workflow produit quatre PNG synthétiques à 390 px; aucune capture personnelle. Les captures renouvelées seront liées à l’exécution CI finale. |
| Page Événements publique / expérience membres | Non modifiée par PR #739 | Aucune modification des composants publics dans cette PR; elle ajoute la centralisation du catalogue et la note d’architecture. La page privée reste owner-only. |
| Déploiement/migration/retrait de l’interface Worker | Non réalisé et volontairement hors état actuel | PR en brouillon; aucun merge, déploiement ou changement d’autorisation n’a été demandé. |

## Ordre de migration proposé

1. Valider ce travail et les captures.
2. Valider l’une des architectures inter-domaines, idéalement une origine LoSP commune si un domaine contrôlé existe.
3. Garder l’entrée d’administration owner-only pendant toute la phase pilote.
4. Intégrer les composants dans msf/docs/evenements.html après preuve sécurisée d’origine/session; conserver le Worker comme API privée.
5. Tester sur Safari/WebKit, puis comparer l’expérience de la page publique avant activation propriétaire.
6. Ne retirer /admin/events-planner qu’après validation complète; ne pas ouvrir aux membres sans autorisation distincte.
