# Challenges LoSP — Correctif « guides dans l'application »

Date : 17 octobre 2026

## Pourquoi ce correctif

La version précédente affichait avant tout des liens externes et des cartes d'auteurs, alors que l'objectif validé est de présenter **des conseils en français avec portraits directement dans LoSP**. Ce correctif supprime cet affichage externe.

## Fonctionnement de la page

- Le JavaScript charge uniquement `challenges.json`, `msf-characters.json` et le nouveau petit fichier `challenge-alternatives.json`.
- Aucune URL de Marvel Church, Reddit, MSFWAR ou MSF Base n'est chargée dans le moteur d'affichage.
- Les métadonnées et les liens du registre international restent **hors interface** dans `challenge-guide-sources.json`, conservé pour le travail éditorial ultérieur.
- Les variantes de joueurs deviennent des cartes LoSP avec portraits, pas des liens externes. Elles indiquent les compositions partielles ou reconstruites.
- Le sélecteur de mission/nœud reste en place. L'accueil de LoSP n'est pas modifié.

## Couverture réelle

**29 événements répertoriés**, dont **12 avec au moins une fiche structurée** et **17 sans fiche détaillée**.
**142 fiches au total**, dont 81 fiches ou sections nouvelles par rapport à la base de 61 précédemment publiée.

| Événement | Fiches / sections | Niveau de preuve |
| --- | ---: | --- |
| Tour de Blade | 6 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Tour de Spider-Man : Descente | 40 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Tour de la Peur | 20 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Surfer d'argent (Briseur) | 10 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Scorpion (Briseur) | 10 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Première Briseuse : Magik | 10 | Recommandations de préparation |
| Dimension noire VIII | 5 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Dimension noire IX | 6 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Invasion : Quasar | 10 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Invasion : Blastaar | 10 | Stratégies synthétiques ; certaines compositions restent à confirmer |
| Finding Xavier : Race to X | 5 | Recommandations de préparation |
| Target : Blue Marvel | 10 | Recommandations de préparation |

### Guides restant à enrichir

- Évasion de Kyln : Code Blazes
- Évasion de Kyln : Code Whiplash
- Tour de Tornade
- Tour de Guerre
- Évasion de Kyln : Polarity Shift
- Épreuves du Roi d'ombre
- Épreuves d'Old Man Logan
- Épreuves du Bouffon vert (Classique)
- Épreuves de Black Cat
- Épreuves de Nova
- Dimension noire 1
- Dimension noire 2
- Dimension noire 3
- Dimension noire 4
- Dimension noire 5
- Dimension noire 6
- Dimension noire 7

Le guide Quasar a 10 missions détaillées, alors que sa progression a été prolongée : les 6 missions supplémentaires restent volontairement « À compléter ». Finding Xavier utilise 5 recommandations de **sections**, sans prétendre fournir plus de 50 nœuds de combat.

## Prudence sur les données

- Chaque composition utilise des IDs jouables de `msf-characters.json`.
- Les conseils sont des **synthèses originales et courtes**, pas des transcriptions complètes de pages tierces.
- Une équipe suggérée pour une section n'est **pas** systématiquement une victoire démontrée. Le champ `strategyKind` et les notes explicatives distinguent ces cas.
- Plusieurs sources externes ne sont pas encore entièrement vérifiées. Leur présence dans le registre éditorial ne signifie **pas** que leur contenu a été traduit.
- Les tests réalisés sur cette branche sont des contrôles statiques et des simulations DOM. Tests manuels à faire sur Safari iOS, Chrome Android et navigateur Discord.

## Prochaine phase de travail

Compléter progressivement les 17 événements restant sans détail, puis approfondir les descriptions succinctes déjà ajoutées, sur la base de compositions et de tactiques de combat individuellement vérifiées. Aucun texte, nœud ou personnage ne doit être inventé pour combler les trous.
