# Worker Cloudflare — capacités MSF

Worker dédié qui relie l’extension Chrome au workflow GitHub déjà validé. Il
est indépendant du Worker utilisé pour les rosters et les infos.

```text
Extension Chrome
  → POST /update
  → Worker Cloudflare
  → workflow_dispatch update-msf-capabilities.yml
```

Il ne parse pas SQLite, ne télécharge pas les 11 JSON et n’écrit pas lui-même
dans le dépôt. Ces tâches restent effectuées et contrôlées par GitHub Actions.

## Routes

### `GET /health`

Diagnostic public sans secret ni information de configuration :

```json
{
  "ok": true,
  "service": "losp-msf-capabilities",
  "version": "0.1.1"
}
```

### `POST /update`

En-têtes attendus :

```text
Content-Type: application/json
x-upload-password: <mot de passe>
```

Corps strictement limité à trois champs :

```json
{
  "gameVersion": "10_3_0",
  "gameBuild": "1654625",
  "databaseBase64": "<combat_data.db encodé>"
}
```

Une réponse HTTP `202` signifie que GitHub a accepté le déclenchement. Elle ne
signifie pas encore que l’Action a terminé ; l’extension devra le préciser à
l’utilisateur.

Si GitHub refuse le déclenchement, la réponse `502` fournit uniquement son
statut HTTP, son message d’erreur et son identifiant de requête. Le jeton est
supprimé du message avant toute réponse, y compris lorsqu’une erreur réseau le
reprendrait accidentellement.

Le fichier n’a pas de nom pendant cet envoi. `combat_data.db`,
`combat_data (1).db`, `(2)`, etc. ne peuvent donc pas être refusés à cause de
leur nom : seuls les octets et l’en-tête SQLite font foi.

## Validations et sécurité

- route et méthodes limitées à `GET /health`, `OPTIONS /update` et
  `POST /update` ;
- mot de passe comparé après SHA-256, sans comparaison directe précoce ;
- `Content-Type`, taille réelle, version, build et Base64 contrôlés ;
- liste des champs JSON fermée afin d’empêcher l’envoi accidentel d’un cookie,
  d’un identifiant de session ou d’un autre champ ;
- en-tête `SQLite format 3` obligatoire ;
- base limitée à 45 Kio afin de rester sous la limite totale de 65 535
  caractères des entrées `workflow_dispatch` ;
- seul l’hôte `api.github.com` et le workflow connu sont appelés ;
- aucune valeur secrète n’est journalisée ou renvoyée ;
- réponses non mises en cache ;
- CORS sans cookies, compatible avec l’origine variable d’une extension Chrome
  non empaquetée.

La GitHub Action réalise ensuite les validations fortes : intégrité SQLite,
schéma, allowlist exacte des 11 ressources, MD5, JSON et provenance CDN.

## Secrets à créer dans Cloudflare

Les deux variables suivantes doivent être ajoutées avec le type **Secret** :

```text
MSF_CAPABILITIES_UPLOAD_PASSWORD
MSF_GITHUB_TOKEN
```

- `MSF_CAPABILITIES_UPLOAD_PASSWORD` peut contenir le mot de passe que
  l’utilisateur saisira dans l’extension.
- `MSF_GITHUB_TOKEN` doit être un jeton GitHub finement limité au seul dépôt
  `Keryas777/msf`, avec la permission de dépôt **Actions: Read and write**.

Ne jamais placer leurs valeurs dans `wrangler.jsonc`, `.dev.vars`, une capture,
un commit ou une conversation. Le fichier `.gitignore` local exclut les
fichiers de secrets de développement courants.

## Déploiement initial depuis le tableau de bord

1. Créer un nouveau Worker nommé `losp-msf-capabilities`.
2. Copier le contenu de `src/index.js` dans son éditeur en mode module.
3. Déployer le code.
4. Dans **Settings → Variables and Secrets**, ajouter les deux secrets nommés
   ci-dessus, puis déployer cette configuration.
5. Ouvrir `https://<adresse-du-worker>/health` et vérifier la réponse JSON.

L’adresse définitive sera ensuite ajoutée à l’extension dans une PR séparée.
Le Worker de roster/infos existant ne doit pas être modifié.

Le fichier `wrangler.jsonc` permet aussi un futur déploiement par Wrangler ou
depuis GitHub, sans rendre cette automatisation obligatoire pour le premier
test.

## Tests

Depuis la racine du dépôt :

```bash
node --test workers/msf-capabilities/test/*.test.mjs
```

Les tests utilisent un faux appel GitHub : ils ne déclenchent aucune Action et
n’ont besoin d’aucun secret réel.
