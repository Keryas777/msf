# Phase 2 — reconnaissance locale des résultats de guerre

## Résumé mesuré

Le nouveau score compare chaque valeur après extraction **et attribution au bon champ/côté**. La présence d’une chaîne dans une autre ligne OCR ne reçoit aucun crédit. Le moteur double passe testé obtient **46/62 champs exacts (74,2 %)** sur le corpus; un seul champ est non évaluable : le nom adverse de la capture 09, dont la vérité reste inconnue. La qualité n’est pas suffisante pour une publication automatique.

L’ancien compte rendu annonçait 48/54 à partir d’une métrique de présence textuelle et ne donnait pas une mesure stricte de l’alliance adverse. Ce résultat est conservé comme historique, mais il n’est pas comparable au benchmark strict ci-dessous.

## Corpus et séparation

- 9 captures réelles : 7 apprentissage (49 champs) et 2 anciennement réservées (13 champs éligibles). Aucun fichier image n’est inclus dans la PR; les SHA-256 dans `ground-truth.json` rendent les essais reproductibles avec les mêmes pièces jointes.
- Le nom adverse de la capture 09 n’a pas de vérité terrain fiable : 63 champs sont présents, 62 sont scorables. La date est inconnue pour chaque image et reste `null`.
- Les captures 08 et 09 ont déjà été examinées dans la phase précédente. Elles ne constituent donc plus une validation indépendante. Le réglage double passe a été retenu après observation de ces sorties; le 12/13 obtenu sur ces deux images contaminées ne démontre pas la généralisation. Il faut de nouvelles captures distinctes.
- Égalité stricte : valeurs numériques exactes; noms insensibles à la casse et aux espaces répétés, compatibles Unicode NFKC, apostrophes droites/courbes assimilées; ponctuation restante conservée.

## Comparatif strict par configuration

| Configuration | Entraînement | Ancienne réserve* | Ensemble éligible |
|---|---:|---:|---:|
| CLI PSM 6 | 29/49 (59.2 %) | 7/13 (53.8 %) | 36/62 (58.1 %) |
| CLI PSM 11 | 32/49 (65.3 %) | 11/13 (84.6 %) | 43/62 (69.4 %) |
| CLI PSM 11 + PSM 6 prudent | 34/49 (69.4 %) | 12/13 (92.3 %) | 46/62 (74.2 %) |

* Réserve contaminée, à ne pas lire comme un résultat de validation indépendante. Le total d’ensemble est 62 car une valeur terrain est inconnue.

La combinaison prudente exploite PSM 11 comme passe principale et PSM 6 comme secours. En cas de désaccord numérique, elle laisse le champ vide sauf si la confiance d’une lecture dépasse l’autre d’au moins 18 points. Les champs non résolus restent modifiables et le brouillon exige une validation manuelle.

## Exactitude finale par champ

| Champ | Exact | Lecture en échec | Attribution en échec | Validation/incertitude |
|---|---:|---:|---:|---:|
| localAlliance | 9/9 | 0 | 0 | 0 |
| opponentAlliance | 6/8 | 0 | 0 | 2 |
| localScore | 7/9 | 2 | 0 | 0 |
| opponentScore | 7/9 | 0 | 0 | 2 |
| localTrophies | 5/9 | 0 | 4 | 0 |
| opponentTrophies | 3/9 | 3 | 2 | 1 |
| result | 9/9 | 0 | 0 | 0 |

Les nombres d’échec classent les cas non exacts dans la sortie double passe : `read_failure` signifie aucune lecture utilisable, `attribution_failure` signifie que la valeur apparaît dans l’OCR mais pas dans son bon champ, et `validation_failure` couvre les lectures non exactes, ambiguës ou incohérentes. Ces catégories sont diagnostiques et peuvent se chevaucher conceptuellement; chaque champ non exact est compté dans une seule catégorie.

### Comparatif initial / actuel

| Mesure | Ancien rapport | Phase 2 stricte |
|---|---:|---:|
| Score global | 48/54 (présence textuelle) | 46/62 (valeur et attribution exactes) |
| Alliance adverse | exclue du total strict annoncé | 6/8 exactes, 2 à corriger |
| Résultat guerre | 9/9 indicé par le bandeau | 9/9 indicé par le bandeau |
| Scores LoSP / adversaire | 7/9 / 9/9 en présence | 7/9 / 7/9 en attribution exacte |
| Trophées LoSP / adverses | 9/9 / 5/9 en présence | 5/9 / 3/9 en attribution exacte |

