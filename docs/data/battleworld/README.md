# LoSP — Données Battleworld

Le guide est piloté par \`index.json\` et par un JSON indépendant pour chaque boss.

## Nouvelle rotation

1. Copier un fichier de boss existant vers un nouveau nom (ex. \`new-boss.json\`).
2. Modifier son \`id\`, son \`boss.name\` et les informations utiles (sans inventer de valeurs).
3. Ajouter \`{"id":"new-boss","name":"Nom affiché","file":"new-boss.json"}\` à \`index.json\`.
4. Modifier uniquement \`activeGuideId\` dans \`index.json\` pour activer ce guide.

Conserver les anciens fichiers : ils restent consultables dans le sélecteur historique.

## Contenu d'un guide

- \`zones\` : trois zones. Chaque zone possède trois \`nodes\`.
- Chaque node : \`restrictions\`, \`enemies\`, \`mechanics\`, \`objectives\`, \`strategy\`, \`avoid\`, \`instructions\`, \`teams\`, \`sources\`.
- \`boss\` : \`name\`, \`mechanics\`, \`objectives\`, \`strategy\`, \`avoid\`, \`instructions\`, \`teams\`, \`sources\`.
- Les champs d'instructions sont des listes de chaînes, dans leur ordre d'affichage. Laisser une liste vide tant que la donnée n'est pas confirmée.
- \`status\`: \`draft\` tant que le contenu reste incomplet. \`lastVerified\` : date ISO \`YYYY-MM-DD\` lorsqu'elle est réellement vérifiée. \`patch\` : version du jeu, si connue.
- Une entrée de \`teams\` peut utiliser : \`id\`, \`title\`, \`characters\` (tableau d'IDs internes de \`msf-characters.json\`, dans l'ordre souhaité), \`phase\`, \`requirements\` (tableau), \`steps\` (tableau ordonné), \`alternatives\` (tableau), \`notes\` (tableau). Tous sont facultatifs sauf \`id\` et \`title\`.
- \`sources\` : tableau d'objets \`{"label":"Source","url":"https://..."}\`.

Ne pas confondre statut « draft » et stratégie testée. Les contenus affichés doivent être sourcés et validés avant d'être présentés comme fiables. Aucun fichier du Codex ou des War Counters n'est modifié.
