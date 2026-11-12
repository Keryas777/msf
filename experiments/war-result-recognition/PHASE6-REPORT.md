# Phase 6 — zones adaptatives et vérification visuelle

## Audit et diagnostic

War Counter Vision est construit dans `docs/war-counter-lab.html`, avec `docs/war-counter-lab.js` et `docs/war-counter-lab.css`. Son flux garde la source image décodée, prélève les crops à leur résolution source (`cropBase`) et rend des aperçus dédiés (`cropPreviewDataUrl`, `slot-crop`, `power-crop`) à côté de chaque proposition.

Avant cette phase, War Results Vision faisait deux lectures Tesseract de la capture entière (PSM 6 et 11), dont le canvas global était plafonné à 10 millions de pixels. Les zones ciblées ne couvraient que l’alliance adverse et des recadrages numériques conditionnels. `locateZones()` cherchait le mot exact `LoSP` et la ligne `points/guerre`, puis appliquait plusieurs offsets exprimés par rapport à l’image entière. Aucune zone n’était montrée à l’utilisateur. Une ancre ratée pouvait donc désactiver le crop de trophées ou décaler une lecture; les deux passes globales pouvaient aussi renvoyer une valeur numérique plausible mais erronée.

Le premier essai Safari fourni par l’utilisateur n’inclut ni l’image source originale ni son journal diagnostic par champ. On ne peut donc pas attribuer avec certitude la substitution `411597 → 411587` à une transformation particulière. Le code de l’ancienne version confirme cependant que la résolution cible du crop dépendait d’une ancre OCR globale, pas d’un repère graphique vérifié. Il ne permet pas de prouver quelle étape a produit chacune des sept valeurs de cet essai.

## Implémentation

- `locateZones()` renvoie maintenant une estimation du panneau (union des ancres OCR, ou repli proportionnel) et les régions des deux noms, deux scores, deux trophées et bandeau de résultat. Les scores utilisent les boîtes numériques sur la rangée du libellé lorsqu’elles sont détectées, sinon la boîte du libellé elle-même. Les trophées utilisent la rangée de nombres à quatre chiffres détectée entre l’en-tête LoSP et la ligne des scores, avec une estimation explicitement marquée si la rangée manque.
- Les zones utilisent les boîtes OCR reconnues comme ancres, des coordonnées pixels de l’image originale et des replis proportionnels clairement identifiés. Le classificateur de ratio distingue `wide`, `landscape` et `compact`; il ne prétend pas démontrer qu’une disposition verticale réelle a été observée.
- Le moteur garde une lecture globale d’ancrage, puis exécute PSM 7 sur chaque crop champ. Les crops numériques utilisent une whitelist 0–9 et le contraste en niveaux de gris. Les lectures globales et ciblées sont comparées; les contradictions restent des propositions ambiguës.
- Le bandeau découpé est analysé par couleur; ce signal reste une preuve complémentaire et produit un conflit s’il contredit une lecture textuelle.
- Les sept aperçus montrent les pixels réellement utilisés par le traitement ciblé. Chaque champ offre l’agrandissement et la relecture isolée.
- L’overlay tactile suit le repère naturel de l’image, permet le déplacement et le redimensionnement, puis relance uniquement le champ touché. Le brouillon conserve les rectangles corrigés, sans stocker l’image.
- Les champs corrigés manuellement survivent à une nouvelle analyse. Une nouvelle lecture devient une proposition explicite et ne remplace la correction qu’après action de l’utilisateur.
- La page garde le chargement OCR local différé, l’import multi-capture, la validation locale et l’export manuel. Aucun envoi ni publication n’a été ajouté. Les versions des ressources locales de la page sont incrémentées pour éviter un cache statique périmé.

## Familles de capture et limites de mesure

`ground-truth.json` contient les noms de neuf captures et leurs SHA-256, mais les fichiers PNG/JPEG ne sont pas présents dans le checkout ni dans `experiments/war-result-recognition`. Les dimensions naturelles, marges, ratios, annotations de rectangle et relances Safari ne peuvent donc pas être mesurés de nouveau dans cette phase. Les neuf captures restent un corpus de développement contaminé par les campagnes précédentes.

Les tests géométriques ajoutés vérifient des boîtes OCR de synthèse en 1000×500, les rectangles de repli en 1800×800, le maintien dans l’image, la conversion affichage→pixels sources, le déplacement et le redimensionnement avec limites. Ces transformations de test ne sont pas présentées comme de nouvelles captures réelles, et ne valident pas l’exactitude géométrique sur le corpus MSF.

## Résultats disponibles

| Champ | Phase 4 hybride local | Premier essai Safari rapporté | Phase 6 Safari mesuré |
|---|---:|---:|---:|
| Alliance LoSP | 9/9 | 0/1 (`oo`) | non testé |
| Alliance adverse | 6/8 | 0/1 (vide / contradictoire) | non testé |
| Score LoSP | 7/9 | 0/1 (`411587`) | non testé |
| Score adverse | 7/9 | 1/1 (`257149`) | non testé |
| Trophées LoSP | 8/9 | 0/1 (vide) | non testé |
| Trophées adverses | 9/9 | 0/1 (vide) | non testé |
| Victoire/défaite | 9/9 | 1/1 (victoire) | non testé |
| Total vérifiable | 55/62 | 2/7 | non testé |

Le score Safari ci-dessus est le résultat utilisateur de l’ancien prototype pour Kronos contre B.B.A. Il n’est pas une mesure de la version Phase 6. CLI, Node et navigateur ne sont pas agrégés ni comparés comme un même environnement.

## Tests exécutés

- `node --check docs/war-results-vision.js`
- `node --check docs/war-results-vision-engine.js`
- `node experiments/war-result-recognition/test-core.cjs`
- `node experiments/war-result-recognition/tests/war-results-vision-zones.test.cjs`
- `node experiments/war-result-recognition/tests/war-results-vision-data.test.cjs`
- `node experiments/war-result-recognition/tests/war-results-vision-static.test.cjs`
- `node experiments/war-result-recognition/tests/war-results-vision-ios-trigger.test.cjs`
- `node experiments/war-result-recognition/tests/war-results-vision-ios-actions.test.cjs`
- `python3 -m unittest discover -s experiments/war-result-recognition -p 'test_*.py' -v`

Les tests vérifient la géométrie pure, les limites et la conversion des coordonnées, le routage des actions iOS précédentes, la validation locale et l’absence de publication. Ils ne chargent pas Tesseract dans Safari et n’évaluent pas le taux OCR Phase 6.

## Réserves avant usage quotidien

Le traitement réel dans Safari iOS doit être répété avec les captures source, en conservant le diagnostic de `zoneMethod`, des sept `rect`, des `zoneReads`, des temps d’appel et des erreurs. Il faut valider le cadrage et l’OCR sur les neuf captures, puis sur de nouvelles captures non utilisées pour les réglages. Les replis proportionnels restent des propositions de secours, pas une preuve de localisation correcte. L’export reste local et la publication officielle est absente.
