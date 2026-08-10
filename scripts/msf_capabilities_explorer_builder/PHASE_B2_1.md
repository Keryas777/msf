# Phase B2.1 — Hiérarchie joueur, branches techniques et occurrences partagées

## Contrat

`AbilityPresentation 2.0.0` sépare :

1. `playerPhases`, unités de lecture visibles ;
2. `branches`, sous-sections conditionnelles, modales ou liées aux triggers ;
3. `occurrences`, table canonique indexée par `sourceActionId`.

Chaque référence d'occurrence apparaît une seule fois dans une phase joueur ou
dans `unassignedOccurrenceRefs`. Chaque branche ne référence que des occurrences
de sa phase. Les opérations, cibles, destinataires, conditions, contrôles, flags,
paramètres non interprétés et pointeurs source restent attachés à l'occurrence.

## Regroupement

Une phase est ouverte par une fonction joueur forte : cible principale,
enchaînement, rebond, répétition, bonus, invocation, transfert, soin/protection,
attaque/défense ou déclenchement passif. Les différences de condition, contrôle,
index arbitraire et dépendance précédente restent des branches. Les passifs sont
regroupés par grande fonction ; leurs triggers deviennent des sous-sections.

Un groupe sans texte ni fonction sûre est nommé `Mécanique non interprétée` et
absorbe ses branches au lieu de créer une carte par action. Aucun texte officiel
ne crée une occurrence mécanique. `LockedDebuff` reste distinct de Trauma.

## Seuils bloquants

Le builder refuse une présentation avec plus de 12 phases, un ratio phases/actions
supérieur à 0,60 pour au moins 8 actions, plus de 60 % de phases mono-action pour
au moins 8 actions, plus de trois labels fallback ou une violation safety.

## Frontend

Le rendu affiche une carte par phase joueur puis des branches repliables. Les
occurrences détaillées sont résolues depuis la table canonique dans le panneau
technique. Le texte officiel reste après la mécanique et les variantes safety
restent accessibles uniquement dans les détails techniques.

## Validation locale

- Phases joueur : 8 349 → 2 467.
- Branches techniques : 8 349.
- Phases mono-action : 6 644 → 370 (14,998 %).
- Capacités avec au moins 10 phases : 141 → 0.
- Maximum : 50 → 5.
- Labels fallback : 3 182 → 113.
- Actions conservées : 12 036 ; opérations conservées : 8 657.
- Génération : 60 234 471 octets ; gzip niveau 9 : 7 465 206 octets.
- Plus gros shard : Bucky Barnes, 407 039 octets (36 414 gzip).
- Abomination : 99 658 octets (11 516 gzip), toujours deux phases.
- Build mesuré : 28,574 s ; RSS maximal : 607 748 Kio.
- Python complet : 157 tests, 155 réussis, 2 ignorés, 0 échec.
- Node complet : 71 réussis, 0 ignoré, 0 échec.

Le smoke navigateur réel reste non exécuté : aucun binaire Chromium n'est présent,
le navigateur cloud ne peut pas joindre le serveur local et le téléchargement
Playwright temporaire a retourné une archive vide/tronquée. Il demeure obligatoire
avant toute publication. Les assertions et parcours avec captures sont préparés
dans `tests/codex-browser-smoke.mjs`.
