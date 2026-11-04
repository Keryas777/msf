import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function node(stacked = false) {
  const classes = new Set();
  let text = "";
  return {
    children: [],
    style: {},
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    closest(selector) {
      return stacked && selector === '[data-alliance-name-lines="two"]' ? {} : null;
    },
    append(...children) { this.children.push(...children); },
    set textContent(value) { text = String(value); this.children = []; },
    get textContent() {
      return this.children.length
        ? this.children.map((child) => child.textContent).join("")
        : text;
    },
  };
}

async function allianceHelper() {
  const alliances = JSON.parse(read("docs/data/alliances.json"));
  const window = { LoSP_SESSION: { allowedAlliances: alliances.map((entry) => entry.key) } };
  vm.runInNewContext(read("docs/alliances.js"), {
    window,
    document: { createElement: () => node() },
    fetch: async () => ({ ok: true, json: async () => alliances }),
  });
  await window.LoSPAlliances.loadAlliances();
  return window.LoSPAlliances;
}

test("TCP and MVP keep emojis beside LoSP names and preserve checkboxes", () => {
  const css = read("docs/rankings-shared.css");
  const rule = css.match(/\.rankingPage \.filterToggle\[data-alliance-name-lines="two"\] \.fStack\s*\{([^}]+)\}/);
  assert.ok(rule, "missing scoped alignment rule");
  assert.match(rule[1], /flex-direction:\s*row/);
  for (const page of ["tcp", "mvp"]) {
    const js = read("docs/" + page + ".js");
    const html = read("docs/" + page + ".html");
    assert.match(js, /data-alliance-name-lines="two"/);
    assert.match(js, /type="checkbox" data-alliance-key/);
    assert.match(js, /alliance\.nameColor \|\| alliance\.displayParts\?\.length === 2/);
    assert.match(html, /rankings-shared\.css\?v=2/);
    assert.match(html, /alliances\.js\?v=\d+/);
  }
});

test("ENDGAME shows ENDGAME and R-évolution as two distinct lines in chips", async () => {
  const helper = await allianceHelper();
  for (const [key, color] of [
    ["endgame-revolution-red", "#ED3946"],
    ["endgame-revolution-orange", "#F6952C"],
  ]) {
    const chip = node(true);
    helper.renderAllianceName(chip, key);
    assert.ok(chip.classList.contains("alliance-name--two-lines"));
    assert.equal(chip.children.length, 2);
    const first = chip.children[0];
    assert.equal(first.textContent, "ENDGAME");
    assert.equal(first.children[0].textContent, "END");
    assert.equal(first.children[0].style.color, "#fff");
    assert.equal(first.children[1].textContent, "GAME");
    assert.equal(first.children[1].style.color, color);
    assert.equal(chip.children[1].textContent, "R-évolution");
    assert.equal(chip.children[1].style.color, color);
    const ordinary = node(false);
    helper.renderAllianceName(ordinary, key);
    assert.equal(ordinary.children[1].textContent, "GAME R-évolution");
  }
});

test("MARINES remains red without a two-line layout", async () => {
  const helper = await allianceHelper();
  const chip = node(true);
  helper.renderAllianceName(chip, "marines");
  assert.equal(chip.textContent, "MΛЯIΠΣƧ");
  assert.equal(chip.style.color, "#E53935");
  assert.equal(chip.style.fontStyle, undefined);
  assert.equal(chip.style.display, undefined);
  assert.equal(chip.style.transform, undefined);
  assert.equal(chip.classList.contains("alliance-name--two-lines"), false);
});