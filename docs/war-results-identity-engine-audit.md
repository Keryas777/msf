# Moteur Identité MSF — audit initial et protocole de validation

Branche : `work/identity-engine-unicode-color-audit`. Source : `docs/war-results-identity-engine.js` sur `main` au 19 novembre 2026.

## Périmètre et architecture

`analyzeRegion(source, rect, recognize, options)` accepte une image, une région et une fonction OCR injectée. Il ne localise pas les noms et n'utilise ni score, ni rang, ni trophées. En revanche `identityText(value, side)` retire le préfixe LoSP lorsque `side === "local"` ; cette règle métier doit migrer vers l'appelant dans une évolution compatible.

La lecture principale est PSM 11 sur un crop agrandi 2× (plafond 4096×1024). Le repli PSM 7 n'est effectué que si la lecture est vide ou sa confiance < 35. Le seuil d'arbitrage contradictoire est 30 points ; les alternatives et l'incertitude sont conservées. Les couleurs proviennent d'un crop RGB non agrandi, plafonné à 1400×520. Les segments proches sont fusionnés à une distance RGB <= 20.

## Taxonomie des erreurs et mécanismes possibles

| Classe | Mécanisme observable dans le code | Diagnostic à mesurer |
| --- | --- | --- |
| Glyphes / chiffres | Confusion du modèle `eng` | Distance d'édition et matrice de confusion lettres/chiffres |
| Unicode / exposants / stylisations | Modèle OCR insuffisant ; `graphemes` fusionne seulement les marques combinantes, pas les séquences ZWJ | Égalité Unicode stricte, code points, graphemes |
| Ponctuation / espaces | `clean` contracte tous les espaces ; l'arbitrage compare les lectures en NFKC minuscules | Insertions/suppressions ponctuation et espaces |
| Contradictions | PSM 7 conditionnel ; conflit conservé sans choix si écart < 30 | Taux de conflits, précision du choix et abstention |
| Reconnaissance partielle | Absence de comparaison de couverture géométrique des lectures | Longueur, boîtes OCR, bords coupés |
| Couleurs | `dominantColor` échantillonne tous les pixels suffisamment lumineux dans les boîtes, y compris du fond | Couverture des pixels réellement textuels, exactitude des couleurs |
| Transitions | Répartition uniforme de la largeur du mot entre ses graphèmes | Écart des frontières de transition |
| Alignement texte/couleur | Association des boîtes par nombre de tokens, puis repli uniforme sur la largeur de l'encre | Taux d'alignement exact, cas sans boîtes |
| Préfixe LoSP | Suppression `side:local` dans le moteur | Compatibilité des appelants après migration |

Ces mécanismes sont des hypothèses techniques, pas des erreurs quantifiées sur les 28 images : aucune image identifiable ne doit être publiée dans le dépôt.

## Priorités proposées

1. **P0 :** corpus local privé commun (guerre + classements), avec partitions développement/validation et mesures reproductibles ; protéger les corrections manuelles et l'API existante.
2. **P1 :** conserver un texte visuel non destructif et une normalisation séparée ; mesurer la gestion des graphèmes complexes ; ajouter des diagnostics de couverture des boîtes.
3. **P1 :** améliorer l'alignement à partir de boîtes de symboles/caractères lorsqu'elles existent, sans inventer de positions ; conserver l'incertitude sinon.
4. **P2 :** comparer PSM 6/7/11, 2×/3× et prétraitements sur chaque catégorie, en mesurant la latence Safari ; ne jamais sélectionner une variante sur le seul total global.
5. **P2 :** comparer les masques de premier plan et la segmentation colorimétrique, avec mesure des frontières multicolores.
6. **P3 :** étude de faisabilité d'un autre OCR uniquement après comparaison du poids, du chargement, des dépendances, de la mémoire et de Safari iOS.

## Protocole

Pour chaque crop privé : référence visuelle Unicode exacte, segments RGB attendus, source guerre/classement utilisée seulement pour stratifier le rapport, dimensions, SHA-256 local, temps, texte OCR, alternatives, confiance, incertitudes et segments. Séparer les partitions par identité de nom et, si possible, par session de capture pour éviter les fuites. Comparer les mêmes images avec les mêmes conditions et présenter les régressions individuelles sans exposer les noms ni les images sur GitHub.

Mesures : exactitude stricte ; exactitude après normalisation ; distance d'édition par graphèmes ; précision/rappel des symboles et ponctuations ; exactitude des couleurs par caractère ; précision des frontières multicolores ; latence médiane/P95 ; fréquence d'abstention et qualité de calibration.

## Baseline historique fournie (non réexécutée)

PR #704, 28 crops manuels : strict 7/28 ; normalisé 9/28 ; caractères 80,4 % ; segments 46 ; transitions multicolores correctes 2/4. Les variantes PSM 6 et 7 isolées ainsi que l'agrandissement 3× ont chacune atteint 8/28 stricts dans des essais antérieurs, sans justifier leur adoption générale.

## Garde-fous de livraison

Ne pas modifier les localisateurs, les moteurs Numérique/Résultat, ni les données identifiables. Pas de nouveau backend ou framework. Toute évolution algorithmique doit avoir des tests unitaires, une comparaison avant/après sur validation privée et une vérification Safari iOS. Ne pas fusionner avant cette validation.
