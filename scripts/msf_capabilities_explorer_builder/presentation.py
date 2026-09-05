"""Controlled, presentation-only vocabulary for the Codex Web artifacts.

These mappings never create gameplay relations. A structured effect is linked
only through its exact upstream effect id; text mentions are literal matches
against the controlled French terms below.
"""

from __future__ import annotations

from typing import Any


SCHEMA_VERSION = "1.2.0"

PROOF = {
    "normalized": {
        "label": "Mécanique vérifiée",
        "explanation": (
            "Le type d’action et les paramètres reconnus sont structurés à "
            "partir des données de combat. Cela ne constitue pas une "
            "simulation complète du combat."
        ),
    },
    "preserved_uninterpreted": {
        "label": "Action détectée",
        "explanation": (
            "L’action existe bien dans les données du jeu, mais sa cible, sa "
            "quantité, sa durée ou certaines conditions ne sont pas "
            "interprétées. N’en déduis pas un comportement non affiché."
        ),
    },
    "official_text_only": {
        "label": "Mention dans le texte",
        "explanation": (
            "La description officielle mentionne cette mécanique, mais aucune "
            "opération structurée correspondante n’a été reliée ici. Le texte "
            "est informatif, pas une preuve mécanique complète."
        ),
    },
}


ABILITY_TYPES = {
    "basic": {"label": "Basique", "order": 10, "base": "basic"},
    "basic_empower": {"label": "Basique renforcée", "order": 11, "base": "basic"},
    "special": {"label": "Spéciale", "order": 20, "base": "special"},
    "special_empower": {
        "label": "Spéciale renforcée",
        "order": 21,
        "base": "special",
    },
    "ultimate": {"label": "Ultime", "order": 30, "base": "ultimate"},
    "ultimate_empower": {
        "label": "Ultime renforcée",
        "order": 31,
        "base": "ultimate",
    },
    "passive": {"label": "Passive", "order": 40, "base": "passive"},
    "passive_empower": {
        "label": "Passive renforcée",
        "order": 41,
        "base": "passive",
    },
}


OPERATION_KINDS = {
    "effect_apply": {"label": "Applique", "order": 10},
    "effect_remove": {"label": "Retire", "order": 20},
    "effect_duration_modify": {"label": "Modifie la durée", "order": 30},
    "effect_transfer": {"label": "Transfère", "order": 40},
    "effect_flip": {"label": "Retourne", "order": 50},
    "ability_energy_generate": {"label": "Génère de l’énergie de capacité", "order": 55},
    "turn_meter_modify": {"label": "Modifie la jauge de vitesse", "order": 57},
    "heal_restore": {"label": "Soigne", "order": 58},
    "barrier_apply": {"label": "Applique de la Barrière", "order": 12},
    "barrier_remove": {"label": "Retire de la Barrière", "order": 22},
    "battlefield_effect_set": {"label": "Active l’effet de champ", "order": 60},
    "battlefield_effect_clear": {"label": "Retire l’effet de champ", "order": 70},
    "spawn": {"label": "Invoque", "order": 80},
    "empower": {"label": "Se renforce", "order": 90},
    "empty_result": {"label": "Résultat vide déclaré", "order": 100},
    "mention": {"label": "Mentions", "order": 110},
    "detected_add": {"label": "Ajoute", "order": 12},
    "detected_remove": {"label": "Retire", "order": 22},
    "detected": {"label": "Actions détectées", "order": 100},
}

TURN_METER_CONTROL_LABELS = {
    "modify_induced_gain": "Réduit les gains provoqués de jauge de vitesse",
    "amplify_induced_gain": "Amplifie les gains provoqués de jauge de vitesse",
    "block_induced_gain": "Empêche les gains provoqués de jauge de vitesse",
    "protect_induced_gain_from_suppression": (
        "Protège les gains provoqués de jauge contre leur suppression"
    ),
    "block_induced_reduction": (
        "Empêche les réductions provoquées de jauge de vitesse"
    ),
    "reduction_immunity": "Immunité à la réduction de jauge de vitesse",
    "block_induced_modification": (
        "Empêche les modifications provoquées de jauge de vitesse"
    ),
    "unresolved": "Contrôle de jauge de vitesse non résolu",
}

