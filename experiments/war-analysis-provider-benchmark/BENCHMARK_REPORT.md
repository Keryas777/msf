# Rapport du benchmark expérimental des rédacteurs de guerre

> **État : laboratoire préparé, benchmark réel non exécuté.** Aucun résultat n'est simulé ou inventé.

## 1. Architecture du benchmark

Le lanceur local exige `--execute`, valide un rapport calculé/classé de 24 joueurs, construit une seule fois le prompt de production, puis transmet ce prompt et ce rapport inchangés aux trois adaptateurs. La validation locale mesure chaque réponse sans modifier le score déterministe. Le laboratoire n'est relié à aucune route du Worker ou de War Admin.

## 2. Modèles et identifiants

- Groq : `openai/gpt-oss-120b` (confirmé dans la configuration du Worker).
- Cloudflare GLM-4.7-Flash : `@cf/zai-org/glm-4.7-flash`.
- Cloudflare Gemma 4 26B : `@cf/google/gemma-4-26b-a4b-it`.

Ces identifiants sont utilisés par défaut. `CLOUDFLARE_GLM_MODEL` et `CLOUDFLARE_GEMMA_MODEL` restent des surcharges facultatives pour de futurs benchmarks.

## 3. Paramètres

- Température : `0.55` pour les trois moteurs.
- Nombre de joueurs : exactement `24`.
- Groq : même `response_format` JSON Schema strict que la production.
- Workers AI : l'adaptateur existant reste sans `response_format`. La validation métier locale de l'enveloppe `analyses[]` demeure l'autorité finale ; aucune garantie `strict: true` équivalente à Groq n'est revendiquée.

## 4. Prompt et règles transmis

Le prompt est produit au moment de l'exécution par `buildAnalysisPrompt` dans le Worker de référence. Il transmet le rapport complet, les plafonds issus de `getGlobalToneCeiling`, l'interdiction de recalculer/citer le score, la demande de 1 à 3 phrases françaises naturelles et toutes les règles métier actuelles. Aucune adaptation sémantique par fournisseur n'est appliquée.

## 5. Résultats techniques

Non disponibles : zéro appel réel effectué.

## 6. Tableau comparatif

| Fournisseur | Modèle | Appels réels | Résultat |
|---|---|---:|---|
| Groq | `openai/gpt-oss-120b` | 0 | Non exécuté |
| Cloudflare | `@cf/zai-org/glm-4.7-flash` | 0 | Non exécuté |
| Cloudflare | `@cf/google/gemma-4-26b-a4b-it` | 0 | Non exécuté |

## 7. Analyses complètes

Aucune analyse produite, car aucun appel réel n'a été effectué. Le rapport généré par une exécution volontaire conservera les textes reçus et leur statut de validation.

## 8. Anomalies

Aucune anomalie enregistrée : le benchmark réel n'a pas été exécuté.

## 9. Consommation et quota

| Fournisseur | Appels | Consommation |
|---|---:|---|
| Groq | 0 | 0 |
| Cloudflare Workers AI | 0 | 0 |

## 10. Appréciation technique

Le laboratoire et ses tests mockés sont prêts. Une exécution volontaire nécessiterait `GROQ_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` et un rapport calculé/classé de 24 joueurs choisi pour l'essai. Les identifiants Cloudflare ont des valeurs par défaut vérifiées et restent surchargeables. Aucune conclusion sur un changement de production ne peut être tirée avant une exécution réelle contrôlée.
