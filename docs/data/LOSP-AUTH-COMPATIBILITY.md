# Compatibilité des sessions LoSP : validation avant déploiement

**But :** prouver que la nouvelle version de \`losp-auth\` accepte les anciens jetons de lecture tout en réservant la publication cosmique aux sessions Discord réellement signées, **sans imposer une reconnexion de masse**.

## Ce qui est testé

- Le jeton historique, stocké sous \`localStorage.losp_session\`, reste accepté par \`GET /me\` et ne déclenche pas de redirection OAuth.
- Le cookie historique \`session\` reste accepté si le navigateur ne dispose pas de localStorage.
- L'identité est revalidée côté Discord ; un membre ayant perdu ses rôles est refusé normalement.
- \`GET /signed-me\` refuse les anciens jetons : pour publier il faut une **nouvelle connexion OAuth signée**.
- Les signatures falsifiées ne sont pas acceptées (test existant).
- Le garde d'authentification \`docs/auth-guard.js\` conserve le stockage local si \`/me\` répond 200.

## Test HTTP réel sans toucher à la production

Après fusion de la PR et uniquement sur \`main\`, lancer manuellement **GitHub → Actions → Vérifier anciennes sessions LoSP sans déployer → Run workflow**.

Le workflow envoie via \`wrangler versions upload\` une nouvelle **version non déployée**, contenant exactement le Worker \`workers/losp-auth/worker.js\` du dépôt. Les secrets restent dans Cloudflare. Le job \`preview\` contacte uniquement la Version URL et utilise un **jeton historique synthétique** avec l'identité d'une fixture déjà définie dans le Worker, sans exposer un véritable jeton utilisateur.

Il teste les réponses réelles de \`/me\` avec cookie et bearer, \`/signed-me\` refusé, et accès anonyme refusé. **Aucun \`wrangler deploy\` ni \`wrangler versions deploy\`** n'est appelé ; le trafic utilisateur reste dirigé vers la version actuellement en production.

**Limite :** ce test représente un compte LoSP encore autorisé à l'instant T. Il ne garantit pas la connexion d'utilisateurs dont les rôles auraient changé, dont le stockage a été effacé ou dont la session est déjà invalide. La migration n'invalide pas volontairement les anciennes sessions. Il faudra garder la possibilité de revenir à l'ancienne version jusqu'au contrôle post-déploiement.

## Sécurité

Cette compatibilité conserve temporairement les limites des anciennes sessions base64 non signées. Elles **ne doivent jamais** permettre de publier ou d'effectuer une opération d'écriture. Une migration silencieuse de jetons historiques vers des jetons signés serait dangereuse : elle ferait passer un identifiant non authentifié pour une preuve d'identité.

Ne pas activer la version de prévisualisation en production. Ne pas envoyer de jetons réels dans GitHub Actions ou ChatGPT.
