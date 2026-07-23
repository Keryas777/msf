# Carnet de bord — pipeline des capacités MSF

> Source de vérité technique du projet LoSP pour localiser, récupérer, valider et transformer les données officielles qui décrivent les capacités de Marvel Strike Force.

**État au 23 juillet 2026 :** la source déclarative, la collecte locale et la récupération GitHub des 11 fichiers sont validées. Le prototype Chrome a reconstruit avec succès la vraie base de 16 384 octets en quatre morceaux, puis la première exécution réelle du workflow a publié les 11 JSON et leur manifeste sur `main`. Le Worker Cloudflare dédié est déployé depuis `main` et son diagnostic `/health` est validé. Le refus rencontré entre `/update` et GitHub est désormais remonté de façon sécurisée afin d’en isoler la cause exacte ; le raccord de l’extension, le parseur et la page de filtres restent à effectuer.

## 1. Objectif et périmètre

Le but est de permettre à la webapp statique LoSP de répondre correctement à des questions comme :

- quels personnages appliquent un Blocage de capacité, Trauma, Étourdissement, Perturbation, Exposé, etc. ;
- avec quelle capacité : basique, spéciale, ultime, passif, assist/counter ou variante renforcée ;
- à quelle cible, avec quelle probabilité et pour combien de tours ;
- sous quelles conditions : mode de jeu, attaque/défense, trait ou allié requis, Chargé, seuil de vie, critique, déclencheur passif, etc. ;
- si l’effet est appliqué, retiré, transféré, inversé ou prolongé.

Ce projet est un **indexeur de capacités**, pas un simulateur de combat. Nous voulons exploiter la logique déclarative officielle, sans reproduire à l’identique le moteur de combat Unity et tous ses cas limites.

## 2. Conclusion technique validée

La logique utile n’est pas limitée aux descriptions textuelles de l’API publique. Elle se trouve principalement dans des fichiers JSON officiels de `combat_data`, dont les noms sont versionnés par un hash MD5.

Le client web conserve le catalogue actif dans une petite base SQLite locale :

```text
IndexedDB /idbfs
└── object store FILE_DATA
    └── …/Config/combat_data.db/
        ├── 0
        ├── 1
        ├── 2
        └── file_size
```

La base reconstruite contient la table `RemoteAssetClientEntry`, qui associe chaque ressource à son hash actif. La version du client est disponible séparément dans `buildUrl`. Ces deux éléments permettent de construire l’URL CDN candidate d’un fichier publié avec cette version. Un fichier inchangé n’est cependant pas toujours recopié dans le dossier de la version courante ; le pipeline conserve donc les sources validées et les réutilise uniquement lorsque leur MD5 correspond toujours au catalogue actif.

Il n’y a donc :

- ni déchiffrement à effectuer ;
- ni trafic réseau du jeu à intercepter à chaque mise à jour ;
- ni hash à deviner ;
- ni besoin de conserver une session MSF ou un jeton GitHub dans les fichiers du dépôt.

Un clic dans une extension Chrome, après le chargement du jeu, pourra fournir à GitHub les informations nécessaires à toute la suite du pipeline.

## 3. Origines, adresses et sources connues

### 3.1 Jeu web

| Usage | Adresse ou origine |
|---|---|
| Page publique | `https://marvelstrikeforce.com/` |
| Frame Unity du jeu | `https://webplayable.m3.scopelypv.com/` |
| API interne du jeu | `https://msf-api.m3.scopelypv.com/` |
| CDN des règles volumineuses | `https://cdn.m3.scopelypv.com/bulky_rules/` |

L’API interne `msf-api.m3.scopelypv.com` transporte des requêtes propres à la session du joueur. Elle n’est pas nécessaire à ce projet et ne doit pas être capturée ou transmise par l’extension.

### 3.2 API publique officielle

Base :

```text
https://api-prod.marvelstrikeforce.com/services/api/
```

Endpoints déjà identifiés comme complémentaires :

- `getCharacterList`
- `getCharacterAbilities`
- `getCharacterAbilityCaps`
- `getCharacterInstanceCaps`
- `getCharacterMaxStatCaps`
- `getTraits`
- `getTraitsByCategory`
- `getIso8Abilities`
- `getGear`
- `getUpgradeTokens`

Exemples déjà utilisés dans le dépôt :

```text
https://api-prod.marvelstrikeforce.com/services/api/getCharacterList?lang=fr
https://api-prod.marvelstrikeforce.com/services/api/getLocalization?tableId=heroes&lang=fr&format=json
```

L’API publique reste utile pour les noms, portraits, descriptions, icônes et plafonds de niveaux. Elle n’est pas la source de vérité suffisante pour toutes les conditions exécutables des capacités.

### 3.3 Images officielles

Base observée :

```text
https://assets.marvelstrikeforce.com/imgs/
```

Exemples :

```text
https://assets.marvelstrikeforce.com/imgs/Portrait_Abomination_d466494d.png
https://assets.marvelstrikeforce.com/imgs/ICON_ABILITY_SPIDERMAN_BASIC_74d32f44.png
```

Le suffixe fait partie du nom versionné. Il ne faut pas tenter de construire une URL d’image à partir du seul identifiant interne si l’API fournit déjà l’URL exacte.

