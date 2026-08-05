export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/war-upload") {
      return new Response(getUploadPage(), {
        headers: {
          "content-type": "text/html; charset=utf-8"
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/war/parse-gemini") {
      let response;

      try {
        response = await handleWarParseGemini(request, env);
      } catch (error) {
        response = Response.json(
          {
            ok: false,
            error: error instanceof Error ? error.message : "Erreur inconnue"
          },
          {
            status: 500
          }
        );
      }

      return addWarParseCorsHeaders(request, response);
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/war/parse-gemini-draft"
    ) {
      let response;

      try {
        response = await handleWarParseGemini(request, env, {
          publish: false,
          detectAlliance: true
        });
      } catch (error) {
        response = Response.json(
          {
            ok: false,
            published: false,
            error: error instanceof Error ? error.message : "Erreur inconnue"
          },
          {
            status: 500
          }
        );
      }

      response = await addDraftPublishedFlag(response);
      return addWarParseDraftCorsHeaders(request, response);
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/war/write-analyses"
    ) {
      let response;

      try {
        response = await handleWarWriteAnalyses(request, env);
      } catch (error) {
        response = Response.json(
          {
            ok: false,
            error: error instanceof Error ? error.message : "Erreur inconnue"
          },
          {
            status: 500
          }
        );
      }

      return addWarParseDraftCorsHeaders(request, response);
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/war/publish-report"
    ) {
      let response;

      try {
        response = await handleWarPublishReport(request, env);
      } catch (error) {
        response = Response.json(
          {
            ok: false,
            published: false,
            error: error instanceof Error ? error.message : "Erreur inconnue"
          },
          {
            status: 500
          }
        );
      }

      return addWarParseDraftCorsHeaders(request, response);
    }

    return new Response("Worker OK. Ouvre /war-upload pour tester Gemini.", {
      headers: {
        "content-type": "text/plain; charset=utf-8"
      }
    });
  }
};

const WAR_ADMIN_ORIGIN = "https://keryas777.github.io";

const WAR_INDEX_PATH = "docs/data/war/index.json";

const WAR_ALLIANCE_ORDER = Object.freeze([
  "zeus",
  "athena",
  "kronos",
  "dionysos",
  "poseidon",
  "hades"
]);

const ANALYSIS_REQUEST_MAX_BYTES = 512 * 1024;
const ANALYSIS_MAX_PLAYERS = 24;
const ANALYSIS_NAME_MAX_LENGTH = 80;
const ANALYSIS_MIN_LENGTH = 40;
const ANALYSIS_MAX_LENGTH = 700;
const ANALYSIS_MAX_SENTENCES = 3;
const GEMINI_ANALYSIS_TIMEOUT_MS = 90 * 1000;

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) {
    return false;
  }

  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();

  return (
    actual.length === expected.length &&
    actual.every(function (key, index) {
      return key === expected[index];
    })
  );
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function countSentences(text) {
  const matches = String(text || "").match(/[.!?]+(?=\s|$)/g);
  return matches ? matches.length : 0;
}

async function readAnalysisRequestJson(request) {
  const contentType = String(request.headers.get("Content-Type") || "")
    .toLowerCase();

  if (!contentType.includes("application/json")) {
    throw new Error("Content-Type invalide. application/json attendu.");
  }

  const contentLength = Number(request.headers.get("Content-Length"));

  if (
    Number.isFinite(contentLength) &&
    contentLength > ANALYSIS_REQUEST_MAX_BYTES
  ) {
    throw new Error("Requête d’analyse trop volumineuse.");
  }

  const rawBody = await request.text();
  const byteLength = new TextEncoder().encode(rawBody).length;

  if (byteLength <= 0) {
    throw new Error("Corps de requête vide.");
  }

  if (byteLength > ANALYSIS_REQUEST_MAX_BYTES) {
    throw new Error("Requête d’analyse trop volumineuse.");
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new Error("JSON de requête invalide.");
  }
}

