const DEFAULT_SITE_ORIGIN = "https://keryas777.github.io";
const DEFAULT_AUTH_BASE_URL = "https://losp-auth.deliriousfan7.workers.dev";
const DEFAULT_SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";
const DEFAULT_SHEET_NAME = "WarCounters";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MAX_BATCH_ITEMS = 100;

function envValue(env, key, fallback = "") {
  return String(env?.[key] ?? fallback).trim();
}

function corsHeaders(request, env) {
  const allowed = envValue(env, "SITE_ORIGIN", DEFAULT_SITE_ORIGIN);
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === allowed ? origin : allowed,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function jsonResponse(data, request, env, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function getBearer(request) {
  const value = request.headers.get("Authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function requireAdmin(request, env) {
  const session = getBearer(request);
  if (!session) {
    const error = new Error("Connexion LoSP requise.");
    error.status = 401;
    throw error;
  }

  const authBase = envValue(env, "AUTH_BASE_URL", DEFAULT_AUTH_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${authBase}/me`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${session}` }
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {}

  if (!response.ok || !data?.ok) {
    const error = new Error("Session LoSP invalide ou expirée.");
    error.status = 401;
    throw error;
  }

  if (String(data.role || "").toLowerCase() !== "admin") {
    const error = new Error("Écriture War Counters réservée à un administrateur LoSP.");
    error.status = 403;
    throw error;
  }

  return data;
}

function base64UrlBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlText(value) {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function pemToArrayBuffer(pem) {
  const normalized = String(pem || "").replace(/\\n/g, "\n");
  const base64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!base64) throw new Error("Clé privée Google absente.");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function serviceAccountAccessToken(env) {
  const email = envValue(env, "GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = envValue(env, "GOOGLE_PRIVATE_KEY");
  if (!email || !privateKey) {
    const error = new Error("Secrets Google Sheets non configurés dans le Worker.");
    error.status = 503;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlText(JSON.stringify({
    iss: email,
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );

  const assertion = `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    const error = new Error(`Authentification Google impossible (${response.status}).`);
    error.status = 502;
    throw error;
  }
  return data.access_token;
}

function sheetConfig(env) {
  return {
    spreadsheetId: envValue(env, "GOOGLE_SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID),
    sheetName: envValue(env, "GOOGLE_SHEET_NAME", DEFAULT_SHEET_NAME)
  };
}

async function googleJson(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_) {}
  if (!response.ok) {
    const message = data?.error?.message || `Google Sheets HTTP ${response.status}`;
    const error = new Error(message);
    error.status = 502;
    throw error;
  }
  return data || {};
}

async function readSheetRows(env, accessToken) {
  const { spreadsheetId, sheetName } = sheetConfig(env);
  const range = encodeURIComponent(`${sheetName}!A:V`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const data = await googleJson(url, accessToken);
  return Array.isArray(data.values) ? data.values : [];
}

function canonicalTeamKey(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function matchupKey(attackIds, defenseIds) {
  return `${canonicalTeamKey(attackIds)}>>${canonicalTeamKey(defenseIds)}`;
}

function ceilRatioToHundredth(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.ceil(number * 100 - 1e-10) / 100;
}

function ratioFromPowers(attackPower, defensePower) {
  const attack = Number(attackPower);
  const defense = Number(defensePower);
  if (!Number.isSafeInteger(attack) || !Number.isSafeInteger(defense) || attack <= 0 || defense <= 0) {
    return null;
  }
  return ceilRatioToHundredth(attack / defense);
}

function normalizeIds(value, label) {
  const ids = (Array.isArray(value) ? value : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  if (!ids.length || ids.length > 5 || new Set(ids).size !== ids.length) {
    const error = new Error(`${label} invalide.`);
    error.status = 400;
    throw error;
  }
  return ids;
}

const HEADERS = [
  "def_family", "def_variant", "def_key",
  "def_char1", "def_char2", "def_char3", "def_char4", "def_char5",
  "atk_family", "atk_team", "atk_key",
  "atk_char1", "atk_char2", "atk_char3", "atk_char4", "atk_char5",
  "min_ratio_hard", "min_ratio_ok", "min_ratio_safe", "min_ratio_overkill", "min_ratio_overkill_plus",
  "notes"
];

function rowsAsObjects(values) {
  if (!values.length) return [];
  const headers = values[0].map((value) => String(value || "").trim());
  const missing = HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    const error = new Error(`Schéma WarCounters incomplet : ${missing.join(", ")}`);
    error.status = 409;
    throw error;
  }

  return values.slice(1).map((cells, index) => {
    const row = { __sheetRow: index + 2 };
    headers.forEach((header, cellIndex) => {
      if (header) row[header] = cells[cellIndex] ?? "";
    });
    return row;
  }).filter((row) => String(row.def_family || row.def_variant || row.atk_family || row.atk_team || "").trim());
}

function rowIds(row, prefix) {
  return [1, 2, 3, 4, 5]
    .map((index) => String(row?.[`${prefix}_char${index}`] || "").trim())
    .filter(Boolean);
}

function matchingRows(rows, attackIds, defenseIds) {
  const attackKey = canonicalTeamKey(attackIds);
  const defenseKey = canonicalTeamKey(defenseIds);
  return rows.filter((row) =>
    canonicalTeamKey(rowIds(row, "atk")) === attackKey &&
    canonicalTeamKey(rowIds(row, "def")) === defenseKey
  );
}

function numericRatio(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function analyzeExisting(matches, newRatio) {
  if (!matches.length) return { status: "new", ratio: newRatio, matches: [] };
  const ratios = matches.map((row) => numericRatio(row.min_ratio_hard)).filter(Boolean);
  const unique = [...new Set(ratios.map((value) => value.toFixed(6)))];
  if (ratios.length !== matches.length || unique.length !== 1) {
    return { status: "conflict", ratio: newRatio, matches };
  }
  const existingRatio = ratios[0];
  if (newRatio < existingRatio) return { status: "improves", ratio: newRatio, existingRatio, matches };
  if (newRatio > existingRatio) return { status: "worse", ratio: newRatio, existingRatio, matches };
  return { status: "same", ratio: newRatio, existingRatio, matches };
}

function cleanText(value, maxLength = 120) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function validatedMetadata(value) {
  const metadata = value && typeof value === "object" ? value : {};
  const result = {
    def_family: cleanText(metadata.def_family),
    def_variant: cleanText(metadata.def_variant),
    def_key: cleanText(metadata.def_key, 100),
    atk_family: cleanText(metadata.atk_family),
    atk_team: cleanText(metadata.atk_team),
    atk_key: cleanText(metadata.atk_key, 100),
    notes: cleanText(metadata.notes, 500)
  };
  for (const key of ["def_family", "def_variant", "def_key", "atk_family", "atk_team", "atk_key"]) {
    if (!result[key]) {
      const error = new Error(`Champ ${key} requis pour un nouveau matchup.`);
      error.status = 400;
      throw error;
    }
  }
  return result;
}

function normalizeBatchItems(value) {
  const rawItems = Array.isArray(value) ? value : [];
  if (!rawItems.length) {
    const error = new Error("Aucun contre à enregistrer.");
    error.status = 400;
    throw error;
  }
  if (rawItems.length > MAX_BATCH_ITEMS) {
    const error = new Error(`Lot trop grand : ${MAX_BATCH_ITEMS} contres maximum.`);
    error.status = 400;
    throw error;
  }

  const grouped = new Map();
  rawItems.forEach((raw, index) => {
    const attackIds = normalizeIds(raw?.attackIds, `Composition attaque #${index + 1}`);
    const defenseIds = normalizeIds(raw?.defenseIds, `Composition défense #${index + 1}`);
    const attackPower = Number(raw?.attackPower);
    const defensePower = Number(raw?.defensePower);
    const ratio = ratioFromPowers(attackPower, defensePower);
    if (!ratio) {
      const error = new Error(`Puissances invalides pour le contre #${index + 1}.`);
      error.status = 400;
      throw error;
    }

    const key = matchupKey(attackIds, defenseIds);
    const candidate = {
      key,
      attackIds,
      defenseIds,
      attackPower,
      defensePower,
      ratio,
      metadata: raw?.metadata,
      sourceIndexes: [index]
    };
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, candidate);
      return;
    }

    const sourceIndexes = [...existing.sourceIndexes, index];
    if (candidate.ratio < existing.ratio) {
      candidate.sourceIndexes = sourceIndexes;
      grouped.set(key, candidate);
    } else {
      existing.sourceIndexes = sourceIndexes;
    }
  });

  const items = [...grouped.values()].sort((a, b) => a.sourceIndexes[0] - b.sourceIndexes[0]);
  return {
    inputCount: rawItems.length,
    duplicateCount: rawItems.length - items.length,
    items
  };
}

function buildBatchPlan(rows, items) {
  const creates = [];
  const updates = [];
  const skipped = [];
  const conflicts = [];

  for (const item of items) {
    const matches = matchingRows(rows, item.attackIds, item.defenseIds);
    const comparison = analyzeExisting(matches, item.ratio);

    if (comparison.status === "conflict") {
      conflicts.push({
        ...item,
        status: "conflict",
        rows: matches.map((row) => row.__sheetRow)
      });
      continue;
    }

    if (comparison.status === "same" || comparison.status === "worse") {
      skipped.push({
        ...item,
        status: comparison.status,
        existingRatio: comparison.existingRatio,
        rows: matches.map((row) => row.__sheetRow)
      });
      continue;
    }

    if (comparison.status === "improves") {
      updates.push({
        ...item,
        status: "updated",
        previousRatio: comparison.existingRatio,
        matches
      });
      continue;
    }

    creates.push({
      ...item,
      status: "created",
      metadata: validatedMetadata(item.metadata)
    });
  }

  return { creates, updates, skipped, conflicts };
}

async function updateHardRatios(env, accessToken, matches, ratio) {
  const { spreadsheetId, sheetName } = sheetConfig(env);
  const data = matches.map((row) => ({
    range: `${sheetName}!Q${row.__sheetRow}`,
    majorDimension: "ROWS",
    values: [[ratio]]
  }));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  await googleJson(url, accessToken, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data })
  });
  return matches.map((row) => row.__sheetRow);
}

async function updateHardRatiosBatch(env, accessToken, updates) {
  if (!updates.length) return [];
  const { spreadsheetId, sheetName } = sheetConfig(env);
  const data = updates.flatMap((entry) => entry.matches.map((row) => ({
    range: `${sheetName}!Q${row.__sheetRow}`,
    majorDimension: "ROWS",
    values: [[entry.ratio]]
  })));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  await googleJson(url, accessToken, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data })
  });
  return updates.map((entry) => ({
    key: entry.key,
    rows: entry.matches.map((row) => row.__sheetRow)
  }));
}

