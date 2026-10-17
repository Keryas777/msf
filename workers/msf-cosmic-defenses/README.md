# Publication directe des défenses d'Épreuve cosmique

Le stockage est **GitHub versionné** (`docs/data/cosmic-defenses.json`) et le formulaire est une page statique. Le Worker Cloudflare `msf-cosmic-defenses` relit la saison et les personnages officiels dans le **même commit**, vérifie chaque proposition, puis réalise un commit atomique avec protection contre les écritures concurrentes.

## Activation indispensable (une seule fois)

1. Mettre à jour **l'authentification LoSP** avec `workers/losp-auth/worker.js`. Le source historique contenait un jeton de session en base64, qui n'est pas une authentification suffisante pour publier. La version modifiée fournit des sessions signées HMAC et l'endpoint `/signed-me`. **NE PAS déployer le Worker auth sans avoir vérifié/configuré ses secrets Discord**, pour ne pas interrompre la connexion des joueurs.
2. Sur le Worker Cloudflare `losp-auth`, définir **trois secrets**, non versionnés : `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `SESSION_SIGNING_SECRET` (au moins 32 caractères aléatoires). Par exemple :
   `cd workers/losp-auth && npx wrangler secret put SESSION_SIGNING_SECRET` et idem pour les deux autres.
3. Déployer l'auth Worker **manuellement après vérification des secrets** : `cd workers/losp-auth && npx wrangler deploy`. Un login OAuth Discord **récent** est nécessaire pour signer la session ; les anciens jetons non signés restent utilisables pour naviguer, mais ne permettent pas la publication.
4. Sur `msf-cosmic-defenses`, configurer le secret Cloudflare `GITHUB_TOKEN` : token **fine-grained**, dépôt `Keryas777/msf`, accès **Contents: Read and Write uniquement**. Le token ne doit jamais apparaître dans un fichier public.
5. Déployer `workers/msf-cosmic-defenses` (workflow `deploy-cosmic-defenses.yml` si les secrets Cloudflare GitHub Actions sont configurés, ou `npx wrangler deploy`). La liaison Cloudflare `LOSP_AUTH` vise le service `losp-auth`.
6. Vérifier `GET https://msf-cosmic-defenses.deliriousfan7.workers.dev/health` : `configured:true`. Tester publication/consultation avec un vrai compte Discord et un **nouveau login**, puis contrôler le commit dans `docs/data/cosmic-defenses.json`.

**Attention :** une PR fusionnée ne prouve pas que les deux Workers sont déployés avec les secrets. Si le service est indisponible, le bouton reste bloqué, le brouillon local n'est pas perdu et aucune fausse publication n'est annoncée.

## Autorisations et données

- **Jamais** de token GitHub dans le navigateur.
- Le POST exige un JWT-like **HMAC signé par losp-auth**, contrôlé de nouveau par Discord ; le client n'envoie ni identité ni source fiables. Un simple pseudo saisi ou un ancien jeton base64 est refusé.
- Les cinq IDs officiels doivent être **jouables**, différents, existants dans `msf-characters.json`.
- La saison est obligatoirement identique à `cosmic-config.json` dans le commit lu : aucune écriture dans une saison ancienne.
- Publication limitée à six salles par requête, un jeu par auteur Discord et par salle. Republier une salle ne modifie pas les autres, ni les données d'un autre auteur. Conservation des entrées de sources comme Marvel Church.
- Lecture **en direct** depuis GitHub via `GET /api/cosmic-defenses`. Si le Worker échoue, consultation de secours du JSON de GitHub Pages avec un avertissement explicite.
- Un commit est enregistré uniquement après succès de la mise à jour de HEAD, avec retry en cas de conflit. Le succès est affiché uniquement après réponse 200.
- Limitation applicative initiale : 15 secondes entre deux publications différentes d'un même joueur ; les cas d'abus massifs nécessitent également une règle Cloudflare WAF de rate limiting.

## Compatibilité saisonnière

Les données restent dans `cosmic-defenses.json`, donc le workflow `cosmic-season.yml` les archive avec les contres à chaque changement de saison. Une publication concurrente à un rollover réessaie sur le nouveau HEAD, et une défense de l'ancienne saison est refusée.

## Tests

`node --test workers/msf-cosmic-defenses/test/*.test.mjs`

Les fichiers ne requièrent pas React, Vue, Node serveur ni base de données serveur.