function validateAnalysisRequest(body) {
  if (!hasExactKeys(body, ["alliance", "date", "report"])) {
    throw new Error("Contrat de requête invalide.");
  }

  const normalizedAlliance = normalizeAlliance(body.alliance);

  if (!normalizedAlliance) {
    throw new Error("Alliance invalide.");
  }

  if (!isValidIsoDate(body.date)) {
    throw new Error("Date invalide.");
  }

  if (!hasExactKeys(body.report, ["summary", "ranking", "players"])) {
    throw new Error("Rapport classé invalide.");
  }

  if (!isPlainObject(body.report.summary)) {
    throw new Error("Résumé du rapport invalide.");
  }

  if (
    !Array.isArray(body.report.players) ||
    !Array.isArray(body.report.ranking)
  ) {
    throw new Error("Rapport classé invalide.");
  }

  const players = body.report.players;
  const ranking = body.report.ranking;

  if (
    players.length < 1 ||
    players.length > ANALYSIS_MAX_PLAYERS
  ) {
    throw new Error("Nombre de joueurs invalide.");
  }

  if (players.length !== ranking.length) {
    throw new Error("Classement incohérent.");
  }

  if (
    !Number.isInteger(body.report.summary.player_count) ||
    body.report.summary.player_count !== players.length
  ) {
    throw new Error("Nombre de joueurs incohérent dans le résumé.");
  }

  const seenNames = new Set();
  const seenOriginalRanks = new Set();

  for (let index = 0; index < players.length; index += 1) {
    const expectedRank = index + 1;
    const player = players[index];
    const rankingEntry = ranking[index];

    if (!isPlainObject(player)) {
      throw new Error("Joueur classé invalide.");
    }

    if (!hasExactKeys(rankingEntry, ["rank", "name", "score"])) {
      throw new Error("Entrée de classement invalide.");
    }

    if (!Number.isInteger(player.rank) || player.rank !== expectedRank) {
      throw new Error("Ordre des joueurs classés invalide.");
    }

    if (
      !Number.isInteger(player.original_rank) ||
      player.original_rank < 1 ||
      player.original_rank > ANALYSIS_MAX_PLAYERS
    ) {
      throw new Error("Rang source invalide.");
    }

    if (seenOriginalRanks.has(player.original_rank)) {
      throw new Error("Rang source en doublon.");
    }

    seenOriginalRanks.add(player.original_rank);

    if (typeof player.name !== "string") {
      throw new Error("Nom de joueur invalide.");
    }

    const playerName = player.name.trim();

    if (
      !playerName ||
      playerName !== player.name ||
      playerName.length > ANALYSIS_NAME_MAX_LENGTH
    ) {
      throw new Error("Nom de joueur invalide.");
    }

    if (seenNames.has(playerName)) {
      throw new Error("Nom de joueur en doublon.");
    }

    seenNames.add(playerName);

    if (
      typeof player.score_total !== "number" ||
      !Number.isFinite(player.score_total)
    ) {
      throw new Error("Score total invalide.");
    }

    if (
      rankingEntry.rank !== expectedRank ||
      rankingEntry.name !== playerName ||
      rankingEntry.score !== player.score_total
    ) {
      throw new Error(
        "Le classement ne correspond pas aux joueurs triés."
      );
    }
  }

  return {
    alliance: normalizedAlliance,
    date: body.date,
    report: body.report
  };
}

function validateAnalysisResponse(parsed, players) {
  if (
    !hasExactKeys(parsed, ["analyses"]) ||
    !Array.isArray(parsed.analyses)
  ) {
    throw new Error("Réponse IA hors contrat.");
  }

  if (parsed.analyses.length !== players.length) {
    throw new Error("Nombre d’analyses invalide.");
  }

  const expected = new Map(
    players.map(function (player) {
      return [player.rank, player.name];
    })
  );

  const ranks = new Set();
  const names = new Set();
  const validatedAnalyses = [];

  for (const entry of parsed.analyses) {
    if (!hasExactKeys(entry, ["rank", "name", "analysis"])) {
      throw new Error("Clé supplémentaire dans une analyse.");
    }

    if (
      !Number.isInteger(entry.rank) ||
      expected.get(entry.rank) !== entry.name
    ) {
      throw new Error("Joueur ou rang inconnu.");
    }

    if (ranks.has(entry.rank) || names.has(entry.name)) {
      throw new Error("Analyse en doublon.");
    }

    if (typeof entry.analysis !== "string") {
      throw new Error("Analyse invalide.");
    }

    const analysis = entry.analysis
      .replace(/\s+/g, " ")
      .trim();

    if (!analysis) {
      throw new Error("Analyse vide.");
    }

    if (
      analysis.length < ANALYSIS_MIN_LENGTH ||
      analysis.length > ANALYSIS_MAX_LENGTH
    ) {
      throw new Error("Longueur d’analyse invalide.");
    }

    const sentenceCount = countSentences(analysis);

    if (sentenceCount > ANALYSIS_MAX_SENTENCES) {
      throw new Error("Une analyse dépasse trois phrases.");
    }

    ranks.add(entry.rank);
    names.add(entry.name);

    validatedAnalyses.push({
      rank: entry.rank,
      name: entry.name,
      analysis: analysis
    });
  }

  validatedAnalyses.sort(function (left, right) {
    return left.rank - right.rank;
  });

  return {
    analyses: validatedAnalyses
  };
}

