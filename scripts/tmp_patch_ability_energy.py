from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one match, found {count}: {old[:160]!r}"
        )
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Normalizer: ability_energy becomes a first-class normalized operation.
replace_once(
    "scripts/msf_capabilities_normalizer/normalizer.py",
    "}\n\nMETRIC_FIELDS = (",
    """}\n\nABILITY_ENERGY_METRIC_FIELDS = (\n    (\"chancePct\", \"action_pct\"),\n    (\"energyAmount\", \"count\"),\n)\n\nMETRIC_FIELDS = (""",
)
replace_once(
    "scripts/msf_capabilities_normalizer/normalizer.py",
    """    def _metrics(\n        self,\n        action: dict[str, Any],\n        *,\n        entry: dict[str, Any] | None,\n        entry_pointer: str,\n    ) -> dict[str, Any]:""",
    """    def _metrics(\n        self,\n        action: dict[str, Any],\n        *,\n        entry: dict[str, Any] | None,\n        entry_pointer: str,\n        metric_fields: tuple[tuple[str, str], ...] = METRIC_FIELDS,\n    ) -> dict[str, Any]:""",
)
replace_once(
    "scripts/msf_capabilities_normalizer/normalizer.py",
    "            for output_name, source_name in METRIC_FIELDS\n",
    "            for output_name, source_name in metric_fields\n",
)
replace_once(
    "scripts/msf_capabilities_normalizer/normalizer.py",
    """        scope: dict[str, Any] | None = None,\n        extra_conditions: list[dict[str, Any]] | None = None,\n    ) -> None:""",
    """        scope: dict[str, Any] | None = None,\n        extra_conditions: list[dict[str, Any]] | None = None,\n        metric_fields: tuple[tuple[str, str], ...] = METRIC_FIELDS,\n    ) -> None:""",
)
replace_once(
    "scripts/msf_capabilities_normalizer/normalizer.py",
    """            \"metrics\": self._metrics(\n                action,\n                entry=entry_object,\n                entry_pointer=entry_pointer,\n            ),""",
    """            \"metrics\": self._metrics(\n                action,\n                entry=entry_object,\n                entry_pointer=entry_pointer,\n                metric_fields=metric_fields,\n            ),""",
)
replace_once(
    "scripts/msf_capabilities_normalizer/normalizer.py",
    """    def _build_battlefield_action(\n        self,\n        action: dict[str, Any],\n        canonical_action_type: str,\n    ) -> None:""",
    """    def _build_ability_energy_action(\n        self,\n        action: dict[str, Any],\n    ) -> None:\n        source_action_id = action.get(\"id\")\n        if isinstance(source_action_id, str):\n            self.supported_action_ids.add(source_action_id)\n        source = action.get(\"source\")\n        if not isinstance(source, dict):\n            source = {}\n        action_pointer = str(source.get(\"pointer\", \"\"))\n        self._build_operation(\n            action,\n            kind=\"ability_energy_generate\",\n            canonical_action_type=\"ability_energy\",\n            source_field=None,\n            effect_id=None,\n            effect_pointer=action_pointer,\n            entry_pointer=action_pointer,\n            entry=None,\n            ordinal=0,\n            scope={\"kind\": \"ability_energy_recipient\"},\n            metric_fields=ABILITY_ENERGY_METRIC_FIELDS,\n        )\n\n    def _build_battlefield_action(\n        self,\n        action: dict[str, Any],\n        canonical_action_type: str,\n    ) -> None:""",
)
replace_once(
    "scripts/msf_capabilities_normalizer/normalizer.py",
    """            if canonical_action_type in EFFECT_ACTION_SPECS:\n                self._build_effect_action(action, canonical_action_type)\n            elif canonical_action_type in {\n                \"set_battlefield_effect\",""",
    """            if canonical_action_type in EFFECT_ACTION_SPECS:\n                self._build_effect_action(action, canonical_action_type)\n            elif canonical_action_type == \"ability_energy\":\n                self._build_ability_energy_action(action)\n            elif canonical_action_type in {\n                \"set_battlefield_effect\",""",
)

