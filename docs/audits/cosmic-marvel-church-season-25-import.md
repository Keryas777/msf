# Marvel Church — défenses recommandées pour l’Épreuve cosmique, saison 25

Source : https://www.marvel.church/cosmic-crucible-the-best-defensive-setup/
Source de transcription : six captures d’écran de la section **Stage Rules / Best Defense / Optimal Defense / Budget Defense** de la page affichant les règles de la saison 25.

## Périmètre strict

- Uniquement les **défenses** indiquées sous les rubriques `Best Defense`, `Optimal Defense` et `Budget Defense` pour les salles 1 à 6.
- **Aucune composition « Offense Heavy Setup » ni « offensive setup » importée.** Les mentions « On Offense and Defense » concernent les *règles* de salle et non des formations offensives.
- La section « Defensive Teams » est utilisée uniquement pour déterminer les membres des formations nommées, recoupées avec `docs/data/teams.json`.
- Les identifiants des cinq personnages proviennent exclusivement de `docs/data/msf-characters.json`, en ne conservant que `player_Character: true`.
- Les variantes introduites par **« / »** sont enregistrées séparément quand l'utilisateur les retient toutes les deux ; les remplacements non indiqués par Marvel Church sont **explicitement attribués aux arbitrages LoSP**. Exemples : la Chose et la Torche humaine sortent pour les 4F (MCU) en salle 6 ; Jubilé sort en salle 4 ; Solar sort en salle 5.
- `docs/data/cosmic-defenses.json` contient **20 compositions de cinq personnages déterminées**, correspondant aux **18 recommandations défensives** source, avec deux déclinaisons supplémentaires (Annihilus/Quasar et Briseur/Méphisto). Aucune composition offensive importée.

## Relevé complet des 18 recommandations défensives

| Salle | Niveau | Recommandation de Marvel Church | État |
|---|---|---|---|
| 1 | Best | Symbiote Six + Professor Xavier (no Toxin) | **Importée**, remplacement explicite |
| 1 | Optimal | Symbiote Six | **Importée**, cinq membres déterminés |
| 1 | Budget | Immortal Weapon + Captain Britain | **Importée** : Captain Britain remplace Iron Fist (2GM), remplacement confirmé par l'utilisateur |
| 2 | Best | Daring Warrior + Odin (no Jessica Jones) | **Importée**, remplacement explicite |
| 2 | Optimal | Accursed + Odin | **Importée** : Odin remplace Mordo, choix validé par l'utilisateur |
| 2 | Budget | Amazing Avenger | **Importée**, cinq membres déterminés |
| 3 | Best | Phoenix Force + Toxin + Mister Fantastic (MCU) | **Importée**, trois membres Force Phénix + deux renforts |
| 3 | Optimal | Blue Marvel + Executioner + Howard the Duck + Emma Frost + Emma Frost (X-Men) | **Importée**, cinq personnages nommés |
| 3 | Budget | Insidious Six + Vulture + Shocker | **Importée**, trio Insidious Six + deux renforts |
| 4 | Best | Exalted X-Men + Annihilus / Quasar (no Jubilee or Wolverine) | **Deux variantes importées** : Jubilé remplacée par Annihilus **ou** Quasar, validé par l'utilisateur |
| 4 | Optimal | Starjammer | **Importée**, cinq membres déterminés |
| 4 | Budget | Shadow Conclave | **Importée**, cinq membres déterminés |
| 5 | Best | A.I. Avenger | **Importée**, cinq membres déterminés |
| 5 | Optimal | New Mutant + Silver Surfer (Breaker) / Mephisto | **Deux variantes importées** : Solar remplacé par le Surfeur d'argent (Briseur) **ou** Méphisto, choix utilisateur |
| 5 | Budget | Iron Raider + Super Skrull (no Iron Monger) | **Importée**, remplacement explicite |
| 6 | Best | F4 (MCU) + Sentry + Blue Marvel | **Importée** : la Torche humaine et la Chose sortent (précision de gameplay donnée par l'utilisateur) |
| 6 | Optimal | F4 (MCU) + Captain Britain + Nightcrawler | **Importée** : la Torche humaine et la Chose sortent (précision de gameplay donnée par l'utilisateur) |
| 6 | Budget | Winter Guard | **Importée**, cinq membres déterminés |

## Contrôles et maintenance

- Les vingt entrées sont étiquetées `season: "season-25"`, `source: "Marvel Church"`, `collection: "Marvel Church — Saison 25"`, et comportent un `sourceUrl` vers l'article d'origine.
- Le sélecteur existant **Consulter les défenses** les présente dans une seule collection Marvel Church, avec leur niveau **Best / Optimal / Budget** dans le titre.
- La publication directe des joueurs, qui utilise `source: "Personnel"` et un `authorDiscordId`, reste totalement indépendante et ne doit pas écraser ces lignes.
- Les 18 recommandations défensives de la section Stage Rules sont couvertes ; les salles 4 et 5 présentent chacune deux variantes distinctes, choisies avec l'utilisateur, d'où **20 compositions** au catalogue.
- **Salle 4 :** Annihilus privilégie le retrait des barrières et des effets positifs (https://marvelstrikeforce.com/en/characters/Annihilus). Quasar privilégie notamment la réduction des assistances et les interactions avec Exposé et Chargé (https://www.marvel.church/quasar/). Les effets exclusifs à la **WAR OFFENSE** de Quasar sont exclus des bénéfices avancés en défense cosmique. Ces caractéristiques ne constituent pas un classement universel entre les deux variantes.
- **Salle 5 :** Marvel Church cite deux renforts mais ne désigne pas le sortant. **LoSP retient Solar** ; le caractère contrôlant de Méphisto est documenté par Scopely (https://marvelstrikeforce.com/en/updates/blog-update-3-8-24).
- Il faudra vérifier que le fichier JSON actif n'a pas changé à la suite de publications de joueurs entre l'ouverture de cette PR et sa fusion ; en cas de conflit, **fusionner les données, jamais écraser les défenses des joueurs**.
