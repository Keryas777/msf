# Audit initial — sources internationales de guides PvE MSF

**Date du contrôle :** 17 octobre 2026  
**Dépôt :** `Keryas777/msf`  
**Périmètre :** Dimensions noires, Tours, Kyln, Trials/Scourges, Breakers, Invasions et sagas PvE comparables.

## Périmètre et source de vérité

Le registre `docs/data/challenge-guide-sources.json` est **distinct** du corpus de stratégies `docs/data/challenges.json`. Il ne remplace aucune équipe, aucun conseil ni aucun état de progression. Les métadonnées affichées concernent des références externes ; une URL de page générale ne démontre pas une stratégie victorieuse pour tous ses nœuds.

**Bilan du registre :** 42 références cataloguées, 19 en attente de vérification. Parmi les 42 : 5 pages lues, 3 pages ouvertes sans validation de chaque soumission, 25 contenus retrouvés dans les index mais non ouverts directement, et 9 pages uniquement indexées.

Les sources `indexed_only` et la `reviewQueue` sont exclues de l'interface, même si elles restent archivées pour la suite. Les contenus `indexed_content` apparaissent avec **avertissement explicite** concernant l'ouverture du lien.

## Constats vérifiés

- **Marvel Church :** l'index du site et les résultats de recherche recensent les pages de tours, Breakers, Invasion, DD et Trials. Plusieurs ouvertures directes automatisées ont été refusées (HTTP 402) : l'indexation et le contenu en recherche **ne valent pas** contrôle interactif actuel de chaque page.
- **MSFWAR :** le site fournit des événements PvE, restrictions, listes de cellules et vidéos, mais une part importante est rendue dynamiquement. Sans URL directe stable d'un événement ou d'une solution, la racine du site reste en file de revue, pas comme solution par étage.
- **MSF Base :** des pages de solutions communautaires par tour ont été identifiées pour Spider-Man, Blade et Fear. L'éditeur indique que les soumissions individuelles **ne sont pas vérifiées** : aucun taux de réussite ni composition imaginaire n'est créé.
- **Reddit :** les comptes rendus de Rayge documentent réellement des compositions et parfois des vidéos par plages de niveaux. Cela reste une victoire **rapportée**, dépendante de la puissance du compte, de l'édition et des modificateurs.
- **App-Tipps :** le guide DD9 donne des recommandations par section, pas un rapport de victoire indépendante ; il synthétise en partie Marvel Church.
- **Theria Games :** les versions française, espagnole et portugaise du guide Shadow King (juillet 2025) appartiennent à une famille éditoriale ; les traductions ne sont pas comptées comme autant de stratégies indépendantes. Une version plus ancienne (janvier 2025) doit être comparée avant fusion éditoriale.
- **Gaming-Fans :** le récit DD6 est accessible, mais historique et non nécessairement applicable aux personnages actuels.
- **Vidéos YouTube fournies :** aucune vidéo n'a pu être visionnée directement durant cet audit. Les URL proposées sans contrôle sont conservées dans la `reviewQueue`. Quatre liens de Rayge explicitement inclus dans des témoignages contrôlés sont indexés séparément, sans prétendre que leur contenu vidéo a été vérifié.

## Compositions secondaires encodées

**29 propositions** de formations sont rattachées à des étages précis dans la source elle-même. Elles correspondent à des retours de joueurs, et non à des tests exécutés par LoSP.

- **24 propositions** possèdent cinq portraits, **5** seulement une composition partielle.
- Parmi les propositions à cinq personnages, **16** développent les noms d'équipes cités en utilisant le catalogue d'équipes LoSP actuel : l'interface les signale comme **reconstructions éditoriales à vérifier**, et non comme cinq noms individuellement vérifiés dans les témoignages.
- Ces formations n'écrasent jamais les stratégies LoSP existantes et peuvent se contredire : plusieurs solutions d'un même nœud restent disponibles côte à côte.

## Règles de granularité

- Les références ayant des `stageIds` ou `sectionIds` sont associées **uniquement** aux étapes explicitement démontrées par leurs publications.
- Les guides généraux apparaissent au niveau de l'événement. Les guides transversaux des DD peuvent apparaître dans chaque DD sans attribution fictive à un nœud.
- `difficulty: null` signifie difficulté non certifiée. Il ne faut jamais inférer une difficulté à partir d'un titre ou d'une catégorie voisine.
- Les périodes historiques, traductions, recommandations théoriques, démonstrations et solutions de joueurs restent distinctes.
- Aucune ingestion automatique de texte intégral, capture ou image de sites tiers : uniquement métadonnées, petites descriptions éditoriales et liens.
- Aucun guide Guerre/Cosmic Crucible/Arène, aucun calculateur, outil de roster ou autre module hors périmètre n'a été importé.

## Périmètre de modifications

- Extension du catalogue existant avec quatre entrées PvE : Invasion Quasar, Invasion Blastaar, Finding Xavier et Target Blue Marvel, sans créer de nœuds hypothétiques.
- Ajout de la quatrième tuile **après** les trois catégories déjà validées.
- Ajout des guides externes multiples dans les fiches d'événement et d'étape, avec filtre par difficulté, métadonnées et prudence sur le niveau de preuve.
- Aucune modification de la page d'accueil, des workflows, du Service Worker ou des modules hors Challenges.

## Étapes restantes

1. Vérifier manuellement sur Safari les sources `indexed_content` et les vidéos YouTube bloquées par les outils.
2. Comparer les différentes versions Theria (traduction vs nouvelle rédaction).
3. Retrouver les permaliens événement/étage de MSFWAR s'ils existent, au lieu de créer des liens génériques.
4. Ajouter les compositions secondaires sous forme de données structurées lorsque chaque source précise réellement les cinq personnages, leurs remplacements et la difficulté.
5. Tester les liens externes et l'accessibilité mobile avant de rendre Challenges visible aux joueurs.

**Ce document reflète un premier audit sourcé, non une certification universelle des liens.**