### 3.4 Ressources Unity secondaires

Le client charge aussi un catalogue Addressables, par exemple lors de l’observation du 21 juillet 2026 :

```text
https://cdn.m3.scopelypv.com/odr/324fb7f0-1f87-4f27-8e14-ce38588aa767/catalog_remote.hash
https://cdn.m3.scopelypv.com/odr/324fb7f0-1f87-4f27-8e14-ce38588aa767/catalog_remote.bin
```

Ce catalogue ne contenait pas la référence `bulky_rules/combat_data/characters`. Il ne remplace donc pas `combat_data.db` pour découvrir les hashes.

Les fichiers Unity/IL2CPP déjà étudiés (`.wasm.gz`, `.data.gz`, `dump.cs`, `script.json`, `stringliteral.json`) sont des sources de secours pour comprendre l’exécution d’une primitive ambiguë. Ils ne sont pas nécessaires au premier indexeur d’effets.

## 4. Localisation dans le stockage du navigateur

### 4.1 Contexte indispensable

Dans les DevTools, la console doit être placée dans le contexte :

```text
webplayable.m3.scopelypv.com
```

Le contexte `top` ne voit pas le même stockage. Une erreur indiquant que `FILE_DATA` est absent peut donc simplement signifier que le script a été exécuté dans le mauvais frame.

### 4.2 Bases IndexedDB observées

| Base | Object store | Utilité actuelle |
|---|---|---|
| `/idbfs` | `FILE_DATA` | Contient les morceaux de `/Config/combat_data.db` ; source retenue |
| `UnityStorage` | `files` | Présent, mais inutile pour le pipeline actuellement validé |

### 4.3 Clés à rechercher

Le chemin utile est `Config`, pas `AssetDBs` :

```text
…/Config/combat_data.db/0
…/Config/combat_data.db/1
…/Config/combat_data.db/2
…/Config/combat_data.db/file_size
```

La partie située avant `/Config/` peut varier ou ne pas être évidente dans l’affichage. Il faut rechercher les morceaux avec une expression suffixe et conserver la clé IndexedDB originale pour la lecture :

```js
const CHUNK_PATTERN = /\/Config\/combat_data\.db\/(\d+)$/i;
```

Règles de reconstruction :

1. ouvrir une base existante avec la version renvoyée par `indexedDB.databases()` ;
2. annuler `onupgradeneeded` afin de ne jamais créer ou modifier une base par erreur ;
3. ouvrir une transaction `readonly` sur `FILE_DATA` ;
4. récupérer toutes les clés ;
5. retenir uniquement les clés finissant par `/Config/combat_data.db/<nombre>` ;
6. trier les morceaux par index numérique ;
7. convertir chaque valeur en octets, y compris si elle est encapsulée dans `contents` ou `data` ;
8. concaténer les morceaux en mémoire ;
9. vérifier l’en-tête ASCII `SQLite format 3` ;
10. ignorer `file_size` lors de la concaténation, mais éventuellement l’utiliser comme contrôle supplémentaire.

La base observée faisait `16 384` octets et comportait trois morceaux. Ces valeurs sont un constat, **pas des constantes à coder**.

## 5. Structure SQLite validée

Schéma exact observé :

```sql
CREATE TABLE "RemoteAssetClientEntry" (
  "id" varchar primary key not null,
  "path" varchar,
  "type" integer,
  "hash" varchar,
  "status" varchar,
  "url" varchar
);

CREATE UNIQUE INDEX "idx_id"
ON "RemoteAssetClientEntry"("id");
```

Requête minimale pour `characters.json` :

```sql
SELECT id, hash, status, url
FROM RemoteAssetClientEntry
WHERE id = 'combat_data/characters.json';
```

Requête retenue pour le pipeline complet :

```sql
SELECT id, hash, status, url
FROM RemoteAssetClientEntry
WHERE id LIKE 'combat_data/%.json'
ORDER BY id;
```

Constats importants :

- les 11 entrées actives avaient `status = 'local'` ;
- la colonne `url` existait, mais valait `NULL` pour les 11 entrées ;
- `path` est une chaîne Base64URL opaque qui contient notamment le nom et l’extension, mais ni `10_3_0` ni l’URL CDN complète ;
- les pages brutes SQLite peuvent garder des traces d’anciens enregistrements supprimés.

Il faut donc exécuter une vraie requête SQLite. Une simple recherche de chaînes dans les octets pourrait récupérer un ancien hash.

## 6. Catalogue observé le 21 juillet 2026

Version du client : `10_3_0`  
Build observé : `1654625`

