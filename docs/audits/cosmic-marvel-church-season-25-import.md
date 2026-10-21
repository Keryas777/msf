# Marvel Church — défenses recommandées pour l’Épreuve cosmique, saison 25

Source : https://www.marvel.church/cosmic-crucible-the-best-defensive-setup/
Source de transcription : six captures d’écran de la section **Stage Rules / Best Defense / Optimal Defense / Budget Defense** de la page affichant les règles de la saison 25.

## Périmètre strict

- Uniquement les **défenses** indiquées sous les rubriques `Best Defense`, `Optimal Defense` et `Budget Defense` pour les salles 1 à 6.
- **Aucune composition « Offense Heavy Setup » ni « offensive setup » importée.** Les mentions « On Offense and Defense » concernent les *règles* de salle et non des formations offensives.
- La section « Defensive Teams » est utilisée uniquement pour déterminer les membres des formations nommées, recoupées avec `docs/data/teams.json`.
- Les identifiants des cinq personnages proviennent exclusivement de `docs/data/msf-characters.json`, en ne conservant que `player_Character: true`.
- Les alternatives introduites par **« / »** ne sont pas choisies arbitrairement, et nous ne devinons pas quels membres retirer d’une formation déjà complète.
- `docs/data/cosmic-defenses.json` contient exclusivement les **12 compositions de cinq personnages déterminables** ci-dessous ; les six autres recommandations restent documentées sans portrait fictif.

## Relevé complet des 18 recommandations défensives

| Salle | Niveau | Recommandation de Marvel Church | État |
|---|---|---|---|
| 1 | Best | Symbiote Six + Professor Xavier (no Toxin) | **Importée**, remplacement explicite |
| 1 | Optimal | Symbiote Six | **Importée**, cinq membres déterminés |
| 1 | Budget | Immortal Weapon + Captain Britain | Non importée : aucun membre à retirer n'est indiqué pour faire place à Captain Britain |
| 2 | Best | Daring Warrior + Odin (no Jessica Jones) | **Importée**, remplacement explicite |
| 2 | Optimal | Accursed + Odin | Non importée : équipe déjà complète, membre sortant non indiqué |
| 2 | Budget | Amazing Avenger | **Importée**, cinq membres déterminés |
| 3 | Best | Phoenix Force + Toxin + Mister Fantastic (MCU) | **Importée**, trois membres Force Phénix + deux renforts |
| 3 | Optimal | Blue Marvel + Executioner + Howard the Duck + Emma Frost + Emma Frost (X-Men) | **Importée**, cinq personnages nommés |
| 3 | Budget | Insidious Six + Vulture + Shocker | **Importée**, trio Insidious Six + deux renforts |
| 4 | Best | Exalted X-Men + Annihilus / Quasar (no Jubilee or Wolverine) | Non importée : plusieurs substitutions alternatives, aucune formation unique désignée |
| 4 | Optimal | Starjammer | **Importée**, cinq membres déterminés |
| 4 | Budget | Shadow Conclave | **Importée**, cinq membres déterminés |
| 5 | Best | A.I. Avenger | **Importée**, cinq membres déterminés |
| 5 | Optimal | New Mutant + Silver Surfer (Breaker) / Mephisto | Non importée : membre sortant non indiqué et deux renforts alternatifs |
| 5 | Budget | Iron Raider + Super Skrull (no Iron Monger) | **Importée**, remplacement explicite |
| 6 | Best | F4 (MCU) + Sentry + Blue Marvel | Non importée : cinq membres F4 (MCU) + deux renforts, deux membres sortants non indiqués |
| 6 | Optimal | F4 (MCU) + Captain Britain + Nightcrawler | Non importée : cinq membres F4 (MCU) + deux renforts, deux membres sortants non indiqués |
| 6 | Budget | Winter Guard | **Importée**, cinq membres déterminés |

## Contrôles et maintenance

- Les douze entrées sont étiquetées `season: "season-25"`, `source: "Marvel Church"`, `collection: "Marvel Church — Saison 25"`, et comportent un `sourceUrl` vers l'article d'origine.
- Le sélecteur existant **Consulter les défenses** les présente dans une seule collection Marvel Church, avec leur niveau **Best / Optimal / Budget** dans le titre.
- La publication directe des joueurs, qui utilise `source: "Personnel"` et un `authorDiscordId`, reste totalement indépendante et ne doit pas écraser ces lignes.
- Lorsque Marvel Church précise les alternatives, les six recommandations restantes pourront faire l'objet d'une PR ultérieure, après identification de **cinq personnages jouables distincts** par équipe.
- Il faudra vérifier que le fichier JSON actif n'a pas changé à la suite de publications de joueurs entre l'ouverture de cette PR et sa fusion ; en cas de conflit, **fusionner les données, jamais écraser les défenses des joueurs**.