function counterRow(attackIds, defenseIds, ratio, metadata, rowNumber) {
  const def = [...defenseIds, "", "", "", "", ""].slice(0, 5);
  const atk = [...attackIds, "", "", "", "", ""].slice(0, 5);
  return [
    metadata.def_family,
    metadata.def_variant,
    metadata.def_key,
    ...def,
    metadata.atk_family,
    metadata.atk_team,
    metadata.atk_key,
    ...atk,
    ratio,
    `=Q${rowNumber}+0.15`,
    `=Q${rowNumber}+0.3`,
    `=Q${rowNumber}+1.3`,
    `=Q${rowNumber}+1.8`,
    metadata.notes
  ];
}

async function appendNewCounter(env, accessToken, attackIds, defenseIds, ratio, metadata, currentValues) {
  const { spreadsheetId, sheetName } = sheetConfig(env);
  const nextRow = Math.max(2, currentValues.length + 1);
  const values = [counterRow(attackIds, defenseIds, ratio, metadata, nextRow)];
  const range = encodeURIComponent(`${sheetName}!A:V`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`;
  const data = await googleJson(url, accessToken, {
    method: "POST",
    body: JSON.stringify({ majorDimension: "ROWS", values })
  });
  const updatedRange = String(data?.updates?.updatedRange || "");
  const match = updatedRange.match(/!A(\d+):/i);
  const actualRow = match ? Number(match[1]) : nextRow;

  if (actualRow !== nextRow) {
    const patchRange = encodeURIComponent(`${sheetName}!R${actualRow}:U${actualRow}`);
    const patchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${patchRange}?valueInputOption=USER_ENTERED`;
    await googleJson(patchUrl, accessToken, {
      method: "PUT",
      body: JSON.stringify({
        majorDimension: "ROWS",
        values: [[
          `=Q${actualRow}+0.15`,
          `=Q${actualRow}+0.3`,
          `=Q${actualRow}+1.3`,
          `=Q${actualRow}+1.8`
        ]]
      })
    });
  }

  return actualRow;
}