# Presentation vocabulary. The specific-mechanics overlay still owns the
# already-verified Flip/Convertit correction; this patch only adds energy.
replace_once(
    "scripts/msf_capabilities_explorer_builder/presentation.py",
    """    \"effect_flip\": {\"label\": \"Retourne\", \"order\": 50},\n    \"battlefield_effect_set\":""",
    """    \"effect_flip\": {\"label\": \"Retourne\", \"order\": 50},\n    \"ability_energy_generate\": {\"label\": \"Génère de l’énergie de capacité\", \"order\": 55},\n    \"battlefield_effect_set\":""",
)
replace_once(
    "scripts/msf_capabilities_explorer_builder/presentation.py",
    """    \"chancePct\": \"Chance\",\n    \"useCount\":""",
    """    \"chancePct\": \"Chance\",\n    \"energyAmount\": \"Énergie générée\",\n    \"useCount\":""",
)
replace_once(
    "scripts/msf_capabilities_explorer_builder/presentation.py",
    """    \"random\": \"cible aléatoire\",\n    \"direct_neighbor\":""",
    """    \"random\": \"cible aléatoire\",\n    \"random_repeat\": \"cible aléatoire\",\n    \"direct_neighbor\":""",
)
replace_once(
    "scripts/msf_capabilities_explorer_builder/presentation.py",
    """GENERIC_MECHANICS = {\n    \"spawn\": {""",
    """GENERIC_MECHANICS = {\n    \"action-ability-energy\": {\n        \"label\": \"Énergie de capacité\",\n        \"sourceName\": \"ability_energy\",\n        \"aliases\": [\"ability energy\", \"énergie de capacité\", \"batterie d’énergie\", \"batterie\"],\n        \"description\": \"Génération structurée d’énergie de capacité pour soi ou des alliés selon les paramètres de combat.\",\n    },\n    \"spawn\": {""",
)

# Builder: keep the existing deep-link id and expose the normalized mechanic.
replace_once(
    "scripts/msf_capabilities_explorer_builder/builder.py",
    """        \"battlefield\": \"Champ de bataille\",\n    }.get(scope.get(\"kind\"))""",
    """        \"battlefield\": \"Champ de bataille\",\n        \"ability_energy_recipient\": \"Destinataire de l’énergie\",\n    }.get(scope.get(\"kind\"))""",
)
replace_once(
    "scripts/msf_capabilities_explorer_builder/builder.py",
    """def _project_operation(\n    operation: Mapping[str, Any],""",
    """def _ability_energy_target_summary(target: Any, recipient: Any) -> str | None:\n    combined: dict[str, Any] = {}\n    for source in (recipient, target):\n        if not isinstance(source, dict):\n            continue\n        for key in (\"relation\", \"relationship\", \"type\", \"limit\"):\n            if key in source and key not in combined:\n                combined[key] = copy.deepcopy(source[key])\n    summary = _target_summary(combined)\n    filters = [\n        value\n        for source in (recipient, target)\n        if isinstance(source, dict)\n        for value in [source.get(\"filter\")]\n        if isinstance(value, dict)\n    ]\n    energy_levels = _flatten_scalars(\n        value\n        for filter_value in filters\n        for value in _collect_values(filter_value, \"energy_level\")\n    )\n    parts = [summary] if summary else []\n    if \"partial_energy\" in energy_levels:\n        parts.append(\"énergie non maximale\")\n    return \" · \".join(parts) if parts else None\n\n\ndef _project_operation(\n    operation: Mapping[str, Any],""",
)
replace_once(
    "scripts/msf_capabilities_explorer_builder/builder.py",
    """    target_record = operation.get(\"target\")\n    target_value = target_record.get(\"value\") if isinstance(target_record, dict) else None\n    metrics = _metric_projection(operation.get(\"metrics\"))""",
    """    target_record = operation.get(\"target\")\n    target_value = target_record.get(\"value\") if isinstance(target_record, dict) else None\n    recipient_record = operation.get(\"recipient\")\n    recipient_value = (\n        recipient_record.get(\"value\") if isinstance(recipient_record, dict) else None\n    )\n    target_summary = (\n        _ability_energy_target_summary(target_value, recipient_value)\n        if kind == \"ability_energy_generate\"\n        else _target_summary(target_value)\n    )\n    metrics = _metric_projection(operation.get(\"metrics\"))""",
)
replace_once(
    "scripts/msf_capabilities_explorer_builder/builder.py",
    """        \"target\": _target_summary(target_value),\n        \"chance\": chance,""",
    """        \"target\": target_summary,\n        \"chance\": chance,""",
)
replace_once(
    "scripts/msf_capabilities_explorer_builder/builder.py",
    """    if kind in {\"spawn\", \"empower\"}:\n        result.add(str(kind))""",
    """    if kind in {\"spawn\", \"empower\"}:\n        result.add(str(kind))\n    if kind == \"ability_energy_generate\":\n        result.add(\"action-ability-energy\")""",
)

