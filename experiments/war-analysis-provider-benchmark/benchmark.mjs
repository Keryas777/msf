import {
  GROQ_ANALYSES_RESPONSE_FORMAT,
  buildAnalysisPrompt,
  getGlobalToneCeiling
} from "../../workers/msf-war-ocr/worker.js";

export const GROQ_MODEL = "openai/gpt-oss-120b";
export const CLOUDFLARE_GLM_MODEL = "@cf/zai-org/glm-4.7-flash";
export const CLOUDFLARE_GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const CLOUDFLARE_LLAMA4_SCOUT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
export const MAX_ANALYSIS_LENGTH = 700;
export const MAX_SENTENCES = 3;
export const BENCHMARK_PROVIDERS = Object.freeze(["all", "groq", "cloudflare-glm", "cloudflare-gemma", "cloudflare-llama4-scout"]);
export const CLOUDFLARE_ANALYSES_RESPONSE_FORMAT = Object.freeze({
  type: "json_schema",
  json_schema: {
    type: "object",
    properties: {
      analyses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            name: { type: "string" },
            analysis: { type: "string" }
          },
          required: ["rank", "name", "analysis"],
          additionalProperties: false
        }
      }
    },
    required: ["analyses"],
    additionalProperties: false
  }
});

export function getBenchmarkConfig(env = process.env) {
  return {
    groqApiKey: env.GROQ_API_KEY,
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareWorkersAiToken: env.CLOUDFLARE_WORKERS_AI_TOKEN,
    cloudflareGlmModel: env.CLOUDFLARE_GLM_MODEL || CLOUDFLARE_GLM_MODEL,
    cloudflareGemmaModel: env.CLOUDFLARE_GEMMA_MODEL || CLOUDFLARE_GEMMA_MODEL,
    cloudflareLlama4ScoutModel: CLOUDFLARE_LLAMA4_SCOUT_MODEL
  };
}

const TONE_LEVELS = Object.freeze({
  withdrawn: 0, mixed: 1, solid: 2, good: 3, very_good: 4,
  excellent: 5, exceptional: 6
});
const TONE_PATTERNS = [
  ["exceptional", /\b(?:exceptionnel(?:le)?|remarquable)\b/iu],
  ["excellent", /\bexcellent(?:e)?\b/iu],
  ["very_good", /\b(?:très bon(?:ne)?|très positif(?:ive)?|convaincant(?:e)?)\b/iu],
  ["good", /\bbon(?:ne)?\b/iu],
  ["solid", /\bsolide\b/iu],
  ["mixed", /\bmitigé(?:e)?\b/iu],
  ["withdrawn", /\b(?:en retrait|insuffisant(?:e)?)\b/iu]
];

function countSentences(text, name) {
  const normalized = name ? String(text).split(name).join("PSEUDO") : String(text);
  return (normalized.match(/[.!?]+(?=\s|$)/g) || []).length;
}

function exceedsToneCeiling(text, score) {
  const ceiling = TONE_LEVELS[getGlobalToneCeiling(score)];
  const sentences = text.match(/.*?(?:[.!?]+(?=\s|$)|$)/gu) || [];
  return sentences.some((sentence) => {
    const global = /\b(?:performance|prestation|guerre|bilan global)\b/iu.test(sentence) ||
      /\bglobalement\b/iu.test(sentence) ||
      /\b(?:il|elle)\s+(?:a\s+été|était|a\s+(?:réalisé|signé|livré)|signe|livre)\b/iu.test(sentence);
    return global && TONE_PATTERNS.some(([tone, pattern]) =>
      pattern.test(sentence) && TONE_LEVELS[tone] > ceiling);
  });
}

export function validateReport(reportEnvelope) {
  const players = reportEnvelope?.report?.players;
  const ranking = reportEnvelope?.report?.ranking;
  if (!Array.isArray(players) || players.length !== 24 || !Array.isArray(ranking) || ranking.length !== 24) {
    throw new Error("Le benchmark exige un rapport calculé et classé de exactement 24 joueurs.");
  }
  players.forEach((player, index) => {
    const ranked = ranking[index];
    if (player.rank !== index + 1 || ranked?.rank !== player.rank ||
        ranked?.name !== player.name || ranked?.score !== player.score_total ||
        !Number.isFinite(player.score_total)) {
      throw new Error(`Rapport ou classement incohérent au rang ${index + 1}.`);
    }
  });
  return reportEnvelope;
}

