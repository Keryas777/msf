# Remise en production de losp-auth — authentification sécurisée

## Contexte

Une version de diagnostic Cloudflare peut avoir remplacé `losp-auth` en production : sa route racine affiche `Not found`. Le Worker complet, disponible sous `workers/losp-auth/worker.js`, doit au contraire retourner exactement `LoSP Auth Worker OK`.

Les secrets `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` et `SESSION_SIGNING_SECRET` ont déjà été validés avec Discord par le workflow GitHub du 17 octobre 2026.

## Déploiement sécurisé

La PR de restauration ajoute `.github/workflows/deploy-losp-auth.yml`. À la fusion dans main, ce workflow :

1. Valide la syntaxe et les tests de compatibilité des sessions actuelles (ancien format non signé et nouveau HMAC).
2. Charge le **véritable Worker** en prévisualisation Cloudflare (0 % trafic de production).
3. Teste sur la version-test les anciennes sessions via bearer et cookie, le refus des connexions anonymes et le refus des anciens jetons pour la publication.
4. **Seulement si tous les tests passent**, déploie le véritable `losp-auth` via Wrangler ; les secrets et variables du tableau de bord sont conservés grâce à `keep_vars: true`.
5. Vérifie les routes publiques de production : racine `LoSP Auth Worker OK`, `/login` redirige vers OAuth Discord, `/me` et `/signed-me` rejettent les visiteurs non connectés.

Le workflow est également lançable manuellement par **Actions → Déployer authentification LoSP sécurisée → Run workflow → main**.

**Ne pas cliquer sur « Save & Deploy » pour une version de diagnostic Cloudflare** : elle ne propose pas `/login`, `/me` ni `/callback`.

## Effet sur les joueurs

- Avec une ancienne session valide : l'application continue de naviguer normalement, pas de reconnexion imposée par le nouveau Worker.
- Si la session a été effacée ou si l'appareil a perdu sa connexion pendant l'incident : un nouvel OAuth Discord peut être nécessaire.
- Pour publier une défense cosmique : un **nouveau login Discord** fournit un jeton signé. Les anciennes sessions non signées ne sont **jamais** transformées automatiquement en sessions autorisées à écrire.

La mise à jour du Worker ne convertit donc **pas immédiatement toutes les sessions en sessions signées**. Les nouveaux logins seront sécurisés.

## Autre prérequis indépendant

La publication directe exige aussi le secret `GITHUB_TOKEN` du Worker `msf-cosmic-defenses`. La remise en service de `losp-auth` n'ajoute pas ce secret.

## Vérification manuelle

- Vérifier l'état du workflow et le job `deploy` vert.
- Ouvrir https://losp-auth.deliriousfan7.workers.dev/ : doit afficher `LoSP Auth Worker OK`.
- Depuis LoSP sur iPhone, vérifier l'accès aux pages habituelles et une connexion Discord de test, puis une proposition cosmique si le Worker de publication est configuré.

En cas d'échec du préflight, **ne pas forcer** le déploiement sans lire les logs. En cas de problème après déploiement, sélectionner une **version complète** antérieure de `losp-auth` dans Cloudflare → Deployments, jamais la version de diagnostic.