| Ressource | Hash actif dans SQLite | Taille logique observée | Rôle dans le projet |
|---|---|---:|---|
| `ai_filter.json` | `dc3e6c1cbd5507e48f8b48492bb13d94` | 18 entrées | Filtres génériques utilisés par l’IA |
| `ai_selector.json` | `c535c94667f22ec008909e47386c02f2` | 77 entrées | Pondération et sélection des cibles par l’IA |
| `battlefield_effects.json` | `2ab3984b81c2598bafe624d5c6b13631` | 13 entrées | Effets de champ de bataille et leurs actions/passifs |
| `characters.json` | `028d99dcb9da89896a3a49b4385474de` | 499 personnages | Source principale : actions, effets, conditions, cibles, niveaux, traits et modes |
| `combat_mods.json` | `bc14932baa42717af78859600ae4f9b8` | `mods` vide, 64 octets | Modificateurs injectés par modes, salles, saisons et événements |
| `constants.json` | `4442126880a5aa8699bccd638a55e7ee` | 3 entrées | Constantes de combat complémentaires |
| `iso8skills.json` | `aaba1a3625807ef69b50b3dd858fd742` | 5 entrées | Logique des classes et capacités ISO-8 |
| `missiontraits.json` | `bd944227ffe5a9fccbfccd52a6892cb8` | 21 groupes | Groupes de personnages imposés par certaines missions |
| `overpower_bonuses.json` | `8e3f9b475acb12678659de1ed42f322d` | 2 entrées | Bonus liés au système Overpower |
| `places.json` | `671e28ea2754ccd2e4ec6db12b893880` | 10 entrées | Définitions liées aux positions/cibles |
| `procs.json` | `b25580b243758b80a2aafae42f20d41b` | 286 effets | Dictionnaire des buffs, debuffs, états et effets techniques |

### Priorités fonctionnelles

- **Minimum indispensable au filtre de capacités :** `characters.json` et `procs.json`.
- **Contexte de combat à collecter dès la première version :** `combat_mods.json`, `battlefield_effects.json`, `iso8skills.json` et `missiontraits.json`.
- **Compléments et évolutivité :** `ai_filter.json`, `ai_selector.json`, `constants.json`, `overpower_bonuses.json` et `places.json`.

Puisqu’il n’y a que 11 fichiers, le pipeline doit tous les récupérer et les archiver comme un ensemble cohérent, même si la première interface n’en exploite qu’une partie.

### Anomalie détectée puis résolue

Lors de la vérification locale, 10 fichiers extraits correspondaient exactement aux hashes du catalogue. La copie disponible de `combat_mods.json` avait le MD5 `8fb315c3bfdb8174532f9eb37d4f0d14`, alors que la base active annonçait `bc14932baa42717af78859600ae4f9b8`.

Cette copie était ancienne ou issue d’un autre instantané. Le fichier actif a ensuite été retrouvé et validé avec le MD5 attendu ; il contient actuellement `{"Data":{"mods":{}},"ForceImportVersion":2,"Name":"combat_mods"}`. Le pipeline refuse tout fichier dont le MD5 ne correspond pas au catalogue actif.

## 7. Construction des URL CDN

Formule observée :

```text
https://cdn.m3.scopelypv.com/bulky_rules/{catégorie}/{version}/{nom}.{hash}.{extension}
```

Pour une ligne ayant :

```text
id      = combat_data/characters.json
hash    = 028d99dcb9da89896a3a49b4385474de
version = 10_3_0
```

l’URL devient :

```text
https://cdn.m3.scopelypv.com/bulky_rules/combat_data/10_3_0/characters.028d99dcb9da89896a3a49b4385474de.json
```

Le hash du catalogue est le MD5 exact des octets téléchargés. Pour `characters.json`, l’`ETag` observé correspondait également à ce MD5, mais le pipeline calcule lui-même le hash du contenu au lieu de dépendre uniquement de l’en-tête HTTP.

### Nuance importante sur le dossier de version

L’URL ci-dessus fonctionne pour `characters.json`, publié dans `10_3_0`. Les tests ont cependant montré qu’un fichier inchangé peut ne pas être présent dans le dossier courant, tout en restant actif dans SQLite. Par exemple, le `combat_mods.json` actif était disponible sous `10_2_1`, mais pas sous `10_3_0`.

La stratégie retenue est donc :

1. si le fichier déjà versionné dans `data/msf-capabilities/raw/` possède le MD5 actif, le conserver sans nouvel appel réseau ;
2. sinon, tenter le dossier de la version courante ;
3. si le CDN répond explicitement que cette version ne contient pas le fichier, essayer une liste bornée de versions antérieures ;
4. dans tous les cas, accepter le fichier uniquement si son MD5, son JSON et sa structure concordent ;
5. enregistrer dans le manifeste la version et l’URL exactes ayant fourni le contenu, lorsqu’elles sont connues.

Le premier ensemble validé est fourni dans une archive d’amorçage temporaire. La première exécution réussie la remplace par les 11 JSON bruts et la supprime du dépôt.

### Extraction de la version

La page du jeu exposait :

```js
buildUrl = "/10_3_0/1654625/Build";
```

La première version à essayer dans l’URL CDN est `10_3_0`. Le numéro `1654625` est le numéro de build et ne figure pas dans l’URL `bulky_rules`.

Une extraction robuste doit :

1. tenter de lire `window.buildUrl` dans le frame du jeu ;
2. à défaut, rechercher le motif `/VERSION/BUILD/Build` dans le document ou le script de chargement ;
3. valider la version avec un format du type `10_3_0`, sans figer le nombre de composantes.

Exemple de motif :

```js
const match = buildUrl.match(/\/((?:\d+_)+\d+)\/\d+\/Build(?:\/|$)/);
```

