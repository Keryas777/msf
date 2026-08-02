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
    this.listeners = new Map();
    this.options = [];
    this.selectedIndex = 0;
    this.src = "";
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
    if (name === "src") this.src = "";
  }
}

function createHarness() {
  const ids = [
    "warAdminForm",
    "warDate",
    "warAlliance",
    "warImage",
    "warPreviewPanel",
    "warPreview",
    "warFileMeta",
    "warSubmit",
    "warStatusPanel",
    "warStatusTitle",
    "warStatusBadge",
    "warStatusMessage",
    "warResult"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  elements.warAlliance.options = [
    { text: "Zeus" },
    { text: "Athéna" },
    { text: "Kronos" },
    { text: "Dionysos" },
    { text: "Poséidon" },
    { text: "Hadès" }
  ];

  const windowListeners = new Map();
  const revokedUrls = [];
  let objectUrlIndex = 0;
  const fetchCalls = [];
  let fetchImplementation = null;

  const context = {
    Blob,
    Date,
    Error,
    File,
    FormData,
    JSON,
    Number,
    Response,
    String,
    console,
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    fetch(url, options) {
      fetchCalls.push({ url, options });
      return fetchImplementation(url, options);
    },
    URL: {
      createObjectURL() {
        objectUrlIndex += 1;
        return `blob:test-${objectUrlIndex}`;
      },
      revokeObjectURL(value) {
        revokedUrls.push(value);
      }
    },
    window: {
      addEventListener(type, listener) {
        const listeners = windowListeners.get(type) || [];
        listeners.push(listener);
        windowListeners.set(type, listeners);
      }
    }
  };

  vm.runInNewContext(app, context, { filename: "war-admin.js" });

  return {
    elements,
    fetchCalls,
    revokedUrls,
    setFetchImplementation(value) {
      fetchImplementation = value;
    },
    listener(id, type) {
      return elements[id].listeners.get(type)?.[0];
    }
  };
}

function submitEvent() {
  return {
    preventDefault() {}
  };
}

test("l’état initial ne lance aucun appel et bloque l’envoi", () => {
  const harness = createHarness();
  const { elements, fetchCalls } = harness;

  assert.match(elements.warDate.value, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(elements.warAlliance.value, "zeus");
  assert.equal(elements.warSubmit.disabled, true);
  assert.equal(elements.warStatusPanel.dataset.state, "idle");
  assert.equal(elements.warStatusTitle.textContent, "En attente");
  assert.equal(fetchCalls.length, 0);
});

test("le remplacement de l’image révoque chaque ancienne URL", () => {
  const harness = createHarness();
  const { elements, revokedUrls } = harness;
  const changeImage = harness.listener("warImage", "change");

  elements.warImage.files = [new File(["one"], "premiere.png", { type: "image/png" })];
  changeImage();
  assert.equal(elements.warPreview.src, "blob:test-1");
  assert.equal(elements.warPreviewPanel.hidden, false);
  assert.equal(elements.warSubmit.disabled, false);
  assert.match(elements.warFileMeta.textContent, /premiere\.png/);

  elements.warImage.files = [new File(["two"], "seconde.png", { type: "image/png" })];
  changeImage();
  assert.equal(elements.warPreview.src, "blob:test-2");
  assert.deepEqual(revokedUrls, ["blob:test-1"]);

  elements.warImage.files = [];
  changeImage();
  assert.equal(elements.warPreviewPanel.hidden, true);
  assert.equal(elements.warSubmit.disabled, true);
  assert.deepEqual(revokedUrls, ["blob:test-1", "blob:test-2"]);
});

test("le succès simulé envoie un seul FormData malgré deux soumissions", async () => {
  const harness = createHarness();
  const { elements, fetchCalls } = harness;
  const changeImage = harness.listener("warImage", "change");
  const submit = harness.listener("warAdminForm", "submit");
  let releaseResponse;

  harness.setFetchImplementation(
    () => new Promise((resolvePromise) => {
      releaseResponse = () => resolvePromise(
        Response.json({
          ok: true,
          alliance: "zeus",
          counts: { players_total: 24 },
          published: false
        })
      );
    })
  );

  const file = new File(["image"], "guerre.png", { type: "image/png" });
  elements.warImage.files = [file];
  changeImage();

  const firstSubmit = submit(submitEvent());
  const secondSubmit = submit(submitEvent());

  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    "https://msf-war-ocr.deliriousfan7.workers.dev/api/war/parse-gemini-draft"
  );
  assert.equal(fetchCalls[0].options.method, "POST");
  assert.equal("headers" in fetchCalls[0].options, false);
  assert.equal(fetchCalls[0].options.body.get("alliance"), "zeus");
  assert.equal(fetchCalls[0].options.body.get("war_date"), elements.warDate.value);
  assert.equal(fetchCalls[0].options.body.get("image").name, "guerre.png");
  assert.equal(elements.warStatusPanel.dataset.state, "sending");
  assert.equal(elements.warSubmit.disabled, true);

  releaseResponse();
  await Promise.all([firstSubmit, secondSubmit]);

  assert.equal(fetchCalls.length, 1);
  assert.equal(elements.warStatusPanel.dataset.state, "success");
  assert.equal(elements.warStatusTitle.textContent, "OCR terminé");
  assert.equal(elements.warStatusBadge.textContent, "Brouillon");
  assert.match(elements.warStatusMessage.textContent, /Brouillon non publié/);
  assert.match(elements.warStatusMessage.textContent, /Aucune donnée GitHub modifiée/);
  assert.match(elements.warResult.textContent, /"players_total": 24/);
  assert.match(elements.warResult.textContent, /"published": false/);
  assert.equal(elements.warSubmit.disabled, false);
});

test("une erreur HTTP simulée conserve et affiche le JSON complet", async () => {
  const harness = createHarness();
  const { elements } = harness;
  const changeImage = harness.listener("warImage", "change");
  const submit = harness.listener("warAdminForm", "submit");
  const errorPayload = { ok: false, error: "Erreur simulée", details: { row: 4 } };

  harness.setFetchImplementation(async () => Response.json(errorPayload, {
    status: 422,
    statusText: "Unprocessable Entity"
  }));

  elements.warImage.files = [new File(["image"], "guerre.png", { type: "image/png" })];
  changeImage();
  await submit(submitEvent());

  assert.equal(elements.warStatusPanel.dataset.state, "error");
  assert.equal(elements.warStatusTitle.textContent, "Échec de l’envoi");
  assert.match(elements.warStatusMessage.textContent, /HTTP 422 Unprocessable Entity/);
  assert.match(elements.warStatusMessage.textContent, /Erreur simulée/);
  assert.equal(elements.warResult.textContent, JSON.stringify(errorPayload, null, 2));
  assert.equal(elements.warSubmit.disabled, false);
});