export function inspectOutput(rawText, players) {
  const result = {
    json_valid: false, analyses_received: 0, analyses_accepted: 0,
    analyses_rejected: 0, rejection_reasons: {}, sentence_compliance: 0,
    length_compliance: 0, tone_compliance: 0, analyses: []
  };
  let parsed;
  try { parsed = JSON.parse(String(rawText).replace(/^```(?:json)?\s*|\s*```$/gi, "")); }
  catch { result.rejection_reasons.invalid_json = 1; return result; }
  result.json_valid = true;
  if (!parsed || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.analyses)) {
    result.rejection_reasons.invalid_envelope = 1; return result;
  }
  result.analyses_received = parsed.analyses.length;
  const ranks = new Map();
  const names = new Map();
  for (const entry of parsed.analyses) {
    ranks.set(entry?.rank, (ranks.get(entry?.rank) || 0) + 1);
    names.set(entry?.name, (names.get(entry?.name) || 0) + 1);
  }
  for (const entry of parsed.analyses) {
    const reasons = [];
    const player = players.find((candidate) => candidate.rank === entry?.rank);
    if (!entry || Object.keys(entry).sort().join() !== "analysis,name,rank") reasons.push("invalid_entry_shape");
    if (!player || player.name !== entry?.name) reasons.push("unknown_player");
    if (ranks.get(entry?.rank) !== 1 || names.get(entry?.name) !== 1) reasons.push("duplicate_player");
    const text = typeof entry?.analysis === "string" ? entry.analysis.replace(/\s+/g, " ").trim() : "";
    if (!text) reasons.push("empty_analysis");
    const sentences = text && player ? countSentences(text, player.name) : 0;
    const sentenceOk = sentences >= 1 && sentences <= MAX_SENTENCES;
    const lengthOk = text.length > 0 && text.length <= MAX_ANALYSIS_LENGTH;
    const toneOk = Boolean(player && text && !exceedsToneCeiling(text, player.score_total));
    if (sentenceOk) result.sentence_compliance += 1; else reasons.push("sentence_count");
    if (lengthOk) result.length_compliance += 1; else reasons.push("length_over_700");
    if (toneOk) result.tone_compliance += 1; else reasons.push("tone_ceiling");
    if (/\bscore(?:_|\s+)total\b/iu.test(text)) reasons.push("score_total_mentioned");
    result.analyses.push({ rank: entry?.rank ?? null, name: entry?.name ?? null, analysis: text,
      sentence_count: sentences, character_count: text.length, tone_ceiling_violation: !toneOk,
      accepted: reasons.length === 0, rejection_reasons: reasons });
    if (reasons.length === 0) result.analyses_accepted += 1;
    else {
      result.analyses_rejected += 1;
      for (const reason of new Set(reasons)) result.rejection_reasons[reason] = (result.rejection_reasons[reason] || 0) + 1;
    }
  }
  return result;
}

function selectedHeaders(headers) {
  const output = {};
  for (const [name, value] of headers.entries()) {
    if (/^(retry-after|x-ratelimit-|ratelimit-|cf-ray)/i.test(name)) output[name] = value;
  }
  return output;
}

async function performCall({ provider, model, endpoint, headers, body, players, fetchImpl }) {
  const started = performance.now();
  try {
    const response = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    const responseText = await response.text();
    let payload;
    try { payload = JSON.parse(responseText); } catch { payload = null; }
    const raw = provider === "groq" ? payload?.choices?.[0]?.message?.content :
      (typeof payload?.result?.response === "string" ? payload.result.response : JSON.stringify(payload?.result?.response ?? ""));
    const inspected = inspectOutput(raw || "", players);
    return { provider, model, success: response.ok, http_status: response.status,
      duration_ms: Math.round(performance.now() - started), calls: 1, players_requested: players.length,
      structured_output: provider === "groq" ? "Groq json_schema strict: true (identique à la production)" :
        ["cloudflare-glm", "cloudflare-llama4-scout"].includes(provider) ? "Cloudflare Workers AI json_schema (validation métier locale finale)" : "non utilisé",
      quota_headers: selectedHeaders(response.headers), usage: payload?.usage ?? payload?.result?.usage ?? null,
      error: response.ok ? null : payload?.errors ?? payload?.error ?? responseText, ...inspected };
  } catch (error) {
    return { provider, model, success: false, duration_ms: Math.round(performance.now() - started), calls: 1,
      players_requested: players.length, analyses_received: 0, analyses_accepted: 0, analyses_rejected: 0,
      rejection_reasons: {}, json_valid: false, quota_headers: {}, usage: null, analyses: [], error: error.message };
  }
}