### Pourquoi une GitHub Action seule ne peut pas découvrir le hash

- la version publique est détectable ;
- le fichier est public lorsque son hash est connu ;
- la liste du dossier/bucket CDN renvoie `AccessDenied` ;
- aucun alias stable testé (`characters.json`, `characters.hash`, `manifest.json`, etc.) n’a fourni le dernier hash ;
- le catalogue Unity Addressables public ne contenait pas cette référence.

Le petit pont local fourni par l’extension reste donc nécessaire. Il ne sert qu’à lire le catalogue déjà téléchargé par le jeu.

## 8. Ce que contiennent les données de capacités

### 8.1 `characters.json`

Structure générale :

```text
Data
└── <characterId>
    ├── basic
    ├── special
    ├── ultimate
    ├── passive[]
    ├── safety
    ├── *_empower
    ├── counter / counter_empower
    ├── traits[]
    ├── passive_stats[]
    ├── global_stats[]
    ├── dynamic_stats[]
    └── autres métadonnées de combat
```

Tous les personnages n’ont pas toutes les sections. Dans l’instantané étudié :

- `basic` : 499 ;
- `special` : 467 ;
- `ultimate` : 396 ;
- `passive` : 442 ;
- `safety` : 477.

`safety` ressemble aux données d’assist/counter et doit être conservé. Son libellé exact dans l’interface sera confirmé pendant le développement du parseur.

Les capacités peuvent aussi contenir des `alternatives`, des variantes `*_empower` et des actions imbriquées. Le parcours doit donc être récursif et ne pas se limiter à `ability.actions` au premier niveau.

### 8.2 Actions qui concernent les effets

| `action` interne | Sens à indexer |
|---|---|
| `proc` | Applique ou accorde un effet |
| `proc_remove` | Retire un effet ; ne doit pas être présenté comme une application |
| `proc_transfer` | Transfère un effet |
| `proc_flip` | Inverse buff/debuff |
| `proc_duration` | Prolonge ou réduit une durée selon `delta` ; peut ajouter avec `add_if_not` |
| `set_battlefield_effect` | Pose un effet de champ de bataille via `effect_id` |
| `clear_battlefield_effect` | Retire un effet de champ de bataille |

Cas particulier : les `procs` placés dans `spawn.pool[]` peuvent être appliqués au personnage invoqué. Ils doivent être classés comme effets d’invocation, pas comme effets directement posés sur la cible principale.

Une occurrence de `AbilityBlock` ou `LockedDebuff` dans `only_if`, `filter`, `target`, `test_action`, `dynamic_stats` ou une immunité décrit généralement une condition. Elle ne prouve pas que la capacité applique l’effet.

### 8.3 Champs à conserver

Pour chaque opération indexée, conserver au minimum :

- `characterId` ;
- emplacement de capacité et variante ;
- `effectId` interne ;
- opération normalisée ;
- `action_pct` par niveau ;
- `use_count`, `apply_count`, `count`, `delta` et durée éventuelle ;
- cible complète : `relation`, `type`, `limit`, `filter`, `primary_selection`, etc. ;
- conditions : `only_if`, `only_if_any`, `only_if_target`, `apply_if`, `action_cond`, `exec_for`, traits, mode et côté ;
- déclencheur passif `exec` ;
- fichier source ;
- chemin JSON source, afin de pouvoir diagnostiquer un résultat sans relire tout le fichier.

Les tableaux de valeurs représentent les niveaux d’amélioration. Il faut conserver le tableau complet. Une valeur « niveau maximal » peut être dérivée pour l’interface, mais ne doit pas remplacer les données brutes.

### 8.4 Identifiants internes d’effets

Le texte affiché en jeu n’est pas toujours l’identifiant présent dans `procs.json` :

| Identifiant interne | Effet affiché ou sens fonctionnel |
|---|---|
| `AbilityBlock` | Blocage de capacité |
| `LockedDebuff` | Trauma |
| `LockedBuff` | Safeguard / Sauvegarde |
| `BuffBlock` | Disrupted / Perturbation |
| `DebuffBlock` | Immunity / Immunité |
| `AccuracyDown` | Blind / Aveuglement |
| `DoT` | Bleed / Saignement |
| `HoT` | Regeneration / Régénération |
| `HealBlock` | Blocage des soins |
| `Stun` | Étourdissement |
| `Exposed` | Exposé |

Conséquence importante : une recherche littérale de `Trauma` dans les fichiers ne trouvera rien. Le filtre devra utiliser un mapping versionné `libellé UI ↔ effectId interne`. Les traductions françaises exactes devront venir de la localisation officielle ou d’un mapping contrôlé, pas d’une traduction improvisée dans le parseur.

### 8.5 Modes internes déjà rencontrés

| Valeur interne | Mode fonctionnel |
|---|---|
| `AVA` | Guerre d’alliance |
| `RAID` | Raid |
| `GRAND_TOURNAMENT` | Épreuve cosmique |
| `BATTLEWORLD` | Battleworld |
| `BATTLEGROUNDS` | Arène |
| `INSANITY` | Dimension noire |
| `MISSION` | Mission |
| `CHALLENGE` | Défi |
| `HORSEMEN` | Événement de type Fléau/Cavalier |
| `TOWER_MODE` | Tour |
| `EVENT_CAMPAIGN` | Campagne événementielle |

