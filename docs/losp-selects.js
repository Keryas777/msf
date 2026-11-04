// Unified, accessible single-choice dropdowns. Native selects stay as the source of truth.
(() => {
  "use strict";
  const states = new Map();
  let active = null;
  let nextId = 0;

  function isAllianceSelect(select) {
    return /^(allianceSelect|historyAlliance)$/.test(select.id) || select.dataset.lospAlliance === "true";
  }

  function allianceMeta(value) {
    return window.LoSPAlliances?.getAllianceMeta?.(value) || null;
  }

  function allianceLabel(container, meta) {
    if (meta.displayParts?.length === 2) {
      container.classList.add("losp-choice__bicolor");
      if (meta.group === "losp" && meta.emoji) {
        const emoji = document.createElement("span");
        emoji.className = "losp-choice__emoji";
        emoji.textContent = meta.emoji;
        container.appendChild(emoji);
      }
      const first = document.createElement("span");
      first.textContent = meta.displayParts[0];
      first.className = "losp-choice__name-white";
      const second = document.createElement("span");
      second.textContent = meta.displayParts[1];
      second.style.color = meta.color || "inherit";
      container.append(first, second);
      return;
    }
    if (meta.emoji) {
      const emoji = document.createElement("span");
      emoji.className = "losp-choice__emoji";
      emoji.textContent = meta.emoji;
      container.append(emoji);
    }
    const name = document.createElement("span");
    name.textContent = meta.displayName || meta.name;
    if (meta.nameColor) name.style.color = meta.nameColor;
    container.append(name);
  }

  function optionLabel(container, select, option) {
    const meta = isAllianceSelect(select) ? allianceMeta(option.value) : null;
    if (meta) {
      allianceLabel(container, meta);
    } else {
      container.textContent = isAllianceSelect(select)
        ? option.textContent.trim().replace(/^•\s*/, "")
        : option.textContent.trim();
    }
  }

  function entries(select) {
    const output = [];
    for (const child of select.children) {
      if (child.tagName === "OPTION") {
        output.push({ option: child, group: "" });
      } else if (child.tagName === "OPTGROUP") {
        for (const option of child.children) {
          if (option.tagName === "OPTION") {
            output.push({ option, group: child.label || "", groupDisabled: child.disabled });
          }
        }
      }
    }
    return output;
  }

  function getCurrentOption(select) {
    return select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
  }

  function updateTrigger(state) {
    const { select, button, label } = state;
    const option = getCurrentOption(select);
    label.replaceChildren();
    if (option) optionLabel(label, select, option);
    else label.textContent = "— Choisir —";
    button.disabled = select.matches(":disabled") || !select.options.length;
    const fieldLabel = select.getAttribute("aria-label") ||
      (select.labels?.[0]?.textContent || "Choisir une option").trim();
    button.setAttribute("aria-label", fieldLabel + (option ? " : " + option.textContent.trim() : ""));
    state.host.hidden = select.hidden || select.style.display === "none";
    if (active === state && button.disabled) closeDropdown();
    state.value = select.value;
  }

  function focusSelectedOption(state, preferredIndex) {
    const list = state.items;
    if (!list.length) return;
    let index = Number.isInteger(preferredIndex) ? preferredIndex :
      list.findIndex((item) => item.option.selected && !item.disabled);
    if (index < 0 || list[index]?.disabled) index = list.findIndex((item) => !item.disabled);
    state.activeIndex = index;
    list.forEach((item, i) => {
      item.node.classList.toggle("is-highlighted", i === index);
    });
    if (index >= 0) {
      state.button.setAttribute("aria-activedescendant", list[index].node.id);
      list[index].node.scrollIntoView({ block: "nearest" });
    } else {
      state.button.removeAttribute("aria-activedescendant");
    }
  }

  function renderOptions(state) {
    const { select, panel } = state;
    panel.replaceChildren();
    state.items = [];
    let lastGroup = null;
    for (const entry of entries(select)) {
      if (entry.group && entry.group !== lastGroup) {
        const heading = document.createElement("div");
        heading.className = "losp-choice__group";
        heading.textContent = entry.group;
        heading.setAttribute("role", "presentation");
        panel.append(heading);
      }
      lastGroup = entry.group;
      const option = entry.option;
      const disabled = Boolean(option.disabled || entry.groupDisabled);
      const node = document.createElement("div");
      node.id = "losp-option-" + (++nextId);
      node.className = "losp-choice__option";
      node.setAttribute("role", "option");
      node.setAttribute("aria-selected", String(option.selected));
      if (disabled) node.setAttribute("aria-disabled", "true");
      const name = document.createElement("span");
      name.className = "losp-choice__option-label";
      optionLabel(name, select, option);
      const check = document.createElement("span");
      check.className = "losp-choice__check";
      check.textContent = "✓";
      check.setAttribute("aria-hidden", "true");
      node.append(name, check);
      panel.append(node);
      const index = state.items.length;
      state.items.push({ node, option, disabled });
      node.addEventListener("click", () => {
        if (disabled) return;
        choose(state, index);
      });
    }
    focusSelectedOption(state);
  }

  function placePanel(state) {
    if (active !== state) return;
    const rect = state.button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0;
    const left = viewport?.offsetLeft || 0;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const margin = 8;
    const availableBelow = top + height - rect.bottom - margin;
    const availableAbove = rect.top - top - margin;
    const opensAbove = availableBelow < 220 && availableAbove > availableBelow;
    const maxHeight = Math.max(80, Math.min(420, opensAbove ? availableAbove - 6 : availableBelow - 6));
    const panelWidth = Math.min(Math.max(rect.width, 220), width - margin * 2);
    state.panel.style.width = panelWidth + "px";
    state.panel.style.left = Math.max(left + margin, Math.min(rect.left, left + width - margin - panelWidth)) + "px";
    state.panel.style.maxHeight = maxHeight + "px";
    state.panel.style.top = opensAbove
      ? Math.max(top + margin, rect.top - Math.min(state.panel.scrollHeight, maxHeight) - 5) + "px"
      : Math.min(rect.bottom + 5, top + height - margin - maxHeight) + "px";
  }

  function closeDropdown() {
    if (!active) return;
    const state = active;
    active = null;
    state.panel.remove();
    state.button.setAttribute("aria-expanded", "false");
    state.button.removeAttribute("aria-activedescendant");
  }

  function openDropdown(state) {
    if (state.select.matches(":disabled")) return;
    closeDropdown();
    updateTrigger(state);
    if (state.button.disabled) return;
    active = state;
    state.button.setAttribute("aria-expanded", "true");
    renderOptions(state);
    document.body.append(state.panel);
    focusSelectedOption(state);
    placePanel(state);
  }

  function choose(state, index) {
    const entry = state.items[index];
    if (!entry || entry.disabled) return;
    const changed = state.select.value !== entry.option.value;
    state.select.value = entry.option.value;
    closeDropdown();
    updateTrigger(state);
    state.button.focus({ preventScroll: true });
    if (changed) {
      state.select.dispatchEvent(new Event("input", { bubbles: true }));
      state.select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function moveHighlight(state, direction, homeOrEnd = false) {
    const enabled = state.items.map((item, i) => item.disabled ? -1 : i).filter((i) => i >= 0);
    if (!enabled.length) return;
    const at = enabled.indexOf(state.activeIndex);
    const next = homeOrEnd ? (direction > 0 ? enabled[0] : enabled[enabled.length - 1])
      : enabled[(at + (direction > 0 ? 1 : enabled.length - 1)) % enabled.length];
    focusSelectedOption(state, next);
  }

  function makeDropdown(select) {
    if (states.has(select) || select.multiple || select.closest("[data-losp-native-selects]")) return;
    const host = document.createElement("span");
    host.className = "losp-choice";
    if (select.classList.contains("select--compact")) host.classList.add("losp-choice--compact");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "losp-select-trigger";
    button.setAttribute("role", "combobox");
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    const panel = document.createElement("div");
    panel.id = "losp-listbox-" + (++nextId);
    panel.className = "losp-choice__panel";
    panel.setAttribute("role", "listbox");
    button.setAttribute("aria-controls", panel.id);
    const label = document.createElement("span");
    label.className = "losp-choice__value";
    const arrow = document.createElement("span");
    arrow.className = "losp-choice__arrow";
    arrow.setAttribute("aria-hidden", "true");
    button.append(label, arrow);
    host.append(button);
    select.insertAdjacentElement("afterend", host);
    const state = { select, host, button, panel, label, items: [], activeIndex: -1 };
    states.set(select, state);
    select.classList.add("losp-native-select");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    updateTrigger(state);
    button.addEventListener("click", () => active === state ? closeDropdown() : openDropdown(state));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && active === state) {
        event.preventDefault(); closeDropdown(); return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        if (active !== state) openDropdown(state);
        else moveHighlight(state, event.key === "ArrowDown" || event.key === "Home" ? 1 : -1,
          event.key === "Home" || event.key === "End");
      } else if (event.key === "Enter" && active === state) {
        event.preventDefault(); choose(state, state.activeIndex);
      }
    });
    select.addEventListener("change", () => updateTrigger(state));
    select.addEventListener("input", () => updateTrigger(state));
    const observer = new MutationObserver(() => {
      updateTrigger(state);
      if (active === state) { renderOptions(state); placePanel(state); }
    });
    observer.observe(select, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["disabled", "hidden", "style", "label", "selected", "value"] });
    state.observer = observer;
    if (select.id) {
      document.querySelectorAll("label[for]").forEach((element) => {
        if (element.htmlFor !== select.id) return;
        element.addEventListener("click", (event) => {
          if (event.target.closest("button, a")) return;
          event.preventDefault();
          button.focus();
          if (active !== state) openDropdown(state);
        });
      });
    }
  }

  // Keep the existing checkbox chips and their typography; only normalize alliance names.
  function updateChip(toggle) {
    const input = toggle.querySelector('input[type="checkbox"][data-alliance], input[type="checkbox"][data-alliance-key]');
    if (!input) return;
    const key = input.dataset.alliance || input.dataset.allianceKey;
    const meta = allianceMeta(key);
    if (!meta || toggle.dataset.lospFormattedAlliance === meta.key) return;
    const label = toggle.querySelector(".fName");
    if (!label) return;
    if (window.LoSPAlliances?.renderAllianceName) {
      window.LoSPAlliances.renderAllianceName(label, key);
    }
    const emoji = toggle.querySelector(".fEmoji");
    if (emoji) emoji.textContent = meta.displayParts?.length === 2 && meta.group !== "losp"
      ? "" : (meta.emoji || "");
    toggle.classList.toggle("losp-alliance-chip", meta.group === "losp");
    toggle.dataset.lospFormattedAlliance = meta.key;
  }

  function scan(root = document) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.("select")) makeDropdown(root);
    root.querySelectorAll?.("select").forEach(makeDropdown);
    if (root.matches?.(".filterToggle")) updateChip(root);
    root.querySelectorAll?.(".filterToggle").forEach(updateChip);
  }

  function refreshAll() {
    for (const state of states.values()) {
      if (state.value !== state.select.value ||
        state.button.disabled !== (state.select.matches(":disabled") || !state.select.options.length)) {
        updateTrigger(state);
      }
    }
  }

  function init() {
    scan();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) scan(node);
      }
      for (const [select, state] of states) {
        if (!select.isConnected) {
          if (active === state) closeDropdown();
          state.observer.disconnect();
          state.host.remove();
          states.delete(select);
        }
      }
      refreshAll();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerdown", (event) => {
      if (active && !active.host.contains(event.target) && !active.panel.contains(event.target)) {
        closeDropdown();
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && active) closeDropdown();
    });
    document.addEventListener("scroll", (event) => {
      if (!active) return;
      if (active.panel.contains(event.target)) return;
      placePanel(active);
    }, true);
    window.addEventListener("resize", () => { if (active) placePanel(active); });
    window.visualViewport?.addEventListener("resize", () => { if (active) placePanel(active); });
    window.visualViewport?.addEventListener("scroll", () => { if (active) placePanel(active); });
    window.addEventListener("losp:auth-ready", () => { scan(); refreshAll(); });
    if (window.LoSPAlliances?.loadAlliances) {
      window.LoSPAlliances.loadAlliances().then(() => {
        for (const state of states.values()) updateTrigger(state);
        document.querySelectorAll(".filterToggle").forEach((toggle) => {
          delete toggle.dataset.lospFormattedAlliance;
          updateChip(toggle);
        });
        if (active) { renderOptions(active); placePanel(active); }
      }).catch(() => {});
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();