# War Results Vision — expérimentation de localisation géométrique

Date : 23 novembre 2026  
Statut : laboratoire uniquement, non fusionné

## Cause vérifiée dans le code

Le laboratoire Numérique appelle `WarResultRecognition.locateZones([], largeur, hauteur)` sans passer OCR global. Sans mots OCR, le moteur renvoie les rectangles proportionnels de repli. Pour les trophées, leurs coordonnées verticales reposent sur des fractions de la hauteur de l'image entière (`.205` à `.29`), puis cette bande est transmise au localisateur adaptatif. Les bandes noires et les cadrages qui changent la hauteur de l'image déplacent donc le point de départ avant la segmentation des glyphes. Le raffineur ne peut corriger la bande que s'il trouve assez de glyphes dans sa recherche locale.

L'analyse normale possède un autre parcours. Elle n'est pas redirigée vers cette expérience.

## Stratégie expérimentale

Le sélecteur du laboratoire compare la géométrie proportionnelle actuelle à un localisateur pixel local. Ce dernier réduit temporairement l'image à 2,5 mégapixels maximum, classe les pixels avec les seuils de couleur déjà utilisés par le lecteur de chiffres, regroupe les composantes connectées en lignes et cherche des suites cohérentes de quatre glyphes couleur trophée ou six glyphes couleur score. Les rectangles sont reconvertis dans les coordonnées de l'image originale. Les deux groupes d'une ligne sont séparés par leur espace visuel; la position verticale de l'image entière ne sert pas de repère.

La stratégie ne déduit pas une valeur OCR et ne dépend d'aucun texte attendu. Elle refuse un champ si elle ne trouve pas une suite suffisamment cohérente. Dans le cas des trophées, le localisateur adaptatif choisi dans le second menu continue ensuite à traiter les glyphes; « Reprise + corrections combinées » est sélectionné comme référence. Les cinq variantes restent disponibles.

## Diagnostics et mesures

Les fiches montrent le rectangle proportionnel initial, les boîtes de glyphes repères, le rectangle pixel localisé, le rectangle final transmis à Tesseract, les découpes correspondantes, la méthode et la raison d'un refus. L'image et les découpes restent dans l'onglet et ne figurent pas dans l'export JSON.

Les tests synthétiques vérifient quatre formats/positions, dont un panneau décentré, les rectangles des quatre champs, la détection indépendante d'un trophée manquant et le refus d'une image sans glyphes. Sur ces fixtures seulement : 16/16 champs sont localisés sur quatre arrangements complets; le cas partiel conserve les trois champs visibles et refuse le quatrième; l'image vide est refusée. Ces chiffres ne décrivent pas les captures de jeu.

Les cinq captures citées dans la demande ne sont pas présentes dans le checkout ni dans les fichiers transmis à cette session. Aucune mesure sur les dix trophées ou les dix scores réels n'est donc disponible. Aucun benchmark OCR réel ni essai sur Safari iOS n'a été exécuté. La reconnaissance des exemples et leurs durées restent à mesurer séparément une fois les images disponibles.

## Validation Safari iOS à effectuer

Sur le lien de prévisualisation du commit, dans Safari iOS :

1. Importer les cinq captures depuis Photos/Fichiers.
2. Choisir « Numérique » et lancer d'abord la méthode proportionnelle sur les quatre champs.
3. Réimporter les mêmes fichiers, choisir « Expérimentale — groupes de chiffres dans les pixels » et conserver la variante trophées « Reprise + corrections combinées » à 18 %.
4. Pour chaque champ, inspecter les contours jaune/cyan/vert/rouge et les trois découpes; classer la localisation avant de regarder la valeur OCR.
5. Comparer les dix trophées, puis les dix scores. Consigner exactitude géométrique, champs partiellement coupés, champs manqués, valeurs OCR exactes malgré localisation correcte, valeurs rejetées et durées.
6. Vérifier en particulier IMG_0052, IMG_2178 et la capture Kronos. Garder les images et leurs découpes sur l'appareil; ne pas les joindre au dépôt.

La stratégie restera expérimentale tant que ce contrôle sur les captures réelles n'aura pas établi ses limites et ses résultats.