TURN_METER_FACETS = {
    "increase": {"id": "turn_meter_increase", "label": "Augmente la jauge de vitesse", "group": "Actions directes", "order": 10},
    "decrease": {"id": "turn_meter_decrease", "label": "Réduit la jauge de vitesse", "group": "Actions directes", "order": 20},
    "contextual_amount": {"id": "turn_meter_contextual_amount", "label": "Montant contextuel de jauge de vitesse", "group": "Actions directes", "order": 30},
    "unresolved": {"id": "turn_meter_unresolved", "label": "Modification de jauge non résolue", "group": "Actions directes", "order": 40},
}

TURN_METER_CONTROL_FACET_IDS = {
    "modify_induced_gain": "turn_meter_modify_induced_gain",
    "amplify_induced_gain": "turn_meter_amplify_induced_gain",
    "block_induced_gain": "turn_meter_block_induced_gain",
    "protect_induced_gain_from_suppression": "turn_meter_protect_induced_gain",
    "block_induced_reduction": "turn_meter_block_induced_reduction",
    "reduction_immunity": "turn_meter_reduction_immunity",
    "unresolved": "turn_meter_control_unresolved",
}

TURN_METER_CONTROL_FACETS = {
    action: {
        "id": facet_id,
        "label": TURN_METER_CONTROL_LABELS[action],
        "group": "Contrôles",
        "order": 100 + order,
    }
    for order, (action, facet_id) in enumerate(TURN_METER_CONTROL_FACET_IDS.items())
}


METRICS = {
    "chancePct": "Chance",
    "energyAmount": "Énergie générée",
    "turnMeterPct": "Variation de jauge de vitesse",
    "specificCharacterTurnMeterPct": "Variation liée aux personnages spécifiques",
    "healAmount": "Soin fixe",
    "sourceMaxHealthPct": "Vie max. du personnage",
    "barrierRemovalPct": "Part de Barrière retirée",
    "useCount": "Quantité indiquée",
    "applyCount": "Nombre d’applications",
    "delta": "Variation de durée",
    "maxDuration": "Durée maximale",
    "sourceRemovalPct": "Part retirée à la source",
    "transferPct": "Part transférée",
    "flipPct": "Chance de retournement",
    "spawnPct": "Chance d’invocation",
    "removePct": "Chance de retrait",
    "useCountPerCrit": "Quantité par critique",
}


MODE_LABELS = {
    "AVA": "Guerre",
    "WAR": "Guerre",
    "RAID": "Raid",
    "TOURNAMENT": "Épreuve",
    "CRUCIBLE": "Épreuve",
    "BATTLEWORLD": "Battleworld",
}

SIDE_LABELS = {"offense": "Attaque", "defense": "Défense"}

RELATION_LABELS = {
    "ally": "allié",
    "enemy": "ennemi",
    "self": "soi",
    "owner": "propriétaire",
}

TARGET_TYPE_LABELS = {
    "all": "toutes les cibles",
    "random": "cible aléatoire",
    "random_repeat": "cible aléatoire",
    "direct_neighbor": "cible adjacente",
    "by_most_stat": "cible ayant la statistique la plus élevée",
    "primary": "cible principale",
}

TRIGGER_LABELS = {
    "on_turn": "À chaque tour",
    "On_turn": "À chaque tour",
    "on_start": "Au début du combat",
    "on_start_early": "Au début du combat",
    "on_start_late": "Au début du combat",
    "below_health": "Sous un seuil de vie",
    "on_death": "À la mort",
    "on_attacked": "Lorsqu’il est attaqué",
    "on_any_turn_end": "À la fin d’un tour",
    "on_any_turn_end_late": "À la fin d’un tour",
    "on_turn_end": "À la fin de son tour",
    "on_turn_end_early": "À la fin de son tour",
    "on_turn_end_late": "À la fin de son tour",
    "on_ability_used": "Lorsqu’une capacité est utilisée",
    "on_turn_late": "À chaque tour",
    "on_turn_early": "À chaque tour",
    "on_debuffed": "Lorsqu’un effet négatif est reçu",
    "on_critical_hit": "Lors d’un coup critique",
    "on_buffed": "Lorsqu’un effet bénéfique est reçu",
    "on_enter_state": "À l’entrée dans un état",
    "on_leave_state": "À la sortie d’un état",
    "on_revive": "À la résurrection",
    "on_kill_other": "Lorsqu’un autre personnage est éliminé",
    "on_kill_target": "Lorsqu’une cible est éliminée",
    "on_successful_hit": "Lors d’une attaque réussie",
    "on_successful_subsequent_hit": "Lors d’une attaque suivante réussie",
    "on_block_success": "Lors d’un blocage réussi",
    "on_dodge_success": "Lors d’une esquive réussie",
    "on_gain_energy": "Lors d’un gain d’énergie",
    "on_gain_energy_for_passives_no_repeat": "Lors d’un gain d’énergie",
    "on_summon": "Lors d’une invocation",
    "on_bleed_tick": "Lors d’un déclenchement de Saignement",
    "on_miss": "Lors d’une attaque manquée",
    "on_debuff_target": "Lorsqu’une cible reçoit un effet négatif",
}


