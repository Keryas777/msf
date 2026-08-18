# Laboratoire de benchmark des analyses de guerre

Ce dossier est strictement hors production. Il n'est importé ni par War Admin ni par le Worker déployé. Le lanceur refuse tout appel sans l'option explicite `--execute` et vérifie avant le premier appel que les cinq paramètres requis sont présents.

## État de la vérification documentaire

Le 18 août 2026, la documentation Cloudflare n'était pas accessible depuis cet environnement : l'accès direct à `developers.cloudflare.com` a échoué avec `Tunnel connection failed: 403 Forbidden` et l'outil de recherche disponible a répondu `401 Unauthorized`. Aucun identifiant Workers AI n'a donc été deviné ni inscrit dans le code.

Avant une exécution réelle, renseigner avec les identifiants **copiés et vérifiés dans le catalogue officiel Workers AI courant** :

- `CLOUDFLARE_GLM_MODEL` pour GLM-4.7-Flash ;
- `CLOUDFLARE_GEMMA_MODEL` pour Gemma-4-26B.

Le modèle Groq de référence, confirmé dans `workers/msf-war-ocr/wrangler.jsonc`, est `openai/gpt-oss-120b`.

## Exécution volontaire uniquement

```bash
GROQ_API_KEY=... \
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_API_TOKEN=... \
CLOUDFLARE_GLM_MODEL='identifiant-officiel-vérifié' \
CLOUDFLARE_GEMMA_MODEL='identifiant-officiel-vérifié' \
node experiments/war-analysis-provider-benchmark/run.mjs --execute rapport-classe.json resultat.md
```

L'entrée doit respecter le contrat actuel `{ alliance, date, report }` et contenir exactement 24 joueurs classés. Les trois appels reçoivent le même prompt construit par le code de production et les mêmes données. Groq réutilise le `json_schema` avec `strict: true`. Pour Workers AI, aucun mécanisme de structured output n'est annoncé ou activé tant que son support exact par ces deux modèles n'a pas pu être confirmé dans la documentation officielle.

Les secrets, l'entrée et le rapport produit ne doivent pas être ajoutés à Git. Le rapport Markdown généré conserve toutes les analyses brutes exploitables, les rejets, durées, usages et headers de quota disponibles.

## Tests sans réseau

La suite dédiée injecte intégralement `fetch` et n'effectue aucun appel fournisseur :

```bash
npm run test:war-analysis-provider-benchmark
```

Elle est volontairement séparée de `npm test` afin de ne pas redéfinir la commande de test standard du dépôt.
