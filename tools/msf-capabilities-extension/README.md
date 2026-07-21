# Extension Chrome — données de capacités MSF

Prototype Manifest V3 qui reconstruit en lecture seule la base locale
`/Config/combat_data.db` après le chargement du client web de Marvel Strike
Force.

Cette première version ne contacte ni Cloudflare ni GitHub. Elle sert à valider
que l’extension peut remplacer l’extraction manuelle effectuée dans les
DevTools.

## Installation locale

1. Ouvrir `chrome://extensions` dans Chrome.
2. Activer **Mode développeur**.
3. Cliquer sur **Charger l’extension non empaquetée**.
4. Sélectionner le dossier `tools/msf-capabilities-extension`.
5. Épingler l’extension si nécessaire.

## Test attendu

1. Ouvrir `https://marvelstrikeforce.com/` et lancer le jeu.
2. Attendre que MSF soit complètement chargé.
3. Ouvrir l’extension.
4. Cliquer sur **Analyser les données**.
5. Vérifier que le rapport affiche une version, un build, un nombre de morceaux
   et une taille reconstruite.
6. Cliquer sur **Télécharger combat_data.db**.

La base observée le 21 juillet 2026 comportait trois morceaux et faisait
16 384 octets. Ces valeurs servent uniquement de point de comparaison : elles
ne sont pas codées comme des constantes.

## Ce que fait l’extension

- localise le sous-frame `webplayable.m3.scopelypv.com` de l’onglet actif ;
- exécute la lecture dans le monde `MAIN` de ce frame ;
- ouvre la base IndexedDB `/idbfs` sans jamais provoquer de mise à niveau ;
- utilise uniquement des transactions `readonly` sur `FILE_DATA` ;
- assemble les clés finissant par `/Config/combat_data.db/<nombre>` ;
- vérifie que le résultat commence par `SQLite format 3` ;
- cherche la version dans `buildUrl`, les scripts et les ressources chargées ;
- garde la base en mémoire jusqu’au téléchargement local.

## Permissions

- `scripting` : exécuter la fonction de lecture dans le bon sous-frame ;
- `webNavigation` : identifier ce sous-frame parmi ceux de l’onglet actif ;
- accès hôte limité à `https://webplayable.m3.scopelypv.com/*`.

L’extension n’a aucune permission `cookies`, `storage`, `downloads` ou accès à
`msf-api.m3.scopelypv.com`. Elle ne contient aucun secret et ne fait aucun
appel réseau.

## Erreurs courantes

- **Frame du jeu introuvable** : le jeu n’est pas ouvert dans l’onglet actif ou
  son frame n’est pas encore chargé.
- **Base `/idbfs` introuvable** : attendre la fin du chargement de MSF puis
  relancer l’analyse.
- **`FILE_DATA` introuvable** : le stockage Unity n’est pas encore initialisé ou
  son schéma a changé.
- **Aucun morceau trouvé** : vérifier que le jeu a terminé sa synchronisation.
- **En-tête SQLite invalide** : ne pas utiliser le fichier et conserver le
  message affiché pour le diagnostic.

## Étape suivante

Après validation réelle dans Chrome, l’extension pourra envoyer cette petite
base et la version du jeu à un endpoint Cloudflare dédié. Le téléchargement des
11 JSON, leur contrôle MD5 et la création de l’index resteront du côté de la
GitHub Action.

La documentation complète du pipeline se trouve dans
`MSF_CAPABILITIES_PIPELINE.md` à la racine du dépôt.
