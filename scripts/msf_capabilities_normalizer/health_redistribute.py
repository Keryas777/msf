"""Conservative health redistribution interpretation; never a combat simulation.

Reviewed selector signatures are corroborated by the official ability descriptions
in Audit-health-redistribute.md (Scarlet Witch, Apocalypse, Mantis, LokiTeen,
Kahhori, Ronin, Symbiote Quicksilver, Phoenix and Mister Sinister). The technical
Invisible Woman shape is identical to Scarlet Witch's verified shape. No formula,
implicit multiplier, actor identity or percentage basis is inferred.
"""
from __future__ import annotations

import copy
from typing import Any

REVIEWED_SIGNATURES = {'/Data/Apocalypse/special/actions/5': {'drain_pct': 100,
                                        'from': {'limit': 10,
                                                 'relation': 'ally',
                                                 'type': 'random'}},
 '/Data/Kahhori/special/actions/7': {'drain_pct': 100,
                                     'from': {'filter': {'traits': {'has_any': ['AbsoluteAForce']}},
                                              'limit': 10,
                                              'relation': 'ally',
                                              'type': 'random'}},
 '/Data/LokiTeen/ultimate/actions/1': {'drain_pct': 100,
                                       'target': {'relation': 'ally'},
                                       'from': {'filter': {'traits': {'has_any': ['Bifrost']}},
                                                'limit': 10,
                                                'relation': 'ally',
                                                'type': 'random'}},
 '/Data/Mantis/ultimate/actions/0': {'drain_pct': 100,
                                     'from': {'filter': {'not': {'target': {'states': ['Spawned']}}},
                                              'limit': 2,
                                              'primary_selection': 'include_as_target',
                                              'relation': 'ally',
                                              'type': 'by_least_health'}},
 '/Data/MrSinister/passive/2/actions/0': {'drain_pct': 10,
                                          'from': {'relation': 'ally'},
                                          'to': {'attacker_as_primary': False,
                                                 'filter': {'traits': {'has_any': ['Marauders']}},
                                                 'primary_selection': 'exclude_from_pool',
                                                 'relation': 'ally'}},
 '/Data/Phoenix/special/actions/2': {'drain_pct': [25],
                                     'target': {'type': 'primary'},
                                     'from': {'relation': 'ally'},
                                     'to': {'limit': 10,
                                            'primary_selection': 'exclude_from_pool',
                                            'relation': 'ally',
                                            'type': 'random'}},
 '/Data/PvE_DDInvisibleWoman/special/actions/0': {'drain_pct': 100,
                                                  'from': {'limit': 10,
                                                           'relation': 'ally',
                                                           'type': 'random'}},
 '/Data/Ronin/passive/2/actions/2': {'drain_pct': 100,
                                     'from': {'filter': {'or': [{'character': ['BlackWidow']},
                                                                {'character': ['Ronin']}]},
                                              'limit': 10,
                                              'relation': 'ally',
                                              'type': 'random'}},
 '/Data/ScarletWitch/special/actions/4': {'drain_pct': 100,
                                          'from': {'limit': 10,
                                                   'relation': 'ally',
                                                   'type': 'random'}},
 '/Data/SymbioteQuicksilver/passive/2/actions/1': {'drain_pct': 100,
                                                   'target': {},
                                                   'from': {'limit': 10,
                                                            'relation': 'ally',
                                                            'type': 'random'}}}

NUMERIC_UNITS = {
    "drain_pct": "source_percent_unknown_basis",
    "heal_multi": "multiplier_hundredths",
    "max_drain_pct": "source_percent_cap_unknown_application",
    "extra_heal": "health_points",
    "action_pct": "percent_chance",
}
FLAG_FIELDS = (
    "trigger_below_health", "trigger_deathproof", "victim_cant_revive",
    "ignore_health_redistribute_immunity", "include_previous_dead",
)


def _field(raw: dict[str, Any], key: str) -> dict[str, Any]:
    if key not in raw:
        return {"present": False}
    value = raw[key]
    return {"present": True, "raw": copy.deepcopy(value),
            "sourceShape": "array" if isinstance(value, list) else "scalar"}


def _numbers(raw: dict[str, Any], key: str) -> list[int | float]:
    value = raw.get(key)
    values = value if isinstance(value, list) else [value]
    return values if values and all(type(v) in (int, float) for v in values) else []


def normalize_health_redistribute(action: dict[str, Any]) -> dict[str, Any]:
    raw = action["raw"]
    pointer = action.get("source", {}).get("pointer")
    drain = _numbers(raw, "drain_pct")
    heal = _numbers(raw, "heal_multi")
    extra_heal = _numbers(raw, "extra_heal")
    no_extra_heal = "extra_heal" not in raw or (extra_heal and all(v == 0 for v in extra_heal))
    donor, receiver = raw.get("from"), raw.get("to")
    behavior, rule, proof = "detected", "unresolved", "structure_only"
    signature = REVIEWED_SIGNATURES.get(pointer)
    reviewed = (
        signature is not None
        and ("target" in raw) == ("target" in signature)
        and all(k in raw and raw[k] == v for k, v in signature.items())
    )
    if (drain and all(v >= 0 for v in drain) and any(v > 0 for v in drain)
            and heal and all(v == 0 for v in heal) and no_extra_heal):
        behavior, rule, proof = "health_loss", "explicit_zero_restitution", "explicit_parameters"
    elif reviewed and "to" not in signature and "to" not in raw and all(
        k not in raw for k in ("heal_multi", "max_drain_pct", "extra_heal")
    ):
        behavior, rule = "health_equalize", "reviewed_equalization_shape"
        proof = "corroborated_shape" if action.get("characterId") == "PvE_DDInvisibleWoman" else "parameters_and_official_text"
    elif reviewed and "to" in signature and "heal_multi" not in raw:
        behavior, rule, proof = "health_transfer_allies", "reviewed_allied_transfer", "parameters_and_official_text"
    elif (isinstance(donor, dict) and donor.get("relation") == "enemy"
          and isinstance(receiver, dict) and receiver.get("relation") == "ally"
          and drain and all(v > 0 for v in drain) and heal and all(v > 0 for v in heal)):
        behavior, rule, proof = "health_steal_redistribute", "explicit_enemy_to_ally_positive_restitution", "explicit_parameters"
    numeric = {}
    for key, unit in NUMERIC_UNITS.items():
        record = _field(raw, key)
        if record["present"]:
            record["unit"] = unit
            record["values"] = copy.deepcopy(raw[key] if isinstance(raw[key], list) else [raw[key]])
        numeric[key] = record
    return {
        "behavior": behavior, "resolved": behavior != "detected",
        "evidence": {"basis": proof, "rule": rule, "sourcePointer": pointer},
        "selectors": {key: _field(raw, key) for key in ("from", "to", "target")},
        "numeric": numeric,
        "properties": {key: _field(raw, key) for key in FLAG_FIELDS},
        "percentageBasis": "unresolved", "engineFormula": "unresolved",
        # Lossless source includes residual fields, nested modifiers, conditions
        # and dependencies. Index and Explorer must carry it without coercion.
        "rawAction": copy.deepcopy(raw),
    }
