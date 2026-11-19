# War Results Vision — trois moteurs spécialisés

La page reste statique et traite chaque capture sur l’appareil. La capture décodée est la source commune; les moteurs reçoivent chacun leurs propres zones et leurs propres images de travail.

## Moteur numérique

Le lecteur des scores et trophées, ses prétraitements, les localisateurs, la reprise verticale à 18 % et les cinq variantes du comparateur A/B restent inchangés. Les zones numériques sont toujours découpées depuis la capture et les quatre champs numériques gardent leur whitelist de chiffres.

## Moteur Identité

`war-results-identity-engine.js` lit séparément chaque nom dans un recadrage couleur tiré de la capture originale. Il utilise Tesseract.js 5 déjà chargé par la page, sans whitelist, d’abord en PSM 11 puis en PSM 7 seulement si la première lecture est vide ou sous 35 % de confiance. Les lectures qui se contredisent restent incertaines. Aucun nom d’alliance n’est imposé à partir d’une liste.

Le nom métier reste du texte Unicode. Le diagnostic contient la clé de recherche normalisée, les symboles lus, les incertitudes et les estimations de couleur. Les segments utilisent le format compatible avec `richName` v1 de Renseignements de guerre (`schemaVersion: 1`, `segments: [{ text, color }]`); cette page ne charge pas ce module et n’en dépend pas. L’export garde les champs texte actuels et ajoute `alliancePresentation` seulement lorsque les segments correspondent exactement au texte exporté.

Les couleurs sont estimées par caractère à partir des pixels RGB lumineux autour des boîtes OCR. Le découpage s’appuie sur les boîtes de mots puis répartit approximativement chaque mot en caractères : il ne s’agit pas d’une segmentation typographique exacte. Tesseract utilise toujours son modèle anglais existant; les polices stylisées et les symboles décoratifs ne sont donc pas garantis. La page ne remplace jamais un symbole illisible par un caractère supposé.

## Moteur Résultat

`war-results-result-engine.js` compte les pixels bleus et rouges dans la zone du titre, puis examine ses trois sous-zones seulement si le signal principal est faible. Une décision couleur exige au moins quatre pixels qualifiés, une part dominante d’au moins 68 % et un écart d’au moins 35 points. Bleu signifie victoire; rouge signifie défaite. Une bande voisine peut confirmer le titre. Une contradiction persistante produit un résultat vide et incertain.

Tesseract ne relit le titre qu’en dernier recours, si les couleurs restent ambiguës sans contradiction. Il cherche uniquement un libellé « VICTOIRE », « DÉFAITE », « VICTORY » ou « DEFEAT ». Les diagnostics détaillent la zone, les comptes et ratios, les sous-zones, la décision, la confiance, le rattrapage OCR et la durée.

## Interface, données et validation

Les champs conservés par le formulaire restent des chaînes simples; les corrections manuelles gardent la priorité et masquent l’aperçu coloré automatique du nom corrigé. Les diagnostics spécialisés sont dans le panneau replié. Les recadrages restent en mémoire de page et ne sont pas écrits dans les exports de mesures.

Les tests automatisés utilisent des pixels synthétiques. Ils couvrent les couleurs monochromes et multiples, accents, symboles, ponctuation, ombres, texte incertain, victoire, défaite, bruit, ambiguïté et contradiction. Ils ne mesurent pas l’exactitude sur des captures réelles. Tesseract.js et son modèle anglais continuent d’être servis par les CDN déjà utilisés; un premier chargement hors ligne n’est pas garanti.

Mesures reproductibles de cette version sur données synthétiques : les cinq chaînes de texte fournies au reconstructeur (`Kronos`, `LoSP Dionysos`, `Étoile`, `Nova ⚔`, `St@n-Lee’s`) sont conservées à l’identique; le symbole `⚔` est conservé (1/1); les deux aplats multicolores retrouvent exactement leur couleur source (2/2). Ces résultats vérifient la restitution après OCR, pas l’exactitude de Tesseract sur une capture réelle. Dans Node v24.22.3, sur 420 000 pixels synthétiques (1400 × 300), après 5 échauffements et 31 mesures : la segmentation couleur Identité a une médiane de 58,855 ms et un p90 de 74,637 ms; la classification couleur Résultat, 7,492 ms et 9,688 ms. Ces mesures CPU synthétiques excluent l’OCR et le rendu Canvas et ne prédisent pas les performances sur iPhone. Les diagnostics enregistrent la durée d’analyse de chaque moteur dans le navigateur.

Safari iOS, Chrome Android et le navigateur Discord doivent encore être vérifiés sur appareils réels avec des captures autorisées. Pour valider sur iPhone : ouvrir l’URL HTTPS de la page, sélectionner une capture dont l’usage local est autorisé, lancer l’analyse, vérifier les deux noms et leurs couleurs, vérifier victoire/défaite, puis corriger chaque champ ambigu et confirmer qu’une nouvelle lecture ne remplace pas une correction manuelle.

## Évaluation ciblée du moteur Identité

Sur 28 noms recadrés manuellement dans sept captures, les comparaisons Tesseract ont réutilisé les images originales et les mêmes rectangles. La référence v5 fait 6/28 noms stricts, 8/28 après normalisation et 78,5 % de caractères indicatifs. Forcer PSM 7 fait 8/28 stricts et 84,4 % de caractères, mais reste expérimental et n’est pas activé.

L’arbitrage conserve les lectures contradictoires et choisit la plus forte seulement si sa confiance dépasse l’autre d’au moins 30 points. Le résultat reste incertain pour permettre la correction. Dans le corpus, cela récupère une lecture alternative nettement plus fiable et garde vide le désaccord dont l’écart est plus faible. La proposition devient 7/28 stricte, 9/28 normalisée et 80,4 % de caractères indicatifs.

Les segments couleur fusionnent les nuances adjacentes à moins de 20 unités RGB du premier échantillon du segment. La couleur de sortie est la moyenne par caractère. Cela réduit les segments constatés de 316 à 46; l’exactitude complète des séquences multicolores reste 2/4, car cette consolidation ne peut pas retrouver une couleur ou une boîte OCR manquante. Les prétraitements niveaux de gris, seuillage Otsu et agrandissement 3× restent non sélectionnés : ils gagnent et perdent des noms différents, sans fournir de compromis général validé.

Le rapport détaillé, les résultats par nom et toutes les sorties brutes restent dans le dossier local du benchmark; ils ne sont pas publiés pour protéger les données identifiables. Mesures Node/Linux à chaud, sans initialisation Tesseract et sans mesure Safari iOS. Le corpus est un jeu de développement, pas une validation indépendante.

PaddleOCR.js 0.4.2 a été évalué mais n’a pas été exécuté sur ce corpus. Son SDK navigateur décrit un pipeline détection + reconnaissance, les assets modèles HTTP et un Worker qui requiert une configuration de build adaptée. Le package pèse environ 23,8 MB décompressé avant dépendances; le modèle anglais mobile annoncé est d’environ 7,5 MB. Une comparaison en pipeline complet sur de simples crops ne mesurerait pas la même chose que le seul lecteur de reconnaissance Tesseract. L’intégration nécessiterait un prototype de build isolé et des vérifications Safari/iOS avant toute mesure exploitable.
