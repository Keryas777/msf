from scripts.msf_capabilities_explorer_builder.builder import (
    _build_mechanic_shard,
    _mechanic_facet_spec,
)


def _occurrence(identifier, character, *, ability=None, direct=None, control=None):
    return {
        "id": identifier,
        "kind": "turn_meter_modify" if direct else "stat_modifier",
        "kindLabel": "Jauge",
        "evidence": "normalized",
        "characterId": character,
        "abilityId": ability,
        "turnMeter": {"action": direct} if direct else None,
        "turnMeterControl": control,
        "modes": [],
        "sides": [],
        "conditions": [],
    }


def test_turn_meter_facets_use_semantic_actions_and_ignore_combined_action():
    gain = _occurrence(
        "op_gain",
        "Gladiator",
        control={
            "action": "block_induced_gain",
            "combinedAction": "block_induced_modification",
        },
    )
    reduction = _occurrence(
        "op_reduction",
        "Gladiator",
        control={
            "action": "block_induced_reduction",
            "combinedAction": "block_induced_modification",
        },
    )

    assert (
        _mechanic_facet_spec("action-turn-meter", gain)["id"]
        == "turn_meter_block_induced_gain"
    )
    assert (
        _mechanic_facet_spec("action-turn-meter", reduction)["id"]
        == "turn_meter_block_induced_reduction"
    )


def test_turn_meter_facets_expose_compact_labels_without_replacing_full_labels():
    expected = {
        "increase": ("Augmente la jauge de vitesse", "Augmente la jauge"),
        "decrease": ("Réduit la jauge de vitesse", "Réduit la jauge"),
        "contextual_amount": (
            "Montant contextuel de jauge de vitesse",
            "Montant contextuel",
        ),
    }
    for action, labels in expected.items():
        facet = _mechanic_facet_spec(
            "action-turn-meter",
            _occurrence(f"op_{action}", "Hero", direct=action),
        )
        assert (facet["label"], facet["shortLabel"]) == labels

    control = _mechanic_facet_spec(
        "action-turn-meter",
        _occurrence(
            "op_control",
            "Hero",
            control={"action": "protect_induced_gain_from_suppression"},
        ),
    )
    assert control["label"] == "Protège les gains provoqués de jauge contre leur suppression"
    assert control["shortLabel"] == "Protège les gains provoqués"


def test_technical_occurrences_remain_character_records_without_fake_ability():
    occurrences = [
        _occurrence("op_direct", "Hero", ability="abl_hero", direct="increase"),
        _occurrence(
            "op_gain",
            "Gladiator",
            control={
                "action": "block_induced_gain",
                "combinedAction": "block_induced_modification",
            },
        ),
        _occurrence(
            "op_reduction",
            "Gladiator",
            control={
                "action": "block_induced_reduction",
                "combinedAction": "block_induced_modification",
            },
        ),
    ]
    mechanic = {
        "id": "action-turn-meter",
        "kind": "action",
        "label": "Jauge de vitesse",
        "description": "",
        "category": "action",
        "occurrences": occurrences,
    }
    abilities = {
        "abl_hero": {
            "characterId": "Hero",
            "name": "Passive",
            "type": "passive",
            "typeLabel": "Passive",
            "typeOrder": 40,
            "isEmpowered": False,
            "iconUrl": None,
        }
    }
    characters = {
        character: {
            "name": character,
            "portraitUrl": None,
            "playable": True,
            "status": {"kind": "character"},
        }
        for character in ("Hero", "Gladiator")
    }

    shard = _build_mechanic_shard(mechanic, abilities, characters)
    facets = {facet["id"]: facet for facet in shard["facets"]}

    assert shard["counts"]["abilities"] == 1
    assert shard["counts"]["occurrences"] == 3
    assert shard["counts"]["technicalOccurrences"] == 2
    assert set(facets) == {
        "turn_meter_increase",
        "turn_meter_block_induced_gain",
        "turn_meter_block_induced_reduction",
    }
    for facet_id in (
        "turn_meter_block_induced_gain",
        "turn_meter_block_induced_reduction",
    ):
        facet = facets[facet_id]
        assert facet["abilityCount"] == 0
        assert facet["characterCount"] == 1
        assert facet["technicalOccurrenceCount"] == 1
        assert facet["records"][0]["characterId"] == "Gladiator"
        assert facet["records"][0]["abilityId"] is None
