import test from "node:test";
import assert from "node:assert/strict";
import {
  listHeroSheetRevisions,
  resolveHeroSheetRevision,
} from "../scripts/m3-hero-sheet-source.mjs";

const NEWEST = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OLDER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function historyHtml() {
  return `
    <html>
      <body>
        <a href="/view/heroes/M3HeroSheet.json/${NEWEST}">latest</a>
        <a href="/view/heroes/M3HeroSheet.json/${NEWEST}">duplicate link</a>
        <a href='/view/heroes/M3HeroSheet.json/${OLDER}'>older</a>
      </body>
    </html>
  `;
}

test("Magnetic Zero history keeps unique M3HeroSheet revisions in page order", () => {
  assert.deepEqual(listHeroSheetRevisions(historyHtml()), [NEWEST, OLDER]);
});

test("automatic mode selects the first revision exposed by the newest-first history", () => {
  assert.deepEqual(resolveHeroSheetRevision(historyHtml()), {
    revision: NEWEST,
    revisionPath: `/view/heroes/M3HeroSheet.json/${NEWEST}`,
    source: "latest-history",
  });
});

test("MSF_HERO_SHEET_REVISION can still pin an older known revision", () => {
  assert.deepEqual(resolveHeroSheetRevision(historyHtml(), OLDER.toUpperCase()), {
    revision: OLDER,
    revisionPath: `/view/heroes/M3HeroSheet.json/${OLDER}`,
    source: "override",
  });
});

test("invalid or unknown manual revisions fail closed", () => {
  assert.throws(
    () => resolveHeroSheetRevision(historyHtml(), "not-a-hash"),
    /Invalid M3HeroSheet revision override/
  );

  const unknown = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  assert.throws(
    () => resolveHeroSheetRevision(historyHtml(), unknown),
    /is not present in history/
  );
});

test("an empty or changed Magnetic Zero history never falls back silently", () => {
  assert.throws(
    () => resolveHeroSheetRevision("<html><body>No revisions here</body></html>"),
    /No M3HeroSheet revision found/
  );
});
