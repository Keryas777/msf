import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [validationApp, reportCalculator, reportRanker, analysisApp, app] = await Promise.all([
  readFile(new URL("../docs/war-admin-validation.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/war-admin-report-calculator.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/war-admin-report-ranker.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/war-admin-analysis.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/war-admin.js", import.meta.url), "utf8")
]);

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
    this.style = {};
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

  removeAttribute(name) {
    this.attributes.delete(name);
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
    "warReportProgress",
    "warValidatedCount",
    "warCalculatedCount",
    "warRankedCount",
    "warAnalyzedCount",
    "warPublishedCount",
    "warCalculateReports",
    "warRankReports",
    "warWriteAnalyses",
    "warPublishReports",
    "warCalculateHelp",
    "warLog",
    "warResult",
    "warSessionView",
    "warReviewView",
    "warReviewBack",
    "warReviewBackBottom",
    "warReviewTitle",
    "warReviewState",
    "warReviewAlliance",
    "warReviewDate",
    "warReviewFile",
    "warReviewTotal",
    "warCountPlayers",
    "warCountInactive",
    "warCountVacant",
    "warCountInvalid",
    "warReviewStructureError",
    "warSourceTabs",
    "warSourceViewport",
    "warReviewImage",
    "warReviewImageNotice",
    "warZoomOut",
    "warZoomReset",
    "warZoomIn",
    "warReviewListPanel",
    "warPlayerList",
    "warReviewUnlock",
    "warValidateDraft",
    "warValidationHelp",
    "warEditorPanel",
    "warEditorBack",
    "warEditorForm",
    "warEditorContext",
    "warEditorStatus",
    "warEditorMessages",
    "warEditorSave",
    "warEditorReset",
    "warEditorCancel",
    "warEditName",
    "warEditAttackPoints",
    "warEditAttacks",
    "warEditDamage",
    "warEditDefenseWins",
    "warEditDefenseBonus",
    "warEditErrorName",
    "warEditErrorAttackPoints",
    "warEditErrorAttacks",
    "warEditErrorDamage",
    "warEditErrorDefenseWins",
    "warEditErrorDefenseBonus",
    "warReportView",
    "warReportBack",
    "warReportTitle",
    "warReportStep",
    "warReportState",
    "warReportOrder",
    "warReportAlliance",
    "warReportDate",
    "warReportSource",
    "warReportTotalDamage",
    "warReportPlayerCount",
    "warReportAvgRef",
    "warReportShareRef",
    "warReportMinAttacks",
    "warReportMinDeviations",
    "warReportPlayerList",
    "warCalculatedJson"
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
    scrollY: 0,
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    scrollTo(_x, y) {
      this.scrollY = y;
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

  const vmContext = vm.createContext(context);
  vm.runInContext(validationApp, vmContext, { filename: "war-admin-validation.js" });
  vm.runInContext(reportCalculator, vmContext, { filename: "war-admin-report-calculator.js" });
  vm.runInContext(reportRanker, vmContext, { filename: "war-admin-report-ranker.js" });
  vm.runInContext(analysisApp, vmContext, { filename: "war-admin-analysis.js" });
  vm.runInContext(app, vmContext, { filename: "war-admin.js" });

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

async function runAnalysisRetryCase(code, retryAfterSeconds) {
  const harness = createHarness({
    runtimeConfig: { retryDelaysMs: [10000, 30000], countdownStepMs: 70000 }
  });
  let analysisAttempt = 0;
  harness.setFetchImplementation(async (url, options) => {
    if (url.includes("parse-gemini-draft")) return Response.json(draftPayload("zeus", "Zeus"));
    analysisAttempt += 1;
    if (analysisAttempt === 1) {
      return Response.json({
        error: "Temporisation fournisseur",
        code,
        retry_after_seconds: retryAfterSeconds,
        rate_limit: { retry_after: String(retryAfterSeconds), remaining_tokens: "0" }
      }, { status: 429 });
    }
    const payload = JSON.parse(options.body);
    return Response.json({
      analyses: payload.report.players.map(({ rank, name }) => ({ rank, name, analysis: `Analyse de ${name}.` }))
    });
  });

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  harness.listener("warCalculateReports", "click")();
  harness.listener("warRankReports", "click")();
  await harness.listener("warWriteAnalyses", "click")();
  return harness;
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

test("la sélection accepte une, sept, huit et dix images, refuse onze images et révoque les aperçus", () => {
  const harness = createHarness();
  const { elements, revokedUrls } = harness;
  const changeImages = harness.listener("warImage", "change");

  elements.warImage.files = files(1);
  changeImages();
  assert.equal(elements.warSubmit.disabled, false);
  assert.match(elements.warFileMeta.textContent, /1 capture sélectionnée/);
  assert.match(elements.warCaptureList.innerHTML, /blob:test-1/);

  for (const count of [7, 8, 10]) {
    elements.warImage.files = files(count);
    changeImages();
    assert.equal(elements.warSubmit.disabled, false);
    assert.match(elements.warFileMeta.textContent, new RegExp(`${count} captures sélectionnées`));
  }

  elements.warImage.files = files(11);
  changeImages();
  assert.equal(elements.warSubmit.disabled, true);
  assert.equal(elements.warImage.value, "");
  assert.equal(elements.warStatusPanel.dataset.state, "error");
  assert.match(elements.warFileMeta.textContent, /Sélection refusée : 11 captures\. Le maximum est de 10\./);
  assert.equal(revokedUrls.length, 26);

  elements.warImage.files = files(1);
  changeImages();
  harness.windowListener("pagehide")();
  assert.equal(revokedUrls.length, 27);
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
  assert.equal(elements.warStatusPanel.dataset.state, "warning");
  assert.match(elements.warCaptureList.innerHTML, /data-action="open-review"/);
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
  assert.match(harness.elements.warQueueSummary.textContent, /Prêts 6/);
  assert.equal(harness.elements.warStatusPanel.dataset.state, "warning");
});

test("un brouillon prêt reste vérifiable à 250 % pendant que l’OCR suivant continue", async () => {
  const harness = createHarness();
  let resolveSecond;
  harness.setFetchImplementation((_url, _options, index) => {
    if (index === 0) return Response.json(draftPayload("zeus", "Zeus"));
    return new Promise((resolve) => {
      resolveSecond = () => resolve(Response.json(draftPayload("kronos", "Kronos")));
    });
  });

  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  const running = harness.listener("warAdminForm", "submit")(submitEvent());
  await flushUntil(() => harness.fetchCalls.length === 2 && typeof resolveSecond === "function");

  const beforeOpen = harness.getSnapshot();
  const cards = harness.elements.warCaptureList.innerHTML.match(/<article[\s\S]*?<\/article>/g);
  assert.equal(beforeOpen.captures[0].state_key, "ready");
  assert.equal(beforeOpen.captures[1].state_key, "ocr");
  assert.match(cards[0], /data-action="open-review"[^>]*>Vérifier<\/button>/);
  assert.doesNotMatch(cards[0], /data-action="open-review"[^>]* disabled/);
  assert.doesNotMatch(cards[1], /data-action="open-review"/);
  assert.match(cards[0], /data-action="toggle-excluded"[^>]* disabled/);

  const fetchCount = harness.fetchCalls.length;
  openReviewFromCard(harness, 0);
  assert.equal(harness.elements.warReviewView.hidden, false);
  assert.equal(harness.elements.warReviewImage.style.width, "250%");
  assert.equal(harness.elements.warZoomReset.textContent, "250 %");
  assert.equal(harness.elements.warCancel.disabled, false);
  assert.equal(harness.getSnapshot().captures[1].state_key, "ocr");
  assert.equal(harness.fetchCalls.length, fetchCount);
  assert.equal(harness.maxActiveRequests, 1);

  resolveSecond();
  await running;
  assert.equal(harness.elements.warReviewView.hidden, false, "la navigation de contrôle est conservée");
  harness.listener("warReviewBack", "click")();
  const snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].state, "Vérification en cours");
  assert.equal(snapshot.captures[1].state, "Brouillon prêt");
  assert.equal(harness.fetchCalls.length, 2);
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
  const captureId = harness.elements.warCaptureList.innerHTML.match(/<select[^>]*data-capture-id="(\d+)"/)?.[1];
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
  const captureId = harness.elements.warCaptureList.innerHTML.match(/<select[^>]*data-capture-id="(\d+)"/)?.[1];

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

test("hors session, le bouton Vérifier reste actif", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("zeus", "Zeus")));
  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  assert.match(harness.elements.warCaptureList.innerHTML, /data-action="open-review"[^>]*>Vérifier<\/button>/);
  assert.doesNotMatch(harness.elements.warCaptureList.innerHTML, /data-action="open-review"[^>]* disabled/);
});

