# War Results Vision — localisation trophées et confusions 5/8

## Résumé

Un essai de localisation expérimentale a remplacé l’ancre horizontale étroite du lecteur par une recherche latérale proportionnelle à l’image, puis a resserré le rectangle autour des quatre composantes couleur détectées par le segmentateur JavaScript existant. La bande verticale provient toujours du localisateur de mise en page; la segmentation ne consulte aucune valeur attendue.

Le recadrage affine améliore Tesseract CLI sur les neuf nouveaux résultats, mais il n’est pas sans régression sur l’ancien corpus. Les seuils du classificateur restent inchangés. Le traitement est publié comme module expérimental non chargé par la page de production; les données visuelles et les résultats détaillés par capture restent privés.

## Mesures de bout en bout — trophées seulement

Les deux variantes ont utilisé les mêmes images et paramètres Tesseract : CLI Linux Tesseract 5.5, PSM 7, liste blanche `0123456789`, niveaux de gris, contraste ×1,7 et agrandissement ×3. Le traitement « affiné » commence par une bande latérale proportionnelle, détecte les composantes sur les pixels couleur originaux, puis recadre leur union avec une marge. Il n’utilise pas de recadrage fourni manuellement.

| Corpus | Variante | Champs exacts | OCR non vide | OCR erroné | Non lus |
|---|---|---:|---:|---:|---:|
| Ancien corpus, 18 trophées | ROI automatique existante | 11/18 | 14/18 | 3 | 4 |
| Ancien corpus, 18 trophées | Bande proportionnelle + composantes | 11/18 | 15/18 | 4 | 3 |
| Neuf nouveaux résultats distincts, 18 trophées | ROI automatique existante | 9/18 | 15/18 | 6 | 3 |
| Neuf nouveaux résultats distincts, 18 trophées | Bande proportionnelle + composantes | 14/18 | 17/18 | 3 | 1 |
| Total exploratoire, 36 trophées | ROI automatique existante | 20/36 | 29/36 | 9 | 7 |
| Total exploratoire, 36 trophées | Bande proportionnelle + composantes | 25/36 | 32/36 | 7 | 4 |

Sur le corpus ancien, le total exact reste stable, avec une erreur supplémentaire acceptée et une lecture auparavant absente. Sur les nouveaux résultats, le gain est de cinq champs exacts, avec trois erreurs et deux refus en moins. Une ancienne lecture adverse exacte a régressé avec la nouvelle géométrie; cela interdit de considérer cette variante comme une amélioration universelle.

Le groupe de quatre nouveaux résultats initialement réservé à la validation a donné 4/8 champs exacts avec l’ancien recadrage et 8/8 avec le recadrage affiné. Ce groupe a ensuite été consulté lors de la comparaison et du choix des variantes géométriques : il n’est donc plus une validation indépendante. Le résultat 8/8 est exploratoire et ne doit pas être présenté comme une mesure hors corpus.

## Segmentation et classificateur

Sur les 36 zones trophées de l’ancien et du nouveau corpus, le segmentateur JavaScript a proposé quatre composantes glyphes pour 36/36. Le module expérimental publié a ensuite été exécuté lui-même sur les bandes de pixels couleur d’origine conservées localement : il a retourné quatre limites de glyphes pour 36/36 zones. Ce décompte mesure les composantes retenues, pas la justesse sémantique de chaque glyphe. Les sorties détaillées et les images de diagnostic restent hors du dépôt.

| Évaluation du classificateur JavaScript, seuils gelés (.79 / marge .035) | Champs | Propositions exactes | Acceptées exactes | Acceptées incorrectes | Refusées |
|---|---:|---:|---:|---:|---:|
| Ancien corpus, validation croisée par capture sur zones affinées | 18 | 13 | 3 | 0 | 15 |
| Nouveaux groupes d’entraînement, prédictions hors pli | 10 | 5 | 0 | 0 | 10 |
| Nouveaux groupes réservés, après enrichissement | 8 | 5 | 0 | 0 | 8 |

Sur les huit champs nouveaux réservés, le classificateur obtenait 3/8 propositions exactes sur les anciens recadrages automatiques et 5/8 sur les zones affinées. Les recadrages de référence corrigés donnent également 5/8 propositions exactes. Le localisateur récupère donc la qualité de proposition observée sur les zones de référence, mais n’élimine pas la limite de classification. Les huit lectures restent refusées avec la marge de sécurité existante; aucune lecture incorrecte n’est acceptée.

Ces résultats ne sont pas des mesures Safari ou Tesseract.js. Le classificateur JavaScript a été lancé sous Node, et la comparaison OCR a été faite avec Tesseract CLI sous Linux. Aucun appareil mobile ni navigateur n’a été testé dans cette expérimentation.

## Diagnostic des glyphes 5 et confusion 5/8

Les trois glyphes 5 des nouvelles captures réservées ont été gardés hors de l’entraînement et du réglage des seuils. L’inspection postérieure montre qu’un glyphe est proposé correctement comme 5 et deux sont proposés comme 8. Les marges de décision restent sous le seuil de .035; ces propositions ne sont pas acceptées. Le motif est cohérent avec un chevauchement des formes normalisées 5/8, et non avec un échec du nombre de composantes ou un caractère tronqué.

Les seuils n’ont pas été modifiés. Une baisse de marge qui accepterait ces exemples serait une calibration sur le jeu réservé; elle risquerait aussi de transformer les confusions en erreurs fiables. De nouveaux résultats contenant des 5 dans plusieurs styles et dimensions sont nécessaires pour calibrer une séparation plus sûre.

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

Conserver ce localisateur comme expérimentation publique et le lecteur comme expérimental. Ne pas intégrer à la page de production ni modifier le seuil du classificateur : le gain Tesseract CLI sur les nouvelles images est mesurable, mais le groupe de validation a influencé le choix géométrique et une régression existe sur l’ancien corpus. La prochaine validation doit utiliser des captures supplémentaires tenues hors de tout réglage, puis Tesseract.js dans un vrai navigateur, idéalement Safari iOS. Les noms, scores et résultat de guerre n’ont pas été réévalués par ce test limité aux trophées.

## Confidentialité du corpus

Le dépôt ne contient aucune capture réelle, découpe, planche, modèle de glyphes, vérité terrain, coordonnées par capture, identifiant de capture ou provenance individuelle. Le présent rapport contient uniquement des statistiques agrégées et des limites méthodologiques.
