# War Results Vision — phase 5

Page autonome : `war-results-vision.html`. Elle réutilise `war-counter-lab.css` (base UI War Counter Vision) et ajoute uniquement les styles des champs de résultat dans `war-results-vision.css`. Aucun lien de navigation, workflow de publication, archive ni écriture distante n’est ajouté.

## Traitement

- `war-result-recognition-core.js` reste la source commune d’extraction, d’arbitrage prudent et de validation OCR.
- `war-results-vision-engine.js` charge Tesseract.js 5 uniquement au lancement, utilise un worker pendant une file séquentielle, puis le termine. Les deux lectures PSM 6/11 sont comparées; les désaccords restent vides avec propositions à examiner.
- L’image source reste disponible pendant la tâche. La lecture générale est bornée à 10 millions de pixels; les zones numériques et l’alliance adverse sont recadrées depuis la source native lorsqu’une lecture est absente ou incertaine.
- Les ressources Tesseract et le modèle anglais sont servis par CDN statiques existants. L’OCR s’exécute localement, mais le premier chargement nécessite une connexion et ne constitue pas un fonctionnement initial hors ligne.
- `war-results-vision.js` gère les fichiers, les fiches isolées, corrections, date manuelle, récapitulatif et export local après confirmation. Les images ne sont jamais placées dans `sessionStorage`; seuls les brouillons textuels/diagnostics le sont.
- `war-results-vision-data.js` valide les huit champs et produit le schéma local versionné. La clé adversaire est un outil de recherche, sans fusion ni rapprochement automatique.

## Diagnostic et mesure

Le panneau diagnostic affiche les temps de chargement du worker, appels OCR et traitement par image depuis `performance.now()`, les dimensions, méthodes, zones d’ancrage, taille du fichier et les propositions. Ce panneau ne contient aucune vérité terrain; les neuf anciennes captures ont déjà servi au réglage. Aucun résultat 55/62 n’est présenté comme une mesure de cette page.

## Limitations de validation

La compatibilité fonctionnelle sur iOS Safari, Android Chrome et navigateur Discord n’a pas été vérifiée sur appareils réels. L’exécution navigateur avec Tesseract.js doit être mesurée depuis une URL HTTPS accessible. Les tests Node du modèle de données ne remplacent pas ce test. La validation locale demeure manuelle et aucune publication officielle n’est possible depuis cette page.