# AbilityPresentation: show a useful but conservative player-facing sentence.
replace_once(
    "scripts/msf_capabilities_explorer_builder/ability_presentation.py",
    """    OPERATION_KINDS,\n    SIDE_LABELS,\n    TRIGGER_LABELS,""",
    """    OPERATION_KINDS,\n    RELATION_LABELS,\n    SIDE_LABELS,\n    TRIGGER_LABELS,""",
)
replace_once(
    "scripts/msf_capabilities_explorer_builder/ability_presentation.py",
    """def _operation_projection(record: Mapping[str, Any]) -> dict[str, Any]:\n    kind = str(record.get(\"kind\") or \"\")\n    return {\n        \"id\": record.get(\"operationId\"),\n        \"kind\": kind,\n        \"label\": OPERATION_KINDS.get(kind, {}).get(\"label\")\n        or _split_source_name(kind),""",
    """def _progression_terminal(record: Any) -> int | float | None:\n    if not isinstance(record, dict):\n        return None\n    value = record.get(\"maxLevelValue\")\n    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):\n        return value\n    return None\n\n\ndef _ability_energy_operation_label(record: Mapping[str, Any]) -> str:\n    metrics = record.get(\"metrics\") if isinstance(record.get(\"metrics\"), dict) else {}\n    amount = _progression_terminal(metrics.get(\"energyAmount\"))\n    if amount is None:\n        text = \"Génère de l’énergie de capacité\"\n    elif amount == 1:\n        text = \"Génère 1 énergie de capacité\"\n    else:\n        text = f\"Génère {amount:g} énergies de capacité\"\n\n    target = _present_value(record.get(\"target\"))\n    recipient = _present_value(record.get(\"recipient\"))\n    merged: dict[str, Any] = {}\n    for source in (recipient, target):\n        if not isinstance(source, dict):\n            continue\n        for key in (\"relation\", \"relationship\", \"type\", \"limit\"):\n            if key in source and key not in merged:\n                merged[key] = _deepcopy(source[key])\n\n    relation = merged.get(\"relation\") or merged.get(\"relationship\")\n    target_type = merged.get(\"type\")\n    raw_limit = merged.get(\"limit\")\n    limits: list[int | float] = []\n    values = raw_limit if isinstance(raw_limit, list) else [raw_limit]\n    for value in values:\n        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):\n            limits.append(value)\n        elif isinstance(value, dict):\n            terminal = value.get(\"t\")\n            if isinstance(terminal, (int, float)) and not isinstance(terminal, bool) and math.isfinite(terminal):\n                limits.append(terminal)\n    limit = limits[-1] if limits else None\n\n    if relation == \"self\":\n        destination = \"soi\"\n    elif isinstance(relation, str) and relation in RELATION_LABELS:\n        noun = RELATION_LABELS[relation]\n        random_target = target_type in {\"random\", \"random_repeat\"}\n        if limit is not None and limit > 1:\n            destination = f\"jusqu’à {limit:g} {noun}s\"\n            if random_target:\n                destination += \" aléatoires\"\n        else:\n            destination = f\"un {noun}\"\n            if random_target:\n                destination += \" aléatoire\"\n    else:\n        destination = None\n    if destination:\n        text += f\" pour {destination}\"\n\n    filters = [\n        source.get(\"filter\")\n        for source in (recipient, target)\n        if isinstance(source, dict) and isinstance(source.get(\"filter\"), dict)\n    ]\n\n    def has_partial_energy(value: Any) -> bool:\n        if isinstance(value, dict):\n            return any(\n                (key == \"energy_level\" and child == \"partial_energy\")\n                or has_partial_energy(child)\n                for key, child in value.items()\n            )\n        if isinstance(value, list):\n            return any(has_partial_energy(child) for child in value)\n        return False\n\n    if any(has_partial_energy(value) for value in filters):\n        text += \" avec énergie non maximale\"\n    return text\n\n\ndef _operation_projection(record: Mapping[str, Any]) -> dict[str, Any]:\n    kind = str(record.get(\"kind\") or \"\")\n    label = (\n        _ability_energy_operation_label(record)\n        if kind == \"ability_energy_generate\"\n        else OPERATION_KINDS.get(kind, {}).get(\"label\")\n        or _split_source_name(kind)\n    )\n    return {\n        \"id\": record.get(\"operationId\"),\n        \"kind\": kind,\n        \"label\": label,""",
)