export async function runBenchmark({ report, config, provider = "all", fetchImpl = fetch }) {
  validateReport(report);
  if (!BENCHMARK_PROVIDERS.includes(provider)) {
    throw new Error(`Fournisseur inconnu: ${provider}. Valeurs attendues: ${BENCHMARK_PROVIDERS.join(", ")}`);
  }
  const prompt = buildAnalysisPrompt(report, false);
  const players = report.report.players;
  const selectedProviders = provider === "all" ? BENCHMARK_PROVIDERS.slice(1) : [provider];
  const required = selectedProviders.flatMap((selected) => selected === "groq"
    ? ["groqApiKey"]
    : ["cloudflareAccountId", "cloudflareWorkersAiToken", selected === "cloudflare-glm" ? "cloudflareGlmModel" :
      selected === "cloudflare-gemma" ? "cloudflareGemmaModel" : "cloudflareLlama4ScoutModel"]);
  const missing = required.filter((key) => !config[key]);
  if (missing.length) throw new Error(`Configuration absente: ${missing.join(", ")}`);
  const calls = [];
  if (selectedProviders.includes("groq")) {
    calls.push(performCall({ provider: "groq", model: GROQ_MODEL, endpoint: "https://api.groq.com/openai/v1/chat/completions",
      headers: { authorization: `Bearer ${config.groqApiKey}`, "content-type": "application/json" },
      body: { model: GROQ_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.55, reasoning_effort: "low", max_completion_tokens: 6000, response_format: GROQ_ANALYSES_RESPONSE_FORMAT }, players, fetchImpl }));
  }
  for (const [cloudflareProvider, model] of [["cloudflare-glm", config.cloudflareGlmModel], ["cloudflare-gemma", config.cloudflareGemmaModel],
    ["cloudflare-llama4-scout", config.cloudflareLlama4ScoutModel]]) {
    if (!selectedProviders.includes(cloudflareProvider)) continue;
    const body = { messages: [{ role: "user", content: prompt }], temperature: 0.55 };
    if (["cloudflare-glm", "cloudflare-llama4-scout"].includes(cloudflareProvider)) body.response_format = CLOUDFLARE_ANALYSES_RESPONSE_FORMAT;
    calls.push(performCall({ provider: cloudflareProvider, model,
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/run/${model}`,
      headers: { authorization: `Bearer ${config.cloudflareWorkersAiToken}`, "content-type": "application/json" }, body, players, fetchImpl }));
  }
  return { generated_at: new Date().toISOString(), prompt, results: await Promise.all(calls) };
}

export function renderMarkdown(run, sourcePath) {
  const rows = run.results.map((r) => `| ${r.provider} | \`${r.model}\` | ${r.success ? "succès" : "échec"} | ${r.http_status ?? "non reçu"} | ${r.duration_ms} | ${r.calls} | ${r.json_valid ? "oui" : "non"} | ${r.analyses_received} | ${r.analyses_accepted} | ${r.analyses_rejected} |`).join("\n");
  const details = run.results.map((r) => `### ${r.provider} — \`${r.model}\`\n\n- Structured output : ${r.structured_output || "non renseigné"}\n- Conformité phrases (1 à 3) : ${r.sentence_compliance ?? 0}/${r.analyses_received}\n- Conformité longueur (700 caractères maximum) : ${r.length_compliance ?? 0}/${r.analyses_received}\n- Violations du plafond tonal : ${(r.analyses || []).filter((a) => a.tone_ceiling_violation).length}\n- Rejets : \`${JSON.stringify(r.rejection_reasons)}\`\n- Quota/rate-limit : \`${JSON.stringify(r.quota_headers)}\`\n- Usage (tokens/neurons si exposés) : \`${JSON.stringify(r.usage)}\`\n- Erreur : ${r.error ? `\`${JSON.stringify(r.error)}\`` : "aucune"}\n\n${r.analyses.map((a) => `${a.rank}. **${a.name}** — ${a.analysis || "_(vide)_"} _(${a.sentence_count} phrase(s), ${a.character_count} caractères)_${a.accepted ? "" : ` _(rejet: ${a.rejection_reasons.join(", ")})_`}`).join("\n\n") || "Aucune analyse reçue."}`).join("\n\n");
  return `# Benchmark expérimental des rédacteurs de débrief de guerre\n\n> Laboratoire isolé : ce rapport ne décide ni ne déclenche aucun changement de production.\n\n## 1. Architecture\n\nCLI locale à activation explicite, entrée unique \`${sourcePath}\`, prompt de production partagé, quatre adaptateurs réseau et validation métier locale. Aucun chemin War Admin n'appelle ce laboratoire.\n\n## 2. Modèles\n\n${run.results.map((r) => `- ${r.provider}: \`${r.model}\``).join("\n")}\n\n## 3. Paramètres\n\nTempérature 0,55 ; 24 joueurs ; un appel unique sans retry ni fallback par fournisseur ; Groq emploie exactement son schéma strict de production, \`reasoning_effort: "low"\` et \`max_completion_tokens: 6000\`.\n\n## 4. Prompt réellement transmis\n\n<details><summary>Prompt commun intégral</summary>\n\n\`\`\`text\n${run.prompt}\n\`\`\`\n</details>\n\n## 5–6. Résultats techniques et tableau comparatif\n\n| Fournisseur | Modèle | État | HTTP | Durée (ms) | Appels | JSON valide | Reçues | Acceptées | Rejetées |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n## 7. Analyses complètes\n\n${details}\n\n## 8. Anomalies\n\nVoir les raisons de rejet et erreurs ci-dessus.\n\n## 9. Consommation et quota\n\nLes headers et objets usage exposés par les fournisseurs sont conservés ci-dessus ; une valeur nulle signifie que le fournisseur ne l'a pas exposée. Aucune métrique absente n'est estimée.\n\n## 10. Appréciation technique\n\nLes mesures sont descriptives uniquement. Toute décision de changement de production reste explicitement hors périmètre.\n`;
}
