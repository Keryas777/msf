# Suivi automatique des sorties MSF

Le suivi est prospectif uniquement. Les années et trimestres déjà audités ne sont pas réinterprétés.

## Sources

- docs/data/msf-characters.json : ID interne, nom, portrait, drapeau player_Character.
- data/msf-capabilities/raw/characters.json : kits officiels et traits des formations.
- docs/data/msf-release-history.json : chronologie éditoriale dont les observations nouvelles sont ajoutées sans effacer les audits.

Le workflow .github/workflows/update-msf-release-history.yml s'exécute toutes les 3 heures et peut aussi être lancé à la demande. Il repose sur les deux collecteurs existants sans les modifier.

## Première utilisation

Le script scripts/update-msf-release-history.mjs crée seulement data/msf-release-monitor/state.json. Il ne transforme jamais le catalogue courant en centaines de sorties nouvelles. Les exécutions suivantes comparent les empreintes des capacités et les traits enregistrés.

## Conditions

- Nouveau personnage : transition vers player_Character=true, présence dans combat_data, ID encore absent des compartiments historiques.
- Rework : au moins deux catégories de capacités modifiées, ou capacité et bonus/trait modifiés, ou au moins deux catégories de bonus modifiées.
- Equipe : trait commun à 3-8 personnages jouables, nouvelle formation avec plusieurs changements de membership ou rework collectif d'au moins trois membres.
- Rework isolé : ajouté à individualReworks et visible dans la chronologie Web.
- Changement mineur : inscrit uniquement dans le journal borné unclassifiedChanges.

Les traits génériques (classe, origine, zone) sont exclus des équipes. Une nouvelle recrue dans une faction ancienne ne suffit pas à créer une nouvelle équipe.

## Dates

La date est celle de la PREMIERE OBSERVATION du changement dans les fichiers, pas une preuve de la PREMIERE DISPONIBILITE AU RECRUTEMENT. Les entrées sont marquées confidence=low / automated_observation et dateConfidence=unverified. L'interface distingue explicitement ces observations des sorties historiquement vérifiées.

Le suivi prospectif ne modifie pas auditedThrough, ne promeut jamais le statut annual à audited et conserve les événements incertains comme tels.

## Sécurité et tests

- Pas de modification rétrospective des trimestres précédents ; année de publication = année UTC de détection.
- Echec si catalogue incohérent, fortement réduit ou changements anormalement massifs.
- Empreintes SHA-256 pour comparer les champs mécaniques ; classement déterministe par identifiant.
- Les événements déjà enregistrés ne sont pas réinsérés lors des exécutions suivantes.
- Les commits ne concernent que state.json et msf-release-history.json.
- Tests : node --test tests/msf-release-monitor.test.mjs
- En PR, le workflow exécute les tests et vérifie que le premier lancement ne modifie pas l'historique.

## Sorties annoncées déjà présentes dans les données

Les annonces officielles peuvent précéder la disponibilité effective. Un personnage
peut donc être player_Character=true avant de pouvoir être recruté : le simple
bootstrap du registre ne suffit pas à déterminer sa sortie.

Le fichier data/msf-release-monitor/scheduled-events.json contient une file de
sorties explicitement datées et sourcées. Tant que l'heure UTC annoncée n'est
pas atteinte, la release et son équipe ne sont pas ajoutées à l'historique.
Lorsque le créneau commence, le script vérifie les personnages et leurs traits,
préserve les dates d'audit passées, puis insère l'événement une seule fois.
Une déclaration planifiée prime sur les heuristiques pour ces membres afin
d'éviter les fausses sorties anticipées et les équipes en double.

Premier cas : Dracula, Morbius, Oath / Nightreavers ; date officielle de
recrutement de Dracula : 2026-10-19 à 21:00 UTC (14:00 PDT).
Les reworks de Morbius et Oath sont documentés pour octobre, sans leur
attribuer une date d'activation exacte non prouvée.
Les deux places restantes de l'équipe ne sont pas fixes.