Path("tests/test_msf_ability_energy_normalization.py").write_text(
    '''from __future__ import annotations\n\nfrom pathlib import Path\nimport unittest\n\nfrom scripts.msf_capabilities_normalizer.normalizer import normalize_mechanics\nfrom scripts.msf_capabilities_parser.parser import parse_sources, serialize_mechanics\n\nROOT = Path(__file__).resolve().parents[1]\nCHARACTERS = ROOT / "data/msf-capabilities/raw/characters.json"\nPROCS = ROOT / "data/msf-capabilities/raw/procs.json"\n\nclass AbilityEnergyNormalizationTests(unittest.TestCase):\n    @classmethod\n    def setUpClass(cls):\n        cls.mechanics = parse_sources(CHARACTERS, PROCS)\n        cls.capabilities = normalize_mechanics(\n            cls.mechanics, mechanics_payload=serialize_mechanics(cls.mechanics)\n        )\n\n    def test_every_ability_energy_action_is_normalized_once(self):\n        source_ids = {\n            action["id"]\n            for action in self.mechanics["actions"]\n            if str(action.get("rawType") or "").lower() == "ability_energy"\n        }\n        operations = [\n            operation for operation in self.capabilities["operations"]\n            if operation.get("sourceActionType") == "ability_energy"\n        ]\n        self.assertTrue(source_ids)\n        self.assertEqual(len(operations), len(source_ids))\n        self.assertEqual({op["sourceActionId"] for op in operations}, source_ids)\n        self.assertTrue(all(op["kind"] == "ability_energy_generate" for op in operations))\n        self.assertTrue(all("selectionCount" not in op.get("metrics", {}) for op in operations))\n        statuses = {\n            mapping["sourceActionId"]: mapping["status"]\n            for mapping in self.capabilities["actionMappings"]\n            if mapping["sourceActionId"] in source_ids\n        }\n        self.assertEqual(set(statuses), source_ids)\n        self.assertEqual(set(statuses.values()), {"normalized"})\n\n    def test_deathlok_encodes_audited_semantics(self):\n        operation = next(\n            op for op in self.capabilities["operations"]\n            if op["source"]["actionPointer"] == "/Data/Deathlok/basic/actions/2"\n        )\n        self.assertEqual(operation["kind"], "ability_energy_generate")\n        self.assertEqual(operation["metrics"]["energyAmount"]["maxLevelValue"], 1)\n        self.assertEqual(operation["metrics"]["chancePct"]["maxLevelValue"], 100)\n        self.assertEqual(operation["target"], {"present": True, "value": {"limit": 2}})\n        recipient = operation["recipient"]["value"]\n        self.assertEqual(recipient["relation"], "ally")\n        self.assertEqual(recipient["type"], "random_repeat")\n        self.assertIn("BionicAvenger", recipient["filter"]["and"][0]["traits"]["has_any"])\n        self.assertEqual(recipient["filter"]["and"][1]["target"]["energy_level"], "partial_energy")\n        condition = operation["conditions"][0]["expression"]\n        self.assertEqual(condition["mode"], "RAID")\n        self.assertEqual(condition["owner"]["energy_level"], "full_energy")\n        self.assertEqual(operation["control"]["actionCondition"], "if_has_crit_result")\n\n    def test_count_is_energy_amount_not_recipient_count(self):\n        operation = next(\n            op for op in self.capabilities["operations"]\n            if op["source"]["actionPointer"] == "/Data/Deathlok/basic/actions/2"\n        )\n        self.assertEqual(operation["rawParameters"]["count"], 1)\n        self.assertEqual(operation["metrics"]["energyAmount"]["maxLevelValue"], 1)\n        self.assertEqual(operation["target"]["value"]["limit"], 2)\n\nif __name__ == "__main__":\n    unittest.main()\n''',
    encoding="utf-8",
)