test("un fragment fusionné sans editableDraft ne devient pas vérifiable", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("zeus", "Zeus")));
  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  const cards = harness.elements.warCaptureList.innerHTML.match(/<article[\s\S]*?<\/article>/g);
  assert.equal(harness.getSnapshot().captures[1].state_key, "merged");
  assert.equal(harness.getSnapshot().captures[1].editable_draft, null);
  assert.doesNotMatch(cards[1], /data-action="open-review"/);
  assert.match(cards[1], /data-action="toggle-excluded"/);
});

function openReviewFromCard(harness, captureIndex = 0, readOnly = false) {
  const ids = [...harness.elements.warCaptureList.innerHTML.matchAll(
    /data-action="open-review" data-capture-id="(\d+)"/g
  )].map((match) => match[1]);
  const captureId = ids[captureIndex];
  assert.ok(captureId, `capture ${captureIndex + 1} ouvrable`);
  harness.listener("warCaptureList", "click")({
    target: {
      dataset: {
        action: "open-review",
        captureId,
        readOnly: String(readOnly)
      },
      disabled: false
    }
  });
  return captureId;
}

function toggleExcludedFromCard(harness, captureIndex = 0) {
  const ids = [...harness.elements.warCaptureList.innerHTML.matchAll(
    /data-action="toggle-excluded" data-capture-id="(\d+)"/g
  )].map((match) => match[1]);
  const captureId = ids[captureIndex];
  assert.ok(captureId, `capture ${captureIndex + 1} excluable`);
  harness.listener("warCaptureList", "click")({
    target: { dataset: { action: "toggle-excluded", captureId }, disabled: false }
  });
  return captureId;
}

