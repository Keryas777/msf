import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../docs/war-admin.js", import.meta.url), "utf8");

class FakeElement {
  constructor(id) {
    this.id = id;
    this.attributes = new Map();
    this.dataset = {};
    this.disabled = false;
    this.files = [];
    this.hidden = false;
    this.innerHTML = "";
    this.listeners = new Map();
    this.scrollHeight = 100;
    this.scrollTop = 0;
    this.textContent = "";
    this.value = "";
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function buildPlayers() {
  return Array.from({ length: 24 }, (_, index) => ({
    row_index: index + 1,
    rank: index + 1,
    name: `Joueur ${index + 1}`,
    alliance: null,
    attack_points: 12000 - index,
    attacks: 14,
    damage: 1_000_000_000 + index,
    defense_wins: 0,
    defense_bonus: 0,
    is_valid: true,
    invalid_reasons: []
  }));
}

function draftPayload(alliance, label, overrides = {}) {
  const players = buildPlayers().map((player) => ({ ...player, alliance }));
  return {
    ok: true,
    model: "gemini-test",
    alliance,
    alliance_label: label,
    detected_alliance: alliance,
    detected_alliance_label: label,
    detection_confident: Boolean(alliance),
    requires_alliance_confirmation: !alliance,
    war_date: "2026-08-02",
    counts: { players_total: 24, valid_rows: 24, invalid_rows: 0 },
    players,
    draft: {
      date: "2026-08-02",
      alliance,
      captured_at: "2026-08-02T12:00:00.000Z",
      source: "gemini-test",
      players: players.map(({ rank, name, attack_points, attacks, damage, defense_wins, defense_bonus }) => ({
        rank,
        name,
        attack_points,
        attacks,
        damage,
        defense_wins,
        defense_bonus
      }))
    },
    published: false,
    raw_gemini_text: "{\"ok\":true}",
    ...overrides
  };
}

function createHarness(options = {}) {
  const ids = [
    "warAdminForm",
    "warDate",
    "warImage",
    "warFileMeta",
    "warSubmit",
    "warCancel",
    "warStatusPanel",
    "warStatusTitle",
    "warStatusBadge",
    "warStatusMessage",
    "warQueueSummary",
    "warCaptureList",
    "warLog",
    "warResult"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  const windowListeners = new Map();
  const revokedUrls = [];
  const fetchCalls = [];
  const timerCalls = [];
  const clearedTimers = [];
  const manualTimers = new Map();
  let nextTimerId = 0;
  let objectUrlIndex = 0;
  let fetchImplementation = null;
  let activeRequests = 0;
  let maxActiveRequests = 0;

  const runtimeConfig = {
    queueDelayMs: 0,
    retryDelaysMs: [0, 0],
    countdownStepMs: 1000,
    exposeState: true,
    ...(options.runtimeConfig || {})
  };

  function fakeSetTimeout(callback, milliseconds) {
    nextTimerId += 1;
    const timerId = nextTimerId;
    timerCalls.push(milliseconds);

    if (options.manualTimers) {
      manualTimers.set(timerId, callback);
    } else {
      globalThis.setTimeout(callback, 0);
    }

    return timerId;
  }

  function fakeClearTimeout(timerId) {
    clearedTimers.push(timerId);
    manualTimers.delete(timerId);
  }

  const windowObject = {
    __MSF_WAR_ADMIN_TEST_CONFIG__: runtimeConfig,
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    }
  };

  const context = {
    AbortController,
    Blob,
    Date,
    Error,
    File,
    FormData,
    JSON,
    Math,
    Number,
    Promise,
    Response,
    String,
    clearTimeout: fakeClearTimeout,
    console,
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    fetch(url, fetchOptions) {
      fetchCalls.push({ url, options: fetchOptions });
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

      return Promise.resolve()
        .then(() => fetchImplementation(url, fetchOptions, fetchCalls.length - 1))
        .finally(() => {
          activeRequests -= 1;
        });
    },
    setTimeout: fakeSetTimeout,
    URL: {
      createObjectURL() {
        objectUrlIndex += 1;
        return `blob:test-${objectUrlIndex}`;
      },
      revokeObjectURL(value) {
        revokedUrls.push(value);
      }
    },
    window: windowObject
  };

  vm.runInNewContext(app, context, { filename: "war-admin.js" });

  return {
    clearedTimers,
    elements,
    fetchCalls,
    manualTimers,
    revokedUrls,
    timerCalls,
    windowObject,
    get maxActiveRequests() {
      return maxActiveRequests;
    },
    getSnapshot() {
      return windowObject.__MSF_WAR_ADMIN_TEST_API__.getSnapshot();
    },
    listener(id, type) {
      return elements[id].listeners.get(type)?.[0];
    },
    setFetchImplementation(value) {
      fetchImplementation = value;
    },
    windowListener(type) {
      return windowListeners.get(type)?.[0];
    }
  };
}

function submitEvent() {
  return { preventDefault() {} };
}

function files(count) {
  return Array.from({ length: count }, (_, index) => (
    new File([`image-${index + 1}`], `guerre-${index + 1}.png`, { type: "image/png" })
  ));
}

async function flushUntil(predicate, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("La condition asynchrone attendue n’a pas été atteinte.");
}

test("l’état initial ne lance aucun appel et bloque la session", () => {
  const harness = createHarness();
  const { elements, fetchCalls } = harness;

  assert.match(elements.warDate.value, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(elements.warSubmit.disabled, true);
  assert.equal(elements.warCancel.disabled, true);
  assert.equal(elements.warStatusPanel.dataset.state, "idle");
  assert.equal(elements.warStatusTitle.textContent, "En attente");
  assert.match(elements.warCaptureList.innerHTML, /Aucune capture/);
  assert.equal(fetchCalls.length, 0);
});

test("la sélection accepte une image, refuse sept images et révoque les aperçus", () => {
  const harness = createHarness();
  const { elements, revokedUrls } = harness;
  const changeImages = harness.listener("warImage", "change");

  elements.warImage.files = files(1);
  changeImages();
  assert.equal(elements.warSubmit.disabled, false);
  assert.match(elements.warFileMeta.textContent, /1 capture sélectionnée/);
  assert.match(elements.warCaptureList.innerHTML, /blob:test-1/);

  elements.warImage.files = files(7);
  changeImages();
  assert.equal(elements.warSubmit.disabled, true);
  assert.equal(elements.warImage.value, "");
  assert.equal(elements.warStatusPanel.dataset.state, "error");
  assert.deepEqual(revokedUrls, ["blob:test-1"]);

  elements.warImage.files = files(1);
  changeImages();
  harness.windowListener("pagehide")();
  assert.deepEqual(revokedUrls, ["blob:test-1", "blob:test-2"]);
});

test("une capture détectée automatiquement crée un brouillon sans alliance envoyée", async () => {
  const harness = createHarness();
  const { elements, fetchCalls } = harness;
  harness.setFetchImplementation(async () => Response.json(draftPayload("kronos", "Kronos")));

  elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    "https://msf-war-ocr.deliriousfan7.workers.dev/api/war/parse-gemini-draft"
  );
  assert.equal(fetchCalls[0].options.method, "POST");
  assert.equal(fetchCalls[0].options.body.get("alliance"), null);
  assert.equal(fetchCalls[0].options.body.get("war_date"), elements.warDate.value);
  assert.equal(fetchCalls[0].options.body.get("image").name, "guerre-1.png");
  assert.ok(fetchCalls[0].options.signal instanceof AbortSignal);

  const snapshot = harness.getSnapshot();
  assert.equal(snapshot.published, false);
  assert.equal(snapshot.drafts.length, 1);
  assert.equal(snapshot.drafts[0].draft.alliance, "kronos");
  assert.equal(snapshot.captures[0].state, "Brouillon prêt");
  assert.equal(snapshot.captures[0].assignment_source, "automatic");
  assert.equal(elements.warStatusPanel.dataset.state, "success");
  assert.match(elements.warCaptureList.innerHTML, /✓ Kronos/);
  assert.match(elements.warLog.innerHTML, /Alliance détectée : Kronos/);
  assert.match(elements.warResult.textContent, /"published": false/);
});

test("six captures restent strictement séquentielles avec cinq délais visibles", async () => {
  const harness = createHarness({
    runtimeConfig: {
      queueDelayMs: 9000,
      retryDelaysMs: [10000, 30000],
      countdownStepMs: 9000
    }
  });
  const allianceResults = [
    ["zeus", "Zeus"],
    ["athena", "Athéna"],
    ["kronos", "Kronos"],
    ["dionysos", "Dionysos"],
    ["poseidon", "Poséidon"],
    ["hades", "Hadès"]
  ];
  let responseIndex = 0;
  harness.setFetchImplementation(async () => {
    const [alliance, label] = allianceResults[responseIndex];
    responseIndex += 1;
    await Promise.resolve();
    return Response.json(draftPayload(alliance, label));
  });

  harness.elements.warImage.files = files(6);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  assert.equal(harness.fetchCalls.length, 6);
  assert.equal(harness.maxActiveRequests, 1);
  assert.deepEqual(harness.timerCalls, [9000, 9000, 9000, 9000, 9000]);
  assert.equal(harness.getSnapshot().drafts.length, 6);
  assert.match(harness.elements.warLog.innerHTML, /Temporisation terminée ; reprise de la file/);
  assert.match(harness.elements.warQueueSummary.textContent, /6 brouillons/);
  assert.equal(harness.elements.warStatusPanel.dataset.state, "success");
});

test("un doublon automatique est bloqué puis peut être affecté manuellement", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("zeus", "Zeus")));

  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  let snapshot = harness.getSnapshot();
  assert.equal(snapshot.drafts.length, 1);
  assert.equal(snapshot.captures[1].state, "Alliance à confirmer");
  assert.match(harness.elements.warCaptureList.innerHTML, /Gemini propose Zeus, déjà attribuée/);
  const captureId = harness.elements.warCaptureList.innerHTML.match(/data-capture-id="(\d+)"/)?.[1];
  assert.ok(captureId);

