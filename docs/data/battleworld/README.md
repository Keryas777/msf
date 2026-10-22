# LoSP — Données Battleworld

Chaque boss possède son propre fichier JSON. `index.json` indique le guide actif et propose l'historique.

## Deux formats de guide

- **Guide complet** (Destructeur, et futurs boss avec des zones) : contient `zones`, un tableau de trois zones possédant chacune trois `nodes`, ainsi que `boss`.
- **Guide boss uniquement** (Knull, Sentry, Maestro) : **aucun champ `zones`** ; la page affiche exclusivement la tactique contre le boss, sans barre de navigation des zones.
- Le type d'affichage est déduit des données ; aucun ID de boss n'est codé en dur dans le JavaScript.

## Rotation du boss

1. Pour un nouveau boss avec zones, copier `destroyer.json` vers un nouveau fichier, puis actualiser `id` et `boss.name`.
2. Ajouter `{ "id": "new-boss", "name": "Nom affiché", "file": "new-boss.json" }` dans `index.json`.
3. Modifier `activeGuideId` dans `index.json` pour désigner le nouveau boss.
4. Quand les zones ne sont plus nécessaires pour un guide d'archives, retirer son champ `zones` : la section tactique `boss` reste préservée.

Les anciens guides restent accessibles par le sélecteur de boss sur `battleworld.html`. Cette page n'est pas liée depuis l'accueil.

## Champs à renseigner

- Chaque node : `restrictions`, `enemies`, `mechanics`, `objectives`, `strategy`, `avoid`, `instructions`, `teams`, `sources`.
- `boss` : `name`, `characterId`, `portraitUrl` (facultatif), `mechanics`, `objectives`, `strategy`, `avoid`, `instructions`, `teams`, `sources`.
- `instructions` et `steps` sont des tableaux de phrases dans l'ordre d'exécution.
- Une équipe dans `teams` possède `id` et `title`, puis facultativement `characters` (IDs internes de `msf-characters.json`), `phase`, `requirements`, `steps`, `alternatives`, `notes`, et `sources`.
- `sources` est un tableau d'objets `{ "label": "Source", "url": "https://..." }`.
- `status` vaut `draft` lorsque le contenu est incomplet, `patch` et `lastVerified` (`YYYY-MM-DD`) doivent uniquement être remplis avec des informations confirmées.

Ne pas inventer de stratégie ni de date. Aucun changement des War Counters, du Codex, du service worker ou de l'authentification n'est requis.