async function handleWarWriteAnalyses(request, env) {
  const requestBody = await readAnalysisRequestJson(request);
  const body = validateAnalysisRequest(requestBody);

  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    throw new Error(
      "La variable secrète GEMINI_API_KEY est absente dans le Worker."
    );
  }

  const prompt = [
    "Tu rédiges uniquement les analyses individuelles d’une guerre Marvel Strike Force terminée.",

    "Le rapport fourni est définitif. Tu ne dois recalculer, corriger, modifier ou retourner aucun score, rang, classement, résumé ou autre valeur numérique.",

    "Pour chaque joueur, rédige en français une analyse de 2 à 3 phrases maximum, concernant uniquement cette guerre.",

    "Chaque analyse doit mettre en avant au moins un point fort lorsqu’il existe, signaler une limite lorsqu’elle est pertinente et donner une lecture globale de la performance.",

    "Utilise uniquement les données présentes dans le rapport. Ne fais aucune projection sur une autre guerre, aucune généralisation sur le joueur et n’invente aucune information.",

    "Ne formule aucun conseil, aucune attente ni recommandation pour une prochaine guerre.",

    "Ne mentionne jamais les prochaines guerres, les futures guerres, la prochaine participation ou une amélioration attendue.",

    "Conclus uniquement sur la performance observée pendant cette guerre.",

    "Repères d’interprétation autorisés : un volume ou une moyenne de dégâts élevés peuvent indiquer des cibles ambitieuses ; de faibles dégâts peuvent indiquer des cibles plus modestes ; beaucoup d’attaques avec de gros dégâts mais plusieurs ratés indiquent une activité ambitieuse mais imparfaite ; de nombreuses victoires défensives indiquent une contribution défensive importante ; les déviations indiquent une implication dans la protection de l’alliance.",

    "Adapte impérativement la tonalité au score_total déjà présent :",

    "- score_total supérieur ou égal à 80 : analyse très positive. Les défauts éventuels sont seulement des marges de progression mineures. Aucune formulation négative forte.",

    "- score_total de 70 à 79 : analyse clairement positive. Les limites sont secondaires et formulées avec prudence. La performance ne doit pas paraître décevante.",

    "- score_total de 60 à 69 : analyse équilibrée, avec points positifs et limites, sans dureté excessive.",

    "- score_total de 50 à 59 : analyse plus critique, mais constructive, factuelle et respectueuse.",

    "- score_total inférieur à 50 : l’analyse peut signaler clairement une performance insuffisante, tout en restant factuelle et respectueuse.",

    "Un joueur classé dans le haut du tableau ou ayant un score_total supérieur ou égal à 70 ne doit jamais recevoir une analyse dont la tonalité globale paraît négative.",

    "Varie les formulations d’un joueur à l’autre. Ne te contente pas d’énoncer les chiffres. Privilégie une lecture analytique.",

    "Retourne uniquement un JSON valide contenant exactement la clé analyses.",

    "Chaque entrée de analyses doit contenir exactement : rank, name et analysis.",

    "Ne retourne aucun tag, score, statistique, résumé, classement ou autre clé.",

    JSON.stringify(body)
  ].join("\n\n");

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent";

  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, GEMINI_ANALYSIS_TIMEOUT_MS);

  let geminiResponse;

  try {
    geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.55,
          responseMimeType: "application/json"
        }
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "Gemini n’a pas répondu dans le délai maximal de 90 secondes."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let geminiData;

  try {
    geminiData = await geminiResponse.json();
  } catch (error) {
    throw new Error("Réponse Gemini illisible.");
  }

  if (!geminiResponse.ok) {
    throw new Error(
      geminiData?.error?.message || "Erreur Gemini"
    );
  }

  const rawText = getGeminiText(geminiData);

  if (!rawText) {
    throw new Error("Gemini n’a retourné aucun texte.");
  }

  let parsed;

  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch (error) {
    throw new Error("Gemini n’a pas renvoyé un JSON parseable.");
  }

  return Response.json(
    validateAnalysisResponse(parsed, body.report.players)
  );
}

async function handleWarPublishReport(request, env) {
  const requestText = await request.text();

  if (!requestText || requestText.length > ANALYSIS_REQUEST_MAX_BYTES) {
    throw new Error("Rapport final absent ou trop volumineux.");
  }

  let finalReport;
  try {
    finalReport = JSON.parse(requestText);
  } catch (error) {
    throw new Error("Rapport final JSON illisible.");
  }

  if (
    !isPlainObject(finalReport) ||
    !isValidIsoDate(finalReport.date) ||
    typeof finalReport.alliance !== "string" ||
    normalizeAlliance(finalReport.alliance) !== finalReport.alliance ||
    !Array.isArray(finalReport.players) ||
    !isPlainObject(finalReport.report) ||
    !isPlainObject(finalReport.report.summary) ||
    !Array.isArray(finalReport.report.ranking) ||
    !Array.isArray(finalReport.report.players)
  ) {
    throw new Error("Le rapport final ne respecte pas le contrat de publication.");
  }

  const branch = String(env.GITHUB_BRANCH || "").trim();
  if (!branch) throw new Error("La branche GitHub de publication doit être configurée.");

  const exportPath =
    "docs/data/war/" + finalReport.date + "/" + finalReport.alliance + ".json";

  const githubWrite = await upsertFileToGitHub({
    env,
    path: exportPath,
    jsonObject: finalReport,
    message: "chore(war): publish " + finalReport.alliance + " for " + finalReport.date
  });

  const reportCommitSha =
    githubWrite && githubWrite.commit ? githubWrite.commit.sha : null;

  let indexWrite;
  try {
    indexWrite = await updateWarIndexAfterPublication(
      env,
      finalReport.date,
      finalReport.alliance
    );
  } catch (error) {
    return Response.json({
      ok: false,
      published: true,
      indexed: false,
      alliance: finalReport.alliance,
      war_date: finalReport.date,
      path: exportPath,
      branch,
      commit_sha: reportCommitSha,
      index_path: WAR_INDEX_PATH,
      error:
        "Le rapport a été publié, mais index.json n’a pas pu être mis à jour. " +
        (error instanceof Error ? error.message : "Erreur inconnue")
    }, { status: 500 });
  }

  return Response.json({
    ok: true,
    published: true,
    indexed: true,
    alliance: finalReport.alliance,
    war_date: finalReport.date,
    path: exportPath,
    branch,
    commit_sha: reportCommitSha,
    index_path: indexWrite.path,
    index_commit_sha: indexWrite.commit_sha
  });
}

function addWarParseCorsHeaders(request, response) {
  response.headers.set("Vary", "Origin");

  if (request.headers.get("Origin") === WAR_ADMIN_ORIGIN) {
    response.headers.set(
      "Access-Control-Allow-Origin",
      WAR_ADMIN_ORIGIN
    );
  } else {
    response.headers.delete("Access-Control-Allow-Origin");
  }

  return response;
}