Les résultats précédents de scores/trophées comptaient des valeurs trouvées ailleurs dans le texte ou dans des lignes OCR voisines. La baisse apparente reflète surtout la correction de la mesure, pas une régression du moteur.

## Table par capture — vérité terrain → extraction

Une coche indique une égalité stricte. `⚠` impose une vérification/correction avant export. `non établi` signifie que la vérité terrain n’a pas été inventée. Les nombres après `c=` sont les confiances Tesseract CLI disponibles; le résultat couleur n’a pas de confiance Tesseract.

| Capture / split | Alliance LoSP | Alliance adverse | Score LoSP | Score adverse | Trophées LoSP | Trophées adverses | Résultat |
|---|---|---|---|---|---|---|---|
| capture-01 / train | Kronos → Kronos c=96 ✓ | B.B.A. → B.B.A c=52 ⚠ | 411597 → 411597 c=95 ✓ | 257149 → 257149 c=83 ✓ | 2778 → 2778 c=45 ✓ | 2627 → — ⚠ | win → win ✓ |
| capture-02 / train | Athena → Athena c=95 ✓ | Allspark X-Men → Allspark X-Men c=87 ✓ | 343311 → — ⚠ | 314689 → 314689 c=77 ✓ | 2792 → — ⚠ | 2680 → 2680 c=70 ✓ | win → win ✓ |
| capture-03 / train | Dionysos → Dionysos c=23 ✓ | German Avenger's → German Avenger's c=77 ✓ | 363432 → — ⚠ | 153303 → — c=70 ⚠ | 2738 → — ⚠ | 2438 → — ⚠ | win → win ✓ |
| capture-04 / train | Kronos → Kronos c=96 ✓ | Infinity X → INFINITY X c=90 ✓ | 319841 → 319841 c=94 ✓ | 458874 → 458874 c=95 ✓ | 2783 → — ⚠ | 2926 → — ⚠ | loss → loss ✓ |
| capture-05 / train | Athena → Athena c=95 ✓ | HYPERACTIF → HYPERACTIF c=90 ✓ | 340136 → 340136 c=86 ✓ | 291856 → 291856 c=74 ✓ | 2791 → — ⚠ | 2640 → 2640 c=93 ✓ | win → win ✓ |
| capture-06 / train | Poseidon → Poseidon c=70 ✓ | SpaceEmperors → SpaceEmperors c=90 ✓ | 366816 → 366816 c=69 ✓ | 168062 → 168062 c=93 ✓ | 2414 → 2414 c=32 ✓ | 2264 → 2268 c=36 ⚠ | win → win ✓ |
| capture-07 / train | Dionysos → Dionysos c=95 ✓ | STAN LEE'S MISFITS → ST@NLEE’S MISFITS c=76 ⚠ | 297706 → 297706 c=95 ✓ | 439960 → — c=79 ⚠ | 2663 → 2663 c=91 ✓ | 2814 → — ⚠ | loss → loss ✓ |
| capture-08 / holdout | Kronos → Kronos c=95 ✓ | Blurred Vision → Blurred Vision c=95 ✓ | 371356 → 371356 c=81 ✓ | 284300 → 284300 c=93 ✓ | 2858 → 2858 c=64 ✓ | 2708 → — ⚠ | win → win ✓ |
| capture-09 / holdout | Athena → Athena c=97 ✓ | non établi → — ⚠ | 348354 → 348354 c=75 ✓ | 481264 → 481264 c=88 ✓ | 2715 → 2715 c=42 ✓ | 2864 → 2864 c=80 ✓ | loss → loss ✓ |

Cette table conserve le texte réellement extrait, sans correction vers les valeurs attendues. Pour la capture 09, l’extracteur n’a pas proposé de nom adverse; la vérité terrain reste non établie.

## Itérations et configurations testées

### Segmentation plein écran, attribution stricte

