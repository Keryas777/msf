# Saisons de l'Épreuve cosmique LoSP

## Saison courante

Au 17/10/2026 : **Saison 25 — Artificial Dread**. Source officielle Scopely :
https://marvelstrikeforce.com/en/updates/blog-update-9-30-26

- Défenses ouvertes : **14/10/2026 21:00 UTC** (14h PDT).
- Premier combat : **16/10/2026 21:00 UTC** (14h PDT).
- `docs/data/cosmic-config.json` : identité de saison, dates, règle globale et règles des six salles.
- `docs/data/cosmic-counters.json` : contres actifs **uniquement** de cette saison.
- `docs/data/cosmic-defenses.json` : défenses publiées **uniquement** de cette saison.
- `docs/data/cosmic-next-season.json` : `null` tant que la prochaine saison n'a pas été officiellement documentée.

Chaque contre ou défense doit contenir `"season": "season-25"` (ou saison courante correspondante). Les deux interfaces ignorent les entrées d'une autre saison. Les contres de guerre demeurent indépendants.

## Détection, contrôle, archivage et nouvelle saison

Le workflow `.github/workflows/cosmic-season.yml` se déclenche chaque heure et manuellement.

1. Il inspecte les titres de l'index officiel des actualités pour **signaler** une possible saison suivante, en créant une issue GitHub à contrôler. Une annonce trouvée ne provoque jamais une suppression.
2. Dès que Scopely publie la saison suivante, vérifier manuellement ses dates (UTC), ses règles globales, les six règles de salles et son URL officielle. Renseigner **l'objet de configuration complet** dans `cosmic-next-season.json` et le merger (PR).
3. À l'heure officielle `season.startAt`, le workflow exécute `scripts/roll-cosmic-season.mjs` :
   - archive **sans modification** la configuration, les contres et les défenses actifs dans `docs/data/cosmic-archive/season-N/` ;
   - remplace la configuration active par celle de N+1 ;
   - vide les deux tableaux actifs ;
   - remet `cosmic-next-season.json` à `null` ;
   - publie ces changements **dans un seul commit GitHub**.
4. Si dates/règles/source/numéro manquent, si une archive existe ou si des entrées sont mal étiquetées, **pas de basculement** : le workflow échoue sans publier une réinitialisation incomplète.

Ce fonctionnement est volontairement conservateur : **il ne peut pas inventer les règles d'une saison non encore publiée**. L'identification automatique des titres officiels est un signal non fiable, pas une validation des règles. La préparation du JSON de la nouvelle saison nécessite donc une revue humaine.

### Brouillons

Les brouillons de défense sont stockés en localStorage avec une clé par saison :
`losp:cosmic-defense-draft:v1:season-N`. Les anciens brouillons saison 25 sont récupérés via l'ancienne clé ; les brouillons saison 25 ne sont pas réutilisés en saison 26. Les brouillons locaux ne sont pas publiés ni archivés sur GitHub : seules les défenses validées et présentes dans le JSON le sont.


### Terminologie française ISO-8 (source officielle)

Ne pas traduire les noms de classes ISO-8 littéralement depuis l'anglais : employer **les intitulés français officiels de MSF**. Correspondances vérifiées dans l'article Scopely « Présentation de l'iso-8 P2 » :

| Anglais (données Scopely) | Français (jeu) |
| --- | --- |
| Striker | Attaquant |
| Fortifier | Fortificateur |
| Healer | Soigneur |
| Skirmisher | Tirailleur |
| Raider | **Fantassin** |

Source française : https://marvelstrikeforce.com/fr/updates/iso-8-blue

Exemple saison 25, salle 2 : **Tirailleur** (Skirmisher) et **Fantassin** (Raider). Le terme « Pillard » est une mauvaise traduction pour la classe Raider et ne doit pas apparaître dans les règles de salles. Lors de la préparation du JSON d'une nouvelle saison, vérifier les libellés français avec la terminologie du jeu, sans modifier le fonctionnement des mécaniques.

### Ajouter des contres / des défenses

Toujours préciser l'identifiant de saison actif dans les objets JSON, par exemple :
`{"season":"season-25","room":1,...}`. Ne jamais importer automatiquement les contres de guerre ou du tournoi Ultimate 32.

### Vérifications

```bash
node --test tests/cosmic-static.test.mjs tests/cosmic-season-lifecycle.test.mjs
node scripts/roll-cosmic-season.mjs
```

La dernière commande affiche `{"status":"no-pending"}` tant que la prochaine saison est inconnue. Le répertoire d'archives est versionné et doit rester consultable.
