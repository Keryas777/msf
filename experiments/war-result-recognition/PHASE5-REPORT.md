# Phase 5 — War Results Vision

## Résumé

La nouvelle page autonome `docs/war-results-vision.html` fournit un flux d’import, d’analyse OCR locale, de vérification/correction des fiches et d’export JSON local. Elle reprend la feuille de style partagée de War Counter Vision et ne change ni le menu, ni War Counter Vision, ni les archives, ni les workflows de publication.

## Implémentation

- Plusieurs PNG/JPEG dans une file séquentielle, avec états par image, aperçu, suppression, reprise d’une erreur, progrès et diagnostics.
- Chargement différé Tesseract.js v5 et modèle `eng` statique; deux lectures PSM 6/11 et désaccords conservés.
- Recadrages numériques depuis l’image native, jusqu’à 3×, déclenchés pour les valeurs absentes ou incertaines; lecture ciblée de l’alliance adverse si nécessaire.
- Canvas général plafonné à 10 MP pour limiter la mémoire, tandis que l’image native reste accessible aux recadrages. Worker terminé après le lot.
- Résultat estimé par couleur du bandeau et texte OCR; un conflit est affiché comme deux hypothèses non résolues.
- Sept champs OCR plus date manuelle. Contrôle de saisie des scores (6 chiffres), trophées (4 chiffres), cohérence des scores/résultat et identité distincte des deux alliances.
- Brouillons textes conservés dans `sessionStorage`; aucune image/base64 n’y est enregistrée. Les corrections restent propres à chaque fiche.
- Schéma local `1.0.0`, incluant nom original adverse, clé normalisée distincte, provenance et corrections. `localAllianceId` reste `null` tant qu’aucun registre dynamique vérifié n’est disponible; pas de liste d’alliances codée en dur.
- Une validation manuelle explicite est requise avant l’état validé et le téléchargement. Statut de sortie: `validated-locally-not-published`.

## Mesures et comparaison

| Champ | Phase 3 CLI | Phase 4 meilleur résultat local | Phase 5 Tesseract.js navigateur |
|---|---:|---:|---:|
| Alliance LoSP | 9/9 | 9/9 | non testé |
| Alliance adverse | 6/8 | 6/8 | non testé |
| Score LoSP | 7/9 | 7/9 | non testé |
| Score adverse | 7/9 | 7/9 | non testé |
| Trophées LoSP | 5/9 | 8/9 | non testé |
| Trophées adverses | 9/9 | 9/9 | non testé |
| Victoire/défaite | 9/9 | 9/9 | non testé |
| **Total** | **52/62** | **55/62** | **non testé** |

Le 55/62 demeure une mesure exploratoire Phase 4, pas une mesure de cette page ni une validation indépendante. Les neuf images ont déjà influencé les réglages; le nom adverse de la capture 09 reste inconnu.

Aucune mesure de précision Phase 5 n’est annoncée. Le démarrage de Chromium automatisé a échoué dans le conteneur avant le chargement de la page (socket process singleton refusé). Les appareils iOS Safari, Android Chrome et Discord n’étaient pas accessibles. Aucun temps/mémoire navigateur ne peut donc être rapporté. Le contrôle HTTPS du chemin GitHub Pages a répondu HTTP 503 au moment de l’essai; aucune URL opérationnelle ne peut être fournie. Le compte Cloudflare connecté ne contient aucun projet Pages utilisable comme aperçu isolé. Aucun déploiement temporaire ni nouvelle infrastructure n’a été créé. La page n’a pas été déployée.

## Tests

Exécutés localement :

- `node --check` pour les trois scripts de la page.
- Tests existants `test-core.cjs` : OK.
- Tests Phase 5 du modèle date/schéma/clé/cohérence : OK.
- Tests statiques d’intégration/navigation et absence d’API OCR distante : OK.
- Suite Python OCR existante : 12 tests OK.

Les tests de modèle et statiques ne remplacent pas un test navigateur avec Tesseract.js. Le script de performance intégré à la page permettra de mesurer le vrai navigateur après disponibilité d’une URL HTTPS branch-preview ou Pages.

## Limites et suite nécessaire

1. Tester Tesseract.js depuis une URL HTTPS réellement déployée sur branche dédiée ou un environnement Pages preview, sans publier de données ni toucher `main`.
2. Mesurer chacun des neuf screenshots avec le vrai moteur navigateur, puis rapporter les 62/63 champs de façon strictement attribuée.
3. Vérifier sur iPhone/Android les erreurs de chargement CDN, la mémoire, le clavier date/numerique et les captures multiples.
4. Comparer l’extraction navigateur aux sorties de phase 4; ne pas substituer les chiffres CLI/Node.
5. Choisir un registre dynamique permettant d’associer l’alliance LoSP à un ID uniquement si une convention actuelle vérifiable existe. Aucun raccordement à l’historique n’est inclus.