| Mode Tesseract CLI | Alliances LoSP | Alliances adverses | Scores LoSP | Scores adverses | Trophées LoSP | Trophées adverses | Total texte (53) |
|---|---:|---:|---:|---:|---:|---:|---:|
| PSM 3 | 4/9 | 5/8 | 5/9 | 6/9 | 2/9 | 2/9 | 24/53 |
| PSM 6 | 5/9 | 5/8 | 6/9 | 9/9 | 1/9 | 1/9 | 27/53 |
| PSM 7 | 0/9 | 0/8 | 0/9 | 0/9 | 0/9 | 0/9 | 0/53 |
| PSM 11 | 7/9 | 6/8 | 7/9 | 7/9 | 4/9 | 3/9 | 34/53 |
| PSM 13 | 0/9 | 0/8 | 0/9 | 0/9 | 0/9 | 0/9 | 0/53 |

Le bandeau couleur donne 9/9 sur chaque mode quand il est évalué séparément. PSM 11 est conservé comme passe principale; PSM 6 complète les champs manquants et la fusion conservatrice atteint 37/53 champs OCR exacts + 9/9 résultats. PSM 3, 7 plein écran et 13 plein écran ont été rejetés pour les champs textuels.

### Recadrages numériques

| Variante CLI | Score LoSP | Score adverse | Trophées LoSP | Trophées adverses | Décision |
|---|---:|---:|---:|---:|---|
| score-wide-3x | 5/9 | 7/9 | 0/9 | 0/9 | Rejetée : baisse contre les passes plein écran. |
| score-narrow-3x | 4/9 | 3/9 | 0/9 | 0/9 | Rejetée : baisse nette. |
| trophy-narrow-4x | 0/9 | 0/9 | 4/9 | 2/9 | Rejetée : moins de champs exacts que l’extracteur plein écran. |

Les essais ont utilisé des coordonnées proportionnelles, ancrées au libellé `POINTS` ou à `LoSP`, un agrandissement, des niveaux de gris, un autocontraste et PSM 7 avec liste blanche numérique. Ils ont coûté davantage et n’améliorent pas les champs visés; les recadrages de trophées ont notamment produit des erreurs/lectures partielles. Le prototype ne les active donc pas.

La phase 1 a aussi testé PSM 6/11, niveaux de gris 2×, autocontraste, seuillage adaptatif, masquage jaune et plusieurs recadrages. Ces essais étaient jugés par présence textuelle et sont conservés dans `war_ocr_benchmark_results.json` uniquement comme historique non comparable; ils ne servent pas à sélectionner les résultats stricts de Phase 2. Aucun OpenCV.js ni AKAZE n’a été ajouté.

### Configuration retenue

- Deux lectures sur l’image complète : PSM 11 puis PSM 6.
- Les champs scores/trophées sont extraits par coordonnées et lignes OCR; chaque valeur garde son côté et sa source. Les tokens numériques non strictement valides sont ignorés.
- Trophées : ligne repérée proportionnellement depuis le bandeau LoSP, chaque côté traité séparément; la position du total avant son évolution sert de repère spatial. Ce repère dépend de la mise en page actuelle MSF et doit être contrôlé sur d’autres résolutions/variantes.
- Noms : le nom d’origine reste éditable; la clé de rapprochement est une normalisation de recherche non destructive. Elle n’effectue aucune fusion automatique. Noms ambigus ou ponctuation perdue restent à vérifier.
- Résultat : signal rouge/bleu du titre, vérifié par cohérence scores/résultat. Le signal couleur n’est jamais la seule preuve si les scores le contredisent.
- Un seul worker OCR est utilisé et détruit à la fin; image limitée à 1800 px de largeur.

## Mesures Tesseract.js et limites de navigateur

| Exécution | Chargement | Reconnaissance | Total | RSS max mesuré | Statut |
|---|---:|---:|---:|---:|---|
| Tesseract.js 7.0.0 sous Node, 9 images / 18 passes | 328 ms (modèle local) | 652 ms/passe en moyenne | 12.45 s | 209 Mo process Node | mesuré, pas navigateur |
| Tesseract CLI Linux 5.5.0, reconnaissance plein écran | non mesuré | PSM 6 548.2 ms; PSM 11 526.7 ms | 2 passes ≈ 1.07 s/capture OCR seule | non mesuré | distinct de Tesseract.js |

La mesure Tesseract.js utilise le paquet 7.0.0 disponible dans l’environnement de travail, alors que la page est épinglée à Tesseract.js 5.0.0 et charge ses scripts/modèles depuis des CDN statiques. La mesure Node ne prouve donc pas les performances de la page. Le worker charge le modèle localement dans cet essai; le téléchargement initial CDN du prototype n’a pas été chronométré.