async function appendNewCountersBatch(env, accessToken, creates, currentValues) {
  if (!creates.length) return [];
  const { spreadsheetId, sheetName } = sheetConfig(env);
  const expectedStart = Math.max(2, currentValues.length + 1);
  const values = creates.map((entry, index) =>
    counterRow(entry.attackIds, entry.defenseIds, entry.ratio, entry.metadata, expectedStart + index)
  );
  const range = encodeURIComponent(`${sheetName}!A:V`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`;
  const data = await googleJson(url, accessToken, {
    method: "POST",
    body: JSON.stringify({ majorDimension: "ROWS", values })
  });
  const updatedRange = String(data?.updates?.updatedRange || "");
  const match = updatedRange.match(/!A(\d+):V(\d+)/i);
  const actualStart = match ? Number(match[1]) : expectedStart;
  const actualRows = creates.map((_, index) => actualStart + index);

  if (actualStart !== expectedStart) {
    const actualEnd = actualStart + creates.length - 1;
    const patchRange = encodeURIComponent(`${sheetName}!R${actualStart}:U${actualEnd}`);
    const patchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${patchRange}?valueInputOption=USER_ENTERED`;
    const formulas = actualRows.map((row) => [
      `=Q${row}+0.15`,
      `=Q${row}+0.3`,
      `=Q${row}+1.3`,
      `=Q${row}+1.8`
    ]);
    await googleJson(patchUrl, accessToken, {
      method: "PUT",
      body: JSON.stringify({ majorDimension: "ROWS", values: formulas })
    });
  }

  return creates.map((entry, index) => ({ key: entry.key, row: actualRows[index] }));
}

