const CARD_SELECTOR = ".capture-card[data-run-id]";
const SCROLLER_SELECTOR = ".team-slots-scroll";
const PULL_REFRESH_THRESHOLD = 8;

function isCaptureCard(node) {
  return node instanceof Element && node.matches(CARD_SELECTOR);
}

function findCard(root, runId) {
  return [...root.children].find((node) => node.dataset?.runId === runId) || null;
}

function normalizedCardMarkup(card) {
  const clone = card.cloneNode(true);
  clone.querySelectorAll(".sheet-write-button").forEach((node) => node.remove());
  clone.querySelectorAll("details[open]").forEach((node) => node.removeAttribute("open"));
  clone.querySelectorAll(".counter-summary").forEach((node) => {
    delete node.dataset.writeEnhancing;
    delete node.dataset.sheetWriteDone;
  });
  return clone.innerHTML;
}

function captureCardUiState(card, documentObj) {
  const detailsOpen = [...card.querySelectorAll("details")].map((node) => node.open);
  const scrollLeft = [...card.querySelectorAll(SCROLLER_SELECTOR)].map((node) => node.scrollLeft);
  const active = documentObj.activeElement;
  let focus = null;

  if (active && card.contains(active)) {
    focus = {
      tagName: active.tagName,
      type: active.getAttribute?.("type") || "",
      ariaLabel: active.getAttribute?.("aria-label") || "",
      name: active.getAttribute?.("name") || "",
      value: active.getAttribute?.("value") || active.value || "",
      text: active.textContent || "",
      selectionStart: Number.isInteger(active.selectionStart) ? active.selectionStart : null,
      selectionEnd: Number.isInteger(active.selectionEnd) ? active.selectionEnd : null
    };
  }

  return { detailsOpen, scrollLeft, focus };
}

function sameFocusTarget(node, focus) {
  if (!focus || node.tagName !== focus.tagName) return false;
  if ((node.getAttribute?.("type") || "") !== focus.type) return false;
  if (focus.ariaLabel && node.getAttribute?.("aria-label") !== focus.ariaLabel) return false;
  if (focus.name && node.getAttribute?.("name") !== focus.name) return false;
  if (focus.value && (node.getAttribute?.("value") || node.value || "") !== focus.value) return false;
  if (!focus.ariaLabel && !focus.name && !focus.value && focus.text && node.textContent !== focus.text) return false;
  return true;
}

function restoreCardUiState(card, state) {
  [...card.querySelectorAll("details")].forEach((node, index) => {
    node.open = Boolean(state.detailsOpen[index]);
  });
  [...card.querySelectorAll(SCROLLER_SELECTOR)].forEach((node, index) => {
    node.scrollLeft = Number(state.scrollLeft[index]) || 0;
  });

  if (!state.focus) return;
  const focusables = [...card.querySelectorAll("input,button,summary")];
  const target = focusables.find((node) => sameFocusTarget(node, state.focus));
  if (!target) return;

  target.focus({ preventScroll: true });
  if (
    state.focus.selectionStart !== null &&
    state.focus.selectionEnd !== null &&
    typeof target.setSelectionRange === "function"
  ) {
    try {
      target.setSelectionRange(state.focus.selectionStart, state.focus.selectionEnd);
    } catch (_) {}
  }
}

function installStableResultsRoot(root, { windowObj, documentObj }) {
  if (!root || root.dataset.stableRendering === "1") return;
  root.dataset.stableRendering = "1";

  const nativeReplaceChildren = root.replaceChildren.bind(root);
  const nativeAppend = root.append.bind(root);
  let renderCycle = null;
  let cycleId = 0;

  root.replaceChildren = (...nodes) => {
    if (nodes.length) {
      renderCycle = null;
      return nativeReplaceChildren(...nodes);
    }

    const id = ++cycleId;
    renderCycle = { id, appended: false };

    queueMicrotask(() => {
      if (!renderCycle || renderCycle.id !== id) return;
      if (!renderCycle.appended) nativeReplaceChildren();
      renderCycle = null;
    });
  };

  root.append = (...nodes) => {
    if (!renderCycle) return nativeAppend(...nodes);
    renderCycle.appended = true;

    for (const node of nodes) {
      if (!isCaptureCard(node) || !node.dataset.runId) {
        nativeAppend(node);
        continue;
      }

      const existing = findCard(root, node.dataset.runId);
      if (!existing) {
        nativeAppend(node);
        continue;
      }

      if (normalizedCardMarkup(existing) === normalizedCardMarkup(node)) continue;

      const state = captureCardUiState(existing, documentObj);
      const topBefore = existing.getBoundingClientRect().top;
      existing.replaceWith(node);
      restoreCardUiState(node, state);

      const topAfter = node.getBoundingClientRect().top;
      const delta = topAfter - topBefore;
      if (Number.isFinite(delta) && Math.abs(delta) > 0.5) {
        windowObj.scrollBy(0, delta);
      }
    }
  };
}

function installPullToRefreshGuard({ windowObj, documentObj }) {
  let lastY = null;
  let topAnchorY = null;

  documentObj.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      lastY = null;
      topAnchorY = null;
      return;
    }

    const currentY = event.touches[0].clientY;
    lastY = currentY;
    topAnchorY = windowObj.scrollY <= 0 ? currentY : null;
  }, { passive: true });

  documentObj.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 1) {
      lastY = null;
      topAnchorY = null;
      return;
    }

    const currentY = event.touches[0].clientY;
    if (windowObj.scrollY <= 0) {
      if (topAnchorY === null) topAnchorY = lastY ?? currentY;
      if (currentY - topAnchorY > PULL_REFRESH_THRESHOLD) event.preventDefault();
    } else {
      topAnchorY = null;
    }
    lastY = currentY;
  }, { passive: false });

  const clear = () => {
    lastY = null;
    topAnchorY = null;
  };
  documentObj.addEventListener("touchend", clear, { passive: true });
  documentObj.addEventListener("touchcancel", clear, { passive: true });
}

function installUnloadGuard(root, windowObj) {
  windowObj.addEventListener("beforeunload", (event) => {
    if (!root.querySelector(CARD_SELECTOR)) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

export function installWarCounterLabStability({
  root = document.querySelector("#captureResults"),
  windowObj = window,
  documentObj = document
} = {}) {
  if (!root) return;
  installStableResultsRoot(root, { windowObj, documentObj });
  installPullToRefreshGuard({ windowObj, documentObj });
  installUnloadGuard(root, windowObj);
}
