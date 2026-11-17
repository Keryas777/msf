# War Results Vision — localisation trophées et confusions 5/8

## Résumé

Un essai de localisation expérimentale a remplacé l’ancre horizontale étroite du lecteur par une recherche latérale proportionnelle à l’image, puis a resserré le rectangle autour des quatre composantes couleur détectées par le segmentateur JavaScript existant. La bande verticale provient toujours du localisateur de mise en page; la segmentation ne consulte aucune valeur attendue. L’analyse de la première régression a révélé que le crop généré utilisait seulement 2 pixels de marge autour des composantes. Le localisateur publié calcule 18 % de la hauteur des glyphes (3 pixels sur ce cas), ce qui restaure un peu de contexte raster sans coordonnée dédiée à l’image.

Le recadrage affine améliore Tesseract CLI sur les neuf nouveaux résultats, mais il n’est pas sans régression sur l’ancien corpus. Les seuils du classificateur restent inchangés. Le traitement est publié comme module expérimental non chargé par la page de production; les données visuelles et les résultats détaillés par capture restent privés.

## Mesures de bout en bout — trophées seulement

Les deux variantes ont utilisé les mêmes images et paramètres Tesseract : CLI Linux Tesseract 5.5, PSM 7, liste blanche `0123456789`, niveaux de gris, contraste ×1,7 et agrandissement ×3. Le traitement « affiné » commence par une bande latérale proportionnelle, détecte les composantes sur les pixels couleur originaux, puis recadre leur union avec une marge. Il n’utilise pas de recadrage fourni manuellement.

| Corpus | Variante | Champs exacts | OCR non vide | OCR erroné | Non lus |
|---|---|---:|---:|---:|---:|
| Ancien corpus, 18 trophées | ROI automatique existante | 11/18 | 14/18 | 3 | 4 |
| Ancien corpus, 18 trophées | Bande proportionnelle + composantes, marge 18 % | 12/18 | 15/18 | 3 | 3 |
| Neuf nouveaux résultats distincts, 18 trophées | ROI automatique existante | 9/18 | 15/18 | 6 | 3 |
| Neuf nouveaux résultats distincts, 18 trophées | Bande proportionnelle + composantes, marge 18 % | 15/18 | 18/18 | 3 | 0 |
| Total exploratoire, 36 trophées | ROI automatique existante | 20/36 | 29/36 | 9 | 7 |
| Total exploratoire, 36 trophées | Bande proportionnelle + composantes, marge 18 % | 27/36 | 33/36 | 6 | 3 |

La première version des crops affines, avec 2 pixels de marge, régressait sur une lecture adverse ancienne : Tesseract changeait le premier chiffre 2 en 5. L’ajout uniforme d’un pixel de marge autour des composantes corrige ce cas avec le même traitement sur toutes les images. Sur l’ancien corpus final, trois lectures auparavant non exactes deviennent exactes et deux lectures exactes sont perdues (12/18 contre 11/18). Sur les nouvelles captures, sept lectures gagnent l’exactitude et une régresse (15/18 contre 9/18). Au total, les changements produisent 27/36 champs exacts, six erreurs OCR et trois champs non lus, contre 20/36, neuf erreurs et sept non lus avec la localisation actuelle.

Le groupe de quatre nouveaux résultats initialement réservé à la validation a donné 4/8 champs exacts avec l’ancien recadrage et 8/8 avec le recadrage affiné. Ce groupe a ensuite été consulté lors de la comparaison et du choix des variantes géométriques : il n’est donc plus une validation indépendante. Le résultat 8/8 est exploratoire et ne doit pas être présenté comme une mesure hors corpus.

## Segmentation et classificateur

Sur les 36 zones trophées de l’ancien et du nouveau corpus, le segmentateur JavaScript a proposé quatre composantes glyphes pour 36/36. Le module expérimental publié a ensuite été exécuté lui-même sur les bandes de pixels couleur d’origine conservées localement : il a retourné quatre limites de glyphes pour 36/36 zones. Sur les anciens recadrages, le segmentateur trouvait quatre glyphes dans 35/36 champs et signalait un contact avec le bord dans 7/36; sur les recadrages issus des composantes, il en trouve quatre dans 36/36, sans contact signalé. Ce décompte mesure les composantes retenues, pas la justesse sémantique de chaque glyphe. Les sorties détaillées et les images de diagnostic restent hors du dépôt.

| Évaluation du classificateur JavaScript, seuils gelés (.79 / marge .035) | Champs | Propositions exactes | Acceptées exactes | Acceptées incorrectes | Refusées |
|---|---:|---:|---:|---:|---:|
| Ancien corpus, validation croisée par capture sur zones affinées | 18 | 13 | 3 | 0 | 15 |
| Nouveaux groupes d’entraînement, prédictions hors pli | 10 | 5 | 0 | 0 | 10 |
| Nouveaux groupes réservés, après enrichissement | 8 | 5 | 0 | 0 | 8 |