  const manualChange = harness.listener("warCaptureList", "change");
  manualChange({ target: { dataset: { captureId }, value: "zeus" } });
  snapshot = harness.getSnapshot();
  assert.equal(snapshot.drafts.length, 1);
  assert.match(harness.elements.warLog.innerHTML, /Choix refusé : Zeus est déjà attribuée/);

  manualChange({ target: { dataset: { captureId }, value: "athena" } });
  snapshot = harness.getSnapshot();
  assert.equal(snapshot.drafts.length, 2);
  assert.equal(snapshot.captures[1].assigned_alliance, "athena");
  assert.equal(snapshot.captures[1].assignment_source, "manual");
  assert.equal(snapshot.captures[1].state, "Brouillon prêt");
  assert.match(harness.elements.warLog.innerHTML, /Alliance confirmée manuellement : Athéna/);
});

test("une détection incertaine demande un choix uniquement pour sa capture", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload(null, null)));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  let snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].state, "Alliance à confirmer");
  assert.equal(snapshot.drafts.length, 0);
  const captureId = harness.elements.warCaptureList.innerHTML.match(/data-capture-id="(\d+)"/)?.[1];

  harness.listener("warCaptureList", "change")({
    target: { dataset: { captureId }, value: "hades" }
  });
  snapshot = harness.getSnapshot();
  assert.equal(snapshot.drafts.length, 1);
  assert.equal(snapshot.drafts[0].draft.alliance, "hades");
  assert.equal(snapshot.captures[0].assignment_source, "manual");
});