async function dispatchJsonRefresh(env) {
  const token = envValue(env, "GITHUB_WORKFLOW_TOKEN");
  if (!token) return { dispatched: false, reason: "token_not_configured" };
  const owner = envValue(env, "GITHUB_REPO_OWNER", "Keryas777");
  const repo = envValue(env, "GITHUB_REPO_NAME", "msf");
  const workflow = envValue(env, "GITHUB_WORKFLOW_FILE", "update-war-counters.yml");
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "LoSP-War-Counter-Write"
      },
      body: JSON.stringify({ ref: "main" })
    }
  );
  if (!response.ok) return { dispatched: false, reason: `github_http_${response.status}` };
  return { dispatched: true, reason: null };
}

async function requestJson(request) {
  try {
    return await request.json();
  } catch (_) {
    const error = new Error("JSON de requête invalide.");
    error.status = 400;
    throw error;
  }
}

async function handleApply(request, env) {
  const admin = await requireAdmin(request, env);
  const body = await requestJson(request);

  const attackIds = normalizeIds(body?.attackIds, "Composition attaque");
  const defenseIds = normalizeIds(body?.defenseIds, "Composition défense");
  const ratio = ratioFromPowers(body?.attackPower, body?.defensePower);
  if (!ratio) {
    const error = new Error("Puissances invalides.");
    error.status = 400;
    throw error;
  }

  const accessToken = await serviceAccountAccessToken(env);
  const rawValues = await readSheetRows(env, accessToken);
  const rows = rowsAsObjects(rawValues);
  const matches = matchingRows(rows, attackIds, defenseIds);
  const comparison = analyzeExisting(matches, ratio);

  if (comparison.status === "conflict") {
    return jsonResponse({
      ok: false,
      status: "conflict",
      ratio,
      message: "Le Sheet contient plusieurs ratios hard différents pour ce matchup. Aucune écriture effectuée.",
      rows: matches.map((row) => row.__sheetRow)
    }, request, env, 409);
  }

  if (comparison.status === "same" || comparison.status === "worse") {
    return jsonResponse({
      ok: true,
      changed: false,
      status: comparison.status,
      ratio,
      existingRatio: comparison.existingRatio,
      message: comparison.status === "same"
        ? "Le ratio est déjà enregistré."
        : "Le contre existant est meilleur."
    }, request, env);
  }

  let result;
  if (comparison.status === "improves") {
    const sheetRows = await updateHardRatios(env, accessToken, matches, ratio);
    result = {
      ok: true,
      changed: true,
      status: "updated",
      ratio,
      previousRatio: comparison.existingRatio,
      rows: sheetRows,
      message: sheetRows.length > 1
        ? `${sheetRows.length} classifications du matchup ont été synchronisées.`
        : "Ratio hard du matchup mis à jour."
    };
  } else {
    const metadata = validatedMetadata(body?.metadata);
    const sheetRow = await appendNewCounter(env, accessToken, attackIds, defenseIds, ratio, metadata, rawValues);
    result = {
      ok: true,
      changed: true,
      status: "created",
      ratio,
      rows: [sheetRow],
      message: `Nouveau matchup ajouté à la ligne ${sheetRow}.`
    };
  }

  const workflow = await dispatchJsonRefresh(env);
  return jsonResponse({
    ...result,
    workflow,
    admin: {
      id: String(admin.id || ""),
      displayName: String(admin.displayName || admin.global_name || admin.username || "")
    }
  }, request, env);
}

