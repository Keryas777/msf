# Vérification Discord LoSP sans toucher au Worker en production

Workflow GitHub Actions : **Tester les secrets Discord LoSP sans déployer**.

Depuis iPhone :
1. Dans Cloudflare, vérifier les noms des trois secrets de production du Worker losp-auth : DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN et SESSION_SIGNING_SECRET.
2. Aller dans GitHub > Keryas777/msf > Actions.
3. Choisir **Tester les secrets Discord LoSP sans déployer**.
4. Appuyer sur **Run workflow**, choisir main, puis **Run workflow**.
5. Ouvrir le run puis le job **test-cloudflare**. La dernière étape indique OK ou ÉCHEC pour chaque secret.

Ce test appelle l'API OAuth Discord avec le flux client_credentials pour vérifier le Client Secret, l'API du bot et la lecture d'un membre du serveur LoSP pour vérifier le token et ses accès, et HMAC-SHA256 pour vérifier la nouvelle clé de signature.

Le workflow crée une **Version URL** via **wrangler versions upload** : elle reprend les secrets Cloudflare de production, mais **ne reçoit aucun trafic utilisateur**, puisqu'elle n'est pas déployée. Le test se termine au bout de 15 minutes ; un jeton aléatoire est nécessaire pour l'appeler. Aucun secret Discord n'est envoyé vers GitHub et aucun token OAuth n'est imprimé.

**Ne jamais utiliser Deploy sur cette version-test depuis le tableau de bord Cloudflare.** Elle ne comporte que les diagnostics, et non les routes habituelles du Worker d'authentification.

Si l'étape de chargement échoue faute de Version URL, aller dans Cloudflare > Workers & Pages > losp-auth > Settings > Domains & Routes et vérifier que **Version URLs** est activé.

Ce diagnostic ne déploie **pas** la nouvelle version de losp-auth et n'active pas automatiquement la publication cosmique ; il vérifie seulement les secrets, en préparation du déploiement contrôlé.

Documentation Cloudflare : https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/
