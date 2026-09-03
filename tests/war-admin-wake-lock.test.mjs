import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../docs/war-admin-wake-lock.js", import.meta.url), "utf8");

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener();
  }
}

class FakeForm {
  constructor(busy = false) {
    this.attributes = new Map([["aria-busy", String(busy)]]);
    this.observers = [];
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    for (const observer of this.observers) observer.callback();
  }
}

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe(target) {
    target.observers.push(this);
  }
}

function createWakeLockSentinel(onRelease) {
  const target = new FakeEventTarget();
  return {
    released: false,
    addEventListener(type, listener) {
      target.addEventListener(type, listener);
    },
    async release() {
      if (this.released) return;
      this.released = true;
      onRelease();
      target.dispatch("release");
    }
  };
}

function createHarness({ busy = false, supported = true } = {}) {
  const form = new FakeForm(busy);
  const documentTarget = new FakeEventTarget();
  const windowTarget = new FakeEventTarget();
  let requestCalls = 0;
  let releaseCalls = 0;
  const sentinels = [];

  const documentObject = {
    visibilityState: "visible",
    getElementById(id) {
      return id === "warAdminForm" ? form : null;
    },
    addEventListener(type, listener) {
      documentTarget.addEventListener(type, listener);
    }
  };

  const navigatorObject = {};
  if (supported) {
    navigatorObject.wakeLock = {
      async request(type) {
        assert.equal(type, "screen");
        requestCalls += 1;
        const sentinel = createWakeLockSentinel(() => {
          releaseCalls += 1;
        });
        sentinels.push(sentinel);
        return sentinel;
      }
    };
  }

  const windowObject = {
    addEventListener(type, listener) {
      windowTarget.addEventListener(type, listener);
    }
  };

  const context = vm.createContext({
    MutationObserver: FakeMutationObserver,
    document: documentObject,
    navigator: navigatorObject,
    window: windowObject
  });
  vm.runInContext(app, context, { filename: "war-admin-wake-lock.js" });

  return {
    documentObject,
    form,
    sentinels,
    get requestCalls() {
      return requestCalls;
    },
    get releaseCalls() {
      return releaseCalls;
    },
    dispatchDocument(type) {
      documentTarget.dispatch(type);
    },
    dispatchWindow(type) {
      windowTarget.dispatch(type);
    }
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("le wake lock suit exactement l'état aria-busy de la session", async () => {
  const harness = createHarness();
  await flush();

  assert.equal(harness.requestCalls, 0);
  assert.equal(harness.releaseCalls, 0);

  harness.form.setAttribute("aria-busy", "true");
  await flush();
  assert.equal(harness.requestCalls, 1);
  assert.equal(harness.sentinels[0].released, false);

  harness.form.setAttribute("aria-busy", "true");
  await flush();
  assert.equal(harness.requestCalls, 1);

  harness.form.setAttribute("aria-busy", "false");
  await flush();
  assert.equal(harness.releaseCalls, 1);
  assert.equal(harness.sentinels[0].released, true);
});

test("le wake lock est relâché quand la page disparaît puis repris au retour", async () => {
  const harness = createHarness({ busy: true });
  await flush();

  assert.equal(harness.requestCalls, 1);

  harness.documentObject.visibilityState = "hidden";
  harness.dispatchDocument("visibilitychange");
  await flush();
  assert.equal(harness.releaseCalls, 1);

  harness.documentObject.visibilityState = "visible";
  harness.dispatchDocument("visibilitychange");
  await flush();
  assert.equal(harness.requestCalls, 2);

  harness.dispatchWindow("focus");
  harness.dispatchWindow("pageshow");
  await flush();
  assert.equal(harness.requestCalls, 2);

  harness.dispatchWindow("pagehide");
  await flush();
  assert.equal(harness.releaseCalls, 2);
});

test("un navigateur sans Screen Wake Lock continue sans erreur", async () => {
  const harness = createHarness({ busy: true, supported: false });
  await flush();

  assert.equal(harness.requestCalls, 0);
  harness.form.setAttribute("aria-busy", "false");
  harness.form.setAttribute("aria-busy", "true");
  harness.dispatchWindow("focus");
  await flush();
  assert.equal(harness.requestCalls, 0);
});