- Test réel dans Safari iOS : non exécuté.
- Test réel dans Chrome Android : non exécuté.
- Navigateur Discord : non exécuté.
- Traitement successif en navigateur, gel de l’interface et mémoire du WASM navigateur : non mesurés.
- Le navigateur de travail a refusé l’URL locale avec une politique d’organisation; aucun test appareil mobile n’était disponible. Compatibilité déclarée : non vérifiée.
- La PWA hors ligne n’a pas été validée. Le chargement reste différé; le cache Tesseract actuel peut retenir les ressources après un premier chargement. L’hébergement de Tesseract.js sous `/docs/vendor/` n’a pas été retenu faute de mesure prouvant un bénéfice hors ligne et après prise en compte du poids/maintien des fichiers WASM et du modèle.

## Vérifications et garde-fous

- 4 tests Python passent pour corpus/split/date/couleur/vérité incomplète; tests Node du parseur vérifient l’attribution des deux côtés, les valeurs de trophées séparées de `+75/-75`, les clés de rapprochement et les erreurs de validation.
- `node --check` passe sur les deux modules navigateur; Python compile les scripts du banc.
- Le formulaire marque les lectures incertaines, garde les deux alliances éditables et bloque l’export si champs obligatoires, formats ou résultat sont incohérents. Toute modification après validation décoche la confirmation.
- L’export n’est qu’un JSON brouillon local, exige une confirmation manuelle et n’écrit aucune donnée de guerre dans les archives publiques. War Counter Vision et le débrief n’ont pas été modifiés.

## Limites restantes et prochaine étape

Le moteur n’atteint pas les objectifs 100 %. Les principaux échecs stricts sont les trophées adverses (3/9), le score LoSP (7/9), le score adverse (7/9), les trophées LoSP (5/9) et les noms adverses (6/8 éligibles). Le taux exact global de 74,2 % ne convient pas à un export automatisé. L’interface exige donc l’examen humain avant toute utilisation.

Les captures montrent une seule famille de composition écran large. Il faut un nouveau lot de résultats réels non vus, avec variantes de résolution, recadrage, luminosité et noms stylisés, avant de conclure sur la généralisation. Toute optimisation doit être jugée sur ce lot réservé à l’avance.

## Mesures et décisions de livraison

- Le corpus est réel; aucune ligne ou image fictive n’a été ajoutée aux archives publiques.
- Les sorties stockées dans les JSON de benchmark servent uniquement à l’évaluation du prototype.
- La PR #605 reste brouillon et non fusionnée. Aucune intégration dans l’historique des adversaires n’a été commencée.

## Phase 3 — reconnaissance visuelle spécialisée

### Résultat principal

La phase 3 a produit une amélioration ciblée et reproductible des trophées adverses grâce à un recadrage proportionnel, un contraste local et une lecture numérique PSM 7. Le meilleur benchmark Tesseract CLI strict atteint **52/62 (83,9 %)**, contre 46/62 en phase 2. Six champs supplémentaires sont exacts; aucun des six autres champs n’est remplacé par la nouvelle méthode. Cette mesure est le résultat du moteur CLI natif, pas une mesure de navigateur.

Le meilleur modèle complet transposable au prototype n’obtient pas le même gain global : sous Tesseract.js 7 dans Node, sur les images limitées à 1800 px comme dans la page, le résultat passe de **40/62 à 46/62**. L’augmentation ciblée est nette pour les trophées adverses, de 0/9 à 6/9, mais le résultat total reste égal à la référence stricte phase 2 de 46/62. La page utilise Tesseract.js 5; ce chiffre Node 7 n’est pas une validation de cette version dans Safari ou Chrome.

| Champ | Phase 2, Tesseract CLI | Phase 3, hybride CLI | Phase 3, hybride Tesseract.js 7 Node, largeur max 1800 |
|---|---:|---:|---:|
| Alliance LoSP | 9/9 | 9/9 | 8/9 |
| Alliance adverse | 6/8 | 6/8 | 6/8 |
| Score LoSP | 7/9 | 7/9 | 7/9 |
| Score adverse | 7/9 | 7/9 | 7/9 |
| Trophées LoSP | 5/9 | 5/9 | 3/9 |
| Trophées adverses | 3/9 | **9/9** | **6/9** |
| Victoire/défaite | 9/9 | 9/9 | 9/9 |
| **Total strict** | **46/62 — 74,2 %** | **52/62 — 83,9 %** | **46/62 — 74,2 %** |