function addWarParseDraftCorsHeaders(request, response) {
  response.headers.delete("Access-Control-Allow-Origin");
  response.headers.delete("Vary");

  if (request.headers.get("Origin") === WAR_ADMIN_ORIGIN) {
    response.headers.set(
      "Access-Control-Allow-Origin",
      WAR_ADMIN_ORIGIN
    );
    response.headers.set("Vary", "Origin");
  }

  return response;
}

async function addDraftPublishedFlag(response) {
  const data = await response.json();

  return Response.json(
    {
      ...data,
      published: false
    },
    {
      status: response.status,
      statusText: response.statusText
    }
  );
}

const ALLIANCES = {
  zeus: "Zeus",
  athena: "Athéna",
  kronos: "Kronos",
  dionysos: "Dionysos",
  poseidon: "Poséidon",
  hades: "Hadès"
};

function normalizeAlliance(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");

  if (key === "zeus") return "zeus";
  if (key === "athena") return "athena";

  if (
    key === "kronos" ||
    key === "cronos" ||
    key === "chronos" ||
    key === "lospkronos"
  ) {
    return "kronos";
  }

  if (key === "dionysos") return "dionysos";
  if (key === "poseidon") return "poseidon";
  if (key === "hades") return "hades";

  return "";
}

function getAllianceLabel(alliance) {
  return ALLIANCES[alliance] || alliance;
}

