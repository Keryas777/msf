# MSF War Counter Vision Worker

Worker Cloudflare dédié au laboratoire visuel **MSF War Counter Vision**. Il ne partage aucun code avec le système de débrief de guerre.

## Route

`POST /api/war-counter-vision/analyze`

Le Worker valide le multipart, le layout, la stratégie et le contrat de réponse. Tant que le verrou R2 est actif, aucun appel Groq réel n'est autorisé.

## Configuration Worker

Le fichier `wrangler.jsonc` décrit le Worker déployé :

- nom : `msf-war-counter-vision` ;
- point d'entrée : `worker.js` ;
- modèle prévu : `qwen/qwen3.6-27b` ;
- verrou actuel : `R1_MOCK_ONLY=true`.

Le secret `GROQ_API_KEY` doit rester exclusivement dans Cloudflare. Il ne doit jamais être ajouté au dépôt.

## Déploiement automatique

Le workflow GitHub Actions suivant est dédié à ce Worker :

`.github/workflows/deploy-msf-war-counter-vision.yml`

Il se déclenche :

- automatiquement après un push sur `main` qui modifie `workers/msf-war-counter-vision/**` ;
- manuellement depuis l'onglet **Actions** avec `workflow_dispatch`.

Le dépôt GitHub doit contenir deux secrets Actions :

- `CLOUDFLARE_API_TOKEN` : jeton limité au déploiement des Workers ;
- `CLOUDFLARE_ACCOUNT_ID` : identifiant du compte Cloudflare.

Le secret applicatif `GROQ_API_KEY` reste configuré directement dans le Worker Cloudflare et n'est pas transmis par GitHub Actions.

Le workflow exécute Wrangler depuis `workers/msf-war-counter-vision/`. Les modifications des autres Workers ou de la WebApp ne déclenchent pas ce déploiement.