Le nom adverse de la capture 09 reste exclu : sa vérité terrain est toujours `null`. Les images 08 et 09 restent des captures déjà consultées; le résultat 13/13 du sous-ensemble anciennement réservé n’est pas indépendant.

### Zones et reconnaissance des nombres

Le parseur partagé expose maintenant `locateZones(words, width, height)`. Il repère les lignes « LoSP » et « POINTS DE GUERRE » dans les boîtes Tesseract, puis retourne les zones des alliances, des deux scores, des deux trophées et du bandeau. Les coordonnées sont calculées en fonction de la taille de l’image. `visualize-zones.py` produit des aperçus annotés localement; les aperçus générés et les captures d’origine ne sont pas inclus dans la PR.

Le recadrage des scores ancré sur le libellé, agrandi 3×, essayé avec niveaux de gris, masque de couleur et seuillage, n’a pas dépassé le plein écran : la meilleure passe PSM 7 en niveaux de gris obtient 4/9 pour chaque score, contre 7/9 dans le benchmark strict phase 2. Elle est rejetée pour ces deux champs. Pour les trophées LoSP, elle obtient 4/9 contre 5/9; elle est aussi rejetée.

Pour les trophées adverses, la variante PSM 7 en niveaux de gris avec contraste et luminosité, agrandie 3×, lit exactement 8/9 totaux en CLI. Le premier groupe numérique doit comporter au moins quatre chiffres; on retient les quatre premiers, le total apparaissant avant le delta sur cette interface. Pour la capture 02, la passe locale ne produit que `561`; elle est donc refusée et l’extraction précédente `2680` est conservée. Avec ce repli déterministe, le champ atteint 9/9 en CLI. Les valeurs en désaccord gardent les deux propositions et déclenchent une alerte; elles ne sont jamais présentées comme confirmées. Les sorties du prototype restent toutes soumises à validation manuelle.

| Variante de recadrage, 36 champs numériques | Scores LoSP | Scores adverses | Trophées LoSP | Trophées adverses | Total |
|---|---:|---:|---:|---:|---:|
| Phase 2 dual-pass, champs attribués | 7/9 | 7/9 | 5/9 | 3/9 | 22/36 |
| PSM 7, brut 3× | 5/9 | 4/9 | 4/9 | 5/9 | 18/36 |
| PSM 7, gris/contraste 3× | 4/9 | 4/9 | 4/9 | **8/9** | 20/36 |
| PSM 7, Otsu 3× | 2/9 | 4/9 | 5/9 | 5/9 | 16/36 |
| PSM 7, masque couleur 3× | 1/9 | 6/9 | 5/9 | 1/9 | 13/36 |
| PSM 8, meilleur des traitements | 1/9 | 3/9 | 4/9 | 1/9 | 9/36 |

Les crops de noms adverses ont été réessayés en resserrant la hauteur à la seule ligne du nom. Sur huit noms vérifiables, la meilleure variante exacte n’obtient que 1/8, contre 6/8 au moteur existant. Les cas `B.B.A.` (ponctuation perdue) et `STAN LEE'S MISFITS` (lettres stylisées) restent non résolus. Aucun nom attendu n’est substitué; aucune correction de vocabulaire par liste d’alliances n’est ajoutée.

L’essai d’un classifieur de glyphes individuels sépare les composantes connexes, conserve uniquement des gabarits de chiffres isolés et utilise une validation laissant chaque capture d’entraînement hors de ses propres prototypes. Il ne mémorise pas des nombres entiers. Ses résultats (scores LoSP 2/9, scores adverses 1/9, trophées LoSP 5/9 et trophées adverses 0/9; 0/2 sur les anciennes captures réservées) ne sont pas meilleurs. La normalisation de formes et les confusions entre les glyphes restent trop sensibles à la résolution, aux ombres et aux traits joints. Cette voie est rejetée comme extracteur automatique.

### Comparaison Tesseract.js et dimensionnement de la page

