const REVISION_PATH_PREFIX = "/view/heroes/M3HeroSheet.json/";
const REVISION_PATTERN = /\/view\/heroes\/M3HeroSheet\.json\/([0-9a-f]{64})/gi;
const REVISION_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export function listHeroSheetRevisions(historyHtml) {
  const html = typeof historyHtml === "string" ? historyHtml : "";
  const revisions = [];
  const seen = new Set();

  for (const match of html.matchAll(REVISION_PATTERN)) {
    const revision = String(match[1] || "").toLowerCase();
    if (!revision || seen.has(revision)) continue;
    seen.add(revision);
    revisions.push(revision);
  }

  return revisions;
}

export function resolveHeroSheetRevision(historyHtml, overrideRevision = "") {
  const revisions = listHeroSheetRevisions(historyHtml);
  if (!revisions.length) {
    throw new Error("No M3HeroSheet revision found in Magnetic Zero history");
  }

  const requested = String(overrideRevision || "").trim().toLowerCase();
  if (requested) {
    if (!REVISION_HASH_PATTERN.test(requested)) {
      throw new Error(`Invalid M3HeroSheet revision override: ${requested}`);
    }
    if (!revisions.includes(requested)) {
      throw new Error(`M3HeroSheet revision ${requested} is not present in history`);
    }
    return {
      revision: requested,
      revisionPath: `${REVISION_PATH_PREFIX}${requested}`,
      source: "override",
    };
  }

  const revision = revisions[0];
  return {
    revision,
    revisionPath: `${REVISION_PATH_PREFIX}${revision}`,
    source: "latest-history",
  };
}
