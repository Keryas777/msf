# Reconnaissance locale des résultats de guerre

Expérience isolée de War Counter Vision (`war-counter-*`) et du débrief de `war-history`. La page GitHub Pages est `docs/war-result-recognition.html`.

## Utiliser le prototype

Ouvrir la page, choisir une capture et lancer la reconnaissance. Le moteur et le modèle anglais sont chargés seulement à ce moment. L’image est traitée dans le navigateur; aucun endpoint OCR n’est appelé. Le premier chargement des fichiers statiques OCR demande une connexion.

Toutes les propositions restent modifiables. Le nom adverse n’est pas deviné. L’export reste un brouillon JSON local après confirmation manuelle; il ne publie rien et n’écrit pas dans les archives. Aucune date n’est déduite.

## Rejouer le banc d’essai natif

Prérequis : Python 3, Pillow et la commande Tesseract avec les données `eng`. Les captures restent locales et ne sont pas copiées dans le dépôt.

```sh
python experiments/war-result-recognition/benchmark.py \
  --images-dir /chemin/vers/les-captures \
  --output /tmp/war_ocr_benchmark_results.json
```

Pour rejouer une seule variante, ajouter `--config hybrid-dual-pass-color-result` ou `--config label-guided-score-roi-psm7` ou `--config hybrid-dual-pass-score-roi-fallback-color-result`. La mesure publiée vérifie la présence exacte d’une valeur dans le texte reconnu; elle ne représente pas la précision du placement dans les champs de formulaire. Voir `REPORT.md`.
