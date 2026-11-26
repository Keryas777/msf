# War Results Vision — localisation expérimentale des scores

État au 26 novembre 2026. Cette note décrit un prototype géométrique en brouillon. Il n’a pas été validé sur les cinq captures MSF originales et ne remplace aucun localisateur de production.

## Audit du code de référence

- Base examinée : commit de production `b5e11378d06bbd2bf336c973cbd56f4aa8bedc36`, fusion de la PR #742.
- PR ouvertes examinées : #739 (planificateur), #707 (audit Identité) et #706 (intégration annuaire/Identité). Aucune ne porte sur la localisation des scores.
- La page officielle utilise `WarResultRecognition.locateZones` dans `docs/war-result-recognition-core.js`. Si les libellés de score sont repérés, les zones sont construites autour des boîtes OCR. Sinon, elles viennent du libellé « score » ou de rectangles proportionnels de repli. Ces rectangles sont des estimations; leur largeur et leurs limites ne suivent pas les pixels visibles du nombre.
- `WarResultsNumericLocatorExperiment` (`docs/war-results-numeric-locator-experiment.js`) détecte des composantes colorées, puis impose six composantes au score. Sa couleur jaune, ses plages de hauteur, la segmentation de ligne et ses marges sont partagées avec sa logique trophées. Aucun de ces paramètres n’a été changé.
- `WarResultsDigitReader.segment` (`docs/war-results-digit-reader.js`) reçoit obligatoirement le nombre de glyphes et utilise son masque de couleur existant. Il reste inchangé. Le constructeur #742 (`docs/war-results-numeric-library.js`) extrait les glyphes après la localisation et le choix manuel de la valeur. Sa normalisation 48 × 64, son redressement, IndexedDB, les références et les échanges JSON restent inchangés.

Risques de troncature observés dans le code : l’OCR des libellés peut donner une boîte trop étroite ou un ancrage légèrement déplacé; le repli proportionnel fixe la zone sans examiner les pixels du score; l’ancien localisateur expérimental exige six composantes; enfin, le constructeur de bibliothèque utilise la zone retournée et peut donc conserver une découpe déjà tronquée. L’anomalie Safari rapportée dans la demande est cohérente avec ces risques. Sa valeur OCR n’est pas utilisée comme vérité terrain.

## Stratégie ajoutée

`docs/war-results-score-locator-experiment.js` est un module score-only indépendant. Il reçoit l’image source, le côté et la zone proportionnelle de départ. Il examine les pixels jaunes dans une bande assez large, crée les composantes connexes, regroupe celles qui partagent un alignement et une hauteur plausible, puis construit une découpe depuis les limites réelles du groupe. Il ne connaît pas le nombre attendu de chiffres et ne lit aucun chiffre.

La recherche reste dans la moitié du côté sélectionné et dans le voisinage horizontal/vertical de la zone proportionnelle. Les groupes suivent des hauteurs et lignes de base cohérentes; un grand espace de séparateur de milliers peut rester dans le même groupe. Les candidats concurrents proches sont refusés comme ambigus. Les lettres ou décorations jaunes qui ne ressemblent pas à une ligne numérique produisent un avertissement, pas une lecture imposée.

Si aucun groupe n’est trouvé dans la recherche initiale ou si un composant la touche, le module relance une recherche élargie directement dans l’image source. La découpe finale comprend une marge liée à la hauteur des glyphes. Les avertissements distinguent l’absence de pixels, les dimensions incohérentes, les groupes concurrents, le contact au bord, le faible score géométrique et une reprise qui n’a pas résolu le problème.

Les seuils sont calibrés sur les rapports géométriques et les fixtures synthétiques de cette PR. Ils ne sont pas présentés comme des paramètres validés sur le rendu MSF. La détection jaune utilise une chroma relative, ce qui écarte mieux certains fonds brunâtres que le seuil couleur fixe hérité du localisateur partagé, tout en admettant des contours anticrénelés.

## Intégration et données

Le laboratoire Numérique possède maintenant un comparateur de scores qui affiche la zone actuelle et la zone expérimentale, leur recouvrement sur la capture, leurs découpes natives, les limites des composantes, les candidats, paramètres et avertissements. Il s’exécute sans OCR. Les champs restent indépendants; le raccourci « 2 scores » sélectionne les deux.

Les diagnostics sont sauvegardés après chaque champ dans `sessionStorage`. Le JSON contient l’identifiant local de capture, ses dimensions, le champ, les zones initiale et finale, le nombre de composantes, les rectangles des glyphes estimés, les reprises, paramètres, avertissements, temps et appréciation manuelle. Le JSON n’inclut ni image, ni pixel, ni proposition OCR. Après réimport de l’image, les aperçus sont recréés depuis les rectangles sauvegardés.

