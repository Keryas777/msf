# MSF War Counter Write Worker

Worker Cloudflare dédié à l'écriture **confirmée** des résultats War Counter Vision dans l'onglet Google Sheet `WarCounters`.

## Sécurité

Le navigateur n'embarque aucun secret Google.

Chaque écriture exige **deux contrôles** :

1. une session LoSP avec rôle `admin`, revérifiée auprès de `https://losp-auth.deliriousfan7.workers.dev/me` ;
2. une clé d'écriture indépendante stockée uniquement comme secret Cloudflare (`WRITE_ADMIN_SECRET`).

La clé d'écriture est saisie dans le dialogue de confirmation et conservée uniquement dans `sessionStorage`, donc jusqu'à la fermeture de l'onglet. Elle n'est jamais versionnée dans GitHub.

Le Worker relit ensuite le Sheet directement, recalcule le ratio depuis les puissances et recompare les compositions avec les IDs personnages. Le client ne peut donc ni forcer un meilleur ratio ni imposer l'existence/absence d'un matchup.

## Règles d'écriture

- Ratio : `attaque / défense`, arrondi **au centième supérieur**.
- Match existant + nouveau ratio inférieur : seule la colonne Q (`min_ratio_hard`) est modifiée.
- Plusieurs classifications du même matchup avec le même ratio : toutes les colonnes Q correspondantes sont mises à jour ensemble.
- Plusieurs ratios différents pour le même matchup : conflit, aucune écriture.
- Ratio identique ou moins bon : aucune écriture.
- Match absent : ajout d'une ligne A:V avec les métadonnées confirmées dans l'UI et les formules R:U.

## Configuration Google et clé admin

Le Worker utilise un compte de service Google. Il faut une seule fois :

1. créer/choisir un projet Google Cloud ;
2. activer **Google Sheets API** ;
3. créer un compte de service ;
4. générer une clé JSON ;
5. partager le fichier `Compil donnée LoSP` en **Éditeur** avec l'adresse e-mail du compte de service ;
6. ajouter au Worker Cloudflare les secrets :
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `WRITE_ADMIN_SECRET`

`WRITE_ADMIN_SECRET` doit être une valeur aléatoire longue, par exemple générée avec :

```bash
openssl rand -hex 32
```

La valeur `GOOGLE_PRIVATE_KEY` est la propriété `private_key` du JSON Google, avec son bloc `BEGIN PRIVATE KEY` complet. Le Worker accepte aussi une valeur où les retours ligne sont stockés sous forme `\n`.

Exemple depuis `workers/msf-war-counter-write/` :

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_PRIVATE_KEY
npx wrangler secret put WRITE_ADMIN_SECRET
```

## Rafraîchissement du JSON

Optionnel : ajouter le secret Cloudflare `GITHUB_WORKFLOW_TOKEN` avec un token GitHub limité au dépôt `Keryas777/msf` et autorisé à déclencher GitHub Actions.

Après une écriture réussie, le Worker déclenche alors `update-war-counters.yml`. Sans ce secret, le Sheet est bien modifié immédiatement et Vision le voit en direct, mais `war-counters.json` attend son workflow manuel/planifié.

## Routes

- `GET /health` : indique si Google, la clé admin et le dispatch GitHub sont configurés, sans exposer leurs valeurs.
- `POST /api/war-counter-write/apply` : écriture sécurisée.

## Déploiement

Le workflow `.github/workflows/deploy-msf-war-counter-write.yml` teste le Worker sur les PR puis le déploie automatiquement quand son dossier change sur `main`.
