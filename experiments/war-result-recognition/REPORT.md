# Reconnaissance locale des résultats de guerre — phases 2 à 4

## Synthèse

La référence stricte de la phase 3 est 52/62 sur le corpus développé. Une expérimentation hybride supplémentaire atteint **55/62 (88,7 %)** sur les mêmes images en combinant le recadrage Tesseract des trophées adverses et un classificateur de chiffres isolés seulement lorsqu’il s’accorde avec une lecture OCR de zone et que la lecture primaire est absente.

Ce résultat de 55/62 est un résultat de développement exploratoire, postérieur à l’examen des neuf captures. Il n’établit pas la généralisation. Le classificateur spécialisé seul n’est pas assez fiable (8/36 chiffres exacts), et il obtient 0/8 champs numériques exacts sur les deux anciennes captures de réserve. La règle hybride n’est donc **pas intégrée comme moteur de production dans le prototype**. Le prototype conserve la passe Tesseract et le traitement ciblé déjà validé en phase 3; les désaccords numériques sont désormais laissés vides, présentés comme alternatives et soumis à correction manuelle au lieu d’être tranchés par un écart de confiance seul.

## Corpus et protocole

- Neuf captures réelles, sept marquées `train` et deux anciennes captures de réserve déjà vues pendant les phases précédentes. La réserve est contaminée; aucune mesure ci-dessous ne prouve une validation indépendante.
- 63 champs attendus, mais **62 mesurables** : le nom adverse de `capture-09` reste sans vérité terrain vérifiée. Aucune date n’est visible.
- Les décisions du script Phase 4 utilisent uniquement les sorties figées des méthodes. La vérité terrain sert ensuite à calculer les mesures, jamais à sélectionner une proposition.
- Les égalités de noms utilisent les règles Unicode et espaces du benchmark strict; les valeurs numériques doivent correspondre exactement et être attribuées au bon champ.
- Les images ne sont pas incluses dans le dépôt. Elles doivent être fournies localement; le manifeste contient les SHA-256.

## Tableau demandé — phase 3, hybride local et navigateur

Le « hybride local » est une recombinaison expérimentale des sorties Tesseract CLI et d’un classificateur Python/Pillow/NumPy/SciPy; ce n’est pas une mesure du prototype navigateur.

| Champ | Phase 3 CLI | Hybride CLI / local | Hybride navigateur |
|---|---:|---:|---:|
| Alliance LoSP | 9/9 | 9/9 | non testé |
| Alliance adverse | 6/8 | 6/8 | non testé |
| Score LoSP | 7/9 | 7/9 | non testé |
| Score adverse | 7/9 | 7/9 | non testé |
| Trophées LoSP | 5/9 | 8/9 | non testé |
| Trophées adverses | 9/9 | 9/9 | non testé |
| Victoire/défaite | 9/9 | 9/9 | non testé |
| **Total** | **52/62 (83,9 %)** | **55/62 (88,7 %)** | **non testé** |

Répartition du meilleur hybride exploratoire : **42/49 train** et **13/13 réserve contaminée**. La phase 3 était 39/49 et 13/13. Les trois champs gagnés sont tous des trophées LoSP absents en passe principale; les six gains de trophées adverses proviennent de la règle de recadrage spécialisée déjà mesurée en phase 3.

## Comparaison des méthodes

| Configuration | Résultat strict | Conclusion |
|---|---:|---|
| Tesseract CLI, deux passes plein écran prudentes | 46/62 | Référence phase 2 stricte |
| Tesseract CLI avec recadrage numérique adverse | 52/62 | +6, tous sur les trophées adverses; conservé en phase 3 |
| Classificateur visuel isolé, champs numériques | 8/36 | Insuffisant seul; ne pas substituer ses sorties |
| Hybride systématique, arbitrage conservateur | 55/62 | Même exactitude; 36 appels classificateur + 9 recadrages ciblés |
| Hybride adaptatif, seuil de confiance primaire < 50 ou valeur absente/invalide | 55/62 | Même exactitude; 20 appels classificateur + 9 recadrages ciblés |

Les comptes d’appels indiquent les inférences demandées par image dans le banc, pas une mesure de latence. L’algorithme adaptatif évite 16 appels au classificateur sur ces sorties; il ne corrige pas les erreurs déjà présentes dans une lecture primaire non déclenchée.

### Complémentarité mesurée sur les 36 champs numériques

- Tesseract phase 2 : 22/36 exacts.
- Classificateur de chiffres isolés : 8/36 exacts.
- Erreurs partagées entre le Tesseract primaire et le classificateur : 8.
- Le classificateur seul aurait corrigé 6 erreurs primaires, mais aurait aussi introduit 20 erreurs là où le primaire était exact.
- La règle de consensus conservatrice a accepté 3 compléments de trophées LoSP; les propositions incorrectes sur les champs primaires absents n’ont pas franchi le consensus dans ce corpus.
- Le recadrage Tesseract de phase 3 apporte six autres corrections de trophées adverses. Au total, l’hybride a neuf gains contre la phase 2, zéro régression observée, et zéro valeur incorrecte auto-sélectionnée selon la vérité de ce corpus.
- Le banc a détecté 22 conflits en mode systématique et 6 en mode adaptatif; un seul champ primaire incorrect était signalé par un désaccord de méthode. Les autres propositions restent soumises à la vérification manuelle générale. Un bon score de confiance ne constitue pas une preuve d’exactitude.