function openEditorRow(harness, rowIndex) {
  harness.listener("warPlayerList", "click")({
    target: {
      dataset: { action: "edit-row", rowIndex: String(rowIndex) },
      disabled: false
    }
  });
}

function editField(harness, field, value) {
  const input = {
    name: field,
    value
  };
  harness.listener("warEditorForm", "input")({ target: input });
}

function payloadWithPlayers(alliance, label, players) {
  const base = draftPayload(alliance, label);
  return {
    ...base,
    players: players.map((player) => ({ ...player, alliance })),
    draft: {
      ...base.draft,
      alliance,
      players: players.map(({ rank, name, attack_points, attacks, damage, defense_wins, defense_bonus }) => ({
        rank,
        name,
        attack_points,
        attacks,
        damage,
        defense_wins,
        defense_bonus
      }))
    }
  };
}

test("un brouillon valide passe de la vérification à OCR validé sans calcul", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("zeus", "Zeus")));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);

  let snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].state, "Vérification en cours");
  assert.equal(harness.elements.warSessionView.hidden, true);
  assert.equal(harness.elements.warReviewView.hidden, false);
  assert.equal(harness.elements.warCountPlayers.textContent, "24");
  assert.equal(harness.elements.warCountInvalid.textContent, "0");
  assert.equal(harness.elements.warValidateDraft.disabled, false);

  harness.listener("warValidateDraft", "click")();
  snapshot = harness.getSnapshot();

  assert.equal(snapshot.captures[0].state, "OCR validé");
  assert.equal(snapshot.captures[0].validatedDraft.players.length, 24);
  assert.equal("report" in snapshot.captures[0].validatedDraft, false);
  assert.equal(snapshot.captures[0].validatedDraft.players[0].rank, 1);
  assert.equal(harness.elements.warValidateDraft.disabled, true);
  assert.equal(harness.elements.warValidateDraft.textContent, "Brouillon OCR validé");
  assert.equal(
    harness.elements.warStatusMessage.textContent,
    "Tous les brouillons OCR disponibles sont validés."
  );
  assert.equal(harness.fetchCalls.length, 1, "la validation ne relance pas Gemini");
});

test("une ligne invalide bloque la validation puis une correction la débloque", async () => {
  const harness = createHarness();
  const players = buildPlayers();
  players[3].damage = null;
  harness.setFetchImplementation(async () => Response.json(payloadWithPlayers("kronos", "Kronos", players)));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);

  let snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].state, "À corriger");
  assert.equal(harness.elements.warCountInvalid.textContent, "1");
  assert.equal(harness.elements.warValidateDraft.disabled, true);
  assert.match(harness.elements.warPlayerList.innerHTML, /data-classification="invalid"/);

  openEditorRow(harness, 3);
  assert.equal(harness.elements.warEditorSave.disabled, true);
  editField(harness, "damage", "987654321");
  assert.equal(harness.elements.warEditorSave.disabled, false);
  harness.listener("warEditorForm", "submit")(submitEvent());

  snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].state, "Vérification en cours");
  assert.equal(snapshot.captures[0].editable_draft.players[3].damage, 987654321);
  assert.equal(snapshot.captures[0].ocr_draft.players[3].damage, null);
  assert.equal(snapshot.captures[0].modification_count, 1);
  assert.equal(harness.elements.warValidateDraft.disabled, false);
});

test("nom et dégâts modifiés après validation déclenchent À revalider puis peuvent être restaurés", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("athena", "Athéna")));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewUnlock", "click")();

  openEditorRow(harness, 0);
  editField(harness, "name", "Nom corrigé");
  editField(harness, "damage", "2222222222");
  harness.listener("warEditorForm", "submit")(submitEvent());

  let snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].state, "À revalider");
  assert.equal(snapshot.captures[0].editable_draft.players[0].name, "Nom corrigé");
  assert.equal(snapshot.captures[0].editable_draft.players[0].damage, 2222222222);
  assert.equal(snapshot.captures[0].response_ocr.draft.players[0].name, "Joueur 1");
  assert.equal(snapshot.captures[0].modification_count, 2);
  assert.match(harness.elements.warPlayerList.innerHTML, /data-modified="true"/);
  assert.doesNotMatch(harness.elements.warStatusMessage.textContent, /Tous les brouillons OCR disponibles/);

  openEditorRow(harness, 0);
  harness.listener("warEditorReset", "click")();
  snapshot = harness.getSnapshot();

  assert.equal(snapshot.captures[0].state, "OCR validé");
  assert.equal(snapshot.captures[0].editable_draft.players[0].name, "Joueur 1");
  assert.equal(snapshot.captures[0].editable_draft.players[0].damage, 1000000000);
  assert.equal(snapshot.captures[0].modification_count, 0);
});