Le constructeur de bibliothèque réutilise ce même localisateur via le moteur partagé, sans copier son algorithme. Il affiche par défaut « Localisation actuelle validée »; le choix « Expérimental » est explicite et ne s’applique qu’aux scores. Les trophées continuent d’utiliser leur chemin actuel.

## Validation automatisée

Le jeu de tests cible les nombres de composantes variables, espacements larges de milliers, fonds clairs et sombres, teintes anticrénelées, scores de chaque côté, premier et dernier glyphes hors de la zone initiale, reprises depuis l’image originale, reprise verticale, groupes concurrents, bande sans nombre, composantes de forme textuelle, chiffres inclinés et plusieurs rapports/résolutions d’image. Il vérifie aussi les limites du crop, les diagnostics, l’absence d’appel OCR dans le comparateur et l’option explicite du constructeur.

Les pixels employés dans les tests sont synthétiques. Ils ne représentent pas une capture MSF et ne valident pas les chiffres réels. La segmentation finale des glyphes doit encore être inspectée sur les captures, puis vérifiée par le constructeur avec la valeur confirmée manuellement.

## Protocole Safari iOS après publication autorisée

1. Ouvrir `https://keryas777.github.io/msf/war-results-vision.html` dans Safari iOS et actualiser la page. Si l’ancienne interface est affichée, fermer l’onglet puis rouvrir l’URL pour renouveler les ressources cache versionnées.
2. Toucher « Choisir des captures » et importer les cinq captures originales : Poséidon (2160 × 1620), Dionysos (2266 × 1488), Zeus (2532 × 1170), Athéna (3216 × 1440), Kronos (2153 × 1200). Les images restent dans le navigateur.
3. Dans « Laboratoire expérimental », sélectionner « Numérique ».
4. Dans « Scores et trophées », toucher « 2 scores ». Vérifier que seules « Score LoSP » et « Score adverse » sont cochées. Pour un essai indépendant, cocher uniquement le score souhaité; répéter ensuite pour l’autre côté.
5. Les trois sélecteurs de localisation et de marge trophées n’agissent pas sur ce comparateur. Les réglages score sont fixes et visibles sous « Paramètres fixes de la recherche expérimentale » : extension initiale X ±7,5 % de la largeur et Y ±5,5 % de la hauteur, demi-image du côté sélectionné; luminance ≥ 76; chroma ≥ `max(16, 0,26 × min(R,G))`; aire minimale 3 pixels; écart composantes ≤ 1,65 hauteur; lignes de base ≤ 0,48 hauteur; hauteur de groupe entre 8 % et 95 % de la bande; confiance ≥ 0,52; ambiguïté si l’écart de rang est inférieur à 0,045; marge de crop 12 % de la hauteur (minimum 2 pixels); reprise sur l’image source avec extension X ±12 % et Y ±10 % uniquement en l’absence de groupe ou au contact du bord.
6. Toucher « Comparer les scores sélectionnés ». Ce bouton lance uniquement la géométrie; Tesseract ne démarre pas. Attendre l’état de fin et inspecter chaque carte.
7. Comparer la zone jaune (méthode actuelle), la recherche cyan, le crop vert et les composantes rouges sur l’image. Dans les deux aperçus, vérifier le premier et le dernier chiffre, les bords hauts et bas, les espaces de milliers et les lettres/pictogrammes voisins. Agrandir l’image dans les détails si nécessaire.
8. Pour chaque champ, choisir « Complète, sans contamination notable », « Chiffre coupé ou contamination » ou « Incertaine ». Ne sélectionner la réussite que si la capture source permet de confirmer visuellement la découpe complète.
9. Toucher « Copier les diagnostics JSON » ou « Télécharger les diagnostics JSON ». Contrôler qu’il y a dix entrées au total, que les deux champs sont présents pour chacune des cinq captures et qu’aucune entrée n’a un avertissement non résolu. Ajouter les valeurs réelles confirmées manuellement au bilan séparé; ne pas les déduire de l’OCR.
10. Une fois la localisation validée, tester séparément la segmentation de la bibliothèque. Dans « Bibliothèque numérique MSF », choisir la capture et le score; laisser « Localisation actuelle (référence) » pour le chemin normal ou choisir explicitement « Expérimental » pour examiner ce crop. Toucher « Localiser, lire et extraire les glyphes », saisir la valeur réelle vérifiée, puis examiner l’isolation de chaque glyphe. Ce contrôle de segmentation ne modifie pas le classement localisation et ne constitue pas une lecture OCR de référence.

Pour conclure la validation réelle, compter comme localisés seulement les champs confirmés visuellement complets sans contamination significative; noter séparément la segmentation et toute éventuelle lecture OCR. Le seuil attendu reste 10/10, à confirmer par ces essais réels.
