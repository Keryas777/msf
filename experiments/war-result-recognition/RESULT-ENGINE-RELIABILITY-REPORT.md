# War Results Vision — résultat : fiabilité et confiance

Date : 23 novembre 2026  
Branche : `work/war-results-result-engine-reliability`  
Base : `main` à `7bf68ad684b7cdc5a0835a3ec1ac529758d231d6`

## État préalable

La PR #708 est fusionnée dans `main`. Le moteur Résultat présent à son commit de référence `226bbece819d163f236401377ac6b28eff4d3f2d` est également celui de la base actuelle. Les seules PR ouvertes liées à War Results Vision au moment de l’audit sont les PR #706 (intégration du moteur Identité au localisateur de classements) et #707 (audit Identité) ; aucune ne modifie le moteur Résultat. Les branches de variantes du localisateur de trophées ne changent pas ce moteur.

Le laboratoire commun exécute le moteur choisi et les champs cochés. Le champ `result` est localisé puis transmis à `WarResultsResultEngine.analyze` ; le worker OCR n’est créé que si le moteur appelle son secours OCR. L’analyse normale continue de lire ses autres champs et n’a pas été modifiée.

## Cause de la confiance affichée à 1 %

Le moteur calculait et renvoyait sa confiance comme une fraction entre 0 et 1 (`0.99` au maximum). Les deux interfaces affichent ce champ selon la convention générale de l’application, en arrondissant une valeur entre 0 et 100. La valeur `0.99` devenait donc `Math.round(0.99)`, soit `1 %`. La décision colorimétrique pouvait être correcte tandis que son pourcentage affiché était faux.

Le correctif convertit le résultat du calcul existant en points de pourcentage à la sortie du moteur. Il ne change pas la formule de confiance ni ne rehausse artificiellement son score. Les autres composants continuent de recevoir le même type de champ, désormais conforme au contrat attendu par les interfaces.

## Comparaison avant/après disponible

Les cinq captures réelles mentionnées dans la demande n’étaient pas présentes dans l’espace de travail de cette session. Aucune décision, durée ou confiance par capture ne peut donc être rapportée ici. Les images n’ont pas été reconstituées, copiées ou publiées.

Le seul comparatif exécutable ici est un échantillon synthétique de 100 × 100 pixels, composé d’un signal bleu dominant et d’un fond neutre, mesuré cinq fois sur 200 appels par série dans Node.js :

| Mesure synthétique | Avant | Après |
|---|---:|---:|
| Décision | `win` | `win` |
| Confiance brute | `0.99` (fraction) | `99` (pourcentage) |
| Valeur affichée par l’interface | `1 %` | `99 %` |
| Médiane par appel dans cet environnement | 0,132 ms | 0,146 ms |
| Étendue des médianes par série | 0,128–0,182 ms | 0,137–0,214 ms |

Cette micro-mesure synthétique n’est ni un benchmark des cinq captures ni une mesure Safari iOS. L’écart de durée est de l’ordre du bruit de mesure et ne permet pas d’inférer les performances mobiles.

## Modifications et vérifications

- `docs/war-results-result-engine.js` : contrat de confiance 0–100; rejet des données pixels incomplètes et des zones entièrement hors image; minimum de 16 pixels chromatiques pour décider; calcul des contradictions de sous-régions après leur analyse et motif explicite; OCR de secours à 74 %, donc toujours marqué à vérifier.
- `experiments/war-result-recognition/tests/war-results-result-engine.test.cjs` : couverture synthétique de couleurs bleues/rouges, bruit, couleurs sombres, ambiguïté, trop peu de pixels, régions invalides/partiellement coupées, contradictions, déclenchement et qualité minimale du secours OCR, ainsi que les unités de confiance.
- Tests ciblés complets : 32/32 réussis; syntaxe JavaScript et `git diff --check` réussis.
- Le contrôle GitHub Actions `test` du commit `9d1d5803666dee7c4445913e9df3de6e0a337215` a échoué dans `tests/scoped-roster-pages.test.mjs:74`: le test attend `joueur.js?v=7`, alors que `main` contient `joueur.js?v=8`. Cette assertion échoue également sur la base inchangée; ni le fichier de page ni ce test ne figurent dans le diff de cette PR. Le log indique une assertion en échec dans ce workflow général.

Les tests d’intégration confirment que le laboratoire conserve l’exécution indépendante, que le secours OCR n’est pas requis quand la couleur suffit, que les actions de correction iOS restent routées et qu’une correction manuelle du résultat survit à une nouvelle proposition du moteur. Aucun code d’interface, d’Identité, de Numérique, de résultat de guerre ou de correction manuelle n’a été modifié.

## Limites restantes

- Rejouer le moteur avant/après sur les cinq captures privées et comparer les cinq résultats attendus, les diagnostics et les durées.
- Vérifier l’affichage et le temps de traitement sur iPhone Safari réel. Aucun appareil Safari n’a été utilisé pour ce changement.
- Confirmer sur le corpus réel que le seuil de 16 pixels et les plages HSV restent adaptés aux captures compressées, assombries ou partielles. Les tests synthétiques ne certifient pas cette généralisation.
- Mettre à jour ou corriger cette assertion générale du dépôt dans un chantier séparé si souhaité; elle n’est pas liée au moteur Résultat.
