# MSF Codex: automatisation et surveillance

Le workflow des capacités vérifie chaque jour à 21:45 UTC les onze révisions `combat_data` de MagneticZero. Le collecteur existant ne télécharge que les révisions nouvelles; il valide leur schéma et leurs empreintes SHA-256/MD5, conserve les contenus inchangés et écrit les changements de façon atomique. Une source vide ou en erreur ne supprime rien.

Une modification de source lance les CLI existantes du parser, normalizer, indexer, Web Publisher et Explorer Builder. Les suites de non-régression sont exécutées et chaque étape passe ensuite son contrôle `--check`. Les générations demeurent immuables; aucune reconstruction ou publication n’est faite si les données métier sont identiques. Le workflow partage `main-data-writer` avec les collectes qui écrivent sur `main`.

À chaque passage, un audit compare `docs/data/msf-characters.json`, la source de présentations françaises et la génération Explorer publiée. Le rapport distingue source absente, source incomplète et donnée disponible mais mal intégrée; il est ajouté au résumé GitHub Actions. Les capacités renforcées sont exclues du contrôle des quatre capacités principales.

Le builder prend désormais `player_Character` dans le catalogue des personnages pour définir la jouabilité. « Présentation officielle » reste un statut distinct. Cela corrige le faux `playable: false` de Dracula. La génération publiée vérifiée le 20 octobre 2026 n’avait toutefois pas ses quatre présentations FR: la collecte MagneticZero ne récupère que les onze fichiers `combat_data`, et le collecteur de personnages ne récupère que les identifiants, portraits et métadonnées de jouabilité. Ces sources ne fournissent pas ses noms, descriptions françaises, icônes de capacités et niveaux maximaux.

Le rapport signalera Dracula et les prochains cas équivalents sans inventer de valeurs. L’automatisation de la source FR reste à connecter à un export officiel vérifié ou un mécanisme autorisé de collecte de l’API publique; les données `/game/v1/` ou `combat_data` ne sont pas supposées équivalentes. Pour une panne MagneticZero, l’ancienne génération reste en place; une base Chrome n’est acceptée qu’en secours manuel explicite.


## Mise à jour des présentations françaises (raccordement sous validation)

Le script `scripts/update_msf_presentations_fr.py` tente la lecture seule de
`https://api-prod.marvelstrikeforce.com/services/api/getCharacterAbilities?lang=fr`.
La variante `lang=fr` n'a pas encore fait l'objet d'une validation de réponse
réelle : la présence du paramètre ne prouve pas la langue des données. Avant
d'écrire `data/msf-capabilities/raw/msf-character-abilities-fr.json`, le script
vérifie le schéma, les quatre capacités, les icônes et niveaux ainsi que la
continuité française avec les présentations déjà connues. En cas d'échec, de
traduction non prouvée ou de capacité incomplète, l'ancienne version est conservée.

Le workflow teste cette source séparément de MagneticZero, ne reconstruit le
Codex que sur changement sémantique validé et journalise les échecs sans
supprimer les données existantes.

**Preuve R2 :** l'audit Roster Service du 19 octobre 2026 établit un
HTTP 200 et un archivage de `getCharacterAbilities` sans paramètre de langue.
Il ne prouve pas que cette archive contient les capacités françaises de Dracula.
Le stockage R2 étant privé, son contenu n'a pas été consulté lors de cette PR.
Ne pas déclarer la collecte FR opérationnelle avant une réponse réelle validée.

Un export R2 peut être vérifié sans appel réseau :
`python -m scripts.update_msf_presentations_fr --source-file export-r2.json`.
L'option `--apply` autorise une écriture atomique seulement après validation.
Aucun secret R2 ou OAuth n'est requis dans le dépôt. Respecter également les
conditions Scopely de conservation maximale de 30 jours pour les données API.
