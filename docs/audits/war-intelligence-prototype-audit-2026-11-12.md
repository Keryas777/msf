# Renseignements de guerre — audit et prototype (étape A)

Date de vérification : 12 novembre 2026. Références : branches `main` des dépôts `Keryas777/msf` et `Keryas777/losp-roster-service`, manuel LoSP MSF API du 5 novembre 2026, code des routes et fichiers réellement présents.

## Résultat de l’audit frontend

- L’accueil actif est `docs/home.html`, avec tuiles image dans `home.css`. Les pages Évolution et Dimensions noires reprennent `style.css`, le garde d’authentification `auth-guard.js`, un CSS propre à la page et une navigation retour/accueil.
- Les couleurs communes sont un fond presque noir, panneaux translucides, bordures discrètes et texte clair. Les pages Guerre les plus abouties utilisent aussi des panneaux bleu nuit, cyan, des accents violet/ambre, des zones tactiles d’au moins 44–50 px et des règles `prefers-reduced-motion`.
- L’application démarre sur `home.html`; le manifeste conserve l’orientation portrait. `sw.js` versionne le cache et utilise réseau d’abord pour HTML, JS/CSS et JSON. Le prototype ajoute ses fichiers à la liste de pré-cache et incrémente cette version.
- `docs/war-counter-lab-*` et la spécification Vision concernent la segmentation/reconnaissance de portraits de personnages après combat. Ce n’est pas un OCR de nom d’alliance; le prototype n’essaie pas de détourner ce pipeline.

## Accès et infrastructure vérifiés

- Le connecteur GitHub a pu lire les deux dépôts et leur branche `main`; une branche isolée a été créée pour le prototype.
- Le connecteur Cloudflare a identifié le compte et lu la liste des ressources : bucket R2 `losp-roster-sessions` et Worker `losp-roster-service` présents. Le manifeste Wrangler confirme que le Worker utilise ce bucket, un Durable Object et les routes existantes.
- Le connecteur Cloudflare de cette session permet de lire les métadonnées de compte, de Worker et de bucket, mais pas de lister/lire directement les objets du bucket. Les données d’objet réelles n’ont donc pas été inspectées via l’API R2. Aucun objet, secret ou enregistrement n’a été modifié.
- Les routes `/admin/*` sont protégées par Cloudflare Access. `admin-auth.js` valide côté Worker la signature et les claims du JWT Access, puis l’adresse email par rapport à l’allowlist serveur. Le navigateur ne peut pas autoriser une écriture simplement en affichant ou masquant un bouton.

## Alliances, classements et API MSF

| Élément | Preuve observée | Portée et limites |
|---|---|---|
| Fiche d’alliance d’une session autorisée | `src/alliance-coverage.js` appelle `GET /player/v1/alliance/card`; extrait `id`, nom, rangs guerre/raid, trophées guerre et ligue. Le code traite l’ID comme `aid:member_version` et ne conserve que la partie stable avant `:`. | Une session OAuth retourne l’alliance associée à cette session; cela n’énumère pas les autres alliances. Le nom est une chaîne Unicode, sans donnée de segment coloré dans la projection locale. |
| Captures de rangs existantes | `scanPrivateAllianceRanks()` parcourt les sessions capitaines disponibles; l’outil de capture filtre les identifiants LoSP/invités explicitement approuvés. `src/alliance-season-ranks.js` conserve les instantanés sous `roster-batches/v1/season-ranks/`. | Ce n’est pas mondial. La capture a `seasonId: null` et le code précise que `warTrophies` n’est pas le score de saison. Les captures utilisent la rétention R2 existante de 7 jours. |
| Carte par identifiant | Le manuel documente `GET /player/v1/alliance/{allianceId}/card` avec droits requis. | Il faut déjà connaître l’identifiant et disposer des droits nécessaires; ce n’est pas une recherche mondiale anonyme. |
| Alliances recruteuses | Le manuel documente `GET /player/v1/alliance/recruiting/recruiters`, qui renvoie des `AllianceCard[]`; paramètres `search`, `warLeague`, `warZone`, langue et autres filtres. | Liste partielle des alliances qui se déclarent recruteuses et soumise au contexte/droits du joueur. Ce n’est pas un classement mondial ni un substitut à l’annuaire historique LoSP. Aucune collecte n’a été lancée. |
| Identifiants, noms et présentation | Le code dérive un identifiant stable depuis le champ `id` de la fiche. Il ne conserve localement que les champs explicitement sélectionnés ci-dessus. | Le manuel fourni ne documente pas de route de classement mondial, de recherche générale alliance par nom, ni de champs de segments colorés/emblèmes dans cette projection. La fidélité visuelle Unicode/couleurs ne peut pas être garantie par la collecte actuelle. |
| Archives alliées publiées | Les archives R2 et routes publiques existantes examinées portent sur des classements déjà approuvés, des trophées, l’Arène et des données de membres; aucun recensement mondial d’alliances n’est déclaré par ces sources. | Les projections publiques ne doivent pas être extrapolées en classement mondial. Le contenu réel des objets R2 n’a pas pu être lu dans cette session. |

**Conclusion d’architecture :** garder l’annuaire historique local, à croissance progressive, avec identifiant interne indépendant du nom. Enrichir plus tard un enregistrement seulement quand une identité officielle est vérifiée. Ne pas fusionner des homonymes. La liste « recruteuses » peut aider à retrouver certaines alliances, mais sa disponibilité et ses filtres ne justifient pas de précharger un annuaire mondial.

## Prototype livré

- Nouvelle page autonome reliée à une tuile de l’accueil, sans modification des outils de débrief, War Counters ou contrats de guerre.
- Carte interactive 3 colonnes × 4 rangées : 3 Ponts d’envol fixes et les 9 salles intérieures, sans doublon.
- Trois modes : vue générale, bonus émis, bonus reçus. Une sélection de salle met en évidence les cibles; les connexions adjacentes utilisent seulement les côtés haut/bas/gauche/droite. Les Ponts d’envol ne produisent aucun effet et reçoivent le global de démonstration de la Caserne.
- Fiche contextuelle sous la carte, indications de portée, panneau d’observation, légende et signalement explicite du caractère fictif.
- Rendu mobile portrait en 3 colonnes et adaptation large écran. Effets limités, sans dépendance framework, avec prise en compte de `prefers-reduced-motion`.
- Les descriptions d’effets sont illustratives à partir de la capture fournie; le ciblage et les formulations doivent être vérifiés avant d’en faire des règles de production. Aucun effet n’est déclaré source officielle.
- Aucune reconnaissance OCR, saisie, API, écriture R2 ou donnée réelle dans cette étape.

## Vérifications prévues / limites de validation

- Vérifier la syntaxe JavaScript, les 12 emplacements, leurs 9 identifiants de salle uniques, les trois modes, les règles d’adjacence, l’absence d’écriture réseau et les liens/cache PWA.
- Une validation graphique sur navigateurs de production et de véritables appareils iPhone/Android n’est pas disponible depuis cet environnement de travail; la capture locale dépendra de l’aperçu de la branche et ne constitue pas un test matériel.
- Étape B non commencée. Les décisions sur les règles exactes, le modèle d’identité et les API de stockage restent en attente de validation du prototype.
