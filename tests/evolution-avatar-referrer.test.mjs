import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../docs/evolution-classement.js', import.meta.url), 'utf8');
const start = source.indexOf('  function createPlayerVisual(');
const end = source.indexOf('  function render(', start);

function renderAvatar(info) {
  assert.ok(start >= 0 && end > start);
  const document = {
    createElement(tag) {
      return {
        tag, children: [],
        appendChild(child) { this.children.push(child); },
      };
    },
  };
  return runInNewContext(source.slice(start, end) +
    '\ncreatePlayerVisual(arguments[0], arguments[1])',
    { document, arguments: [info, 'Test player'] });
}

test('Evolution loads official event portraits without a referring page', () => {
  const url = 'https://assets.marvelstrikeforce.com/imgs/ICON_PLAYERICON_JEFFTHELANDSHARKTOONSHADE_4633c36e.png';
  const frame = 'https://assets.marvelstrikeforce.com/imgs/ICON_FRAME_SPIDERWEAVER_d5a7c182.png';
  const visual = renderAvatar({ icon: url, frame });
  assert.equal(visual.children.length, 2);
  assert.equal(visual.children[0].src, url);
  assert.equal(visual.children[0].referrerPolicy, 'no-referrer');
  assert.equal(visual.children[1].src, frame);
  assert.equal(visual.children[1].referrerPolicy, 'no-referrer');
});

test('Evolution keeps portrait-free player fallback and does not invent images', () => {
  const visual = renderAvatar({});
  assert.equal(visual.children.length, 1);
  assert.equal(visual.children[0].tag, 'span');
  assert.equal(visual.children[0].textContent, 'T');
});

test('Evolution ranking page invalidates the previous script cache', async () => {
  const html = await readFile(new URL('../docs/evolution-classement.html', import.meta.url), 'utf8');
  assert.match(html, /evolution-classement\.js\?v=12/);
});