test("la fiche accepte 0 mais rejette immédiatement décimales et valeurs négatives", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("poseidon", "Poséidon")));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  openEditorRow(harness, 1);

  editField(harness, "damage", "1.5");
  assert.equal(harness.elements.warEditorSave.disabled, true);
  assert.match(harness.elements.warEditErrorDamage.textContent, /entier/);

  editField(harness, "damage", "-1");
  assert.equal(harness.elements.warEditorSave.disabled, true);
  assert.match(harness.elements.warEditErrorDamage.textContent, /entier/);

  for (const field of ["attack_points", "attacks", "damage", "defense_wins", "defense_bonus"]) {
    editField(harness, field, "0");
  }
  assert.equal(harness.elements.warEditorSave.disabled, false);
  harness.listener("warEditorForm", "submit")(submitEvent());

  const snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].editable_draft.players[1].damage, 0);
  assert.equal(snapshot.captures[0].editable_draft.players[1].attacks, 0);
  assert.match(
    harness.elements.warPlayerList.innerHTML,
    /data-row-index="1" data-classification="inactive" data-modified="true"/
  );
  assert.match(harness.elements.warPlayerList.innerHTML, />Modifié<\/span>/);
});

test("les alliances gardent des états indépendants et le retour conserve l’ordre", async () => {
  const harness = createHarness();
  const responses = [
    draftPayload("zeus", "Zeus"),
    draftPayload("dionysos", "Dionysos")
  ];
  let responseIndex = 0;
  harness.setFetchImplementation(async () => Response.json(responses[responseIndex++]));

  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness, 0);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();

  const snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].assigned_alliance, "zeus");
  assert.equal(snapshot.captures[0].state, "OCR validé");
  assert.equal(snapshot.captures[1].assigned_alliance, "dionysos");
  assert.equal(snapshot.captures[1].state, "Brouillon prêt");
  assert.match(harness.elements.warQueueSummary.textContent, /Prêts 1 · En cours 0 · À corriger 0 · Validés 1/);
  assert.equal(harness.elements.warSessionView.hidden, false);
  assert.equal(harness.elements.warReviewView.hidden, true);
});

test("le calcul reste bloqué jusqu’à la validation puis enrichit le brouillon sans nouvel appel", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("zeus", "Zeus")));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  assert.equal(harness.elements.warReportProgress.hidden, false);
  assert.equal(harness.elements.warCalculateReports.disabled, true);
  assert.equal(harness.elements.warValidatedCount.textContent, "0");
  assert.equal(harness.elements.warCalculatedCount.textContent, "0");

  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  assert.equal(harness.elements.warCalculateReports.disabled, false);
  assert.equal(harness.elements.warValidatedCount.textContent, "1");

  harness.listener("warCalculateReports", "click")();
  const snapshot = harness.getSnapshot();

  assert.equal(harness.fetchCalls.length, 1, "le calcul ne relance pas Gemini");
  assert.equal(snapshot.published, false);
  assert.deepEqual(snapshot.publication, { performed: false, state: "pending" });
  assert.equal(snapshot.reports.length, 1);
  assert.equal(snapshot.captures[0].state, "Rapport calculé");
  assert.equal(snapshot.captures[0].calculatedReport.report.summary.player_count, 24);
  assert.equal(snapshot.captures[0].calculatedReport.report.summary.minimum_attacks, 11);
  assert.equal(snapshot.captures[0].calculatedReport.report.summary.minimum_deviations, 2);
  assert.equal("ranking" in snapshot.captures[0].calculatedReport.report, false);
  assert.equal("rank" in snapshot.captures[0].calculatedReport.report.players[0], false);
  assert.equal(harness.elements.warCalculatedCount.textContent, "1");
  assert.equal(harness.elements.warCalculateReports.disabled, true);
  assert.equal(harness.elements.warCalculateReports.textContent, "Rapports calculés");
  assert.equal(
    harness.elements.warStatusMessage.textContent,
    "1 OCR validé · 1 rapport calculé · publication en attente."
  );
});

test("le classement reste bloqué avant calcul, puis se reclasse après invalidation ciblée", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("zeus", "Zeus")));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  assert.equal(harness.elements.warRankReports.disabled, true);

  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  harness.listener("warCalculateReports", "click")();
  assert.equal(harness.elements.warRankReports.disabled, false);

  harness.listener("warRankReports", "click")();
  let snapshot = harness.getSnapshot();
  const ranked = snapshot.captures[0].rankedReport;
  assert.equal(snapshot.captures[0].state, "Rapport classé");
  assert.equal(snapshot.ranked_reports.length, 1);
  assert.deepEqual(ranked.report.players.map(({ rank }) => rank), Array.from({ length: 24 }, (_, index) => index + 1));
  assert.deepEqual(
    ranked.report.ranking,
    ranked.report.players.map(({ rank, name, score_total }) => ({ rank, name, score: score_total }))
  );
  assert.equal(harness.fetchCalls.length, 1, "le classement ne doit effectuer aucun appel réseau");

  openReviewFromCard(harness, 0, true);
  harness.listener("warReviewUnlock", "click")();
  openEditorRow(harness, 0);
  editField(harness, "damage", "2222222222");
  harness.listener("warEditorForm", "submit")(submitEvent());
  snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].calculatedReport, null);
  assert.equal(snapshot.captures[0].rankedReport, null);
  assert.equal(snapshot.ranked_reports.length, 0);
  assert.equal(harness.elements.warRankReports.disabled, true);

  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  harness.listener("warCalculateReports", "click")();
  harness.listener("warRankReports", "click")();
  snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].state, "Rapport classé");
  assert.equal(snapshot.captures[0].rankedReport.players[0].damage, 2222222222);
  assert.equal(snapshot.ranked_reports.length, 1);
  assert.equal(harness.fetchCalls.length, 1);
});

