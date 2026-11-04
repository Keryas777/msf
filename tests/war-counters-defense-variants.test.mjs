import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("docs/war-counters.js");
const records = JSON.parse(read("docs/data/war-counters.json"));

function makeSelection(family, rows = records) {
  const start = source.indexOf("  function defenseSignature(row) {");
  const end = source.indexOf("  function renderDefense() {", start);
  assert.ok(start >= 0 && end > start, "Les fonctions de sélection des défenses existent.");

  const select = {
    options: [],
    disabled: false,
    _value: "",
    set innerHTML(value) {
      this.options = [];
      this._value = "";
    },
    appendChild(option) { this.options.push(option); },
    get value() { return this._value; },
    set value(value) { this._value = value; },
    get selectedOptions() { return this.options.filter((option) => option.value === this._value); }
  };
  const WAR = rows.map((record) => ({
    ...record,
    def_chars: [1, 2, 3, 4, 5].map((index) => record[`def_char${index}`]).filter(Boolean)
  }));
  const context = {
    WAR,
    defFamilySelect: { value: family },
    defVariantSelect: select,
    isRoomRelevant: () => true,
    normalizeKey: (value) => String(value).toLowerCase(),
    CHAR_MAP: new Map(),
    document: { createElement: () => ({ value: "", textContent: "" }) }
  };
  const helpers = runInNewContext(source.slice(start, end) +
    "\n({ defenseSignature, defenseSelectionKey, matchesSelectedDefense, defenseVariantOptions, renderDefVariantOptions, getSelectedDef })",
    context);
  return { helpers, select, WAR };
}

test("une variante partagée par plusieurs défenses propose des choix distincts", () => {
  const { helpers } = makeSelection("Symbiote 6");
  const choices = helpers.defenseVariantOptions("Symbiote 6")
    .filter(({ row }) => row.def_variant === "Symbiote 6 + Professeur Xavier");
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(({ key }) => key)).size, 3);
  assert.ok(choices.some(({ label }) => label.includes("Knull") && label.includes("Venom")));
  assert.ok(choices.some(({ label }) => label.includes("Knull") && label.includes("Toxin")));
  assert.ok(choices.some(({ label }) => label.includes("Venom") && label.includes("Toxin") && !label.includes("Knull")));
});

test("le choix exact affiche les cinq défenseurs et exclut les autres ratios", () => {
  const { helpers, select, WAR } = makeSelection("Symbiote 6");
  helpers.renderDefVariantOptions();

  const choices = helpers.defenseVariantOptions("Symbiote 6")
    .filter(({ row }) => row.def_variant === "Symbiote 6 + Professeur Xavier");
  const withToxin = choices.find(({ row }) => row.def_chars.includes("Knull") && row.def_chars.includes("Toxin"));
  const withVenom = choices.find(({ row }) => row.def_chars.includes("Knull") && row.def_chars.includes("Venom"));
  assert.ok(withToxin && withVenom);
  assert.ok(select.options.some(({ value }) => value === withToxin.key));

  select.value = withToxin.key;
  const toxinDef = helpers.getSelectedDef();
  assert.deepEqual([...toxinDef.def_chars].sort(), [...withToxin.row.def_chars].sort());
  const toxinRows = WAR.filter((row) => helpers.matchesSelectedDefense(row, toxinDef));
  assert.equal(toxinRows.filter((row) => row.atk_team === "Winter Guard + Quasar").length, 1);
  assert.equal(toxinRows.filter((row) => row.atk_team === 'Eternels Intemporels "classique"').length, 1);
  assert.equal(toxinRows.find((row) => row.atk_team === "Winter Guard + Quasar").min_ratio_ok, "1.24");

  select.value = withVenom.key;
  const venomDef = helpers.getSelectedDef();
  const venomRows = WAR.filter((row) => helpers.matchesSelectedDefense(row, venomDef));
  assert.equal(venomRows.filter((row) => row.atk_team === "Winter Guard + Quasar").length, 2);
  assert.equal(venomRows.filter((row) => row.atk_team === 'Eternels Intemporels "classique"').length, 1);
  assert.ok(venomRows.every((row) => !helpers.matchesSelectedDefense(row, toxinDef)));
});

test("les familles sans variante ambiguë conservent un seul choix par variante", () => {
  const { helpers } = makeSelection("Winter Guard");
  const choices = helpers.defenseVariantOptions("Winter Guard");
  const names = choices.map(({ row }) => row.def_variant);
  assert.equal(new Set(names).size, names.length);
  assert.ok(choices.every(({ row, label }) => row.def_variant === label));
});

test("les autres collisions de noms sont détectées sans hardcode d'équipe", () => {
  for (const family of ["Club des Damnés", "Conclave de l'Ombre", "Force Phénix", "Guerriers Audacieux"]) {
    const { helpers } = makeSelection(family);
    const entries = helpers.defenseVariantOptions(family);
    const byName = new Map();
    for (const entry of entries) {
      if (!byName.has(entry.row.def_variant)) byName.set(entry.row.def_variant, []);
      byName.get(entry.row.def_variant).push(entry);
    }
    for (const sameName of byName.values()) {
      if (sameName.length < 2) continue;
      assert.equal(new Set(sameName.map((entry) => entry.label)).size, sameName.length);
    }
  }
});
