# Intégration du moteur Identité — audit préalable

## Composants réutilisés

- `war-results-identity-engine.js` expose déjà `WarResultsIdentityEngine.analyzeRegion(source, rect, recognize, options)`. Il produit le texte brut, le nom normalisé, les segments colorés, les symboles, la confiance, les incertitudes et le temps d’analyse. Les couleurs sont lues depuis l’image source en RGB; les boîtes de mots dépendent des sorties Tesseract.
- `war-results-vision-engine.js` détient le Worker Tesseract.js v5 partagé et son chargement `eng`/WASM/modèle, avec un worker à la fois. L’adaptateur `analyzeIdentityRegion` ajouté délègue à ces deux composants.
- `alliance-directory.js` et son index central fournissent `findByName` et `suggestMatches`. Les suggestions restent consultatives; aucune identité n’est créée ni fusionnée.
- `LoSPAllianceNameCrop` reste disponible et inchangé dans le localisateur pour un appel futur qui voudrait un PNG autonome.

## Limites confirmées par le code

Le moteur fait une première lecture PSM 11 et ne lance PSM 7 que si la lecture manque ou a une confiance faible. Le texte brut normalisé est distinct des segments couleur. La confiance des segments et la couverture couleur peuvent être absentes/faibles; elles ne doivent pas être interprétées comme une exactitude Unicode garantie. Le chargement du bundle Tesseract v5 s’effectue depuis jsDelivr, puis les fichiers WASM et le modèle anglais depuis les origines configurées dans War Results Vision. L’image est transmise au worker local du navigateur, pas à ces serveurs de ressources.

## Corpus et mesure

Les dix captures de classement utilisées en phase A ne sont pas présentes dans cet environnement de travail. Aucun score OCR, comparaison aux noms visibles ni résultat de rapprochement n’est revendiqué ici. Le benchmark de 40 noms reste à exécuter dès que ce corpus sera retransmis. Les images ne sont pas incluses dans le dépôt.
