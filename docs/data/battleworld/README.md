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

## Affichage des compositions et panneaux

Tous les panneaux de missions (Standard, Mini-boss, Élite, Bonus) sont **fermés à l'ouverture** de chaque zone ; seules les sections sélectionnées par le joueur sont développées.

Une équipe entièrement déterminée utilise `teams[].characters` avec ses cinq IDs exacts, idéalement recoupés avec `docs/data/teams.json` et `docs/data/msf-characters.json`.

Si une source nomme un groupe (ex. « 4 Fantastic Four (MCU) » ou « 3 Galactic Council ») **sans préciser quels membres ont réellement été joués**, ne pas modifier les membres certains : `characters` conserve uniquement ces IDs explicitement nommés. Le champ facultatif `illustrativeCharacters` contient alors cinq IDs pour représenter **une proposition illustrative**, jamais une composition attestée. Un avertissement est automatiquement affiché au-dessus des portraits et les `notes` conservent l'incertitude.

Cette distinction concerne actuellement Xavier + Exalted X-Men, Fantastic Four (MCU) ×4 + Odin et Galactic Council + Surfer d'argent (Briseur) + Xavier. Les alternatives illustratives pourront être remplacées après confirmation des cinq personnages testés.

**Source éditoriale :** https://www.marvel.church/battleworld-fallen-asgard/ (recommandations communautaires, non confirmation officielle).

**Points en attente :** les quatre missions Bonus des Zones 2 et 3 restent sans stratégie confirmée ; l'éligibilité d'Amazing Avenger dans Bonus Zone 1 « Chaos Team » doit être testée ; la source décrit cinq difficultés tout en appelant plusieurs fois difficulté 4 « maximale ». La restriction Zone 3 Standard 1 est indiquée Tech seule avec l'ancienne rotation Tech + Héros stockée dans `historicalInstructions`. Ne pas effacer ces avertissements sans vérification.

## Conseils de combat unifiés — édition des missions

Depuis cette révision, les **27 missions du Destructeur** possèdent chacune un tableau `combatGuide` de phrases ordonnées pour une lecture mobile sans redondance. Le rendu d'une mission présente uniquement :
- ses `restrictions` s'il y en a ;
- un seul bloc **Conseils de combat** (mécaniques pertinentes, priorités, déroulement, avertissements indispensables) ;
- les compositions recommandées, avec portraits et leurs notes propres ;
- les sources ne sont plus affichées sous chaque mission ni dans les compositions de ces missions ; elles restent dans les JSON et dans les sections globales du boss.

Les anciens champs `enemies`, `mechanics`, `objectives`, `strategy`, `avoid`, `instructions`, `notes`, `warnings` et `historicalInstructions` sont **conservés dans les JSON pour audit et révision**, mais ne s'affichent plus séparément lorsque `combatGuide` est présent. Les futurs guides qui ne disposent pas de `combatGuide` continuent de fonctionner selon le schéma historique.

Les anciennes instructions détaillées de la Zone 3 Standard 1 restent intégralement consultables dans `combatGuide` avec le préfixe **« Ancienne rotation »**, et dans `historicalInstructions` comme archive. Les quatre missions Bonus sans stratégie contiennent une mention de manque d'information explicite, jamais une consigne inventée.

Pour ajouter ou corriger une recommandation, modifier **`combatGuide` en priorité** ; ne pas réintroduire les doublons dans le rendu. Les champs sources seront conservés jusqu'à une éventuelle refonte éditoriale validée.
