# Audit des provenances et séparation des stratégies PvE — 17 octobre 2026

## Constat

Le schéma d'origine ne portait que **une composition `characters` et un texte `advice` par nœud**, plus un tableau de **40 alternatives** indépendant. Cela favorisait l'amalgame entre plusieurs publications et empêchait de déterminer avec certitude à qui attribuer chaque tactique.

Le catalogue éditorial (`challenge-guide-sources.json`) classe des URL à l'échelle d'un **événement** ; même `editorialRef`, présent dans 34 événements, **ne prouve pas la provenance d'une étape**. Attribution nominative à une source non justifiée = à éviter.

## Migration effectuée

- `docs/data/challenges.json` conserve l'organisation **mode → événement → nœud**, avec `id`, `title`, `requirement` et `unit` lorsqu'il était présent, ainsi que les résumés/notes des événements.
- `docs/data/challenge-strategies.json` contient **377 versions** distinctes : **337 anciennes fiches** et **40 variantes**.
- **39 nœuds** disposent d'au moins deux versions ; maximum **3**. Une ancienne équipe n'est jamais fusionnée avec l'alternative de Rayge ou un autre contributeur.
- Chaque version dispose de son identifiant stable, équipe, portraits, actions, difficulté indiquée, type de parcours, notes, références internes et alertes de qualité.
- Les anciennes données ne sont pas « validées » par la migration : toutes les versions sont `review.status = needs_source_audit`.
- `challenge-alternatives.json` demeure conservé comme source historique de migration, mais **n'est plus téléchargé par la page**.
- Le JS ne charge que `challenges.json`, `msf-characters.json` et `challenge-strategies.json`. Les URL et auteurs restent exclusivement dans le catalogue éditorial **non chargé par les joueurs**.

### État de la provenance

| État de la version | Nombre | Signification |
| --- | ---: | --- |
| Aucune attribution de nœud vérifiable | 348 | Ne pas présenter une origine présumée comme certaine |
| Correspondance exacte dans le catalogue | 29 | Même événement/nœud, personnages et nom d'équipe ; **pas** une preuve de victoire |

Les correspondances sont des **recoupements entre deux fichiers LoSP déjà produits**, non des validations des pages externes. En particulier, une source indexée peut être ancienne, inaccessible ou concerner une difficulté différente.

### Drapeaux de qualité

- `source_not_attributed_to_this_node` : **348** versions
- `recommendation_not_a_proven_clear` : **89** versions
- `partial_or_unspecified_team` : **53** versions
- `no_source_verified_tactical_steps` : **40** versions
- `reference_match_not_independently_checked` : **29** versions
- `historical_strategy` : **25** versions
- `expanded_using_current_losp_team_members` : **16** versions
- `three_versus_five_team_size_conflict` : **5** versions
- `possible_editorial_reconstruction` : **4** versions
- `tactics_name_heroes_not_in_displayed_five` : **1** versions
- `source_context_needs_reconstruction` : **1** versions
- `second_attack_context` : **1** versions

Les drapeaux sont indépendants et peuvent s'appliquer à la même version.

## Exemples prioritaires à réauditer

1. **Shadow King, mission 1, version 1** : les notes évoquent Old Man Logan et Deathpool, qui ne figurent pas dans les cinq portraits. La présence de ces noms n'est pas en elle-même une erreur si l'on évoque une mission ultérieure, mais le guide doit **expliquer explicitement le contexte** ; actuellement ce n'est pas établi. Avertissement ciblé intégré.
2. **Kyln Code Blazes, cellules 1–5** : contradiction « trio » / « cinq membres conseillés ». Ne jamais remplir arbitrairement les deux places ou afficher un groupe de cinq comme éligible sans vérification.
3. **DD8 / DD9** : les variantes sont souvent des recommandations éditoriales et non des victoires contrôlées. Vérifier les restrictions et le niveau d'équipement avant de les nommer « stratégie victorieuse ».
4. **Scourges et DD6** : parcours historiques, parfois fondés sur une méta ancienne. La présence d'un portrait jouable ne prouve pas l'admissibilité réelle.
5. **Spider-Man Tower, étages 31–40** : correspondance au catalogue pour plusieurs alternatives, mais **16 équipes de la collection globale** utilisent des membres reconstruits depuis le roster d'équipes LoSP. Réobserver les démonstrations pour fixer les cinq personnages et les rotations.
6. **Quasar 11–16, Code Blazes 6–20** : aucun texte inventé. Ces nœuds restent en attente.

## Règle de rédaction obligatoire pour les prochaines versions

1. Vérifier l'événement, la difficulté, les restrictions, l'étage/nœud et la date ou édition de **chaque source**.
2. Créer **une nouvelle version par stratégie réellement distincte**, sans emprunter sa composition, ses cibles ou son ordre d'actions à une deuxième publication.
3. Conserver le ou les `sourceIds` du catalogue interne **uniquement** quand la correspondance du combat est établie ; noter explicitement `not_established` sinon.
4. Distinguer **victoire observée**, **victoire rapportée**, **recommandation**, **reconstitution éditoriale** et **parcours historique**. Ne pas classer automatiquement un ancien `walkthrough` comme prouvé.
5. Retranscrire **les restrictions, cinq personnages réellement mentionnés ou équipe partielle, cibles prioritaires, compétences, ordre de jeu, conditions et substitutions** uniquement lorsqu'ils sont documentés. Un guide général reste général.
6. Traduire et reformuler les conseils d'une source **sans amalgamer plusieurs versions**. Les désaccords entre auteurs doivent devenir des versions séparées.
7. Après revue manuelle, passer `review.status` à `source_checked` et renseigner les références internes sans inventer d'URL ; conserver les avertissements pertinents.
8. Vérifier les traits et les capacités dans le jeu, puis seulement qualifier une solution de validée par combat.

## Contrôles effectués

- **34 événements** et **337 nœuds** conservés.
- Migration de toutes les clés tactiques existantes : **0 discordance(s), 0 élément(s) manquant(s)**.
- **377 identifiants uniques**, tous rattachés à un nœud de la base.
- Vue multiple testée sur Spider-Man 31, Fear 4, Kyln Whiplash 1, Shadow King 10, DD8 Ville héros, et une version seule sur Blade 1.
- Nœuds vides futurs testés sur Kyln Code Blazes 20 et Invasion Quasar 16.
- Simulations DOM : navigation directe, portraits, état terminé et **aucun lien externe**.
- Les tests de simulation ne remplacent **pas** la validation visuelle sur iOS Safari, Android Chrome ou navigateur Discord.

## Périmètre

Pas d'intégration à `home.html`, pas de modification du Service Worker, des mécanismes de guerre, des rosters ou des workflows. Projet statique GitHub Pages, sans framework.