Le côté peut être précisé séparément avec `combat_side = offense|defense`. Les conditions peuvent être imbriquées dans `and`, `or` ou `not` ; elles ne doivent pas être aplaties au prix d’une perte de sens.

## 9. Exemples de contrôle pour le futur parseur

Ces chemins ont été vérifiés dans l’instantané du 21 juillet 2026 et serviront de tests de non-régression :

| Résultat attendu | Chemin source |
|---|---|
| Adam Warlock applique `AbilityBlock` avec sa spéciale | `Data.AdamWarlock.special.actions[1]` |
| Ant-Man applique `AbilityBlock` avec sa spéciale | `Data.AntMan.special.actions[1]` |
| Apocalypse applique `LockedDebuff` (Trauma) avec son ultime | `Data.Apocalypse.ultimate.actions[4]` |
| Arès applique `LockedDebuff` uniquement en `AVA` avec sa spéciale | `Data.Ares.special.actions[4]` |
| Abomination applique `Stun` avec son ultime | `Data.Abomination.ultimate.actions[3]` |

Le parseur doit également réussir les tests négatifs suivants :

- un effet seulement mentionné dans `only_if` n’est pas classé comme appliqué ;
- `proc_remove` n’est pas classé comme application ;
- un effet d’invocation est distingué d’un effet sur la cible attaquée ;
- une variante `alternatives` n’est ni oubliée ni comptée deux fois sans contexte ;
- une condition `mode` ou `combat_side` reste attachée à l’action concernée.

## 10. Raccord avec les fichiers actuels du dépôt

Le dépôt contient déjà le référentiel léger des personnages :

```text
docs/data/msf-characters.json
```

Chaque entrée fournit notamment :

```json
{
  "id": "Abomination",
  "nameKey": "Abomination",
  "nameFr": null,
  "nameEn": null,
  "portraitUrl": "https://assets.marvelstrikeforce.com/imgs/Portrait_Abomination_d466494d.png"
}
```

La jointure principale sera :

```text
characters.json → clé de Data
msf-characters.json → champ id
```

Fichiers existants à réutiliser :

```text
scripts/fetch-characters.mjs
.github/workflows/fetch-characters.yml
docs/data/msf-characters.json
```

Le workflow existant actualise `msf-characters.json` toutes les trois heures. Le nouveau pipeline ne doit pas dupliquer ce rôle ; il doit enrichir ces identifiants avec la logique des capacités.

## 11. Architecture cible retenue

```mermaid
flowchart TD
    A["MSF chargé dans Chrome"] --> B["Extension : base SQLite + version"]
    B --> C["Cloudflare Worker : authentification et relais"]
    C --> D["GitHub Action : requête SQLite et téléchargements CDN"]
    D --> E["Validation MD5 + génération de l’index"]
    E --> F["JSON statique consommé par GitHub Pages"]
```

### 11.1 Extension Chrome

Responsabilités :

- fonctionner uniquement après un clic sur « Mettre à jour les capacités » ;
- trouver le frame `webplayable.m3.scopelypv.com` ;
- lire `/idbfs` en lecture seule ;
- reconstruire `combat_data.db` en mémoire ;
- extraire la version depuis `buildUrl` ;
- afficher un rapport lisible avant l’envoi ;
- envoyer la base et la version au Worker ;
- proposer un téléchargement local de secours si l’envoi échoue.

L’extension n’a pas besoin d’embarquer SQLite si elle transmet la petite base reconstruite à GitHub. Cela garde son code simple et limite les dépendances.

Décisions appliquées dans le premier prototype :

- ciblage du bon sous-frame avec `chrome.webNavigation.getAllFrames()` ;
- lecture injectée dans le monde `MAIN` avec `chrome.scripting.executeScript()` ;
- permissions Manifest V3 limitées à `scripting`, `webNavigation` et à l’hôte `webplayable.m3.scopelypv.com` ;
- transfert fiable du binaire en Base64 ;
- comportement lorsque MSF n’est pas chargé ou lorsque le schéma change.

Ces choix ont été validés sur le vrai client MSF dans Chrome : quatre morceaux ont produit une base SQLite intacte de 16 384 octets, contenant exactement les 11 lignes actives et passant `PRAGMA integrity_check`. Le prototype ne contient aucun content script permanent, aucun appel réseau et aucun secret.

### 11.2 Cloudflare Worker

Responsabilités :

- Worker dédié, séparé des routes d’upload roster/infos ;
- diagnostic public `GET /health` sans information sensible ;
- endpoint `POST /update` et prérequête CORS `OPTIONS /update` ;
- authentification par le mot de passe d’upload ;
- contrôle du type et de la taille du payload ;
- validation minimale de la version et de l’en-tête SQLite ;
- déclenchement de `workflow_dispatch` sur `Keryas777/msf` ;
- aucun parsing métier des capacités.

Contrat JSON retenu entre l’extension et le Worker :

```json
{
  "gameVersion": "10_3_0",
  "gameBuild": "1654625",
  "databaseBase64": "<combat_data.db encodé>"
}
```