test("deux échecs déclenchent les attentes 10 s et 30 s avant le succès", async () => {
  const harness = createHarness({
    runtimeConfig: {
      queueDelayMs: 9000,
      retryDelaysMs: [10000, 30000],
      countdownStepMs: 30000
    }
  });
  let attempt = 0;
  harness.setFetchImplementation(async () => {
    attempt += 1;
    if (attempt < 3) {
      return Response.json(
        { ok: false, published: false, error: `Gemini indisponible ${attempt}` },
        { status: 503, statusText: "Service Unavailable" }
      );
    }
    return Response.json(draftPayload("poseidon", "Poséidon"));
  });

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  assert.equal(harness.fetchCalls.length, 3);
  assert.deepEqual(harness.timerCalls, [10000, 30000]);
  assert.equal(harness.getSnapshot().captures[0].attempts, 3);
  assert.equal(harness.getSnapshot().captures[0].state, "Brouillon prêt");
  assert.match(harness.elements.warLog.innerHTML, /Attente 10 secondes avant la tentative 2/);
  assert.match(harness.elements.warLog.innerHTML, /Attente 30 secondes avant la tentative 3/);
});

test("la file poursuit la capture suivante après trois échecs Gemini", async () => {
  const harness = createHarness();
  let callIndex = 0;
  harness.setFetchImplementation(async () => {
    callIndex += 1;
    if (callIndex <= 3) {
      return Response.json(
        { ok: false, published: false, error: "Échec simulé" },
        { status: 503 }
      );
    }
    return Response.json(draftPayload("dionysos", "Dionysos"));
  });

  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  const snapshot = harness.getSnapshot();
  assert.equal(harness.fetchCalls.length, 4);
  assert.equal(harness.maxActiveRequests, 1);
  assert.equal(snapshot.captures[0].state, "OCR échoué");
  assert.equal(snapshot.captures[0].attempts, 3);
  assert.equal(snapshot.captures[1].state, "Brouillon prêt");
  assert.equal(snapshot.drafts.length, 1);
  assert.match(harness.elements.warLog.innerHTML, /poursuite automatique de la file/);
  assert.equal(harness.elements.warStatusPanel.dataset.state, "warning");
});

test("l’utilisateur peut interrompre la temporisation avant la capture suivante", async () => {
  const harness = createHarness({
    manualTimers: true,
    runtimeConfig: {
      queueDelayMs: 9000,
      retryDelaysMs: [10000, 30000],
      countdownStepMs: 9000
    }
  });
  const responses = [
    ["zeus", "Zeus"],
    ["athena", "Athéna"]
  ];
  let responseIndex = 0;
  harness.setFetchImplementation(async () => {
    const [alliance, label] = responses[responseIndex];
    responseIndex += 1;
    return Response.json(draftPayload(alliance, label));
  });

  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  const submitPromise = harness.listener("warAdminForm", "submit")(submitEvent());

  await flushUntil(() => harness.manualTimers.size === 1);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.elements.warStatusPanel.dataset.state, "waiting");
  assert.match(harness.elements.warStatusMessage.textContent, /9 secondes/);

  harness.listener("warCancel", "click")();
  await submitPromise;

  const snapshot = harness.getSnapshot();
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(snapshot.captures[0].state, "Brouillon prêt");
  assert.equal(snapshot.captures[1].state, "Interrompue");
  assert.equal(snapshot.drafts.length, 1);
  assert.equal(harness.clearedTimers.length, 1);
  assert.equal(harness.elements.warStatusPanel.dataset.state, "cancelled");
});
