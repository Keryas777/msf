# Correctif urgent iOS — War Results Vision

## Cause confirmée

Dans `war-results-vision.js`, le clic principal était branché directement sur `analyzePending`. Le navigateur lui transmettait son objet `MouseEvent` comme premier argument; la fonction traitait cet argument comme l’identifiant d’une capture. La sélection des captures en attente comparait alors un identifiant texte à l’objet événement, obtenait une liste vide et retournait sans message. `WarResultsVisionEngine.analyze()` n’était jamais appelé. Ce chemin explique à la fois l’absence de champs et l’absence de progression/erreur; le défaut n’était pas dans Tesseract.

Les quatre actions des cartes avaient aussi `data-action` sans `data-id`. `onAction()` cherchait la capture correspondant à `button.dataset.id` et retournait immédiatement, rendant la relance, la suppression, la validation et le téléchargement inopérants.

## Correctifs

- Le gestionnaire principal utilise maintenant un wrapper sans argument; la fonction d’analyse ignore également tout argument qui n’est pas une chaîne.
- Chaque action de carte transmet l’identifiant de la capture.
- L’analyse affiche immédiatement son démarrage, le décodage, le chargement du script, l’initialisation du Worker, le chargement WASM/modèle, les passes OCR et la progression disponible.
- Les erreurs inattendues et rejets de promesse sont affichés dans la page. Les échecs du Worker/WASM/modèle donnent une erreur contextualisée et l’erreur par capture reste visible sur sa carte.

## Vérifications

- Tests du chemin réel de clic avec un faux DOM : clic principal (MouseEvent fourni), analyse individuelle, suppression, validation et téléchargement ciblé : OK.
- Tests statiques des identifiants et des états de diagnostic : OK.
- `node --check` des scripts et tests existants du noyau OCR : exécutés.
- Requêtes HEAD vers les scripts Tesseract.js 5, le Worker, un noyau WASM et `eng.traineddata.gz` : réponses HTTP 200 et en-têtes CORS `*` observés pour les ressources vérifiées.

Ces vérifications confirment que le défaut de non-démarrage était l’argument événement mal interprété. Elles ne remplacent pas un nouvel essai manuel sur iPhone; le signalement de l’utilisateur confirme que la page publiée est Safari iOS, mais aucun appareil iOS n’est piloté dans cet environnement.
