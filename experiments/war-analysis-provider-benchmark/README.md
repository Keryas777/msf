# Laboratoire de benchmark des analyses de guerre

Ce dossier est strictement hors production. Il n'est importé ni par War Admin ni par le Worker déployé. Le lanceur refuse tout appel sans l'option explicite `--execute` et vérifie avant le premier appel que les trois secrets requis et les identifiants de modèles sont présents.

## Modèles vérifiés

- Groq : `openai/gpt-oss-120b` ;
- Cloudflare GLM-4.7-Flash : `@cf/zai-org/glm-4.7-flash` ;
- Cloudflare Gemma 4 26B : `@cf/google/gemma-4-26b-a4b-it`.

Ces identifiants Cloudflare vérifiés sont les valeurs par défaut du laboratoire. Les variables facultatives `CLOUDFLARE_GLM_MODEL` et `CLOUDFLARE_GEMMA_MODEL` permettent toujours de les surcharger pour de futurs benchmarks.

## Exécution volontaire uniquement

```bash
GROQ_API_KEY=... \
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_WORKERS_AI_TOKEN=... \
node experiments/war-analysis-provider-benchmark/run.mjs --execute rapport-classe.json resultat.md
```

`CLOUDFLARE_WORKERS_AI_TOKEN` doit être un token dédié à Workers AI disposant des permissions nécessaires à l'exécution de modèles Workers AI.

Pour tester d'autres versions, ajouter facultativement `CLOUDFLARE_GLM_MODEL=...` et/ou `CLOUDFLARE_GEMMA_MODEL=...` à cette commande.

L'entrée doit respecter le contrat actuel `{ alliance, date, report }` et contenir exactement 24 joueurs classés. Les trois appels reçoivent le même prompt construit par le code de production et les mêmes données. Groq réutilise le `json_schema` avec `strict: true`. Le laboratoire conserve l'adaptateur Cloudflare existant sans `response_format` : la validation métier locale de l'enveloppe `analyses[]` reste l'autorité finale et aucune garantie `strict: true` équivalente à Groq n'est revendiquée.

Les secrets, l'entrée et le rapport produit ne doivent pas être ajoutés à Git. Le rapport Markdown généré conserve toutes les analyses brutes exploitables, les rejets, durées, usages et headers de quota disponibles.

## Tests sans réseau

La suite dédiée injecte intégralement `fetch` et n'effectue aucun appel fournisseur :

```bash
npm run test:war-analysis-provider-benchmark
```

Elle est volontairement séparée de `npm test` afin de ne pas redéfinir la commande de test standard du dépôt.