TRAIT_LABELS = {
    "Hero": "Héros",
    "Villain": "Vilain",
    "Global": "Mondial",
    "Cosmic": "Cosmique",
    "City": "Ville",
    "Mystic": "Mystique",
    "Skill": "Compétence",
    "Controller": "Contrôleur",
    "Brawler": "Cogneur",
    "Blaster": "Artilleur",
    "Protector": "Protecteur",
    "Support": "Soutien",
}


# The standard proc ids have stable, exact semantics in the upstream catalog.
# Text terms are deliberately narrower: they enable literal mentions only and
# never cause a structured relation.
EFFECT_PRESENTATIONS: dict[str, dict[str, Any]] = {
    "AbilityBlock": {
        "label": "Blocage de capacité",
        "aliases": ["ability block", "abilityblock", "capablock", "blocage capacité"],
        "terms": ["Blocage de capacité"],
        "description": "Empêche temporairement l’utilisation des capacités actives.",
    },
    "AccuracyDown": {
        "label": "Précision réduite",
        "aliases": ["accuracy down", "accuracydown"],
        "terms": ["Précision réduite"],
    },
    "BuffBlock": {
        "label": "Perturbation",
        "aliases": ["buff block", "buffblock", "disrupted"],
        "terms": ["Perturbation"],
    },
    "DefenseDown": {
        "label": "Défense réduite",
        "aliases": ["defense down", "defensedown"],
        "terms": ["Défense réduite"],
    },
    "DoT": {
        "label": "Saignement",
        "aliases": ["bleed", "dot"],
        "terms": ["Saignement"],
    },
    "HealBlock": {
        "label": "Blocage de soins",
        "aliases": ["heal block", "healblock"],
        "terms": ["Blocage de soins"],
    },
    "ISODoT": {
        "label": "Saignement ISO-8",
        "aliases": ["iso bleed", "isodot"],
        "terms": [],
    },
    "MinorDefenseDown": {
        "label": "Défense réduite mineure",
        "aliases": ["minor defense down", "minordefensedown"],
        "terms": ["Défense réduite mineure"],
    },
    "MinorOffenseDown": {
        "label": "Attaque réduite mineure",
        "aliases": ["minor offense down", "minoroffensedown"],
        "terms": ["Attaque réduite mineure"],
    },
    "OffenseDown": {
        "label": "Attaque réduite",
        "aliases": ["offense down", "offensedown"],
        "terms": ["Attaque réduite"],
    },
    "Silence": {
        "label": "Silence",
        "aliases": ["silence"],
        "terms": ["Silence"],
    },
    "Slow": {
        "label": "Ralentissement",
        "aliases": ["slow"],
        "terms": ["Ralentissement"],
    },
    "Stun": {
        "label": "Étourdissement",
        "aliases": ["stun"],
        "terms": ["Étourdissement"],
    },
    "Counter": {
        "label": "Contre-attaque",
        "aliases": ["counter", "counterattack"],
        "terms": ["Contre-attaque"],
    },
    "Deathproof": {
        "label": "Dernier souffle",
        "aliases": ["deathproof"],
        "terms": ["Dernier souffle"],
    },
    "DebuffBlock": {
        "label": "Immunité",
        "aliases": ["debuff block", "debuffblock", "immunity"],
        "terms": ["Immunité"],
    },
    "DefenseUp": {
        "label": "Défense augmentée",
        "aliases": ["defense up", "defenseup"],
        "terms": ["Défense augmentée"],
    },
    "Deflect": {
        "label": "Déviation",
        "aliases": ["deflect"],
        "terms": ["Déviation"],
    },
    "Evade": {
        "label": "Évitement",
        "aliases": ["evade"],
        "terms": ["Évitement"],
    },
    "HoT": {
        "label": "Régénération",
        "aliases": ["hot", "regeneration"],
        "terms": ["Régénération"],
    },
    "LockedBuff": {
        "label": "Sauvegarde",
        "aliases": ["safeguard", "lockedbuff"],
        "terms": ["Sauvegarde"],
    },
    "MinorDefenseUp": {
        "label": "Défense augmentée mineure",
        "aliases": ["minor defense up", "minordefenseup"],
        "terms": ["Défense augmentée mineure"],
    },
    "MinorDeflect": {
        "label": "Déviation mineure",
        "aliases": ["minor deflect", "minordeflect"],
        "terms": ["Déviation mineure"],
    },
    "MinorHoT": {
        "label": "Régénération mineure",
        "aliases": ["minor hot", "minorhot"],
        "terms": ["Régénération mineure"],
    },
    "MinorOffenseUp": {
        "label": "Attaque augmentée mineure",
        "aliases": ["minor offense up", "minoroffenseup"],
        "terms": ["Attaque augmentée mineure"],
    },
    "OffenseUp": {
        "label": "Attaque augmentée",
        "aliases": ["offense up", "offenseup"],
        "terms": ["Attaque augmentée"],
    },
    "SpeedUp": {
        "label": "Vitesse augmentée",
        "aliases": ["speed up", "speedup"],
        "terms": ["Vitesse augmentée"],
    },
    "Stealth": {
        "label": "Furtivité",
        "aliases": ["stealth"],
        "terms": ["Furtivité"],
    },
    "Taunt": {
        "label": "Provocation",
        "aliases": ["taunt"],
        "terms": ["Provocation"],
    },
    "Charged": {
        "label": "Chargé",
        "aliases": ["charged"],
        "terms": ["Chargé"],
    },
    "ReviveOnce": {
        "label": "Ressusciter une fois",
        "aliases": ["revive once", "reviveonce"],
        "terms": ["Ressusciter une fois"],
    },
    "Vulnerable": {
        "label": "Vulnérable",
        "aliases": ["vulnerable"],
        "terms": ["Vulnérable"],
    },
    "Exposed": {
        "label": "À découvert",
        "aliases": ["exposed"],
        "terms": ["À découvert"],
    },
    "Exhausted": {
        "label": "Épuisement",
        "aliases": ["exhausted"],
        "terms": ["Épuisement", "Épuisé"],
    },
}