test("la rédaction fusionne uniquement les analyses dans le rapport classé", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async (url, options) => {
    if (url.includes("parse-gemini-draft")) return Response.json(draftPayload("zeus", "Zeus"));
    const payload = JSON.parse(options.body);
    return Response.json({
      analyses: payload.report.players.map(({ rank, name }) => ({
        rank,
        name,
        analysis: `Analyse de ${name} pour cette guerre.`
      }))
    });
  });

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  harness.listener("warCalculateReports", "click")();
  harness.listener("warRankReports", "click")();

  const before = structuredClone(harness.getSnapshot().captures[0].rankedReport);
  await harness.listener("warWriteAnalyses", "click")();
  const snapshot = harness.getSnapshot();
  const finalReport = snapshot.captures[0].finalReport;

  assert.equal(harness.fetchCalls.length, 2);
  assert.match(harness.fetchCalls[1].url, /\/api\/war\/write-analyses$/);
  assert.deepEqual(finalReport.report.summary, before.report.summary);
  assert.deepEqual(finalReport.report.ranking, before.report.ranking);
  finalReport.report.players.forEach((player, index) => {
    const { analysis, ...withoutAnalysis } = player;
    assert.deepEqual(withoutAnalysis, before.report.players[index]);
    assert.match(analysis, /pour cette guerre/);
    assert.equal("tags" in player, false);
  });
  assert.equal(snapshot.published, false);
  assert.equal(snapshot.final_reports.length, 1);
  assert.equal(harness.elements.warAnalyzedCount.textContent, "1");
});

test("le retour de veille resynchronise une rédaction déjà terminée et réactive Publier", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async (url, options) => {
    if (url.includes("parse-gemini-draft")) {
      return Response.json(draftPayload("zeus", "Zeus"));
    }
    const payload = JSON.parse(options.body);
    return Response.json({
      analyses: payload.report.players.map(({ rank, name }) => ({
        rank,
        name,
        analysis: `Analyse de ${name} après reprise.`
      }))
    });
  });

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  harness.listener("warCalculateReports", "click")();
  harness.listener("warRankReports", "click")();
  await harness.listener("warWriteAnalyses", "click")();

  assert.equal(harness.getSnapshot().final_reports.length, 1);

  harness.elements.warAnalyzedCount.textContent = "0";
  harness.elements.warPublishReports.disabled = true;
  harness.elements.warCalculateHelp.textContent = "état visuel figé";

  harness.windowListener("focus")();

  assert.equal(harness.elements.warAnalyzedCount.textContent, "1");
  assert.equal(harness.elements.warPublishReports.disabled, false);
  assert.equal(harness.elements.warPublishReports.textContent, "Publier");
  assert.match(harness.elements.warCalculateHelp.textContent, /1 rapport analysé prêt à publier/);
  assert.equal(harness.elements.warStatusPanel.dataset.state, "success");
  assert.equal(harness.elements.warStatusTitle.textContent, "Analyses terminées");
  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(typeof harness.windowListener("pageshow"), "function");
});

test("un Load failed réseau pendant la rédaction est retryé puis fusionné", async () => {
  const harness = createHarness({
    runtimeConfig: { retryDelaysMs: [10000, 30000], countdownStepMs: 10000 }
  });
  let analysisAttempt = 0;

  harness.setFetchImplementation(async (url, options) => {
    if (url.includes("parse-gemini-draft")) {
      return Response.json(draftPayload("zeus", "Zeus"));
    }

    analysisAttempt += 1;
    if (analysisAttempt === 1) {
      throw new TypeError("Load failed");
    }

    const payload = JSON.parse(options.body);
    return Response.json({
      analyses: payload.report.players.map(({ rank, name }) => ({
        rank,
        name,
        analysis: `Analyse de ${name} après retry réseau.`
      }))
    });
  });

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  harness.listener("warCalculateReports", "click")();
  harness.listener("warRankReports", "click")();
  await harness.listener("warWriteAnalyses", "click")();

  const analysisCalls = harness.fetchCalls.filter(({ url }) => url.includes("write-analyses"));
  assert.equal(analysisCalls.length, 2);
  assert.deepEqual(harness.timerCalls, [10000]);
  assert.match(harness.elements.warLog.innerHTML, /Tentative 1\/3 échouée : Load failed/);
  assert.match(harness.elements.warLog.innerHTML, /Attente 10 secondes avant la tentative 2/);
  assert.equal(harness.getSnapshot().final_reports.length, 1);
  assert.equal(harness.elements.warPublishReports.disabled, false);
});