Les lignes complètes par capture et champ — vérité terrain, valeur primaire, prédiction visuelle, hypothèses OCR de recadrage, choix hybride, désaccords et déclenchement adaptatif — sont dans `phase4-hybrid-benchmark-results.json`.

## Recadrage et localisateur

Le localisateur proportionnel de la phase 3 s’appuie sur les mots d’ancrage « LoSP » et « POINTS DE GUERRE ». Les zones sont prélevées dans l’image d’origine. Pour les trophées adverses, l’agrandissement 3×, niveaux de gris/contraste et Tesseract PSM 7 avec whitelist numérique ont porté le score strict de 3/9 à 9/9. Quand la lecture est trop courte, le système conserve l’ancienne proposition et affiche la divergence, sans conclure que la valeur est validée.

La segmentation de chiffres isolés reste expérimentale. Le protocole exclut la capture courante lors de l’entraînement des prototypes et n’enregistre aucun nombre complet. Il reste sensible aux variations de couleurs, de contours et aux petites erreurs de segmentation; les erreurs du classificateur sur les anciennes captures de réserve empêchent son adoption générale.

## Moteur OCR alternatif

Aucun deuxième moteur de production n’a été installé ni comparé aux captures. La documentation officielle décrit aujourd’hui PaddleOCR.js comme un SDK de reconnaissance dans le navigateur; ses modèles indiqués vont de 6,3 MB (PP-OCRv6 tiny) à 31,2 MB (PP-OCRv6 small), en plus du runtime et des ressources WebAssembly/OpenCV. Le projet annonce Apache-2.0. ONNX Runtime Web documente son backend WASM pour Safari iOS et Chrome Android, mais cette prise en charge théorique ne remplace pas un essai sur appareil.

Sources examinées : [PaddleOCR.js — modèles, licence et ressources](https://paddleocr.dev/javascript), [PaddleOCR.js — déploiement navigateur](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/cross_platform/browser.en.md), [ONNX Runtime Web — navigateurs et exécuteurs](https://onnxruntime.ai/docs/get-started/with-javascript/web.html). PaddleOCR.js ajoute une pile conséquente pour ce prototype et aucune mesure de précision sur les captures MSF n’a été réalisée; il n’est donc pas intégré. Son essai reste une piste si l’on peut obtenir le SDK et les modèles de façon reproductible, sans dépendance distante à l’exécution.

## Performances et tests navigateur

Les données disponibles restent des mesures Linux/Node, sans extrapolation mobile :

- Tesseract.js 7 sous Node, capture entière : démarrage 328 ms, ~652 ms par passe, 12,45 s pour neuf captures, pic RSS ~209 MB.
- Même banc sur images réduites à 1800 px : démarrage 306 ms, ~537 ms par passe, 10,22 s pour neuf captures, pic RSS ~176 MB.
- Tesseract.js 7 Node, recadrages seulement : 28 ms par capture native en moyenne; les temps de la passe complète ne sont pas déduits de ce sous-test.
- Expérience visuelle phase 3 : 5,394 s pour neuf captures sous Linux, incluant les ancres Tesseract CLI; aucune mémoire ni taille de modèle navigateur mesurée.
- Tesseract.js réellement embarqué par le prototype : version 5, performances navigateur non mesurées.

Le test de cette phase a tenté d’ouvrir le prototype local dans Chromium. L’environnement navigateur a refusé les URL locales (`ERR_CONNECTION_REFUSED`) et la page `file://` a été bloquée par la politique de l’organisation. Aucun test navigateur ne peut donc être déclaré réussi. iOS Safari, Android Chrome, Discord, PWA, WebAssembly mobile et mode hors ligne restent **non testés**.

## Arbitrage intégré au prototype

`arbitrateNumeric` applique maintenant une règle déterministe et testée : accord → conserver la lecture commune; primaire absente → proposer la lecture de secours comme incertaine; désaccord → valeur vide, deux alternatives conservées, revue manuelle obligatoire. Un écart de confiance seul ne sélectionne plus une valeur en conflit. Cette modification est indépendante du benchmark expérimental de 55/62 et vise à éviter de présenter une supposition comme résultat confirmé.

Le prototype reste à validation et export manuel; aucune écriture d’archive, publication de guerre, changement à War Counter Vision ou au débrief n’est ajouté.

## Rejouer et vérifier

Pré-requis pour le banc Phase 4 : les artefacts Phase 2/3 ci-dessus et Python 3. La campagne de résultats congelés est reproduite avec :

```sh
python experiments/war-result-recognition/phase4-hybrid-benchmark.py
python -m unittest discover -s experiments/war-result-recognition -p 'test_*.py' -v
node experiments/war-result-recognition/test-core.cjs
node --check docs/war-result-recognition.js
node --check docs/war-result-recognition-core.js
```

La campagne complète Phase 3, requérant les neuf captures locales, est décrite dans `README.md`. Aucun fichier image ou crop dérivé n’est ajouté à la PR.