Le mot de passe est envoyé séparément dans l’en-tête `x-upload-password`. La
liste des champs JSON est fermée : le Worker refuse tout champ supplémentaire
afin qu’un cookie ou une donnée de session ne puisse pas être transmis par
erreur. Le nom local du fichier n’est jamais envoyé ; un téléchargement nommé
`combat_data (1).db` ou `combat_data (25).db` est donc traité comme
`combat_data.db` dès lors que ses octets sont valides.

Noms de secrets confirmés :

```text
MSF_CAPABILITIES_UPLOAD_PASSWORD
MSF_GITHUB_TOKEN
```

Seuls les noms sont documentés. Les valeurs ne doivent jamais apparaître dans le dépôt, l’extension, les logs ou ce carnet.

Le jeton finement limité du Worker doit viser uniquement `Keryas777/msf` avec la permission de dépôt **Actions: Read and write**, nécessaire au déclenchement du workflow. Il n’a pas besoin d’écrire lui-même le contenu du dépôt : cette responsabilité appartient au `GITHUB_TOKEN` natif de l’Action.

Le transport `workflow_dispatch` limite l’ensemble des entrées à 65 535 caractères. Le Worker limite donc actuellement SQLite à 45 Kio ; la vraie base de 16 384 octets produit un appel de 21 941 caractères. Si la base dépasse un jour cette limite, il faudra changer le transport plutôt que tronquer ou accepter silencieusement le fichier.

Le code et ses tests se trouvent dans `workers/msf-capabilities/`. Le Worker est relié nativement à la branche `main` dans Cloudflare, avec `workers/msf-capabilities` comme dossier racine et `npx wrangler deploy` comme commande de déploiement. Les deux valeurs secrètes sont créées directement par le propriétaire du compte Cloudflare, sans jamais être communiquées ni versionnées.

En cas de refus GitHub, le Worker renvoie uniquement le statut HTTP, le message
d’erreur et l’identifiant de requête GitHub. Toute occurrence du jeton est
supprimée avant la réponse, et les espaces accidentels autour du secret sont
ignorés.

### 11.3 GitHub Action

Responsabilités :

1. recevoir `game_version`, `game_build` et la base encodée en Base64 par `workflow_dispatch` ;
2. décoder la base et l’ouvrir avec SQLite en lecture seule ;
3. exécuter `PRAGMA integrity_check` ;
4. lire exactement les 11 lignes actives de `RemoteAssetClientEntry` ;
5. vérifier l’allowlist, le statut `local` et le format des hashes ;
6. réutiliser uniquement un fichier brut dont le MD5 correspond encore ;
7. télécharger les fichiers absents ou modifiés depuis le CDN officiel ;
8. vérifier l’origine, la taille, le JSON, les clés structurelles, le MD5 et le SHA-256 ;
9. générer un manifeste de provenance stable ;
10. ne créer un commit que si le résultat a réellement changé.

Le futur parseur construira ensuite l’index compact destiné à la webapp. Il reste volontairement hors de ce deuxième jalon.

Le `GITHUB_TOKEN` natif de l’Action pourra écrire le commit avec `contents: write`. Le jeton conservé dans Cloudflare ne devra avoir que les permissions nécessaires pour déclencher le workflow sur ce seul dépôt.

GitHub n’accepte le déclenchement `workflow_dispatch` que lorsque le fichier de workflow existe sur la branche par défaut. La première exécution complète aura donc lieu après fusion de la PR qui introduit ce pipeline.

## 12. Arborescence du prototype et cible du pipeline

```text
tools/
└── msf-capabilities-extension/
    ├── manifest.json
    ├── popup.html
    ├── popup.css
    ├── popup.js
    └── README.md

workers/
└── msf-capabilities/
    ├── src/index.js
    ├── test/index.test.mjs
    ├── wrangler.jsonc
    ├── .gitignore
    └── README.md

data/
└── msf-capabilities/
    ├── README.md
    ├── raw/
    │   └── <les 11 fichiers officiels>
    └── source-manifest.json

scripts/
├── update_msf_capabilities.py
└── build-capabilities-index.mjs  # étape suivante

tests/
└── test_update_msf_capabilities.py

.github/workflows/
├── update-msf-capabilities.yml
└── test-msf-capabilities-worker.yml

docs/data/
└── msf-capabilities.json
```

Principes :

- les données brutes et les outils de construction restent hors de `/docs` ;
- seul le JSON compact nécessaire au navigateur est publié par GitHub Pages ;
- l’application finale reste 100 % statique, sans framework ni backend lourd ;
- les chemins ci-dessus sont désormais confirmés dans l’architecture réelle du dépôt.

## 13. Format cible conseillé pour l’index web

Exemple indicatif, non figé :

```json
{
  "generatedAt": "2026-07-21T00:00:00Z",
  "source": {
    "gameVersion": "10_3_0",
    "charactersHash": "028d99dcb9da89896a3a49b4385474de",
    "procsHash": "b25580b243758b80a2aafae42f20d41b"
  },
  "effects": {
    "AbilityBlock": {
      "labelFr": "Blocage de capacité",
      "category": "debuff"
    },
    "LockedDebuff": {
      "labelFr": "Trauma",
      "category": "debuff"
    }
  },
  "characters": {
    "AdamWarlock": {
      "effects": []
    }
  }
}
```