test("la rédaction Workers AI temporaire respecte retry_after_seconds et sa marge", async () => {
  const temporary = await runAnalysisRetryCase("WORKERS_AI_TEMPORARY", 44);
  assert.deepEqual(temporary.timerCalls, [47000]);
  assert.match(temporary.elements.warLog.innerHTML, /Attente 47 secondes avant la tentative 2/);
  assert.equal(temporary.fetchCalls.filter(({ url }) => url.includes("write-analyses")).length, 2);
});

test("la rédaction ne retry pas le quota quotidien Workers AI", async () => {
  const dailyLimit = await runAnalysisRetryCase("WORKERS_AI_DAILY_LIMIT", 44);
  assert.deepEqual(dailyLimit.timerCalls, []);
  assert.equal(dailyLimit.fetchCalls.filter(({ url }) => url.includes("write-analyses")).length, 1);
  assert.match(dailyLimit.elements.warLog.innerHTML, /Quota quotidien Workers AI atteint/);
});

test("la rédaction ne retry pas une erreur Workers AI permanente", async () => {
  const permanent = await runAnalysisRetryCase("WORKERS_AI_ERROR", 44);
  assert.deepEqual(permanent.timerCalls, []);
  assert.equal(permanent.fetchCalls.filter(({ url }) => url.includes("write-analyses")).length, 1);
});

test("un rapport final est publié sans recalcul ni modification", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async (url, options) => {
    if (url.includes("parse-gemini-draft")) return Response.json(draftPayload("zeus", "Zeus"));
    if (url.includes("write-analyses")) {
      const payload = JSON.parse(options.body);
      return Response.json({
        analyses: payload.report.players.map(({ rank, name }) => ({
          rank,
          name,
          analysis: `Analyse fidèle de ${name} pour cette guerre.`
        }))
      });
    }
    return Response.json({
      ok: true,
      published: true,
      path: "docs/data/war/2026-08-02/zeus.json",
      commit_sha: "commit-zeus"
    });
  });

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  harness.listener("warCalculateReports", "click")();
  harness.listener("warRankReports", "click")();
  await harness.listener("warWriteAnalyses", "click")();

  const before = structuredClone(harness.getSnapshot().captures[0].finalReport);
  await harness.listener("warPublishReports", "click")();
  const snapshot = harness.getSnapshot();

  assert.equal(harness.fetchCalls.length, 3);
  assert.match(harness.fetchCalls[2].url, /\/api\/war\/publish-report$/);
  assert.equal(harness.fetchCalls[2].options.body, JSON.stringify(before));
  assert.deepEqual(snapshot.captures[0].finalReport, before);
  assert.equal(snapshot.captures[0].publication.state, "published");
  assert.equal(snapshot.captures[0].publication.commit_sha, "commit-zeus");
  assert.equal(snapshot.published, true);
  assert.equal(harness.elements.warPublishedCount.textContent, "1");
  assert.equal(harness.elements.warPublishReports.textContent, "Publié");
});

test("la publication reste séquentielle et poursuit après une erreur", async () => {
  const harness = createHarness();
  let ocrIndex = 0;
  let publicationIndex = 0;
  const drafts = [
    draftPayload("zeus", "Zeus"),
    draftPayload("kronos", "Kronos")
  ];

  harness.setFetchImplementation(async (url, options) => {
    if (url.includes("parse-gemini-draft")) return Response.json(drafts[ocrIndex++]);
    if (url.includes("write-analyses")) {
      const payload = JSON.parse(options.body);
      return Response.json({
        analyses: payload.report.players.map(({ rank, name }) => ({
          rank,
          name,
          analysis: `Analyse conservée de ${name} pour cette guerre.`
        }))
      });
    }

    publicationIndex += 1;
    if (publicationIndex === 1) {
      return Response.json({ ok: false, published: false, error: "Échec Zeus" }, { status: 500 });
    }
    return Response.json({
      ok: true,
      published: true,
      path: "docs/data/war/2026-08-02/kronos.json",
      commit_sha: "commit-kronos"
    });
  });

  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  for (let index = 0; index < 2; index += 1) {
    openReviewFromCard(harness, index);
    harness.listener("warValidateDraft", "click")();
    harness.listener("warReviewBack", "click")();
  }
  harness.listener("warCalculateReports", "click")();
  harness.listener("warRankReports", "click")();
  await harness.listener("warWriteAnalyses", "click")();
  const before = harness.getSnapshot().captures.map((capture) => structuredClone(capture.finalReport));
  await harness.listener("warPublishReports", "click")();
  const snapshot = harness.getSnapshot();
  const publicationCalls = harness.fetchCalls.filter(({ url }) => url.includes("publish-report"));

  assert.equal(publicationCalls.length, 2);
  assert.equal(harness.maxActiveRequests, 1);
  assert.equal(publicationCalls[0].options.body, JSON.stringify(before[0]));
  assert.equal(publicationCalls[1].options.body, JSON.stringify(before[1]));
  assert.deepEqual(snapshot.captures.map(({ finalReport }) => finalReport), before);
  assert.equal(snapshot.captures[0].publication.state, "error");
  assert.equal(snapshot.captures[1].publication.state, "published");
  assert.equal(snapshot.published, false);
  assert.match(harness.elements.warStatusMessage.textContent, /1 rapport publié · 1 échec conservé/);
});

