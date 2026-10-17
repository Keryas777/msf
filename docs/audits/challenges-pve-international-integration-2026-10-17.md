# Guides LoSP — audit d'intégration PvE internationale (17/10/2026)

## Méthode

Point de départ : `main` après fusion de la PR #267, soit **29 événements et 142 fiches/sections**. La présente branche n'a pas recréé l'interface. L'exploitation des sources vise uniquement **les guides de progression PvE** (Dimensions noires, Tours/Kyln, Trials/Scourges et Sagas), sans contres de guerre/Crucible/arène.

La priorité a été donnée aux guides écrits dont le texte pouvait être consulté ou recoupé : **Marvel Church**, guides DD **App-Tipps** et **Theria Games** et journal historique DD6 **Gaming-Fans**. Les alternatives de joueurs déjà présentes dans LoSP (`challenge-alternatives.json`) ont été conservées. L'index international `challenge-guide-sources.json` reste un outil **éditorial non chargé dans l'interface**.

## Résultat quantitatif

- **34 événements** au total, tous possédant au moins une fiche ou section, contre 29 au départ.
- **337 fiches/sections structurées**, soit **+195** par rapport à la base.
- **40 compositions alternatives** préexistantes préservées.
- **47 références éditoriales**, dont cinq références nouvelles pour quatre Scourges et Apocalypse.
- **Aucun lien externe** ni auteur ajouté dans l'interface Challenges.

**Important :** 337 entrées ne signifient pas 337 victoires démontrées. Certaines sont des descriptions par section, des préparations théoriques, des parcours anciens ou des étapes provisoires.

## Événements et couverture principale

| Guide | Sections documentées | Catégorie |
| --- | ---: | --- |
| Tour de Blade | 24/24 | tower |
| Tour de Spider-Man : Descente | 40/40 | tower |
| Tour de la Peur | 20/20 | tower |
| Tour de Tornade | 12/12 | tower |
| Tour de Guerre | 12/12 | tower |
| Évasion de Kyln : Code Whiplash | 20/20 | tower |
| Évasion de Kyln : Polarity Shift | 18/18 | tower |
| Épreuves du Roi d'ombre | 10/10 | trial |
| Épreuves d'Old Man Logan | 10/10 | trial |
| Épreuves de Black Cat | 10/10 | trial |
| Épreuves du Bouffon vert (Classique) | 10/10 | trial |
| Épreuves de Nova | 10/10 | trial |
| Fléau Famine — Malicia | 10/10 | trial |
| Fléau Pestilence — Morgan Le Fay | 10/10 | trial |
| Fléau Guerre — Hulk rouge | 10/10 | trial |
| Fléau Mort — Archangel | 10/10 | trial |
| Saga d'Apocalypse | 9/9 | event |
| Dimension noire 6 | 5 | dark-dimension |
| Dimension noire VIII | 5 | dark-dimension |
| Dimension noire IX | 6 | dark-dimension |

Les autres événements de la base initiale sont conservés : Silver Surfer (Breaker), Scorpion (Breaker), Magik (Breaker), Finding Xavier, Invasion Quasar, Blastaar, Target Blue Marvel et DD1–DD5/DD7, avec leur couverture disponible.

## Limites strictes et cas ambigus

1. **Kyln Code Blazes :** 5 cellules documentées sur 20. Le guide confirme **3 personnages par cellule**, mais propose des équipes de cinq dans les premières instructions. Les membres nommés apparaissent comme **candidats** ; aucun trio validé n'a été inventé. Les 15 autres restent « À compléter ».
2. **Invasion Quasar :** 10 premières missions documentées sur 16 ; six missions suivantes restent en attente d'un déroulé vérifié.
3. **Kyln Polarity Shift :** contradiction interne sur l'exigence d'étoiles des légendaires cellules 15/16 : le tableau affirme cinq étoiles, l'explication narrative parle de trois/quatre. Le JSON avertit explicitement le joueur.
4. **Scourges Famine, Pestilence, Guerre, Mort :** sources historiques avec restrictions modifiées ultérieurement ; les compositions reconstruites ou modernisées ne sont **pas** des confirmations de victoire en 2026.
5. **DD1–DD5 et DD7 :** chaque entrée comprend une section de préparation et de restrictions, **sans fausse équipe de cinq héros** présentée comme gagnante.
6. **DD6 :** journal historique des missions 2 à 6 de 2023 ; certains cinq personnages ne peuvent être affichés exactement, notamment **Kestrel normale** absente des métadonnées `player_Character`. Ne jamais la remplacer par Kestrel zombie.
7. **DD8/DD9 :** recommandations et alternatives par sections, non équivalentes à des clears vidéo démontrés.
8. **Trials historiques Black Cat et Bouffon vert classique :** une partie des anciens guides suggère le héros justement en cours de déblocage. Les premières équipes montrent des remplaçants signalés, pas le futur héros obligatoire.
9. **Saga Apocalypse :** prérequis de progression Hard/Héroïque/Apocalyptique ; les neufs nœuds sont listés pour Apocalyptique, mais les compositions proposées sont des recommandations et les membres explicitement obligatoires sont indiqués sans compléter arbitrairement les emplacements.
10. **Contenus vidéo YouTube et Reddit :** ils ne sont pas tous lisibles directement lors de cette exécution ; ne pas traiter une vidéo ou un post non ouvert comme victoire vérifiée. Les sources restent indexées pour une analyse ultérieure.
11. **Éligibilité des traits :** les identifiants ont été vérifiés contre `msf-characters.json` (personnages jouables), mais le fichier ne suffit pas à **garantir l'éligibilité des traits de toutes les équipes**. Les substitutions théoriques doivent être confrontées à la sélection réelle en jeu.

## Architecture et vérifications

- Les données restent dans `docs/data/challenges.json` : aucun backend, aucun framework.
- Des niveaux de preuve explicites sont utilisés (`walkthrough`, `recommendation`, `historical_playthrough`, `multi_attempt`), et les équipes partielles sont identifiées.
- Aucun lien ou attribution vers les sites sources ne s'affiche dans les fiches ; l'index de sources éditorial reste séparé.
- Script de la page inchangé fonctionnellement hormis les libellés avertissant des recommandations partielles / combats anciens.
- `challenges-category.html` référence `challenges.js?v=5` pour éviter les vieilles versions Safari/PWA.
- Tests structurels : IDs de personnages jouables, doublons d'étapes, comptages, URLs absentes du runtime, JavaScript syntaxiquement valide.
- **14 parcours simulés** (tour, Kyln, Trials, Scourges, saga, DD), sélecteur et rendu des portraits : succès.
- `docs/home.html`, `docs/home.css` et `docs/sw.js` strictement identiques à `main`.

## Travail résiduel

- Examiner les 19 références encore en `reviewQueue`, vidéos complètes et sites dynamiques MSFWAR/MSF Base pour obtenir des tactiques et compositions individuelles supplémentaires, sans réutiliser aveuglément des schémas de cinq personnages.
- Valider par **tests tactiles réels iOS Safari, Android Chrome et navigateur Discord**, ainsi que les restrictions en jeu.
- Étendre les notes des anciennes DD (actuellement préparation par section), les six missions Quasar et quinze cellules Blazes dès que les descriptions détaillées deviennent vérifiables.

**Cette PR doit rester en brouillon avant la revue des compositions et restrictions en jeu.**