async function handleApplyBatch(request, env) {
  const admin = await requireAdmin(request, env);
  const body = await requestJson(request);
  const normalized = normalizeBatchItems(body?.items);

  const accessToken = await serviceAccountAccessToken(env);
  const rawValues = await readSheetRows(env, accessToken);
  const rows = rowsAsObjects(rawValues);
  const plan = buildBatchPlan(rows, normalized.items);

  const updatedRows = await updateHardRatiosBatch(env, accessToken, plan.updates);
  const createdRows = await appendNewCountersBatch(env, accessToken, plan.creates, rawValues);
  const updatedByKey = new Map(updatedRows.map((entry) => [entry.key, entry.rows]));
  const createdByKey = new Map(createdRows.map((entry) => [entry.key, entry.row]));

  const results = [
    ...plan.creates.map((entry) => ({
      key: entry.key,
      status: "created",
      ratio: entry.ratio,
      rows: [createdByKey.get(entry.key)].filter(Boolean),
      sourceIndexes: entry.sourceIndexes
    })),
    ...plan.updates.map((entry) => ({
      key: entry.key,
      status: "updated",
      ratio: entry.ratio,
      previousRatio: entry.previousRatio,
      rows: updatedByKey.get(entry.key) || [],
      sourceIndexes: entry.sourceIndexes
    })),
    ...plan.skipped.map((entry) => ({
      key: entry.key,
      status: entry.status,
      ratio: entry.ratio,
      existingRatio: entry.existingRatio,
      rows: entry.rows,
      sourceIndexes: entry.sourceIndexes
    })),
    ...plan.conflicts.map((entry) => ({
      key: entry.key,
      status: "conflict",
      ratio: entry.ratio,
      rows: entry.rows,
      sourceIndexes: entry.sourceIndexes
    }))
  ].sort((a, b) => (a.sourceIndexes?.[0] ?? 0) - (b.sourceIndexes?.[0] ?? 0));

  const changed = plan.creates.length > 0 || plan.updates.length > 0;
  const workflow = changed
    ? await dispatchJsonRefresh(env)
    : { dispatched: false, reason: "no_changes" };

  return jsonResponse({
    ok: true,
    changed,
    summary: {
      received: normalized.inputCount,
      unique: normalized.items.length,
      duplicates: normalized.duplicateCount,
      created: plan.creates.length,
      updated: plan.updates.length,
      same: plan.skipped.filter((entry) => entry.status === "same").length,
      worse: plan.skipped.filter((entry) => entry.status === "worse").length,
      conflicts: plan.conflicts.length
    },
    results,
    workflow,
    admin: {
      id: String(admin.id || ""),
      displayName: String(admin.displayName || admin.global_name || admin.username || "")
    }
  }, request, env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "msf-war-counter-write",
        googleConfigured: Boolean(envValue(env, "GOOGLE_SERVICE_ACCOUNT_EMAIL") && envValue(env, "GOOGLE_PRIVATE_KEY")),
        workflowDispatchConfigured: Boolean(envValue(env, "GITHUB_WORKFLOW_TOKEN"))
      }, request, env);
    }

    if (url.pathname === "/api/war-counter-write/apply") {
      if (request.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, request, env, 405);
      try {
        return await handleApply(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: error?.message || String(error)
        }, request, env, Number(error?.status) || 500);
      }
    }

    if (url.pathname === "/api/war-counter-write/apply-batch") {
      if (request.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, request, env, 405);
      try {
        return await handleApplyBatch(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: error?.message || String(error)
        }, request, env, Number(error?.status) || 500);
      }
    }

    return jsonResponse({ ok: false, error: "not_found" }, request, env, 404);
  }
};

export {
  analyzeExisting,
  buildBatchPlan,
  canonicalTeamKey,
  ceilRatioToHundredth,
  matchingRows,
  matchupKey,
  normalizeBatchItems,
  ratioFromPowers,
  rowsAsObjects
};
