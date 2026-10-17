# Épreuve cosmique — données LoSP

Les pages sont statiques et utilisent les mêmes portraits et rosters que les outils LoSP, mais **pas** le catalogue ni les bonus de guerre.

## Fichiers

- `cosmic-config.json` : les six salles, leur libellé et le texte de leur règle saisonnière. Modifier ces règles ici lorsqu'elles évoluent. Le moteur ne déduit **pas** automatiquement des bonus de puissance de ces textes.
- `cosmic-counters.json` : contres dédiés à l'Épreuve cosmique, indépendants de `war-counters.json`. Vide au départ : ne jamais importer automatiquement des contres de guerre.
- `cosmic-defenses.json` : compositions de défense publiées après validation. Vide au départ.

## Contres

Chaque objet du tableau `cosmic-counters.json` reprend les colonnes de `war-counters.json`, notamment :

```json
{
  "room": 1,
  "def_family": "Nom générique de la défense",
  "def_variant": "Variante",
  "def_char1": "InternalId1",
  "def_char2": "InternalId2",
  "def_char3": "InternalId3",
  "def_char4": "InternalId4",
  "def_char5": "InternalId5",
  "atk_family": "Nom générique de l'attaque",
  "atk_team": "Nom de l'attaque",
  "atk_char1": "InternalId1",
  "atk_char2": "InternalId2",
  "atk_char3": "InternalId3",
  "atk_char4": "InternalId4",
  "atk_char5": "InternalId5",
  "min_ratio_hard": 0.8,
  "min_ratio_ok": 1,
  "min_ratio_safe": 1.2,
  "notes": "Conditions à vérifier"
}
```

Ceci n'est **qu'un exemple de structure**, pas une recommandation ni des seuils vérifiés. Ne renseigner les seuils qu'avec des données pertinentes pour l'Épreuve cosmique.

`room` vaut 1 à 6 pour un contre spécifique à une salle, ou `0`/absent pour un contre générique affiché dans toutes les salles. Le mode « Toutes les salles » présente également les contres spécifiques ; il faut choisir la bonne salle avant de lancer son attaque.

Les puissances de roster utilisées sont **brutes** : aucun multiplicateur `war-season-rules.json` n'est appliqué.

## Défenses validées

Chaque entrée de `cosmic-defenses.json` peut avoir cette structure :

```json
{
  "room": 1,
  "name": "Nom de la composition",
  "characters": ["InternalId1", "InternalId2", "InternalId3", "InternalId4", "InternalId5"],
  "author": "Pseudo du joueur",
  "source": "Personnel ou Marvel Church",
  "sourceUrl": "https://example.com/source-reelle",
  "notes": "Stratégie ou variante"
}
```

Les cinq IDs doivent correspondre aux personnages jouables de `msf-characters.json` et ne pas se répéter dans une équipe. Ne publier de proposition tierce qu'avec une attribution correcte et un lien réel si disponible.

## Propositions des joueurs

Le formulaire `cosmic-defenses.html` valide les personnages, accepte **une à six salles complètes**, mémorise un brouillon local et partage un texte via l'API de partage mobile ou le presse-papiers.

**Il ne soumet pas directement des données au dépôt ou à Google Sheets.** Le joueur partage sa proposition à l'équipe sur Discord ; un responsable la valide avant de l'ajouter à `cosmic-defenses.json`. Ce circuit évite de prétendre qu'une publication en écriture existe dans une application statique. Une future collecte automatisée devra employer un service dédié avec authentification, validation et modération.

## Vérification

```sh
node --test tests/cosmic-static.test.mjs
```

## Consultation : sélection des défenses publiées

Sur `cosmic-defenses.html`, le menu **Choisir des défenses** propose par défaut « Toutes les défenses publiées », puis les groupes **Défenses des joueurs** (regroupés par `author`) et **Guides et autres sources** (regroupés par `source`, par exemple `Marvel Church`). Le menu ne contient que les compositions de la saison active et masque ses groupes tant que `cosmic-defenses.json` est vide.

Pour conserver plusieurs jeux de défenses d'un même auteur ou d'une même source, une entrée peut comporter un champ facultatif `"collection": "Nom du set"` : toutes les entrées qui partagent cet auteur/source et ce nom constituent un groupe distinct. Les cinq personnages d'une même salle sont toujours indiqués dans `characters`. Les crédits et les liens `sourceUrl` des entrées publiées restent visibles.

Le menu **ne remplace pas** le formulaire permettant de proposer ses propres défenses : il sert uniquement à consulter les propositions validées, sans modifier le JSON ni les brouillons locaux.

## Pages distinctes de consultation et de proposition

La rubrique `cosmic.html` contient **trois tuiles** :

- `cosmic-counters.html` — Contres ;
- `cosmic-defenses.html` — **Consulter les défenses** : le sélecteur de joueurs/sources et les six salles de la saison active, en lecture seule ;
- `cosmic-defense-propose.html` — **Proposer une défense** : sélection des personnages, cinq portraits avec suppression, notes, pseudo Discord non éditable et partage.

Le script `cosmic-defenses.js` est commun aux deux vues et n'initialise que les fonctionnalités de la page consultée via `data-cosmic-view`. Le catalogue `cosmic-defense-catalog.js` n'est chargé que pour consulter les défenses. Le formulaire conserve la **même clé localStorage par saison** : les brouillons existants restent accessibles après la séparation des pages.

Aucune tuile n'est ajoutée à l'accueil général LoSP.
