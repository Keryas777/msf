# Audit d’identité des alliances — annuaire central

Date de l’audit : 19 novembre 2026. Portée : dépôt `Keryas777/msf` sur `main`, dépôt `Keryas777/losp-roster-service` sur `main`, documentation MSF API fournie au projet et inventaire des ressources Cloudflare lisibles par le connecteur. Aucune donnée R2 ni aucun code de `losp-roster-service` n’a été modifié.

## Modèle déjà utilisé dans la WebApp

La donnée publique `docs/data/war-intelligence.json` définit les identités connues dans les Renseignements de guerre. Chaque alliance a `id`, `name` et `richName`; `docs/data/WAR-INTEL-README.md` précise que `id` est stable, que `richName` reprend un format versionné de segments `text`/`color`/`symbol`, et que les observations gardent un `allianceId` plutôt qu’un nom affiché. Le Worker `workers/msf-cosmic-defenses/worker.js` génère les IDs sous la forme `wi-` + UUID aléatoire et rattache les plans avec `allianceId`. L’administration publie une correction de nom sur la même identité.

`war-results-vision-data.js` utilise pour l’instant un `localAllianceId` optionnel, séparé de ces IDs. `war-history.js` et plusieurs pages gardent des clés/alias LoSP pour les groupements de l’alliance de l’utilisateur; ces clés ne sont pas des IDs d’alliances adverses. Aucun de ces formats n’est remplacé par cette PR.

Le référentiel central réemploie les six IDs `wi-…` correspondant sans ambiguïté aux noms déjà observés dans le fichier de guerre : MARINES, Omega Protocol, NWO Planet of Apes, DA Galaxy Rangers, ArcAngels et BLADE RUNNER. Le libellé courant des anciens relevés n’est pas réécrit. Le nom `DA Galaxy Rangers` est conservé comme alias observé de la fiche simplifiée `Galaxy Rangers`.

## Résultat Roster Service et API officielle

`src/alliance-coverage.js` appelle `GET /player/v1/alliance/card`, lit `data.id` et `data.name`, et réduit l’identifiant `id` au segment avant `:` via `stableAllianceId()`. Son commentaire documente le format Scopely `{aid}:{member_version}`. `docs/multi-alliance-coverage-phase-1.md` explique que la version varie avec les mouvements de membres et que le préfixe `aid` est la partie stable employée pour regrouper des sessions. Les empreintes de ces `aid` sont seules écrites dans les synthèses de couverture R2. Le manuel API projet (édition du 5 novembre 2026) documente les routes `/player/v1/alliance/card` et `/player/v1/alliance/{allianceId}/card`, de même que les réponses `AllianceCard` et `AllianceMemberInfo`.

**Conclusion :** un identifiant d’alliance fourni par Scopely est disponible et sa partie stable est définie dans la documentation et le code du service : `AllianceCard.id`, sous-partie `aid` avant le séparateur `:`. Il peut être stocké ultérieurement comme `officialAllianceId` après réception d’une preuve d’appartenance à une fiche précise. Aucun de ces identifiants bruts n’a pu être relié aux 28 noms des captures dans cette phase; les `officialAllianceId` des 28 fiches restent donc `null`.

À ne pas confondre :

- `aid` : partie stable de l’identifiant officiel d’alliance.
- `member_version` : suffixe technique qui varie avec l’effectif; ne pas utiliser comme identité.
- `AllianceMemberInfo.id` : ID de membre/joueur, pas ID d’alliance.
- `groupId` : champ de groupement présent dans d’autres structures MSF, par exemple certains raids; ce n’est pas une identité d’alliance.
- `allianceFingerprint` : SHA-256 interne du service pour regrouper ou autoriser des traitements privés; ce n’est pas l’ID officiel brut et n’est pas publié comme ID interne LoSP.
- `wi-…` : ID interne stable des Renseignements de guerre, conservé par le nouvel annuaire.
- Nom/alias : libellé observable, susceptible d’être décoré ou modifié; jamais utilisé seul pour fusionner.

Le dépôt décrit `roster-batches/v1/` comme des archives R2 privées avec rétention limitée, mais la session Cloudflare disponible ne liste que le bucket privé `losp-roster-sessions`. Les réponses brutes d’AllianceCard ne sont donc pas accessibles ici pour vérification directe. Les seules lectures Cloudflare effectuées ont listé le compte et ses noms de buckets; aucun objet R2 privé ni jeton n’a été ouvert.

## Sources contrôlées

- `docs/data/war-intelligence.json` et `docs/data/WAR-INTEL-README.md` dans `Keryas777/msf`.
- `workers/msf-cosmic-defenses/worker.js`, `workers/msf-cosmic-defenses/test/war-intelligence.test.mjs`, `docs/renseignements-guerre.js`, `docs/admin-renseignements-guerre.js`.
- `docs/war-results-vision-data.js`, `docs/war-history.js`.
- `src/alliance-coverage.js`, `src/coverage-test.js`, `src/private-roster-batches.js`, `src/public-trophy-history.js` dans `Keryas777/losp-roster-service`.
- `docs/multi-alliance-coverage-phase-1.md`, `docs/guest-alliance-collectors-2026-11-04.md`, `docs/roster-sync-roadmap-2026-10-18.md` dans `Keryas777/losp-roster-service`.
- Manuel des endpoints fourni : routes d’alliance documentées pages 8 et 15, structures d’alliance page 23.

## Limites de transcription du premier lot

Les sept captures fournies couvrent les 28 lignes. Elles ne sont pas copiées dans GitHub. Les couleurs de segment sont estimées visuellement depuis les captures; elles peuvent varier légèrement du pixel réel. Les caractères décoratifs de SOVEREIGN REIGN, MARINES, Galaxy Rangers et Green STAR et les suffixes DTA ont des notes de vérification dans les fiches. Les dates d’observation sont laissées absentes (`null`), car aucune date historique ne figurait dans les captures.
