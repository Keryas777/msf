# Extension Chrome — données de capacités MSF

Extension Manifest V3 qui reconstruit en lecture seule la base locale
`/Config/combat_data.db`, puis demande au Worker LoSP de lancer la mise à jour
des données officielles de capacités.

```text
MSF dans Chrome
  → extension
  → Worker Cloudflare
  → GitHub Action
```

Le téléchargement de `combat_data.db` reste disponible comme solution de
secours si l’envoi échoue.

## Installation locale

1. Ouvrir `chrome://extensions` dans Chrome.
2. Activer **Mode développeur**.
3. Cliquer sur **Charger l’extension non empaquetée**.
4. Sélectionner le dossier `tools/msf-capabilities-extension`.
5. Épingler l’extension si nécessaire.

Après une modification locale du dossier, cliquer sur **Actualiser** sur la
fiche de l’extension dans `chrome://extensions`.

## Première mise à jour

1. Ouvrir `https://marvelstrikeforce.com/` et lancer le jeu.
2. Attendre que MSF soit complètement chargé.
3. Ouvrir l’extension.
4. Saisir le mot de passe d’upload Cloudflare.
5. Laisser **Mémoriser sur cet ordinateur** coché si ce profil Chrome est
   personnel.
6. Cliquer sur **Mettre à jour les capacités**.

Une réponse verte signifie que GitHub a accepté la demande et commence ses
propres contrôles. Elle ne garantit pas encore la fin de l’Action.

Lors des utilisations suivantes, le mot de passe est prérempli depuis le
stockage local de l’extension. Le bouton **Oublier** l’efface immédiatement.

## Ce que fait l’extension

- localise le sous-frame `webplayable.m3.scopelypv.com` de l’onglet actif ;
- exécute la lecture dans le monde `MAIN` de ce frame ;
- ouvre la base IndexedDB `/idbfs` sans jamais provoquer de mise à niveau ;
- utilise uniquement des transactions `readonly` sur `FILE_DATA` ;
- assemble les clés finissant par `/Config/combat_data.db/<nombre>` ;
- vérifie que le résultat commence par `SQLite format 3` ;
- interrompt l’opération au-delà de 45 Kio, limite du transport actuel ;
- cherche la version dans `buildUrl`, les scripts et les ressources chargées ;
- affiche la version, le build, le nombre de morceaux et la taille ;
- envoie uniquement `gameVersion`, `gameBuild` et `databaseBase64` au Worker ;
- garde la base en mémoire pour permettre un téléchargement local de secours.

La base observée le 21 juillet 2026 comportait quatre morceaux et faisait
16 384 octets. Ces valeurs servent uniquement de point de comparaison : elles
ne sont pas codées comme des constantes.

## Mot de passe et confidentialité

Le mot de passe d’upload peut être conservé dans `chrome.storage.local` :

- il reste dans le profil Chrome qui contient l’extension ;
- il n’utilise pas la synchronisation Chrome ;
- son accès est restreint aux contextes internes de l’extension lorsque la
  version de Chrome le permet ;
- il n’est jamais écrit dans GitHub ni inclus dans le code ;
- il est envoyé uniquement à l’adresse HTTPS du Worker LoSP, dans l’en-tête
  `x-upload-password` ;
- il disparaît avec les données de l’extension si celle-ci est supprimée.

Ce stockage privilégie l’utilisation en un clic sur un ordinateur personnel.
Sur un ordinateur partagé, décocher la mémorisation ou utiliser **Oublier**.

L’extension ne lit et ne transmet aucun cookie, jeton, identifiant de session
MSF, HAR, NetLog ou autre contenu du stockage Unity. La requête vers le Worker
est fermée aux trois champs documentés ci-dessus et n’envoie aucun identifiant
de compte ou de session MSF.

## Permissions

- `scripting` : exécuter la lecture dans le bon sous-frame ;
- `webNavigation` : identifier ce sous-frame dans l’onglet actif ;
- `storage` : mémoriser localement le mot de passe si l’utilisateur le choisit ;
- `https://webplayable.m3.scopelypv.com/*` : lire la base locale du frame MSF ;
- `https://losp-msf-capabilities.deliriousfan7.workers.dev/*` : appeler le
  Worker LoSP.

L’extension n’a aucune permission `cookies`, `downloads` ou accès à
`msf-api.m3.scopelypv.com`.

## Erreurs courantes

- **Frame du jeu introuvable** : le jeu n’est pas ouvert dans l’onglet actif ou
  son frame n’est pas encore chargé.
- **Base `/idbfs` introuvable** : attendre la fin du chargement de MSF puis
  relancer la mise à jour.
- **`FILE_DATA` introuvable** : le stockage Unity n’est pas encore initialisé ou
  son schéma a changé.
- **Aucun morceau trouvé** : vérifier que le jeu a terminé sa synchronisation.
- **Version non détectée** : l’envoi est interrompu, mais le téléchargement de
  secours reste possible.
- **Mot de passe incorrect** : corriger le champ puis relancer ; aucun fichier
  n’est envoyé à GitHub.
- **Worker injoignable** : vérifier la connexion et l’état de `/health`.

## Tests

Depuis la racine du dépôt :

```bash
node --test tools/msf-capabilities-extension/test/*.test.mjs
```

Les tests utilisent un faux `fetch` : ils n’appellent ni Cloudflare ni GitHub.

La documentation complète du pipeline se trouve dans
`MSF_CAPABILITIES_PIPELINE.md` à la racine du dépôt.
