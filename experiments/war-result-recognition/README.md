# Reconnaissance locale des résultats de guerre

Le prototype est isolé des compteurs de guerre, du débrief et des archives. Il traite l’image dans le navigateur avec Tesseract.js et Canvas; il ne contacte aucune API OCR, n’écrit pas d’historique et n’infère pas de date. L’export reste un brouillon local après correction et confirmation manuelles.

## Corpus

`ground-truth.json` contient neuf captures vérifiées visuellement : sept en entraînement, deux initialement réservées. Les dates sont nulles. Le nom adverse de `capture-09` reste inconnu, donc les 63 positions de champs ont 62 valeurs de vérité terrain éligibles. Les deux images dites « holdout » ont été consultées pendant l’itération précédente; elles sont marquées contaminées et ne sont pas une validation indépendante.

Les images ne sont pas stockées dans ce répertoire ni dans la PR. Le banc attend leur copie locale dans un dossier séparé. Chaque image est vérifiée par SHA-256 avant exécution.

## Rejouer l’évaluation stricte

Prérequis : Python 3, Pillow, Node.js et Tesseract CLI avec le modèle `eng`.

```sh
python experiments/war-result-recognition/benchmark.py \
  --images-dir /chemin/vers/les-captures \
  --output experiments/war-result-recognition/phase2-benchmark-results.json

node experiments/war-result-recognition/segmentation-sweep.cjs
python experiments/war-result-recognition/roi-sweep.py --images-dir /chemin/vers/les-captures
```

Le benchmark appelle le même parseur spatial JavaScript que la page, et compare séparément les configurations PSM 6, PSM 11 et la combinaison prudente des deux passes. Pour chaque champ, le JSON enregistre la valeur attendue, la valeur extraite et attribuée, l’égalité stricte, la confiance Tesseract quand elle existe, la source, la correction manuelle requise et la catégorie d’échec. La ponctuation des noms est conservée dans l’égalité; seules la casse, les variantes Unicode compatibles et les espaces répétés sont normalisés.

Le résultat victoire/défaite est mesuré indépendamment par l’indice rouge/bleu du bandeau. Le test de segmentation ne crédite jamais une valeur trouvée ailleurs dans le texte OCR comme un champ correctement extrait.

## Tesseract.js

`benchmark-tesseractjs.cjs` exécute localement le paquet Tesseract.js disponible dans l’environnement Node. Il faut fournir un modèle `eng` local dans le chemin indiqué par le script; `summarize-tesseractjs.py` compare les valeurs produites aux mêmes champs de vérité terrain.

Cette exécution est une mesure Node du moteur Tesseract.js 7.0.0, pas un essai du prototype Web qui reste épinglé à Tesseract.js 5.0.0. Elle ne mesure ni Safari/Chrome mobile, ni le chargement CDN réel du premier passage. Le blocage du navigateur de travail sur les URL locales a empêché de démarrer le prototype en navigateur; iOS Safari, Android Chrome et le navigateur Discord restent non testés.

## Tests

```sh
python -m unittest discover -s experiments/war-result-recognition -p 'test_*.py' -v
node experiments/war-result-recognition/test-core.cjs
node --check docs/war-result-recognition.js
node --check docs/war-result-recognition-core.js
```

Voir `REPORT.md` pour les mesures, les limites, les configurations rejetées et la table par capture. `war_ocr_benchmark_results.json` conserve le premier essai. `REPORT.md` le marque comme mesure de présence textuelle non comparable et le remplace pour les conclusions de précision.