test("deux alliances doivent être validées indépendamment avant le calcul groupé", async () => {
  const harness = createHarness();
  const responses = [
    draftPayload("zeus", "Zeus"),
    draftPayload("kronos", "Kronos")
  ];
  let responseIndex = 0;
  harness.setFetchImplementation(async () => Response.json(responses[responseIndex++]));

  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  openReviewFromCard(harness, 0);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBackBottom", "click")();
  assert.equal(harness.elements.warCalculateReports.disabled, true);
  assert.equal(harness.elements.warValidatedCount.textContent, "1");

  openReviewFromCard(harness, 1);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  assert.equal(harness.elements.warCalculateReports.disabled, false);

  harness.listener("warCalculateReports", "click")();
  const snapshot = harness.getSnapshot();
  assert.equal(snapshot.reports.length, 2);
  assert.deepEqual(snapshot.reports.map(({ alliance }) => alliance), ["zeus", "kronos"]);
  assert.deepEqual(
    snapshot.reports[0].report.report.players.slice(0, 3).map(({ original_rank }) => original_rank),
    [1, 2, 3]
  );
  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(harness.elements.warValidatedCount.textContent, "2");
  assert.equal(harness.elements.warCalculatedCount.textContent, "2");
});

test("un rapport calculé s’ouvre dans une vue mobile consultable puis revient à la session", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("poseidon", "Poséidon")));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBackBottom", "click")();
  harness.listener("warCalculateReports", "click")();

  const captureId = harness.elements.warCaptureList.innerHTML.match(
    /data-action="open-report" data-capture-id="(\d+)"/
  )?.[1];
  assert.ok(captureId);
  harness.listener("warCaptureList", "click")({
    target: { dataset: { action: "open-report", captureId }, disabled: false }
  });

  assert.equal(harness.elements.warSessionView.hidden, true);
  assert.equal(harness.elements.warReportView.hidden, false);
  assert.equal(harness.elements.warReportAlliance.textContent, "Poséidon");
  assert.equal(harness.elements.warReportPlayerCount.textContent, "24");
  assert.match(harness.elements.warReportPlayerList.innerHTML, /warAdminReportPlayer/);
  assert.match(harness.elements.warReportPlayerList.innerHTML, /Joueur 1/);
  assert.match(harness.elements.warCalculatedJson.textContent, /"score_total"/);

  harness.listener("warReportBack", "click")();
  assert.equal(harness.elements.warSessionView.hidden, false);
  assert.equal(harness.elements.warReportView.hidden, true);
});

test("modifier après calcul invalide uniquement le rapport concerné et impose une revalidation", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("athena", "Athéna")));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  harness.listener("warCalculateReports", "click")();

  openReviewFromCard(harness, 0, true);
  harness.listener("warReviewUnlock", "click")();
  openEditorRow(harness, 0);
  editField(harness, "damage", "2222222222");
  harness.listener("warEditorForm", "submit")(submitEvent());

  let snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].state, "À revalider");
  assert.equal(snapshot.captures[0].calculatedReport, null);
  assert.equal(snapshot.reports.length, 0);
  assert.equal(harness.elements.warCalculateReports.disabled, true);

  harness.listener("warValidateDraft", "click")();
  assert.equal(harness.elements.warCalculateReports.disabled, false);
  harness.listener("warCalculateReports", "click")();
  snapshot = harness.getSnapshot();

  assert.equal(snapshot.captures[0].state, "Rapport calculé");
  assert.equal(snapshot.captures[0].calculatedReport.players[0].damage, 2222222222);
  assert.equal(snapshot.reports.length, 1);
  assert.equal(harness.fetchCalls.length, 1);
});

test("le workflow complet calcule les six alliances validées en une seule action locale", async () => {
  const harness = createHarness();
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
    const [alliance, label] = allianceResults[responseIndex++];
    return Response.json(draftPayload(alliance, label));
  });

  harness.elements.warImage.files = files(6);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  for (let index = 0; index < allianceResults.length; index += 1) {
    openReviewFromCard(harness, index);
    harness.listener("warValidateDraft", "click")();
    harness.listener("warReviewBackBottom", "click")();
  }

  assert.equal(harness.elements.warCalculateReports.disabled, false);
  harness.listener("warCalculateReports", "click")();
  const snapshot = harness.getSnapshot();

  assert.equal(harness.fetchCalls.length, 6);
  assert.equal(snapshot.reports.length, 6);
  assert.deepEqual(
    snapshot.reports.map(({ alliance }) => alliance),
    allianceResults.map(([alliance]) => alliance)
  );
  assert.deepEqual(
    snapshot.reports.map(({ report }) => [
      report.report.summary.minimum_attacks,
      report.report.summary.minimum_deviations
    ]),
    [[11, 2], [11, 2], [10, 1], [10, 1], [10, 0], [10, 0]]
  );
  assert.equal(harness.elements.warValidatedCount.textContent, "6");
  assert.equal(harness.elements.warCalculatedCount.textContent, "6");
});

