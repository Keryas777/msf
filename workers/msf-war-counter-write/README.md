# MSF War Counter Write Worker

Worker Cloudflare dédié à l'écriture **confirmée** des résultats War Counter Vision dans l'onglet Google Sheet `WarCounters`.

## Sécurité

Le navigateur n'embarque aucun secret Google.

Chaque écriture :

1. exige le token de session LoSP dans `Authorization: Bearer ...` ;
2. vérifie la session auprès de `https://losp-auth.deliriousfan7.workers.dev/me` ;
3. exige `role: "admin"` ;
4. relit le Sheet directement côté Worker ;
5. recalcule le ratio depuis les puissances ;
6. recompare les compositions avec les IDs personnages, ordre ignoré ;
7. n'écrit que si la décision est encore valide au moment du POST.

Le client ne peut donc pas forcer un meilleur ratio en envoyant une valeur de ratio arbitraire.

## Règles d'écriture

- Ratio : `attaque / défense`, arrondi **au centième supérieur**.
- Match existant + nouveau ratio inférieur : seule la colonne Q (`min_ratio_hard`) est modifiée.
- Plusieurs classifications du même matchup avec le même ratio : toutes les colonnes Q correspondantes sont mises à jour ensemble.
- Plusieurs ratios différents pour le même matchup : conflit, aucune écriture.
- Ratio identique ou moins bon : aucune écriture.
- Match absent : ajout d'une ligne A:V avec les métadonnées confirmées dans l'UI et les formules R:U.

## Configuration Google

Le Worker utilise un compte de service Google. Il faut une seule fois :

1. créer/choisir un projet Google Cloud ;
2. activer **Google Sheets API** ;
3. créer un compte de service ;
4. générer une clé JSON ;
5. partager le fichier `Compil donnée LoSP` en **Éditeur** avec l'adresse e-mail du compte de service ;
6. ajouter au Worker Cloudflare les secrets :
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`

La valeur `GOOGLE_PRIVATE_KEY` est la propriété `private_key` du JSON Google, avec son bloc `BEGIN PRIVATE KEY` complet. Le Worker accepte aussi une valeur où les retours ligne sont stockés sous forme `\n`.

Exemple depuis `workers/msf-war-counter-write/` :

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_PRIVATE_KEY
```

## Rafraîchissement du JSON

Optionnel : ajouter le secret Cloudflare `GITHUB_WORKFLOW_TOKEN` avec un token GitHub limité au dépôt `Keryas777/msf` et autorisé à déclencher GitHub Actions.

Après une écriture réussie, le Worker déclenche alors `update-war-counters.yml`. Sans ce secret, le Sheet est bien modifié immédiatement et Vision le voit en direct, mais `war-counters.json` attend son workflow manuel/planifié.

## Routes

- `GET /health` : état de configuration, aucun secret exposé.
- `POST /api/war-counter-write/apply` : écriture sécurisée.

## Déploiement

Le workflow `.github/workflows/deploy-msf-war-counter-write.yml` déploie automatiquement le Worker quand ce dossier change sur `main`.
