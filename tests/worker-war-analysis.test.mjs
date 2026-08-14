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

function requestBody(score = 71, name = "Pelleas") {
  return {
    alliance: "zeus",
    date: "2026-08-09",
    report: {
      summary: { player_count: 1 },
      ranking: [{ rank: 1, name, score }],
      players: [{ rank: 1, original_rank: 1, name, score_total: score }]
    }
  };
}

async function callWorker(comment, score = 71, name = "Pelleas") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          analyses: [{ rank: 1, name, analysis: comment }]
        })
      }
    }]
  });

  try {
    return await worker.fetch(new Request("https://worker.test/api/war/write-analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(score, name))
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

test("le Worker ignore la ponctuation du pseudo dans le comptage des phrases", async () => {
  const response = await callWorker(
    "Il a remporté ses dix attaques avec une efficacité maximale. Son impact offensif a été important.",
    71,
    "Tt!!Le Fléau !!"
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    analyses: [{
      rank: 1,
      name: "Tt!!Le Fléau !!",
      analysis: "Tt!!Le Fléau !! a réalisé une très bonne performance. Il a remporté ses dix attaques avec une efficacité maximale. Son impact offensif a été important."
    }]
  });
});

test("le Worker rejette les jugements globaux et la mention du score total", async () => {
  for (const comment of [
    "Il a réalisé une excellente performance.",
    "Sa performance a été exceptionnelle.",
    "Il a livré une très bonne prestation.",
    "Sa prestation globale a été excellente.",
    "Globalement, il a été exceptionnel.",
    "Son score total reflète dix attaques victorieuses."
  ]) {
    const response = await callWorker(comment);
    assert.equal(response.status, 500, comment);
    assert.match((await response.json()).error, /jugement global interdit/);
  }
});

test("le Worker supprime une qualification globale placée avant le commentaire factuel", async () => {
  const factualComment = "Avec 12 attaques réussies, son efficacité offensive a été remarquable.";
  const response = await callWorker(
    `Il a réalisé une excellente performance. ${factualComment}`
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).analyses[0].analysis,
    `Pelleas a réalisé une très bonne performance. ${factualComment}`
  );
});

test("le Worker supprime une qualification globale placée après le commentaire factuel", async () => {
  const factualComment = "Avec 12 attaques réussies, son efficacité offensive a été remarquable.";
  const response = await callWorker(
    `${factualComment} Il a réalisé une excellente performance.`
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).analyses[0].analysis,
    `Pelleas a réalisé une très bonne performance. ${factualComment}`
  );
});

test("le Worker limite le commentaire nettoyé à deux phrases et l’analyse finale à trois", async () => {
  const response = await callWorker(
    "Il a livré une très bonne prestation. Il a remporté dix attaques. Son impact offensif a été remarquable."
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).analyses[0].analysis,
    "Pelleas a réalisé une très bonne performance. Il a remporté dix attaques. Son impact offensif a été remarquable."
  );
});

test("le Worker accepte les qualifications ciblées d’un aspect du rapport", async () => {
  for (const comment of [
    "Son efficacité a été exceptionnelle avec dix attaques réussies.",
    "Son efficacité offensive a été excellente avec dix attaques réussies.",
    "Son impact a été remarquable avec dix attaques réussies.",
    "Son activité a été très bonne avec dix attaques réussies.",
    "Sa défense a été excellente sur les combats recensés.",
    "Ses dégâts ont été particulièrement élevés sur le rapport.",
    "Il a affiché une excellente efficacité avec 12 attaques réussies.",
    "Son travail offensif a été excellent avec dix attaques réussies."
  ]) {
    const response = await callWorker(comment);
    assert.equal(response.status, 200, comment);
    assert.equal(
      (await response.json()).analyses[0].analysis,
      `Pelleas a réalisé une très bonne performance. ${comment}`,
      comment
    );
  }
});

test("le Worker accepte le commentaire observé et conserve l’assemblage déterministe", async () => {
  const comment = "Leenos a affiché une grande efficacité avec 12 attaques réussies et un dégât moyen de 109,5 millions, ce qui témoigne de sa capacité à cibler des adversaires solides.";
  const response = await callWorker(comment, 84, "Leenos");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["analyses"]);
  assert.deepEqual(Object.keys(body.analyses[0]), ["rank", "name", "analysis"]);
  assert.equal(
    body.analyses[0].analysis,
    `Leenos a réalisé une excellente performance. ${comment}`
  );
});

test("le Worker rejette un troisième énoncé complémentaire", async () => {
  const response = await callWorker(
    "Il a remporté dix attaques. Son efficacité a été maximale. Son impact offensif a été important."
  );
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /dépasse deux phrases/);
});
