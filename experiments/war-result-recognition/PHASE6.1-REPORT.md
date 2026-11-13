# Phase 6.1 — correction des zones OCR

## Corpus et protocole

Les neuf originaux ont été réutilisés et leurs SHA-256 vérifiés. Les 63 emplacements sont reportés; 62 ont une vérité terrain, l'alliance adverse de capture-09 restant inconnue. Aucun ground truth n'a servi au localisateur.

Le localisateur `locateZones()` utilise les ancres PSM 11 du plein écran. Le benchmark lit ensuite les mêmes zones avec Tesseract CLI 5.5, PSM 7, mêmes whitelist et prétraitements Phase 6. Seule la géométrie a changé. Les noms LoSP sont comparés au champ vérifié du manifeste (`Kronos`, `Athena`, etc.), sans ajouter artificiellement le préfixe visuel « LoSP » à la vérité terrain. Durée du rejeu CLI complet des neuf captures : 10,78 s sur cet environnement Linux. Ce n'est pas une mesure mobile.

## Causes identifiées et correction

- Le crop LoSP s'étendait jusqu'au milieu de la capture : il prenait le badge/ornement et du texte voisin. Il démarre maintenant au mot LoSP, englobe les mots de nom de la même ligne détectée et s'arrête après le dernier mot détecté.
- Le crop adverse s'étendait jusqu'à 96 % de la largeur : des éléments latéraux et plusieurs lignes entraient dans l'OCR. Il suit désormais les mots de la ligne d'alliance et leurs bornes horizontales; la bande verticale est calée sur la ligne LoSP afin qu'une boîte OCR aberrante et trop haute ne l'étire pas.
- Les trophées adverses étaient estimés depuis le début de l'alliance adverse et la rangée prédite : leur rectangle pouvait inclure le changement de trophées et du bruit. Quand un token de quatre chiffres est détecté entre la rangée des alliances et le libellé des scores, chaque côté utilise son propre token OCR comme ancre de rectangle, avec une marge liée à la hauteur de ligne. En absence d'ancre, l'ancien repli reste en place.
- Les scores n'ont pas été modifiés; leur extraction et repli restent identiques.

## Résultats stricts avant/après

| Champ | Ancienne zone | Nouvelle zone | Gain/régression par capture |
|---|---:|---:|---|
| Alliance LoSP | 0/9 | 3/9 | + captures 01, 02, 05 |
| Alliance adverse | 3/8 | 4/8 | + capture 02 |
| Score LoSP | 6/9 | 6/9 | aucun |
| Score adverse | 5/9 | 5/9 | aucun |
| Trophées LoSP | 5/9 | 6/9 | + capture 07 |
| Trophées adverses | 0/9 | 6/9 | + captures 02, 03, 05, 06, 08, 09 |
| Victoire/défaite | 9/9 | 9/9 | aucun |
| **Total** | **28/62** | **39/62** | **+11, aucune régression exacte** |

Le score LoSP reste 6/9 et l'adverse 5/9. Aucun gain OCR n'est attribué aux rectangles seuls dans ces catégories. Le résultat reste piloté par la couleur et ne change pas. La comparaison 28→39 reproduit le benchmark précédent; le champ LoSP de la vérité terrain a été corrigé pour comparer le nom d'alliance lui-même, sans préfixe `LoSP` ajouté artificiellement.

## Découpes vérifiables

`phase6.1-crops-before-after.jpg` est une planche avant/après par champ et capture, avec la valeur lue. `phase6.1-corrected-zone-benchmark.json` contient les rectangles image-source, ancres, résultats et statuts par champ. Les captures ne sont pas incluses au dépôt.

La relocalisation des trophées adverses explique six gains OCR avec les paramètres inchangés. Le résultat reste exploratoire : le corpus a été utilisé en développement et aucune annotation indépendante des boîtes n'existe. Les textes de noms ne sont pas tous lus correctement, même dans des rectangles visuellement resserrés.

## Vérifications et limites

Passés : `node --check docs/war-result-recognition-core.js`, test géométrique des zones/coordonnées tactiles, test statique d'intégration, test du modèle de données et `git diff --check`. Le routage des corrections manuelles et la préservation de valeur restent couverts par les tests de l'application; le code d'édition tactile n'a pas changé.

Aucun appareil iPhone/Android n'était disponible pour mesurer mémoire ou latence mobile. Les 10,78 s sont le temps de bout en bout du CLI sur 9 images; le moteur navigateur v5, les workers et la mémoire Safari ne sont pas mesurés dans cette phase.

Recommandation : les changements ciblés de géométrie sont démontrés et n'introduisent aucune perte exacte sur le benchmark; l'intégration locale au noyau est justifiée. Le diagnostic des scores n'indique pas encore que leur problème vient de la géométrie. Pas de deslant ni changement de paramètres OCR.
