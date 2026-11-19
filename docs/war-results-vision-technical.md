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

Safari iOS, Chrome Android et le navigateur Discord doivent encore être vérifiés sur appareils réels avec des captures autorisées. Pour valider sur iPhone : ouvrir l’URL HTTPS de la page, sélectionner une capture dont l’usage local est autorisé, lancer l’analyse, vérifier les deux noms et leurs couleurs, vérifier victoire/défaite, puis corriger chaque champ ambigu et confirmer qu’une nouvelle lecture ne remplace pas une correction manuelle.
