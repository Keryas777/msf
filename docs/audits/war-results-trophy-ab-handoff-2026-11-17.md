# Passation — comparateur A/B des zones trophées War Results Vision

Date : 17 novembre 2026  
PR : [#697](https://github.com/Keryas777/msf/pull/697) — brouillon, non fusionnée  
Branche : `feat/war-results-confidence-public`

## État sécurisé

Les modifications disponibles dans le checkout ont été gardées et préparées pour la branche de la PR. Le comparateur est uniquement diagnostique : il lance Tesseract.js v5 sur les mêmes images, ne remplace pas le résultat OCR utilisé par le formulaire, et n’écrit dans aucun historique officiel. Les URL de production des ressources Tesseract sont revenues à leur configuration CDN d’origine. Les ressources statiques temporaires créées pour l’essai navigateur ont été supprimées.

Les captures, crops, glyphes, vérités terrain et tableaux détaillés restent hors du dépôt. Le rapport public ne conserve que des statistiques agrégées et des limites méthodologiques.

## Mesures récupérables

### Tesseract CLI sous Linux

Les 36 champs trophées ont été comparés hors navigateur avec Tesseract CLI 5.5, PSM 7, whitelist numérique, niveaux de gris, contraste ×1,7 et agrandissement ×3. Résultats agrégés :

| Corpus | Localisateur actuel exact | Adaptatif exact | Variation | OCR erroné actuel → adaptatif | Non lus actuel → adaptatif |
|---|---:|---:|---:|---:|---:|
| Ancien, 18 champs | 11/18 | 12/18 | +1 | 3 → 3 | 4 → 3 |
| Neuf nouveaux résultats distincts, 18 champs | 9/18 | 15/18 | +6 | 6 → 3 | 3 → 0 |
| Total exploratoire, 36 champs | 20/36 | 27/36 | +7 | 9 → 6 | 7 → 3 |

Le groupe initialement réservé de nouvelles captures a influencé le choix géométrique; il ne constitue plus une validation indépendante. Le gain CLI ne démontre pas une amélioration générale ni un gain Tesseract.js.

### Tesseract.js v5 dans Chromium desktop

Un essai de bout en bout du comparateur a été exécuté sur neuf résultats distincts du corpus récent, soit 18 champs trophées relus par les deux variantes. Le chargement des ressources CDN échouait dans cet environnement; l’exécution a réussi en servant temporairement les ressources statiques correspondant aux mêmes versions de Tesseract.js v5 et du modèle anglais. L’interface a affiché les deux aperçus, les propositions OCR, les confiances disponibles, la géométrie et les durées. Les durées visibles étaient de l’ordre de 8 à 11 secondes par capture.

Le JSON détaillé n’a pas été persisté et les cartes du benchmark ne sont plus présentes dans la session Chromium. Le tableau exact par champ n’est donc pas récupérable depuis l’état actuel sans relancer l’OCR. L’ancien corpus n’a pas été passé dans ce navigateur. Aucune exactitude Tesseract.js n’est annoncée. Safari iOS et Android Chrome n’ont pas été testés.

## Fichiers préparés dans la PR

- `docs/war-results-trophy-locator-experiment.js` : localisateur trophées expérimental, marge liée à la hauteur des glyphes et traitement d’une bande déjà découpée.
- `docs/war-results-vision-engine.js` : méthode A/B partageant le worker et les paramètres OCR de la page.
- `docs/war-results-vision.html`, `docs/war-results-vision.css`, `docs/war-results-vision.js` : panneau de diagnostic, exécution séquentielle, cartes par variante, états/progression et export JSON explicitement local.
- `experiments/war-result-recognition/tests/war-results-trophy-ab-mode.test.cjs` : contrôle synthétique du câblage du diagnostic.
- `docs/audits/war-results-localizer-e2e-2026-11.md` : mesures CLI, essai navigateur et limites.

Les noms de fichiers d’images peuvent apparaître uniquement dans l’interface et dans le fichier JSON que l’utilisateur choisit de télécharger localement; aucun appel ne les transmet à un service. Ne pas joindre ni committer un tel export.

## Tests

Vérifications exécutées pendant cette reprise : `git diff --check`; `node --check` sur les trois modules JavaScript modifiés; tests du localisateur et du câblage A/B (5/5 réussis). Aucun benchmark OCR lourd n’a été relancé. Les mesures CLI/classificateur antérieures ne sont pas recalculées ici.

## Étapes restantes

1. Relire les changements et confirmer l’absence d’images, de miniatures, de valeurs champ par champ et de données de vérité terrain dans le diff public.
2. Exécuter les tests légers disponibles; ne pas relancer le benchmark OCR lourd.
3. Pousser les seuls fichiers publiables sur la branche actuelle de la PR #697.
4. Vérifier que la PR demeure ouverte, brouillon et non fusionnée.
5. Pour obtenir la comparaison navigateur demandée sur 36 champs, refaire ultérieurement l’essai sur les deux corpus et conserver un export agrégé/anonymisé dans un emplacement privé. Ne publier un rapport par champ qu’après contrôle de confidentialité explicite. Tester Safari iOS avant toute activation en production.

## Décision actuelle

Garder le localisateur adaptatif et le panneau A/B à titre expérimental. Ne pas remplacer le localisateur de production, ne pas modifier les autres champs, ne pas changer les paramètres de reconnaissance et ne pas activer d’écriture vers les archives.
