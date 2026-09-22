import test from "node:test";
import assert from "node:assert/strict";
import {
  WAR_COUNTERS_LIVE_CSV_URL,
  loadLiveWarCounters,
  parsePublishedWarCountersCsv
} from "../docs/war-counter-live-source.js";

const sampleCsv = `def_family,def_variant,def_key,def_char1,def_char2,def_char3,def_char4,def_char5,atk_family,atk_team,atk_key,atk_char1,atk_char2,atk_char3,atk_char4,atk_char5,min_ratio_hard,min_ratio_ok,min_ratio_safe,min_ratio_overkill,min_ratio_overkill_plus,notes\n"Conclave de l'Ombre","Conclave de l'Ombre ""classique""",conclave,Thanos,Sylvie,Malekith,HighEvolutionary,Executioner,"Eternels Intemporels","Eternels Intemporels ""classique""",eternels,Kingo,Ikaris,Sersi,Gilgamesh,Thena,0.5,0.65,0.8,1.8,2.3,"Test, avec virgule"\n`;

test("parse le CSV publié WarCounters avec guillemets et virgules", () => {
  const rows = parsePublishedWarCountersCsv(sampleCsv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].def_key, "conclave");
  assert.equal(rows[0].atk_char5, "Thena");
  assert.equal(rows[0].min_ratio_hard, "0.5");
  assert.equal(rows[0].notes, "Test, avec virgule");
});

test("refuse une page HTML Google à la place du CSV", () => {
  assert.throws(
    () => parsePublishedWarCountersCsv("<!doctype html><html><body>login</body></html>"),
    /pas un CSV publié/
  );
});

test("utilise le Google Sheet publié en priorité", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    return new Response(sampleCsv, { status: 200, headers: { "Content-Type": "text/csv" } });
  };

  const result = await loadLiveWarCounters({ fetchImpl: fakeFetch, now: () => 12345 });
  assert.equal(result.source, "sheet-live");
  assert.equal(result.rows.length, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0], new RegExp(WAR_COUNTERS_LIVE_CSV_URL.split("?")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(calls[0], /[?&]_=12345/);
});

test("retombe sur war-counters.json si le Sheet direct échoue", async () => {
  const fallbackRows = [{
    def_family: "Fallback",
    def_variant: "Fallback classique",
    def_char1: "A",
    atk_family: "Attack",
    atk_team: "Attack classique",
    atk_char1: "B",
    min_ratio_hard: "0.8"
  }];
  let calls = 0;

  const fakeFetch = async (url) => {
    calls += 1;
    if (String(url).startsWith("https://docs.google.com/")) {
      throw new TypeError("Failed to fetch");
    }
    return new Response(JSON.stringify(fallbackRows), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await loadLiveWarCounters({
    fetchImpl: fakeFetch,
    fallbackUrl: "https://example.test/data/war-counters.json",
    now: () => 12345
  });

  assert.equal(result.source, "json-fallback");
  assert.equal(result.liveError, "Failed to fetch");
  assert.deepEqual(result.rows, fallbackRows);
  assert.equal(calls, 2);
});