# LockedDebuff is intentionally not linked to Trauma in v1. The product
# contract requires Trauma to remain a text-only mechanic until an exact,
# audited presentation-to-operation relation exists.
TEXT_ONLY_MECHANICS = {
    "trauma": {
        "label": "Traumatisme",
        "sourceName": "Trauma",
        "aliases": ["trauma"],
        "terms": ["Traumatisme"],
        "description": "Mention officielle de Traumatisme dans les descriptions de capacités.",
    },
    "war-defense": {
        "label": "Défense de guerre",
        "sourceName": "war defense",
        "aliases": ["war defense", "défense guerre"],
        "terms": ["défense de guerre"],
        "description": "Capacités dont le texte ou les conditions citent la défense de guerre.",
    },
}


DETECTED_ACTIONS = {}


ACTION_PRESENTATIONS = {
    "stat_modifier": "Modification de statistique",
    "turn_meter": "Modification de jauge de vitesse",
    "heal": "Soin",
    "ability_energy": "Énergie de capacité",
    "health_redistribute": "Redistribution de vie",
    "attack_ally": "Attaque d’un allié",
    "damage_mul_per_proc": "Dégâts selon les effets",
    "revive": "Résurrection",
    "attack": "Attaque",
    "drain": "Drain de vie",
    "ability_energy_transfer": "Transfert d’énergie",
    "move": "Déplacement",
    "drain_heal_results": "Soin issu du drain",
    "unclassified_object": "Action non classée",
}


