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

## Phase 3 — essais visuels et moteur hybride

Les expériences phase 3 utilisent toujours les neuf mêmes captures; les deux anciennes captures réservées restent contaminées. Elles ne sont pas présentées comme une validation indépendante.

Le module `docs/war-result-recognition-core.js` expose `locateZones(words, width, height)`. Il propose les zones alliance adverse, scores, trophées et bandeau à partir des mots OCR « LoSP » et « POINTS DE GUERRE », avec coordonnées relatives à la résolution. `visualize-zones.py` écrit des aperçus PNG localement; ces images de guerre ne sont pas ajoutées au dépôt.

Le modèle visuel de chiffres dans `visual-digit-experiment.py` segmente des glyphes isolés, construit des prototypes de formes à partir des sept captures d’apprentissage et laisse la capture entière hors des prototypes lors du score correspondant. Il n’enregistre pas et ne prédit pas de nombres entiers par mémorisation. Ses résultats n’ont pas dépassé Tesseract; il reste un essai rejeté. Les autres variantes de recadrage Tesseract, les modes PSM 7/8, les masques de couleur, niveaux de gris et seuillage sont détaillés dans les JSON phase 3.

Rejouer les essais Tesseract CLI (sorties déterministes avec versions et modèles identiques) :

```sh
python experiments/war-result-recognition/localized-tesseract-sweep.py \
  --images-dir /chemin/vers/les-captures
python experiments/war-result-recognition/phase3-hybrid-benchmark.py
python experiments/war-result-recognition/localized-name-sweep.py \
  --images-dir /chemin/vers/les-captures
python experiments/war-result-recognition/visual-digit-experiment.py \
  --images-dir /chemin/vers/les-captures
python experiments/war-result-recognition/visualize-zones.py \
  --images-dir /chemin/vers/les-captures --out-dir /chemin/vers/aperçus
```

Pour mesurer Tesseract.js localement sous Node, le paquet `tesseract.js` et le modèle anglais doivent être disponibles; aucune capture n’est envoyée. Les scripts peuvent prendre des images pré-réduites pour reproduire le plafond de 1800 px de la page :

```sh
python experiments/war-result-recognition/resize-benchmark-images.py \
  --images-dir /chemin/vers/les-captures --out-dir /tmp/captures-1800 --max-width 1800
python experiments/war-result-recognition/export-phase3-tessjs-crops.py \
  --images-dir /chemin/vers/les-captures --out-dir /tmp/war-crops --max-width 1800
WAR_OCR_IMAGES_DIR=/tmp/captures-1800 \
WAR_OCR_NODE_OUTPUT=/tmp/tessjs-raw.json \
  node experiments/war-result-recognition/benchmark-tesseractjs.cjs
WAR_OCR_IMAGES_DIR=/tmp/captures-1800 \
WAR_OCR_NODE_RAW=/tmp/tessjs-raw.json \
WAR_OCR_NODE_SUMMARY=/tmp/tessjs-summary.json \
  python experiments/war-result-recognition/summarize-tesseractjs.py
WAR_OCR_JS_BASELINE=/tmp/tessjs-summary.json \
  node experiments/war-result-recognition/benchmark-phase3-tessjs.cjs \
  /tmp/war-crops /tmp/tessjs-crop-results.json
```

Les mesures de Tesseract CLI, Tesseract.js 7 sous Node et le prototype navigateur épinglé à Tesseract.js 5 sont séparées dans `REPORT.md` et leurs JSON. Les scripts Node sont des bancs natifs, pas une validation Safari/Chrome.