Sur les huit champs nouveaux réservés, le classificateur obtenait 3/8 propositions exactes sur les anciens recadrages automatiques et 5/8 sur les zones affinées. Les recadrages de référence corrigés donnent également 5/8 propositions exactes. Le localisateur récupère donc la qualité de proposition observée sur les zones de référence, mais n’élimine pas la limite de classification. Les huit lectures restent refusées avec la marge de sécurité existante; aucune lecture incorrecte n’est acceptée.

Ces tableaux ne sont pas des mesures navigateur. Le classificateur JavaScript a été lancé sous Node, et les chiffres exacts du benchmark OCR proviennent de Tesseract CLI sous Linux. Un essai Tesseract.js v5 dans Chromium desktop est décrit plus haut, mais ses résultats par champ n’ont pas été conservés. Aucun appareil mobile n’a été testé.

## Diagnostic des glyphes 5 et confusion 5/8

Les trois glyphes 5 des nouvelles captures réservées ont été gardés hors de l’entraînement et du réglage des seuils. L’inspection postérieure montre qu’un glyphe est proposé correctement comme 5 et deux sont proposés comme 8. Les marges de décision restent sous le seuil de .035; ces propositions ne sont pas acceptées. Le motif est cohérent avec un chevauchement des formes normalisées 5/8, et non avec un échec du nombre de composantes ou un caractère tronqué.

Les seuils n’ont pas été modifiés. Une baisse de marge qui accepterait ces exemples serait une calibration sur le jeu réservé; elle risquerait aussi de transformer les confusions en erreurs fiables. De nouveaux résultats contenant des 5 dans plusieurs styles et dimensions sont nécessaires pour calibrer une séparation plus sûre.

## Essai comparatif dans Tesseract.js v5 (Chromium desktop)

Un essai du comparateur intégré à War Results Vision a ensuite exécuté les deux localisateurs avec le moteur Tesseract.js v5 de la page, sur neuf résultats distincts du corpus récent (18 champs trophées). Le chargement CDN n’a pas démarré dans cet environnement; l’essai a réussi avec des ressources statiques locales de la même version Tesseract.js et du modèle anglais. Le comparateur affichait les deux découpes, le texte OCR, la confiance disponible, la géométrie et les durées par lecture. Les ressources temporaires ont été supprimées après l’essai; les URL CDN normales sont restaurées dans le code.

Les résultats détaillés de cette exécution n’ont pas été enregistrés dans un fichier récupérable, et la session Chromium actuelle ne conserve plus les cartes produites. Il n’est donc pas possible de reconstruire sans nouvel OCR un tableau fiable des 18 champs récents, ni un tableau Tesseract.js des 36 champs (l’ancien corpus n’a pas été exécuté dans ce passage). Aucune exactitude navigateur n’est annoncée. Les seuls nombres d’exactitude ci-dessus sont ceux de Tesseract CLI 5.5 sous Linux. Le test navigateur confirme uniquement que le parcours A/B complet s’exécute dans Chromium desktop sur neuf captures, avec une durée d’environ 8 à 11 secondes par capture observée dans l’interface. Safari iOS et Android Chrome n’ont pas été testés.

| Mesure navigateur Tesseract.js v5 | Résultat récupérable |
|---|---:|
| Captures distinctes traitées dans l’essai Chromium | 9 |
| Champs trophées passés dans les deux variantes | 18 |
| Tableau exact par champ / exactitude | Non persisté, indisponible |
| Ancien corpus passé au moteur navigateur | Non testé |
| Safari iOS / Android Chrome | Non testé |

## Effet de localisation isolé

Le module expérimental `war-results-trophy-locator-experiment.js` :

- recherche dans une bande horizontale relative au côté gauche ou droit de l’image;
- reprend seulement la position verticale du localisateur de mise en page existant;
- ignore l’ancre horizontale qui tronquait les premiers chiffres sur certaines dispositions;
- demande quatre composantes issues des pixels d’origine et refuse un résultat incomplet;
- calcule le rectangle autour de l’union des glyphes avec une marge liée à leur hauteur;
- retourne les coordonnées et l’aperçu pixel du rectangle dans le repère de l’image originale.

Quatre tests synthétiques vérifient le changement de résolution proportionnel, la conversion des limites vers l’image source, les marges et le refus lorsque des composantes manquent. Le module n’est pas appelé par War Results Vision et ne change aucun comportement de production.

## Décision

Conserver ce localisateur comme expérimentation publique et le lecteur comme expérimental. Ne pas intégrer à la page de production ni modifier le seuil du classificateur : le gain Tesseract CLI sur les nouvelles images est mesurable, mais le groupe de validation a influencé le choix géométrique et une régression existe sur l’ancien corpus. L’essai Chromium confirme le parcours navigateur, mais ne fournit plus de données exactes persistées; il ne valide donc pas un gain OCR Tesseract.js. La prochaine mesure exacte doit utiliser un export agrégé conservé et des captures tenues hors des réglages, puis être répétée sur Safari iOS si un appareil est disponible. Les noms, scores et résultat de guerre n’ont pas été réévalués par ce test limité aux trophées.

## Confidentialité du corpus

Le dépôt ne contient aucune capture réelle, découpe, planche, modèle de glyphes, vérité terrain, coordonnées par capture, identifiant de capture ou provenance individuelle. Le présent rapport contient uniquement des statistiques agrégées et des limites méthodologiques.