Chaque effet normalisé devra conserver un `sourcePath`. Le format final doit privilégier la vitesse de chargement sur mobile, tout en restant explicable et testable.

## 14. Contrôles de sécurité et d’intégrité

### À faire systématiquement

- lecture IndexedDB uniquement en `readonly` ;
- vérification de l’en-tête SQLite ;
- validation stricte de la version ;
- allowlist des 11 identifiants ;
- hash au format `^[a-f0-9]{32}$` ;
- téléchargement uniquement depuis l’hôte CDN attendu ;
- calcul MD5 des octets avant parsing ;
- parsing JSON et contrôle des clés principales `Data`, `Name`, `ForceImportVersion` lorsque présentes ;
- limite de taille côté extension, Worker et Action, avec prise en compte des 65 535 caractères de `workflow_dispatch` ;
- nom local de la base ignoré au profit de sa validation interne : `combat_data.db`, `combat_data (1).db`, etc. sont acceptés ;
- aucun commit lorsque les hashes et l’index sont inchangés ;
- journal de provenance sans donnée de session.

### À ne jamais committer ou transmettre

- HAR complet ;
- NetLog complet ;
- URL chiffrée de requête vers `msf-api.m3.scopelypv.com` ;
- cookies, jetons ou identifiants de session MSF ;
- jeton GitHub ;
- secret Cloudflare ;
- dump global du stockage du navigateur.

Les captures réseau utilisées pendant la recherche peuvent contenir des informations de session, même si les paramètres semblent opaques. Seules les conclusions techniques dérivées doivent entrer dans le dépôt.

## 15. Pièges déjà rencontrés

1. **Mauvais contexte DevTools :** `top` ne donnait pas accès au bon `FILE_DATA`.
2. **Mauvais emplacement supposé :** la base n’est pas `/AssetDBs/*.db`, mais `/Config/combat_data.db`.
3. **Filtre trop strict :** exiger que la clé commence exactement par `/Config/` a échoué ; la recherche par suffixe fonctionne.
4. **Perte de la clé originale :** convertir la clé en chaîne pour la chercher est acceptable, mais `objectStore.get()` doit recevoir la clé originale.
5. **Recherche binaire trompeuse :** SQLite peut garder d’anciennes lignes supprimées ; toujours interroger la table.
6. **URL absente de SQLite :** la colonne `url` est `NULL`, la version doit venir de `buildUrl`.
7. **Nom d’effet trompeur :** `Trauma` est stocké sous `LockedDebuff`.
8. **Faux positifs du parseur :** un proc dans une condition n’est pas nécessairement appliqué.
9. **Fichier périmé :** `combat_mods.json` a déjà révélé un MD5 différent du catalogue actif.
10. **Valeurs observées non contractuelles :** ne pas figer trois morceaux, 16 384 octets, 499 personnages ou 286 procs.
11. **Dossier CDN courant incomplet :** un hash encore actif peut n’exister que dans un ancien dossier de version ; réutiliser le fichier validé ou conserver sa version source exacte.
12. **Nom téléchargé variable :** Chrome peut produire `combat_data (1).db`, `(2)`, etc. ; ne jamais valider la base par son nom.

## 16. Ordre de réalisation

- [x] Identifier la source déclarative des capacités.
- [x] Identifier le stockage IndexedDB et le bon frame.
- [x] Reconstruire et ouvrir `combat_data.db`.
- [x] Retrouver la ligne `characters.json` et son hash.
- [x] Établir la formule CDN et la provenance de la version.
- [x] Inventorier les 11 ressources actives.
- [x] Vérifier que `characters.json` contient les actions, cibles et conditions.
- [x] Vérifier que `procs.json` définit les effets internes.
- [x] Créer le prototype d’extension en lecture seule, sans envoi GitHub.
- [x] Valider dans Chrome la version et l’export local de la base.
- [x] Implémenter et tester la route Worker dédiée.
- [x] Déployer le Worker et créer ses deux secrets dans Cloudflare.
- [ ] Raccorder l’extension à l’adresse définitive du Worker.
- [x] Ajouter la GitHub Action de téléchargement et validation.
- [x] Vérifier avec la vraie base les 11 lignes actives, les 11 MD5 et l’absence de modification au second passage.
- [x] Valider la première exécution du workflow sur GitHub après fusion.
- [ ] Figer le schéma de l’index généré.
- [ ] Écrire le parseur et ses tests de non-régression.
- [ ] Construire la page mobile-first de filtres.
- [ ] Vérifier iOS Safari, Android Chrome, PWA et navigateur intégré Discord pour la page finale.

## 17. Critères de réussite de la première chaîne complète

Après un clic dans l’extension :