Une nouvelle vérification a reproduit le redimensionnement de la page : les images de largeur supérieure à 1800 px sont proportionnellement réduites avant les lectures Tesseract.js. Sous Tesseract.js 7 / Node, cette réduction fait passer le double passage plein écran de la mesure native 44/62 à 40/62. Le recadrage seul, sur ces mêmes images redimensionnées, obtient 6/9 trophées adverses. Le repli sur la lecture précédente quand le recadrage ne donne pas quatre chiffres laisse le score complet à 46/62; le trophée adverse passe de 0/9 à 6/9, sans changement des six autres champs.

| Exécution Tesseract.js 7 sous Node | Chargement initial | Reconnaissance | Durée corpus | RSS processus maximum |
|---|---:|---:|---:|---:|
| Double passe plein écran, images natives | 328 ms | 652 ms/passe | 12,45 s | 209 Mo |
| Double passe plein écran, largeur limitée à 1800 px | 306 ms | 537 ms/passe | 10,22 s | 176 Mo |
| Passe seule sur les neuf petits crops, images natives | 296 ms | 28 ms/crop en moyenne | 248 ms | 117 Mo |
| Passe seule sur les neuf petits crops, source limitée à 1800 px | 202 ms | 24 ms/crop en moyenne | 219 ms | 110 Mo |

Les mesures de mémoire des crops concernent un processus qui ne fait que ces neuf petits crops, pas un worker navigateur combinant les passes pleine image et le crop. Les nombres ne sont pas des mesures de Safari. Les lectures Tesseract.js 7 pleine résolution donnent 49/62 après le crop (44/62 avant); les lectures à 1800 px donnent 46/62 (40/62 avant). La page reste épinglée à Tesseract.js 5; aucun appareil iOS, Android ou navigateur Discord n’était accessible pour tester cette intégration.

### Modèle visuel et dépendances alternatives

Le modèle léger de formes, la lecture spécialisée des chiffres et les indices Canvas sont évalués séparément. OpenCV.js, AKAZE et un second moteur OCR n’ont pas été ajoutés. Aucun second moteur OCR local (Ocrad, PaddleOCR, EasyOCR ou runtime ONNX) ni OpenCV n’est installé dans l’environnement, et aucun test navigateur ne permettait d’évaluer leur coût de chargement, mémoire ou compatibilité. Ajouter ces ressources sans résultat comparatif local favorable aurait augmenté le poids et les risques de maintenance sans preuve de bénéfice.

### Fichiers de résultats phase 3

- `phase3-hybrid-benchmark-results.json` : tableau strict par capture et agrégation du meilleur hybride CLI.
- `phase3-localized-tesseract-results.json` : sorties détaillées de chaque crop, PSM et prétraitement.
- `phase3-name-results.json` : résultats de la campagne sur les noms adverses.
- `phase3-visual-digit-results.json` : segmentation, prototypes par glyphes et résultats par champ.
- `phase3-tessjs-hybrid-benchmark-results.json` et `phase3-tessjs-resized-hybrid-benchmark-results.json` : résultats Node 7 à pleine résolution et à 1800 px.
- `tesseractjs-node-resized-raw-results.json` et `tesseractjs-node-resized-results.json` : sorties des deux passes de base sur les images dimensionnées comme la page.

### Conclusion et limites

La voie des crops améliore nettement un champ prioritaire et fournit un garde-fou utile : une lecture plus courte que quatre chiffres n’est jamais retenue. Cependant, le meilleur résultat strict de 52/62 vient de Tesseract CLI plein écran, et le protocole Tesseract.js 7 dimensionné comme la page reste à 46/62. Le crop Tesseract.js donne encore une mauvaise lecture sur la capture 03 (`2436` au lieu de `2438`) et sur la capture 09 redimensionnée (`2084` au lieu de `2864`); ces cas restent signalés comme incertains dans le prototype.

Les noms adverses ne progressent pas, les scores ne progressent pas, et les trophées adverses ne sont pas suffisamment fiables pour une publication automatique. Les neuf images ne démontrent pas la généralisation. Il faut un nouveau lot réel jamais consulté, plus des mesures Tesseract.js 5 dans un navigateur réel, avant de décider de l’activation pour l’usage de guerre. L’export reste manuel et aucun résultat n’est versé aux archives. La PR #605 demeure brouillon et non fusionnée.
