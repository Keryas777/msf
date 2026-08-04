import assert from "node:assert/strict";
import test from "node:test";

import worker from "../workers/msf-war-ocr/worker.js";

function finalReport(alliance = "zeus") {
  return {
    date: "2026-08-02",
    alliance,
    captured_at: "2026-08-02T12:00:00.000Z",
    source: "gemini-2.5-flash",
    players: [
      {
        rank: 1,
        name: "Alpha",
        attack_points: 12000,
        attacks: 14,
        damage: 1234567890,
        defense_wins: 2,
        defense_bonus: 1
      }
    ],
    report: {
      summary: {
        total_damage: 1234567890,
        avg_damage_ref: 123456789.012345,
        damage_share_ref: 0.333333333333
      },
      ranking: [
        { rank: 1, name: "Alpha", score: 87.125 }
      ],
      players: [
        {
          original_rank: 1,
          rank: 1,
          name: "Alpha",
          score_total: 87.125,
          score_impact: 84.75,
          score_efficiency: 91.5,
          score_activity: 89.25,
          analysis: "Une analyse IA conservée exactement, avec sa ponctuation."
        }
      ]
    }
  };
}

function publicationRequest(report) {
  return new Request("https://worker.test/api/war/publish-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://keryas777.github.io"
    },
    body: JSON.stringify(report)
  });
}

const env = {
  GITHUB_OWNER: "Keryas777",
  GITHUB_REPO: "msf",
  GITHUB_BRANCH: "agent/war-reports-publication",
  GITHUB_TOKEN: "test-token"
};

test("le Worker crée le chemin daté et sérialise fidèlement finalReport", { concurrency: false }, async () => {
  const report = finalReport();
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (options.method === "GET") return new Response("Not found", { status: 404 });
    return Response.json({ commit: { sha: "commit-zeus" } });
  };

  try {
    const response = await worker.fetch(publicationRequest(report), env, {});
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.published, true);
    assert.equal(data.path, "docs/data/war/2026-08-02/zeus.json");
    assert.equal(data.branch, env.GITHUB_BRANCH);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /docs\/data\/war\/2026-08-02\/zeus\.json\?ref=agent%2Fwar-reports-publication$/);
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[1].options.method, "PUT");

    const githubBody = JSON.parse(calls[1].options.body);
    const writtenJson = Buffer.from(githubBody.content, "base64").toString("utf8");
    assert.equal(writtenJson, JSON.stringify(report, null, 2) + "\n");
    assert.deepEqual(JSON.parse(writtenJson), report);
    assert.equal(JSON.parse(writtenJson).report.summary.avg_damage_ref, 123456789.012345);
    assert.equal(
      JSON.parse(writtenJson).report.players[0].analysis,
      report.report.players[0].analysis
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("le Worker refuse toute publication directe sur main", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response();
  };

  try {
    const response = await worker.fetch(
      publicationRequest(finalReport()),
      { ...env, GITHUB_BRANCH: "main" },
      {}
    );
    const data = await response.json();

    assert.equal(response.status, 500);
    assert.equal(data.published, false);
    assert.match(data.error, /différente de main/);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
