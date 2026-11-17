# War Results Vision — calibration des refus

## Résultat

Le lecteur produit 21 propositions numériques exactes sur 36, mais n’en accepte qu’une. Les seuils actuels sont une similarité minimale de `0,79` et une marge minimale entre les deux meilleurs chiffres de `0,035`.

| Catégorie | Champs | Propositions exactes | Acceptées exactes | Refus |
| --- | ---: | ---: | ---: | ---: |
| Scores | 18 | 9 | 1 | 17 |
| Trophées | 18 | 12 | 0 | 18 |
| Total | 36 | 21 | 1 | 35 |

Les refus viennent de deux règles différentes : sur les scores, 17 champs sont refusés pour `ambiguous-glyph`; sur les trophées, 17 le sont parce que le modèle n’a pas la classe `5`, et un champ est refusé car un caractère touche le bord de sa découpe.

Sur les mêmes zones, les propositions sont exactes dans 15/28 champs de CV contre 18/28 pour Tesseract CLI; dans le jeu réservé, elles sont exactes dans 6/8 contre 5/8. Ces résultats restent des mesures Node/CLI du corpus connu, pas une validation navigateur.

## Calibration des scores

La marge actuelle est le minimum des marges par chiffre. Une seule lettre de confiance faible suffit donc à refuser tout le nombre. Sur les prédictions hors pli des sept captures d’entraînement, les nombres exacts ont des marges minimales de `0,0054` à `0,0422`; les nombres incorrects vont de `0,0006` à `0,0112`. Les plages se recouvrent, mais le haut de la distribution correcte laisse un intervalle empirique sans erreur observée.

Un seuil de marge dérivé uniquement de ces prédictions hors pli vaut `0,016074`. Il accepterait 2/14 scores de CV, tous deux exacts, contre 1/14 au seuil actuel. Une validation imbriquée, qui réserve à tour de rôle chaque capture d’entraînement pour tester le seuil, n’accepte toutefois que 1/14 champ, sans erreur; le seuil choisi varie de `0,0153` à `0,0267` selon la capture retirée.

Le seuil figé à `0,016074` n’accepte aucun score des deux captures de validation, alors que leurs quatre propositions étaient exactes. Le seuil plus bas augmente donc la couverture apparente sur les données utilisées pour le calibrer, mais ne démontre pas de gain de validation.

## Calibration des trophées

Le modèle trophée n’a aucun exemple du chiffre `5`. Le garde-fou de classe incomplète doit rester actif : il entraîne le refus des 18 champs de trophées, quels que soient leur similarité et leur marge. L’assouplir ferait passer une classe inconnue pour l’une des classes apprises.

À titre de diagnostic seulement, si l’on ignore ce garde-fou, la CV trouve un seuil de marge `0,016806` qui accepte 7/14 champs, tous exacts sur ces prédictions. L’écart entre la marge incorrecte la plus haute (`0,016736`) et la marge correcte suivante (`0,016877`) n’est que `0,000141`. En validation imbriquée, la même politique accepte 7/14 champs, dont 1 est faux. Elle n’est pas assez stable pour servir de règle d’acceptation.

Appliqué sans retouche aux deux captures réservées, ce seuil hypothétique n’accepte aucun trophée. Les deux erreurs de proposition du jeu réservé concernent des nombres contenant le chiffre absent du modèle. Les marges des trophées corrects et incorrects se recouvrent; les seuils de similarité ne compensent pas l’absence de cette classe.

## Décision

Je conserve les seuils du lecteur à `0,79` et `0,035`. Le seuil candidat `0,016074` n’améliore pas la validation et la calibration des trophées échoue à la fois sur la classe manquante et sur la stabilité des marges. Aucun changement de production ni changement de seuil par défaut n’est proposé.

Pour reprendre la calibration, il faut d’abord ajouter des glyphes réels de trophées `5`, puis obtenir davantage de captures indépendantes. Les seuils pourront être réévalués sur des prédictions hors capture, avec une contrainte de précision minimale fixée avant l’analyse.

## Reproduction et confidentialité

Le modèle JSON local contient les masques binaires des glyphes, leurs valeurs étiquetées et leur provenance par capture/champ/position. Ces masques sont des dérivés visuels des captures; ils ne sont pas nécessaires au segmentateur publié et ne seront pas inclus. Le script `calibrate-war-results-confidence.py` lit le benchmark privé local et n’écrit qu’un résumé agrégé par catégorie et par split. Il ne sérialise aucun texte OCR, score, trophée, identifiant de capture, rectangle, glyphe ou empreinte. Les tests de calibration n’utilisent que des lignes synthétiques. Aucun fichier source d’image, planche, annotation par champ ou modèle de glyphes n’est inclus dans le résumé agrégé.

Exécution locale :

```sh
python3 experiments/war-result-recognition/calibrate-war-results-confidence.py \
  --input /chemin/local/war-results-digit-reader-benchmark.json \
  --output /chemin/local/war-results-confidence-calibration.json
python3 -m unittest experiments/war-result-recognition/tests/test_confidence_calibration.py
```
