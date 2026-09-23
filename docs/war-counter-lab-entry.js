import { loadLiveWarCounters } from "./war-counter-live-source.js";
import { ensureWarCounterWriteBearer } from "./war-counter-write-auth.js?v=2";

const sourceStatus = document.querySelector("#counterSourceStatus");
const captureInput = document.querySelector("#captureInput");
const analyzeButton = document.querySelector("#analyzeButton");
const selectionSummary = document.querySelector("#selectionSummary");

function describeWriteAuthFailure(result) {
  const reason = String(result?.reason || "unknown");
  const labels = {
    missing_bearer: "session transmise absente",
    not_connected: "session non reçue par le Worker d’auth",
    invalid_session: "session refusée par le Worker d’auth",
    discord_check_failed: "vérification Discord momentanément impossible",
    no_authorized_alliance: "aucun rôle d’alliance autorisé",
    not_guild_member: "compte absent du serveur LoSP",
    not_admin: "compte LoSP non administrateur",
    auth_fetch_failed: "liaison entre Workers indisponible",
    network_error: "appel au Worker d’écriture impossible"
  };
  const label = labels[reason] || reason;
  const status = Number.isFinite(Number(result?.authStatus)) && Number(result.authStatus) > 0
    ? ` · auth HTTP ${result.authStatus}`
    : "";
  return `${label} (${reason}${status})`;
}

const writeAuth = await ensureWarCounterWriteBearer({
  fetchImpl: globalThis.fetch.bind(globalThis)
});

if (!writeAuth.ok) {
  if (captureInput) captureInput.disabled = true;
  if (analyzeButton) analyzeButton.disabled = true;
  if (selectionSummary) {
    selectionSummary.textContent = "N’analyse aucune capture : l’autorisation d’écriture doit être valide avant de commencer.";
  }
  if (sourceStatus) {
    sourceStatus.textContent = writeAuth.stage === "write-worker"
      ? `Écriture Sheet bloquée avant analyse : ${describeWriteAuthFailure(writeAuth)}.`
      : "Synchronisation de la session LoSP en cours…";
    sourceStatus.classList.add("is-fallback");
  }
  await new Promise(() => {});
}

const nativeFetch = globalThis.fetch.bind(globalThis);
const localCountersUrl = new URL("data/war-counters.json", window.location.href);
let counterSourcePromise = null;

function requestUrl(input) {
  try {
    if (input instanceof Request) return new URL(input.url, window.location.href);
    return new URL(String(input), window.location.href);
  } catch (_) {
    return null;
  }
}

function isWarCountersJsonRequest(input) {
  const url = requestUrl(input);
  return Boolean(url && url.origin === localCountersUrl.origin && url.pathname === localCountersUrl.pathname);
}

function renderSourceStatus(result) {
  if (!sourceStatus) return;

  if (result.source === "sheet-live") {
    sourceStatus.textContent = `Comparaison War Counters : Google Sheet en direct · ${result.rows.length} lignes.`;
    sourceStatus.classList.remove("is-fallback");
    sourceStatus.classList.add("is-live");
    return;
  }

  sourceStatus.textContent = `Comparaison War Counters : secours war-counters.json · ${result.rows.length} lignes.`;
  sourceStatus.classList.remove("is-live");
  sourceStatus.classList.add("is-fallback");

  if (result.liveError) {
    console.warn("[war-counter-vision] Google Sheet direct indisponible, fallback JSON utilisé:", result.liveError);
  }
}

function loadCounterSource() {
  if (!counterSourcePromise) {
    counterSourcePromise = loadLiveWarCounters({
      fetchImpl: nativeFetch,
      fallbackUrl: localCountersUrl.toString()
    }).then((result) => {
      renderSourceStatus(result);
      return result;
    });
  }
  return counterSourcePromise;
}

globalThis.fetch = async (input, init) => {
  if (!isWarCountersJsonRequest(input)) return nativeFetch(input, init);

  const result = await loadCounterSource();
  return new Response(JSON.stringify(result.rows), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-War-Counters-Source": result.source
    }
  });
};

try {
  await import("./war-counter-lab.js?v=r7-vertical-1");
  const { initWarCounterWriteUi } = await import("./war-counter-write-ui.js?v=r2");
  initWarCounterWriteUi();
} catch (error) {
  if (sourceStatus) {
    sourceStatus.textContent = "War Counter Vision : chargement du module impossible.";
    sourceStatus.classList.add("is-fallback");
  }
  throw error;
}