GENERIC_MECHANICS = {
    "barrier": {
        "label": "Barrière",
        "sourceName": "barrier",
        "aliases": ["barrier", "barrière", "remove barrier", "retire barrière"],
        "description": "Application ou retrait structuré de Barrière à partir des données de combat.",
    },
    "action-heal": {
        "label": "Soin",
        "sourceName": "heal",
        "aliases": ["heal", "soin", "soigne"],
        "description": "Restauration structurée de points de vie à partir des données de combat.",
    },
    "action-turn-meter": {
        "label": "Jauge de vitesse",
        "sourceName": "turn_meter",
        "aliases": ["turn meter", "jauge de vitesse", "barre de tour"],
        "description": "Modification structurée de la jauge de vitesse à partir des données de combat.",
    },
    "action-ability-energy": {
        "label": "Énergie de capacité",
        "sourceName": "ability_energy",
        "aliases": ["ability energy", "énergie de capacité", "batterie d’énergie", "batterie"],
        "description": "Génération structurée d’énergie de capacité pour soi ou des alliés selon les paramètres de combat.",
    },
    "spawn": {
        "label": "Invocation",
        "sourceName": "spawn",
        "aliases": ["spawn", "summon", "invocation", "invoque"],
        "description": "Invocation structurée à partir des données de combat.",
    },
    "empower": {
        "label": "Renforcement",
        "sourceName": "empower",
        "aliases": ["empower", "empowered", "renforcé", "renforcement"],
        "description": "Passage à une version renforcée détecté dans les données de combat.",
    },
    "negative-effect-duration": {
        "label": "Durée des effets négatifs",
        "sourceName": "debuff duration",
        "aliases": ["prolonge effet négatif", "debuff duration"],
        "description": "Modification structurée de la durée d’effets négatifs génériques.",
    },
    "generic-buffs": {
        "label": "Effets bénéfiques génériques",
        "sourceName": "generic buffs",
        "aliases": ["buffs", "effets bénéfiques"],
        "description": "Opérations structurées visant une catégorie d’effets bénéfiques sans effet précis.",
    },
    "generic-debuffs": {
        "label": "Effets négatifs génériques",
        "sourceName": "generic debuffs",
        "aliases": ["debuffs", "effets négatifs"],
        "description": "Opérations structurées visant une catégorie d’effets négatifs sans effet précis.",
    },
    "generic-effects": {
        "label": "Effets génériques",
        "sourceName": "generic effects",
        "aliases": ["effects", "effets"],
        "description": "Opérations structurées visant des effets sans identifiant précis.",
    },
    "battlefield-effects": {
        "label": "Effets de champ de bataille",
        "sourceName": "battlefield effects",
        "aliases": ["battlefield", "effet de champ"],
        "description": "Pose ou retrait structuré d’un effet de champ de bataille.",
    },
}


SUGGESTION_SPECS = [
    {
        "label": "Qui applique Blocage de capacité ?",
        "view": "effect",
        "id": "ability-block",
        "operation": "effect_apply",
    },
    {
        "label": "Qui retire Barrière ?",
        "view": "mechanic",
        "id": "barrier",
        "operation": "barrier_remove",
    },
    {
        "label": "Quels personnages invoquent ?",
        "view": "mechanic",
        "id": "spawn",
        "operation": "spawn",
    },
    {
        "label": "Quels personnages se renforcent ?",
        "view": "mechanic",
        "id": "empower",
        "operation": "empower",
    },
    {
        "label": "Qui prolonge un effet négatif ?",
        "view": "mechanic",
        "id": "negative-effect-duration",
        "operation": "effect_duration_modify",
    },
    {
        "label": "Quelles capacités fonctionnent en défense de guerre ?",
        "view": "mechanic",
        "id": "war-defense",
        "operation": "mention",
    },
]


LIMITATIONS = [
    "Aucune simulation de combat n’est effectuée.",
    "Les phases sont des regroupements de présentation et ne modifient aucune action source.",
    "Une cible absente n’est jamais ajoutée à une occurrence, même lorsqu’elle suit une cible explicite dans une phase.",
    "Les actions détectées ne reçoivent ni cible, ni quantité, ni durée déduite.",
    "Les capacités renforcées sans présentation officielle utilisent un fallback neutre.",
    "Les mentions textuelles reposent uniquement sur des termes contrôlés exacts.",
    "Le texte officiel peut nommer ou aligner une phase, jamais créer une opération mécanique.",
    "Le fonctionnement hors ligne complet n’est pas pris en charge dans cette phase.",
]
