# Politique éditoriale LoSP — Épreuve cosmique : français prioritaire

Cette politique concerne toutes les règles : règle globale et salles 1 à 6. Elle s'applique à tous les effets et déclencheurs (buffs, debuffs, cible, activation, états, modificateurs, classes ISO-8 et effets spécifiques).

## Priorité des sources

1. Version officielle Scopely réellement rédigée en français, et terminologie du client du jeu en français, lorsqu'elles existent.
2. Sans texte officiel français de la règle : version officielle anglaise pour vérifier précisément la mécanique, accompagnée de la terminologie française attestée dans les sources françaises officielles du jeu.
3. Sources communautaires en français pour éclairer les interprétations ou les traductions non couvertes, mais sans remplacer une mécanique officiellement documentée sans vérification.
4. En cas de contradiction entre documents officiels français et anglais : documenter l'écart, vérifier la règle en jeu, ne pas inventer ni corriger silencieusement.

Attention : une URL contenant /fr/ ne prouve pas que son contenu est en français. Vérifier le texte effectivement affiché. Ne jamais traduire littéralement les noms de debuffs et effets.

## Revue obligatoire pour une nouvelle saison

Chaque configuration de prochaine saison contient une propriété localizationReview avec :
- policy : fr-first
- status : reviewed
- rules : sept entrées global, room-1 à room-6

Pour chaque entrée, documenter : frenchOfficialChecked=true, frenchTerminologyChecked=true, les sources OFFICIELLES consultées (avec URL, authority=official, contentLanguage=fr ou en et contentVerified=true), ainsi que selectedSourceUrl.

Quand une règle officielle française existe parmi les sources vérifiées, elle doit être sélectionnée. Si elle n'existe pas, conserver la source anglaise officielle et écrire un fallbackExplanation expliquant les vérifications françaises. Une source communautaire peut compléter la terminologie, mais pas devenir source de vérité de la mécanique.

Exemple d'entrée d'une salle lorsque seul le texte anglais officiel est disponible :

    {
      "frenchOfficialChecked": true,
      "frenchTerminologyChecked": true,
      "sources": [
        {
          "url": "https://marvelstrikeforce.com/en/updates/exemple-officiel",
          "contentLanguage": "en",
          "authority": "official",
          "contentVerified": true
        }
      ],
      "selectedSourceUrl": "https://marvelstrikeforce.com/en/updates/exemple-officiel",
      "fallbackExplanation": "Aucune traduction française officielle trouvée après vérification ; termes français du jeu contrôlés séparément."
    }

Le script scripts/cosmic-localization.mjs impose les sept revues avant que scripts/roll-cosmic-season.mjs puisse archiver l'ancienne saison et réinitialiser les contres et défenses. Le contrôle automatique ne prouve pas à lui seul la fidélité d'une traduction : les déclarations doivent être sincèrement vérifiées par un humain.

## Saison 25 : situation réelle

Référence mécanique officielle : https://marvelstrikeforce.com/en/updates/blog-update-9-30-26

L'annonce figure dans l'index du site en français, mais une traduction française intégrale de ses sept règles n'a pas été confirmée. Ne pas déclarer les sept traductions « officiellement validées » sans examen supplémentaire.

Pour les termes ISO-8, une référence française Scopely vérifiée est : https://marvelstrikeforce.com/fr/updates/iso-8-blue

Ces règles de priorité s'appliquent aussi aux saisons futures : elles ne doivent pas modifier automatiquement les libellés de la saison active sans nouvelle vérification.