function getUploadPage() {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>MSF War Parse - Gemini</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: #e5e7eb;
      margin: 0;
      padding: 24px;
    }

    .wrap {
      max-width: 1100px;
      margin: 0 auto;
    }

    h1 {
      margin-top: 0;
      margin-bottom: 16px;
    }

    p {
      color: #cbd5e1;
    }

    form {
      background: #111827;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #334155;
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: bold;
    }

    select,
    input,
    button {
      font-size: 16px;
      padding: 10px;
      margin-bottom: 12px;
      width: 100%;
      box-sizing: border-box;
    }

    button {
      background: #2563eb;
      color: white;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
    }

    button:hover {
      background: #1d4ed8;
    }

    pre {
      background: #020617;
      color: #93c5fd;
      padding: 16px;
      border-radius: 12px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid #334155;
    }

    .preview-wrap {
      background: #111827;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid #334155;
      margin-bottom: 20px;
    }

    .preview-wrap img {
      width: 100%;
      display: block;
      border-radius: 8px;
      background: #000;
    }

    .note {
      font-size: 14px;
      color: #94a3b8;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Upload screenshot war — Gemini</h1>
    <p class="note">
      Cette version n'utilise plus OCR.space. Le screenshot complet est envoyé à Gemini, sans réduction.
    </p>

    <form id="uploadForm">
      <label for="date">Date de guerre</label>
      <input id="date" name="date" type="date" required />

      <label for="alliance">Alliance</label>
      <select id="alliance" name="alliance">
        <option value="zeus">Zeus</option>
        <option value="athena">Athéna</option>
        <option value="kronos">Kronos</option>
        <option value="dionysos">Dionysos</option>
        <option value="poseidon">Poséidon</option>
        <option value="hades">Hadès</option>
      </select>

      <label for="image">Screenshot</label>
      <input id="image" type="file" name="image" accept="image/*" required />

      <button type="submit">Envoyer à Gemini</button>
    </form>

    <div class="preview-wrap">
      <img id="preview" alt="preview" />
    </div>

    <pre id="result">En attente d'un upload...</pre>
  </div>

  <script>
    const form = document.getElementById("uploadForm");
    const result = document.getElementById("result");
    const preview = document.getElementById("preview");
    const imageInput = document.getElementById("image");
    const dateInput = document.getElementById("date");

    dateInput.value = new Date().toISOString().slice(0, 10);

    imageInput.addEventListener("change", function () {
      const file = imageInput.files[0];
      if (!file) return;
      preview.src = URL.createObjectURL(file);
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const alliance = document.getElementById("alliance").value;
      const warDate = document.getElementById("date").value;
      const file = imageInput.files[0];

      if (!file) {
        result.textContent = "Aucun fichier sélectionné.";
        return;
      }

      if (!warDate) {
        result.textContent = "Date de guerre manquante.";
        return;
      }

      try {
        const formData = new FormData();
        formData.append("alliance", alliance);
        formData.append("war_date", warDate);
        formData.append("image", file, file.name || "war.jpg");

        result.textContent =
          "Image originale : " + file.size + " octets\\n\\n" +
          "Envoi à Gemini en cours...";

        const res = await fetch("/api/war/parse-gemini", {
          method: "POST",
          body: formData
        });

        const data = await res.json();
        result.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        result.textContent = "Erreur : " + err.message;
      }
    });
  </script>
</body>
</html>`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}

function stringToBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToStringUtf8(value) {
  try {
    return decodeURIComponent(escape(atob(String(value || ""))));
  } catch (error) {
    throw new Error("Le contenu GitHub ne peut pas être décodé.");
  }
}

function stripCodeFences(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function getGeminiText(data) {
  if (
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    Array.isArray(data.candidates[0].content.parts)
  ) {
    for (const part of data.candidates[0].content.parts) {
      if (typeof part.text === "string") {
        return part.text;
      }
    }
  }

  return "";
}

function buildGeminiPrompt(alliance) {
  const allianceLabel = getAllianceLabel(alliance);

  return [
    "Tu analyses un screenshot Marvel Strike Force d'un tableau de guerre d'alliance.",
    "",
    "Alliance attendue : " + allianceLabel + ".",
    'Valeur technique attendue du champ alliance : "' + alliance + '".',
    "",
    "Retourne UNIQUEMENT un JSON valide, sans markdown, sans explication, sans texte avant ou après.",
    "",
    "Contraintes absolues :",
    "- Il y a 24 lignes visibles, une par joueur, dans l'ordre vertical.",
    "- Ne saute aucune ligne.",
    "- Respecte strictement l'ordre visuel de haut en bas.",
    "- Ne fusionne pas deux lignes.",
    "- Ne décale pas les joueurs.",
    "- Les nombres doivent être des entiers JSON bruts, sans espaces ni séparateurs visuels.",
    "- Si une valeur est illisible, mets null.",
    "",
    "Règles spécifiques IMPORTANTES :",
    "- Supprime systématiquement le tag vert [MOI] s'il apparaît à côté du nom du joueur qui prend le screenshot.",
    "- Les noms doivent être retournés sans [MOI].",
    "- Le champ alliance dans chaque joueur doit toujours valoir " + alliance + ".",
    "- Dans la colonne damage, certains nombres supérieurs à 1 milliard sont parfois tronqués à l'écran : le dernier chiffre n'apparaît pas visuellement.",
    "- Quand un nombre de dégâts > 1 milliard est visiblement tronqué de son dernier chiffre, ajoute un 0 final pour retourner la valeur brute la plus proche possible.",
    "- Exemple : si l'écran montre 1 003 207 03, retourne 1003207030.",
    "- Exemple : si l'écran montre 1 380 357 878, retourne 1380357878 sans rien ajouter.",
    "- N'ajoute PAS un 0 à tous les dégâts automatiquement : ajoute-le seulement si le nombre est visiblement tronqué dans l'interface.",
    "",
    "Organise les données EXACTEMENT dans ce format :",
    "{",
    '  "ok": true,',
    '  "alliance": "' + alliance + '",',
    '  "players": [',
    "    {",
    '      "row_index": 1,',
    '      "name": "lolo",',
    '      "alliance": "' + alliance + '",',
    '      "attack_points": 13000,',
    '      "attacks": 14,',
    '      "damage": 1380357878,',
    '      "defense_wins": 2,',
    '      "defense_bonus": 3',
    "    }",
    "  ]",
    "}",
    "",
    "Rappels métier :",
    "- row_index va de 1 à 24",
    "- attack_points = points d'attaque",
    "- attacks = attaques",
    "- damage = points de dégâts",
    "- defense_wins = victoires en défense",
    "- defense_bonus = bonus de défense",
    "",
    "Ne retourne QUE ce JSON final."
  ].join("\\n");
}

function buildGeminiAutoDetectPrompt() {
  return [
    "Tu analyses un screenshot Marvel Strike Force d'un tableau de guerre d'alliance.",
    "",
    "Commence par identifier l'alliance visible sur la capture.",
    "Alliances possibles et valeurs techniques normalisées :",
    '- Zeus => "zeus"',
    '- Athéna ou Athena => "athena"',
    '- Kronos, Cronos, Chronos ou LoSP Kronos => "kronos"',
    '- Dionysos => "dionysos"',
    '- Poséidon ou Poseidon => "poseidon"',
    '- Hadès ou Hades => "hades"',
    "",
    "Règles de détection :",
    "- Utilise le nom, le titre ou les éléments d'alliance réellement visibles dans l'image.",
    "- Ne devine pas si l'alliance n'est pas identifiable avec certitude.",
    "- Si elle est certaine, detected_alliance doit contenir uniquement la valeur technique normalisée.",
    "- Si elle est certaine, detected_alliance_label doit contenir exactement le libellé français correspondant.",
    "- Si elle est incertaine, mets detected_alliance et detected_alliance_label à null, et detection_confident à false.",
    "",
    "Retourne UNIQUEMENT un JSON valide, sans markdown, sans explication, sans texte avant ou après.",
    "",
    "Contraintes absolues :",
    "- Il y a 24 lignes visibles, une par joueur, dans l'ordre vertical.",
    "- Ne saute aucune ligne.",
    "- Respecte strictement l'ordre visuel de haut en bas.",
    "- Ne fusionne pas deux lignes.",
    "- Ne décale pas les joueurs.",
    "- Les nombres doivent être des entiers JSON bruts, sans espaces ni séparateurs visuels.",
    "- Si une valeur est illisible, mets null.",
    "",
    "Règles spécifiques IMPORTANTES :",
    "- Supprime systématiquement le tag vert [MOI] s'il apparaît à côté du nom du joueur qui prend le screenshot.",
    "- Les noms doivent être retournés sans [MOI].",
    "- Dans la colonne damage, certains nombres supérieurs à 1 milliard sont parfois tronqués à l'écran : le dernier chiffre n'apparaît pas visuellement.",
    "- Quand un nombre de dégâts > 1 milliard est visiblement tronqué de son dernier chiffre, ajoute un 0 final pour retourner la valeur brute la plus proche possible.",
    "- Exemple : si l'écran montre 1 003 207 03, retourne 1003207030.",
    "- Exemple : si l'écran montre 1 380 357 878, retourne 1380357878 sans rien ajouter.",
    "- N'ajoute PAS un 0 à tous les dégâts automatiquement : ajoute-le seulement si le nombre est visiblement tronqué dans l'interface.",
    "",
    "Le JSON doit contenir exactement ces informations :",
    '- "ok": true',
    '- "detected_alliance": une valeur technique autorisée ou null',
    '- "detected_alliance_label": le libellé correspondant ou null',
    '- "detection_confident": true ou false',
    '- "players": le tableau des 24 lignes',
    "",
    "Chaque joueur doit suivre ce format :",
    "{",
    '  "row_index": 1,',
    '  "name": "lolo",',
    '  "attack_points": 13000,',
    '  "attacks": 14,',
    '  "damage": 1380357878,',
    '  "defense_wins": 2,',
    '  "defense_bonus": 3',
    "}",
    "",
    "Rappels métier :",
    "- row_index va de 1 à 24",
    "- attack_points = points d'attaque",
    "- attacks = attaques",
    "- damage = points de dégâts",
    "- defense_wins = victoires en défense",
    "- defense_bonus = bonus de défense",
    "",
    "Ne retourne QUE ce JSON final."
  ].join("\\n");
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "");

    if (/^-?\d+$/.test(cleaned)) {
      return parseInt(cleaned, 10);
    }
  }

  return null;
}

function cleanPlayerName(name) {
  return String(name || "")
    .replace(/\[\s*MOI\s*\]/gi, "")
    .replace(/\(\s*MOI\s*\)/gi, "")
    .replace(/\bMOI\b/gi, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDamage(value) {
  return toNullableInt(value);
}

function normalizePlayer(player, index, alliance) {
  return {
    rank: index + 1,
    row_index:
      typeof player?.row_index === "number"
        ? player.row_index
        : index + 1,
    name: cleanPlayerName(player?.name ?? null),
    alliance: alliance,
    attack_points: toNullableInt(player?.attack_points),
    attacks: toNullableInt(player?.attacks),
    damage: normalizeDamage(player?.damage),
    defense_wins: toNullableInt(player?.defense_wins),
    defense_bonus: toNullableInt(player?.defense_bonus)
  };
}

function getInvalidReasons(player) {
  const reasons = [];

  if (!player.name) {
    reasons.push("name");
  }

  if (
    player.attack_points !== null &&
    (player.attack_points < 0 || player.attack_points > 15000)
  ) {
    reasons.push("attack_points");
  }

  if (
    player.attacks !== null &&
    (player.attacks < 0 || player.attacks > 14)
  ) {
    reasons.push("attacks");
  }

  if (
    player.damage !== null &&
    (player.damage < 0 || player.damage > 30000000000)
  ) {
    reasons.push("damage");
  }

  if (
    player.defense_wins !== null &&
    (player.defense_wins < 0 || player.defense_wins > 20)
  ) {
    reasons.push("defense_wins");
  }

  if (
    player.defense_bonus !== null &&
    (player.defense_bonus < 0 || player.defense_bonus > 10)
  ) {
    reasons.push("defense_bonus");
  }

  return reasons;
}

function buildFinalWarFile(warDate, alliance, model, players) {
  return {
    date: warDate,
    alliance: alliance,
    captured_at: new Date().toISOString(),
    source: model,
    players: players.map(function (player, index) {
      return {
        rank: index + 1,
        name: player.name,
        attack_points: player.attack_points,
        attacks: player.attacks,
        damage: player.damage,
        defense_wins: player.defense_wins,
        defense_bonus: player.defense_bonus
      };
    })
  };
}

function getGitHubContentsApiUrl(env, path) {
  const owner = String(env.GITHUB_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO || "").trim();

  if (!owner || !repo) {
    throw new Error("Configuration GitHub incomplète dans le Worker.");
  }

  return (
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    "/contents/" +
    path.split("/").map(encodeURIComponent).join("/")
  );
}

function getGitHubHeaders(env, includeContentType) {
  const token = String(env.GITHUB_TOKEN || "").trim();

  if (!token) {
    throw new Error("Le secret GITHUB_TOKEN est absent dans le Worker.");
  }

  const headers = {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github+json",
    "User-Agent": "msf-war-worker"
  };

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function sortWarAlliances(values) {
  const unique = [];

  for (const value of Array.isArray(values) ? values : []) {
    const alliance = normalizeAlliance(value);
    if (alliance && !unique.includes(alliance)) unique.push(alliance);
  }

  return unique.sort(function (left, right) {
    return WAR_ALLIANCE_ORDER.indexOf(left) - WAR_ALLIANCE_ORDER.indexOf(right);
  });
}

function normalizeWarIndex(index) {
  const normalized = { alliances: [], dates: [] };
  if (!isPlainObject(index)) return normalized;

  normalized.alliances = sortWarAlliances(index.alliances);
  if (!Array.isArray(index.dates)) return normalized;

  const entriesByDate = new Map();
  for (const entry of index.dates) {
    if (!isPlainObject(entry) || !isValidIsoDate(entry.date)) continue;
    const existing = entriesByDate.get(entry.date) || [];
    entriesByDate.set(entry.date, sortWarAlliances([
      ...existing,
      ...(Array.isArray(entry.alliances) ? entry.alliances : [])
    ]));
  }

  normalized.dates = Array.from(entriesByDate.entries())
    .map(function ([date, alliances]) { return { date, alliances }; })
    .sort(function (left, right) { return left.date.localeCompare(right.date); });

  return normalized;
}

function addReportToWarIndex(index, warDate, alliance) {
  const normalized = normalizeWarIndex(index);
  normalized.alliances = sortWarAlliances([...normalized.alliances, alliance]);

  let dateEntry = normalized.dates.find(function (entry) {
    return entry.date === warDate;
  });

  if (!dateEntry) {
    dateEntry = { date: warDate, alliances: [] };
    normalized.dates.push(dateEntry);
  }

  dateEntry.alliances = sortWarAlliances([...dateEntry.alliances, alliance]);
  normalized.dates.sort(function (left, right) {
    return left.date.localeCompare(right.date);
  });

  return normalized;
}

async function readWarIndexFromGitHub(env) {
  const branch = String(env.GITHUB_BRANCH || "").trim();
  if (!branch) throw new Error("La branche GitHub de publication doit être configurée.");

  const response = await fetch(
    getGitHubContentsApiUrl(env, WAR_INDEX_PATH) + "?ref=" + encodeURIComponent(branch),
    { method: "GET", headers: getGitHubHeaders(env, false) }
  );

  if (response.status === 404) {
    return { index: { alliances: [], dates: [] }, sha: null };
  }
  if (!response.ok) {
    throw new Error("Lecture de l’index des guerres impossible : " + await response.text());
  }

  const data = await response.json();
  if (!isPlainObject(data) || typeof data.content !== "string" || typeof data.sha !== "string") {
    throw new Error("Réponse GitHub invalide pour l’index des guerres.");
  }

  let parsed;
  try {
    parsed = JSON.parse(base64ToStringUtf8(data.content.replace(/\s/g, "")));
  } catch (error) {
    throw new Error("Le fichier index.json des guerres est invalide.");
  }

  return { index: normalizeWarIndex(parsed), sha: data.sha };
}

async function writeWarIndexToGitHub(env, index, existingSha, warDate) {
  const branch = String(env.GITHUB_BRANCH || "").trim();
  if (!branch) throw new Error("La branche GitHub de publication doit être configurée.");

  const body = {
    message: "chore(war): update index for " + warDate,
    content: stringToBase64Utf8(JSON.stringify(index, null, 2) + "\n"),
    branch
  };
  if (existingSha) body.sha = existingSha;

  const response = await fetch(getGitHubContentsApiUrl(env, WAR_INDEX_PATH), {
    method: "PUT",
    headers: getGitHubHeaders(env, true),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error("Mise à jour de l’index des guerres impossible : " + await response.text());
  }

  return await response.json();
}

async function updateWarIndexAfterPublication(env, warDate, alliance) {
  const current = await readWarIndexFromGitHub(env);
  const updatedIndex = addReportToWarIndex(current.index, warDate, alliance);
  const githubWrite = await writeWarIndexToGitHub(
    env,
    updatedIndex,
    current.sha,
    warDate
  );

  return {
    path: WAR_INDEX_PATH,
    commit_sha: githubWrite && githubWrite.commit ? githubWrite.commit.sha : null
  };
}

async function upsertFileToGitHub(args) {
  const env = args.env;
  const path = args.path;
  const jsonObject = args.jsonObject;
  const message = args.message;

  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const token = env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error("Secrets GitHub manquants dans le Worker.");
  }

  const apiUrl =
    "https://api.github.com/repos/" +
    owner +
    "/" +
    repo +
    "/contents/" +
    path.split("/").map(encodeURIComponent).join("/");

  let existingSha = null;

  const getRes = await fetch(
    apiUrl + "?ref=" + encodeURIComponent(branch),
    {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "User-Agent": "msf-war-worker"
      }
    }
  );

  if (getRes.ok) {
    const existingData = await getRes.json();
    existingSha = existingData.sha || null;
  } else if (getRes.status !== 404) {
    const errText = await getRes.text();
    throw new Error("Lecture GitHub impossible : " + errText);
  }

  const content = JSON.stringify(jsonObject, null, 2) + "\n";
  const base64Content = stringToBase64Utf8(content);

  const body = {
    message: message,
    content: base64Content,
    branch: branch
  };

  if (existingSha) {
    body.sha = existingSha;
  }

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "msf-war-worker"
    },
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error("Écriture GitHub impossible : " + errText);
  }

  return await putRes.json();
}

async function callGeminiVision(args) {
  const imageBlob = args.imageBlob;
  const alliance = args.alliance;
  const shouldDetectAlliance = args.detectAlliance === true;
  const env = args.env;

  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    throw new Error(
      "La variable secrète GEMINI_API_KEY est absente dans le Worker."
    );
  }

  const imageBuffer = await imageBlob.arrayBuffer();
  const imageBase64 = arrayBufferToBase64(imageBuffer);

  const prompt = shouldDetectAlliance
    ? buildGeminiAutoDetectPrompt()
    : buildGeminiPrompt(alliance);

  const payload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: imageBlob.type || "image/jpeg",
              data: imageBase64
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      (data && data.error && data.error.message) || "Erreur Gemini"
    );
  }

  const rawText = getGeminiText(data);
  const cleanedText = stripCodeFences(rawText);

  let parsed;

  try {
    parsed = JSON.parse(cleanedText);
  } catch (error) {
    return {
      ok: false,
      model: model,
      raw_gemini_text: rawText,
      parsed_json_error:
        "Gemini n'a pas renvoyé un JSON parseable."
    };
  }

  const playersInput =
    parsed && Array.isArray(parsed.players)
      ? parsed.players
      : [];

  let resolvedAlliance = alliance;
  let detectionConfident = true;

  if (shouldDetectAlliance) {
    const detectedAlliance =
      normalizeAlliance(parsed?.detected_alliance) ||
      normalizeAlliance(parsed?.detected_alliance_label) ||
      normalizeAlliance(parsed?.alliance);

    detectionConfident =
      Boolean(detectedAlliance) &&
      parsed?.detection_confident !== false;

    resolvedAlliance = detectionConfident
      ? detectedAlliance
      : null;
  }

  const players = [];

  for (let index = 0; index < 24; index += 1) {
    players.push(
      normalizePlayer(
        playersInput[index] || {},
        index,
        resolvedAlliance
      )
    );
  }

  const playersWithValidation = players.map(function (player) {
    const invalidReasons = getInvalidReasons(player);

    return {
      row_index: player.row_index,
      rank: player.rank,
      name: player.name,
      alliance: player.alliance,
      attack_points: player.attack_points,
      attacks: player.attacks,
      damage: player.damage,
      defense_wins: player.defense_wins,
      defense_bonus: player.defense_bonus,
      is_valid: invalidReasons.length === 0,
      invalid_reasons: invalidReasons
    };
  });

  const validRows = playersWithValidation.filter(function (player) {
    return player.is_valid;
  }).length;

  const invalidRows =
    playersWithValidation.length - validRows;

  const result = {
    ok: true,
    model: model,
    alliance: resolvedAlliance,
    counts: {
      players_total: playersWithValidation.length,
      valid_rows: validRows,
      invalid_rows: invalidRows
    },
    players: playersWithValidation,
    raw_gemini_text: rawText
  };

  if (shouldDetectAlliance) {
    result.detected_alliance = resolvedAlliance;
    result.detected_alliance_label = resolvedAlliance
      ? getAllianceLabel(resolvedAlliance)
      : null;
    result.detection_confident = detectionConfident;
  }

  return result;
}

async function handleWarParseGemini(request, env, options) {
  const shouldPublish =
    !options || options.publish !== false;

  const shouldDetectAlliance = Boolean(
    options && options.detectAlliance === true
  );

  const formData = await request.formData();

  const allianceRaw = formData.get("alliance");
  const warDate = formData.get("war_date");
  const imageBlob = formData.get("image");

  let alliance = null;

  if (!shouldDetectAlliance) {
    if (!allianceRaw || typeof allianceRaw !== "string") {
      return Response.json(
        {
          ok: false,
          error: "Alliance manquante"
        },
        {
          status: 400
        }
      );
    }

    alliance = normalizeAlliance(allianceRaw);

    if (!alliance) {
      return Response.json(
        {
          ok: false,
          error:
            "Alliance invalide. Valeurs acceptées : zeus, athena, kronos, dionysos, poseidon, hades"
        },
        {
          status: 400
        }
      );
    }
  }

  if (!warDate || typeof warDate !== "string") {
    return Response.json(
      {
        ok: false,
        error: "Date de guerre manquante"
      },
      {
        status: 400
      }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(warDate)) {
    return Response.json(
      {
        ok: false,
        error: "Format de date invalide. Attendu : YYYY-MM-DD"
      },
      {
        status: 400
      }
    );
  }

  if (!imageBlob || typeof imageBlob === "string") {
    return Response.json(
      {
        ok: false,
        error: "Image manquante"
      },
      {
        status: 400
      }
    );
  }

  const result = await callGeminiVision({
    imageBlob: imageBlob,
    alliance: alliance,
    detectAlliance: shouldDetectAlliance,
    env: env
  });

  if (!result.ok) {
    return Response.json(result);
  }

  const resolvedAlliance = shouldDetectAlliance
    ? result.detected_alliance
    : alliance;

  const finalPlayers = result.players.map(function (player) {
    return {
      rank: player.rank,
      name: player.name,
      attack_points: player.attack_points,
      attacks: player.attacks,
      damage: player.damage,
      defense_wins: player.defense_wins,
      defense_bonus: player.defense_bonus
    };
  });

  const finalWarFile = buildFinalWarFile(
    warDate,
    resolvedAlliance,
    result.model,
    finalPlayers
  );

  if (!shouldPublish) {
    const draftResponse = {
      ok: true,
      model: result.model,
      alliance: resolvedAlliance,
      alliance_label: resolvedAlliance
        ? getAllianceLabel(resolvedAlliance)
        : null,
      war_date: warDate,
      counts: result.counts,
      players: result.players,
      draft: finalWarFile,
      published: false,
      raw_gemini_text: result.raw_gemini_text
    };

    if (shouldDetectAlliance) {
      draftResponse.detected_alliance =
        result.detected_alliance;

      draftResponse.detected_alliance_label =
        result.detected_alliance_label;

      draftResponse.detection_confident =
        result.detection_confident;

      draftResponse.requires_alliance_confirmation =
        !result.detected_alliance;
    }

    return Response.json(draftResponse);
  }

  const exportPath =
    "docs/data/war/" +
    warDate +
    "/" +
    alliance +
    ".json";

  const githubWrite = await upsertFileToGitHub({
    env: env,
    path: exportPath,
    jsonObject: finalWarFile,
    message:
      "chore(war): update " +
      alliance +
      " for " +
      warDate
  });

  return Response.json({
    ok: true,
    model: result.model,
    alliance: alliance,
    alliance_label: getAllianceLabel(alliance),
    war_date: warDate,
    counts: result.counts,
    players: result.players,
    export_payload: {
      path: exportPath,
      json: finalWarFile
    },
    github: {
      committed: true,
      path: exportPath,
      commit_sha:
        githubWrite && githubWrite.commit
          ? githubWrite.commit.sha
          : null
    },
    raw_gemini_text: result.raw_gemini_text
  });
}
