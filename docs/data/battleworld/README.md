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

## Fallen Asgard / Le Destructeur — 27 missions + boss

Le guide actif `destroyer.json` conserve les trois missions Standard dans `zones[].nodes`, sans changer les anciens identifiants de nodes.

Chaque zone peut maintenant ajouter :
- `miniboss` : objet mission unique ;
- `eliteMissions` : tableau de trois missions Élite ;
- `bonusMissions` : tableau de deux missions Bonus ;
- `notes` et `day` : précisions contextuelles et journée concernée.

Ces nouveaux champs sont facultatifs pour les futures rotations : le rendu demeure compatible avec les anciens guides. Les trois anciens boss (Knull, Sentry, Maestro) n'ont **aucune zone**.

Le guide comporte `overview` : introduction, `progression` (clés et déblocages), `tokens`, `eliteDebuffs` (trois rangs × trois niveaux), `rewards`, `warnings`, `sources`. Cette section est accessible depuis l'onglet Boss.

Chaque mission utilise les tableaux d'origine (restrictions, ennemis, mécaniques, objectifs, stratégie, à éviter, instructions, équipes, sources) et peut ajouter `notes`, `warnings` et `historicalInstructions`. Les anciennes rotations restent donc visibles sous leur **statut historique**, sans être confondues avec les instructions actuelles.

Le boss peut comporter `traits`, `baseSpeed`, `enemies` et les mécaniques détaillées ; les équipes restent des objets `teams` avec `title`, `characters`, `notes`, `steps`, `alternatives` et `requirements`. Quand l'article source nomme une équipe complète sans citer tous ses membres, ne pas deviner les IDs des personnages manquants.

**Source éditoriale :** https://www.marvel.church/battleworld-fallen-asgard/ (recommandations communautaires, non confirmation officielle).

**Points en attente :** les quatre missions Bonus des Zones 2 et 3 restent sans stratégie confirmée ; l'éligibilité d'Amazing Avenger dans Bonus Zone 1 « Chaos Team » doit être testée ; la source décrit cinq difficultés tout en appelant plusieurs fois difficulté 4 « maximale ». La restriction Zone 3 Standard 1 est indiquée Tech seule avec l'ancienne rotation Tech + Héros stockée dans `historicalInstructions`. Ne pas effacer ces avertissements sans vérification.
