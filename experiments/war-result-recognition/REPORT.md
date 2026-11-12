# Rapport — reconnaissance locale des résultats de guerre

## Corpus et vérité terrain

Les neuf captures jointes ont été vérifiées visuellement et consignées dans `ground-truth.json`. Les sept premières dans l’ordre des pièces jointes forment l’entraînement; les deux suivantes restent hors entraînement. Les dates sont toutes nulles. Le nom de l’alliance adverse de la capture 09 est volontairement laissé inconnu, car sa lecture est ambiguë.

Le fichier `war_ocr_benchmark_results.json` annoncé dans la demande n’était ni joint ni trouvé dans `Keryas777/msf`. La comparaison part donc d’un nouveau benchmark de référence, rejouable avec les captures locales.

## Résultats mesurés

Le score mesure la présence exacte de la valeur attendue dans le texte OCR : les scores sont cherchés sur une ligne contenant « POINTS », les trophées comme jetons numériques exacts, les alliances après normalisation des espaces et accents. Le résultat du prototype hybride est déterminé par la couleur du bandeau de titre. Cette mesure ne garantit pas encore que le parseur place chaque nombre dans le bon champ; c’est pourquoi l’écran garde chaque valeur modifiable et exige une confirmation humaine.

| Configuration | Entraînement (42 champs) | Échantillons tenus à part (12 champs) | Ensemble (54 champs) | Temps moyen/capture |
|---|---:|---:|---:|---:|
| Tesseract plein écran, PSM 6 + détection couleur du résultat | 28/42 (66,7 %) | 8/12 (66,7 %) | 36/54 (66,7 %) | 0,60 s |
| PSM 6 + PSM 11, recadrage numérique de secours PSM 7, signal couleur du résultat | 36/42 (85,7 %) | 12/12 (100 %) | 48/54 (88,9 %) | 1,70 s |

Le résultat victoire/défaite est reconnu par le signal bleu/rouge sur 9/9 captures, y compris les deux échantillons tenus à part. Dans la configuration finale, les valeurs exactes apparaissent dans le texte OCR sur 9/9 captures pour l’alliance LoSP, 7/9 pour le score LoSP, 9/9 pour le score adverse, 9/9 pour les trophées LoSP et 5/9 pour les trophées adverses. Le nom adverse est exact sur 7/8 cas vérifiables; le cas ambigu reste exclu.

Un recadrage numérique guidé par le libellé « POINTS » avec liste blanche de chiffres (PSM 7 à 2×) a été ajouté au banc de test; il est comparé dans le JSON et non activé par défaut. Les deux passes OCR combinées apportent un gain mesurable sur PSM 6 seul. Le mode PSM 11 améliore la présence des valeurs de trophées et des noms d’alliance; PSM 6 garde une meilleure lecture des lignes de score. Le recadrage PSM 7 est tenté seulement quand la passe PSM 6 ne donne pas une séquence de six chiffres pour un côté. Le seuillage adaptatif et le grossissement en niveaux de gris ont été testés puis rejetés, car ils dégradaient plusieurs champs. 

## Implémentation et limites

`docs/war-result-recognition.html` fournit une page autonome de l’application. Le moteur Tesseract.js 5 et les données `eng` ne sont chargés qu’après le clic. La capture est redimensionnée à 1800 px maximum, l’OCR s’exécute dans un worker local, puis le worker est arrêté pour libérer sa mémoire. Les appels éventuels au CDN servent uniquement à charger le moteur WebAssembly et le modèle OCR : aucune image n’est envoyée à une API de reconnaissance.

Le prototype n’écrit rien dans l’historique. Il n’infère aucune date. Le nom adverse doit être saisi ou corrigé manuellement. Les suggestions OCR restent modifiables, et l’export du brouillon n’est possible qu’après confirmation manuelle.

Les temps indiqués viennent de Tesseract CLI sur l’environnement de travail Linux, pas d’un iPhone, Android ou navigateur Discord. Le chargement initial dépend d’une connexion aux CDN statiques; l’utilisation hors ligne après un premier chargement n’a pas été validée. L’intégration navigateur n’a pas encore fait l’objet d’une mesure de précision sur appareils mobiles. OpenCV.js n’a pas été ajouté : les essais Canvas/Pillow disponibles ne démontrent pas qu’il apporterait un gain.

## Rejouer

Voir `README.md` pour installer les dépendances expérimentales et relancer les sept configurations. Les images restent locales et ne sont pas ajoutées aux archives ni au dépôt.
