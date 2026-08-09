import assert from "node:assert/strict";
import test from "node:test";
import worker, { getGlobalPerformanceSentence } from "../workers/msf-war-ocr/worker.js";

const expectedSentences = [
  [93, "Ada a réalisé une performance exceptionnelle."],
  [84, "Ada a réalisé une excellente performance."],
  [71, "Ada a réalisé une très bonne performance."],
  [64, "Ada a réalisé une bonne performance."],
  [55, "Ada a réalisé une performance solide."],
  [49, "Ada a réalisé une performance mitigée."],
  [30, "Ada a réalisé une performance en retrait."],
  [89.9, "Ada a réalisé une excellente performance."],
  [79.9, "Ada a réalisé une très bonne performance."],
  [69.9, "Ada a réalisé une bonne performance."],
  [59.9, "Ada a réalisé une performance solide."],
  [49.9, "Ada a réalisé une performance mitigée."],
  [39.9, "Ada a réalisé une performance en retrait."]
];

test("la qualification déterministe respecte toutes les bornes, y compris décimales", () => {
  for (const [score, expected] of expectedSentences) {
    assert.equal(getGlobalPerformanceSentence(score, "Ada"), expected, String(score));
  }
  assert.equal(
    getGlobalPerformanceSentence(71, "Pelleas"),
    "Pelleas a réalisé une très bonne performance."
  );
});

function requestBody(score = 71) {
  return {
    alliance: "zeus",
    date: "2026-08-09",
    report: {
      summary: { player_count: 1 },
      ranking: [{ rank: 1, name: "Pelleas", score }],
      players: [{ rank: 1, original_rank: 1, name: "Pelleas", score_total: score }]
    }
  };
}

async function callWorker(comment, score = 71) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          analyses: [{ rank: 1, name: "Pelleas", analysis: comment }]
        })
      }
    }]
  });

  try {
    return await worker.fetch(new Request("https://worker.test/api/war/write-analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(score))
    }), { GROQ_API_KEY: "test" });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("le Worker assemble la phrase déterministe avant au plus deux phrases Groq", async () => {
  const response = await callWorker(
    "Il a remporté ses dix attaques avec une efficacité maximale. Son impact offensif a été important."
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    analyses: [{
      rank: 1,
      name: "Pelleas",
      analysis: "Pelleas a réalisé une très bonne performance. Il a remporté ses dix attaques avec une efficacité maximale. Son impact offensif a été important."
    }]
  });
});

test("le Worker rejette les jugements globaux et la mention du score total", async () => {
  for (const comment of [
    "Il a réalisé une performance exceptionnelle grâce à ses dix attaques victorieuses.",
    "Son score total reflète dix attaques victorieuses et une activité offensive importante."
  ]) {
    const response = await callWorker(comment);
    assert.equal(response.status, 500, comment);
    assert.match((await response.json()).error, /jugement global interdit/);
  }
});

test("le Worker accepte la qualification exceptionnelle d’un sous-score", async () => {
  const response = await callWorker(
    "Son efficacité a été exceptionnelle. Ses dix attaques victorieuses ont eu un impact offensif important."
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["analyses"]);
  assert.deepEqual(Object.keys(body.analyses[0]), ["rank", "name", "analysis"]);
  assert.match(body.analyses[0].analysis, /^Pelleas a réalisé une très bonne performance\. Son efficacité a été exceptionnelle\./);
  assert.equal((body.analyses[0].analysis.match(/[.!?]+(?=\s|$)/g) || []).length, 3);
});

test("le Worker rejette un troisième énoncé complémentaire", async () => {
  const response = await callWorker(
    "Il a remporté dix attaques. Son efficacité a été maximale. Son impact offensif a été important."
  );
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /dépasse deux phrases/);
});