1. un rapport affiche la version détectée et exactement les entrées actives autorisées ;
2. l’Action télécharge les fichiers dont les hashes figurent dans cette base ;
3. tout écart MD5 arrête le workflow sans remplacer les bonnes données ;
4. si rien n’a changé, aucun commit n’est créé ;
5. si les données ont changé, un seul commit cohérent met à jour le manifeste, les sources retenues et l’index ;
6. le JSON final permet de retrouver Adam Warlock pour `AbilityBlock` et Apocalypse pour `LockedDebuff` ;
7. les résultats indiquent la capacité, la cible et les conditions ;
8. les suppressions, transferts, inversions et simples mentions conditionnelles ne sont pas confondus avec une application.

## 18. Questions encore ouvertes

- Quelle table de localisation officielle fournit les libellés français exacts de tous les procs ?
- Quel libellé utilisateur retenir pour `safety` et les variantes techniques ?
- Quel schéma final donne le meilleur compromis entre précision, taille et vitesse sur mobile ?
- Comment signaler dans l’interface les effets conditionnels très complexes sans transformer le filtre en simulateur ?

Ces points ne remettent pas en cause la localisation ni la récupération des données. Ils concernent l’implémentation et la présentation.

## 19. Journal des décisions

### 21 juillet 2026

- périmètre confirmé : filtre détaillé des capacités, pas simulateur ;
- `combat_data/characters.json` retenu comme source principale de logique ;
- `combat_data/procs.json` retenu comme dictionnaire des effets ;
- récupération manuelle de fichiers abandonnée au profit d’un bouton d’extension ;
- automatisation totalement planifiée abandonnée ;
- envoi automatique vers GitHub après le clic retenu ;
- jeton GitHub interdit dans l’extension ;
- base SQLite + version transmises au pipeline, traitement lourd effectué côté GitHub ;
- collecte des 11 fichiers retenue pour éviter de recommencer l’exploration lors d’un futur besoin ;
- présent carnet placé à la racine du dépôt, hors de GitHub Pages ;
- extension conservée dans `tools/msf-capabilities-extension`, hors de `/docs` et donc hors de GitHub Pages ;
- premier prototype limité à une lecture locale en monde `MAIN`, avec rapport et téléchargement de secours ;
- aucune route Worker, aucun appel réseau et aucun secret dans ce premier jalon ;
- test Chrome réel réussi : quatre morceaux, 16 384 octets, intégrité SQLite `ok` et 11 ressources actives ;
- noms `combat_data.db` et `combat_data (n).db` acceptés, car seule la base elle-même fait foi ;
- pipeline des sources implémenté en Python standard, sans nouvelle dépendance du projet ;
- `workflow_dispatch` retenu pour transporter la base Base64, la version et le build ;
- 11 fichiers bruts versionnés hors de `/docs`, accompagnés d’un manifeste de provenance ;
- amorce temporaire retenue pour le premier ensemble, car les fichiers inchangés ne sont pas tous recopiés dans le dossier CDN courant ;
- quatre tests couvrent le nom numéroté, l’allowlist exacte, le refus d’un mauvais MD5, le repli de version et l’absence de réécriture inutile.

### 22 juillet 2026

- première exécution réelle de `update-msf-capabilities.yml` réussie avec la base de 16 384 octets ;
- 11 JSON officiels et `source-manifest.json` publiés sur `main`, puis amorce temporaire supprimée ;
- Worker Cloudflare séparé retenu afin de ne jamais modifier le Worker roster/infos existant ;
- routes retenues : `GET /health`, `OPTIONS /update` et `POST /update` ;
- contrat fermé à `gameVersion`, `gameBuild` et `databaseBase64`, avec mot de passe dans `x-upload-password` ;
- secrets confirmés : `MSF_CAPABILITIES_UPLOAD_PASSWORD` et `MSF_GITHUB_TOKEN` ;
- jeton GitHub limité au dépôt `Keryas777/msf` et à la permission Actions en écriture ;
- limite Worker fixée à 45 Kio pour respecter les 65 535 caractères de `workflow_dispatch` ;
- vrai fichier `combat_data (1).db` accepté lors du test d’intégration : HTTP 202 simulé et seulement trois entrées transmises à GitHub ;
- huit tests Worker couvrent santé, CORS, authentification, schéma fermé, version, SQLite, déclenchement GitHub, erreurs sans fuite et secrets absents.

### 23 juillet 2026

- connexion Git native Cloudflare validée sur `main`, avec `workers/msf-capabilities` comme dossier racine ;
- déploiement du Worker et création des deux secrets terminés ; `/health` a confirmé le service actif ;
- déclenchement direct de `update-msf-capabilities.yml` avec le jeton finement limité accepté en HTTP 204, puis Action terminée au vert ;
- panne isolée au seul appel Worker → GitHub, indépendamment de la base SQLite, du workflow et des permissions du jeton ;
- version Worker `0.1.1` préparée pour remonter le statut, le message et l’identifiant GitHub sans exposer le jeton ;
- neuf tests Worker couvrent désormais aussi les diagnostics HTTP sécurisés, les erreurs réseau et la normalisation du jeton ;
- le diagnostic réel a identifié `redirect: "error"` comme incompatible avec le runtime Cloudflare ; la version `0.1.2` utilise `redirect: "manual"` et vérifie toujours explicitement le statut HTTP renvoyé par GitHub.

---

Lorsqu’une découverte ou une décision modifie ce pipeline, mettre à jour ce fichier dans le même commit que le code concerné.