test("exclure puis réintégrer un brouillon à corriger conserve son OCR et son blocage réel", async () => {
  const harness = createHarness();
  const invalid = draftPayload("zeus", "Zeus");
  invalid.draft.players[0].name = "";
  invalid.players[0].name = "";
  harness.setFetchImplementation(async () => Response.json(invalid));

  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  const before = structuredClone(harness.getSnapshot().captures[0].ocr_draft);

  toggleExcludedFromCard(harness);
  let snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].excluded, true);
  assert.deepEqual(snapshot.captures[0].ocr_draft, before);
  assert.deepEqual(snapshot.captures[0].editable_draft, before);
  assert.match(harness.elements.warCaptureList.innerHTML, /Exclu[\s\S]*Réintégrer/);

  toggleExcludedFromCard(harness);
  snapshot = harness.getSnapshot();
  assert.equal(snapshot.captures[0].excluded, false);
  assert.deepEqual(snapshot.captures[0].ocr_draft, before);
  assert.equal(snapshot.captures[0].state, "À corriger");
  assert.equal(harness.elements.warCalculateReports.disabled, true);
  assert.equal(harness.fetchCalls.length, 1, "la réintégration ne relance pas Gemini");
});

test("un brouillon validé conserve sa validation après exclusion et réintégration", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("poseidon", "Poséidon")));
  harness.elements.warImage.files = files(1);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  openReviewFromCard(harness);
  harness.listener("warValidateDraft", "click")();
  harness.listener("warReviewBack", "click")();
  const validated = structuredClone(harness.getSnapshot().captures[0].validatedDraft);

  toggleExcludedFromCard(harness);
  toggleExcludedFromCard(harness);
  const capture = harness.getSnapshot().captures[0];
  assert.equal(capture.excluded, false);
  assert.deepEqual(capture.validatedDraft, validated);
  assert.equal(capture.state, "OCR validé");
  assert.equal(harness.fetchCalls.length, 1);
});

test("les alliances exclues sont absentes du calcul, de Groq et de la publication", async () => {
  const harness = createHarness();
  const alliances = [["zeus", "Zeus"], ["dionysos", "Dionysos"], ["poseidon", "Poséidon"]];
  let ocrIndex = 0;
  harness.setFetchImplementation(async (url, options) => {
    if (url.includes("parse-gemini-draft")) {
      const [key, label] = alliances[ocrIndex++];
      return Response.json(draftPayload(key, label));
    }
    if (url.includes("write-analyses")) {
      const payload = JSON.parse(options.body);
      return Response.json({ analyses: payload.report.players.map(({ rank, name }) => ({ rank, name, analysis: `Analyse de ${name}.` })) });
    }
    return Response.json({ ok: true, published: true, path: "docs/data/war/test.json", commit_sha: "test" });
  });

  harness.elements.warImage.files = files(3);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());
  toggleExcludedFromCard(harness, 1);
  for (const index of [0, 2]) {
    openReviewFromCard(harness, index);
    harness.listener("warValidateDraft", "click")();
    harness.listener("warReviewBack", "click")();
  }
  harness.listener("warCalculateReports", "click")();
  harness.listener("warRankReports", "click")();
  await harness.listener("warWriteAnalyses", "click")();
  await harness.listener("warPublishReports", "click")();

  const snapshot = harness.getSnapshot();
  assert.deepEqual(snapshot.reports.map(({ alliance }) => alliance), ["zeus", "poseidon"]);
  assert.deepEqual(snapshot.final_reports.map(({ alliance }) => alliance), ["zeus", "poseidon"]);
  assert.equal(harness.fetchCalls.filter(({ url }) => url.includes("write-analyses")).length, 2);
  assert.equal(harness.fetchCalls.filter(({ url }) => url.includes("publish-report")).length, 2);
  assert.equal(snapshot.captures[1].excluded, true);
  assert.ok(snapshot.captures[1].ocr_draft, "l’OCR Dionysos reste dans la session");
});

test("la fusion ignore un fragment exclu et ne produit rien quand ils le sont tous", async () => {
  const harness = createHarness();
  harness.setFetchImplementation(async () => Response.json(draftPayload("dionysos", "Dionysos")));
  harness.elements.warImage.files = files(2);
  harness.listener("warImage", "change")();
  await harness.listener("warAdminForm", "submit")(submitEvent());

  toggleExcludedFromCard(harness, 0);
  let snapshot = harness.getSnapshot();
  assert.equal(snapshot.drafts.length, 1);
  assert.equal(snapshot.drafts[0].source_count, 1);
  assert.equal(snapshot.drafts[0].draft.players[0]._source_count, 1);

  toggleExcludedFromCard(harness, 1);
  snapshot = harness.getSnapshot();
  assert.equal(snapshot.drafts.length, 0);
  assert.equal(snapshot.reports.length, 0);
  assert.equal(harness.fetchCalls.length, 2);
});
