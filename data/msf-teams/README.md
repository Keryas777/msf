# Audit des équipes MSF — génération indépendante

Ce chantier produit une **proposition**, jamais un remplacement automatique du
catalogue utilisé par la Web-app. L'onglet Google Sheets **Teams** et le workflow
fetch-teams.yml continuent seuls à alimenter docs/data/teams.json.

## Exécution

Depuis la racine du dépôt :

    node --test tests/msf-team-candidates.test.mjs tests/msf-release-monitor.test.mjs
    node scripts/generate-teams-candidates.mjs

Ou exécuter le workflow manuel « Audit automatic MSF team candidates ». Les PR
touchant le générateur exécutent aussi les tests, la génération et déposent
deux fichiers en artefacts GitHub Actions.

## Sources et sorties

Le générateur lit les **données déjà collectées** :
- docs/data/msf-characters.json : IDs exacts et jouabilité ;
- data/msf-capabilities/raw/characters.json : traits et conditions de capacités ;
- docs/data/teams.json : **comparaison uniquement**, jamais en entrée de génération.

Il réutilise le filtre générique et la jointure vérifiée de
update-msf-release-history.mjs ; il ne réalise aucun nouvel appel réseau.

Sorties de diagnostic (non consommées par les pages) :
- docs/data/teams-generated.json : propositions (team, mode, characters) ;
- data/msf-teams/teams-audit.json : groupes détectés, signaux et écarts.

Les candidats ont de **3 à 8 personnages**. Un mode est proposé uniquement si
au moins la moitié des membres (minimum 2) ont des conditions explicites
correspondantes. Un personnage n'est compté qu'une fois par mode, quel que soit
le nombre de capacités mentionnant ce mode. Les doublons exacts
composition+mode sont dédupliqués. Le nom est déduit du trait interne et peut
donc nécessiter une traduction éditoriale.

Correspondances des conditions :
- AVA / WAR → Guerre ;
- RAID → Raid ;
- TOURNAMENT / CRUCIBLE → Epreuve ;
- BATTLEWORLD → Battleworld.

La présence d'une condition combat_side *dans la même expression que le mode
Guerre* est conservée comme **indice**, pas comme classement attaque/défense
définitif. Les capacités peuvent contenir simultanément des branches attaque
et défense. L'**Arène** n'est pas attribuée automatiquement : l'absence de
bonus conditionnel explicite n'est pas une preuve de destination Arène.

## Pourquoi il faut valider les différences

- Un trait peut regrouper **plus de cinq** personnages, sans préciser les
  cinq conseillés.
- Un personnage peut posséder **plusieurs** traits d'équipe.
- Certains traits peuvent représenter des catégories larges plutôt qu'une
  équipe jouable.
- Le mode d'un bonus ne prouve pas à lui seul le meilleur mode stratégique.
- Plusieurs modes possibles peuvent être proposés pour une même composition.
- Les entrées Divers, les équipes hors méta et les compositions personnalisées
  sont des décisions éditoriales.

referenceExactCompositions compte les entrées de Sheets dont la composition
correspond exactement à un groupe candidat, **indépendamment du mode**.
referenceExactGenerated exige **composition et mode identiques**. Le rapport
referenceMissing liste les lignes non reproduites et leur groupe le plus
proche. Ne pas considérer le pourcentage de concordance comme une validation
automatique d'une future migration.

**Étape suivante, non activée :** comparer le rapport réel avec les 55 lignes
actuelles ; enrichir les règles de validation / exceptions documentées ;
ensuite seulement envisager une bascule contrôlée de teams.json.
