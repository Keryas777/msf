const DATA_URL = new URL("./data/alliance-directory.json", import.meta.url);

export function normalizeAllianceName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, "");
}

export function validateDirectory(payload) {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.alliances)) {
    throw new TypeError("Format de l’annuaire invalide.");
  }
  const ids = new Set();
  for (const alliance of payload.alliances) {
    if (!alliance || typeof alliance.allianceId !== "string" || !alliance.allianceId.trim()) {
      throw new TypeError("Identifiant d’alliance manquant.");
    }
    if (ids.has(alliance.allianceId)) throw new TypeError("Identifiant d’alliance en double.");
    ids.add(alliance.allianceId);
    if (typeof alliance.name !== "string" || !alliance.name.trim()) {
      throw new TypeError("Nom d’alliance manquant.");
    }
    const expected = normalizeAllianceName(alliance.name);
    if (alliance.searchName !== expected) throw new TypeError(`searchName incohérent pour ${alliance.name}.`);
    if (alliance.officialAllianceId !== null && typeof alliance.officialAllianceId !== "string") {
      throw new TypeError(`Identifiant officiel invalide pour ${alliance.name}.`);
    }
  }
  return payload;
}

export function createAllianceIdentity({ name, allianceId = randomId(), richName = null, aliases = [] }) {
  const simpleName = String(name ?? "").trim();
  if (!simpleName) throw new TypeError("Le nom simplifié est obligatoire.");
  if (!allianceId || typeof allianceId !== "string") throw new TypeError("L’identifiant permanent est obligatoire.");
  return {
    allianceId,
    name: simpleName,
    searchName: normalizeAllianceName(simpleName),
    richName,
    officialAllianceId: null,
    identityStatus: "provisional",
    presentationStatus: richName ? "provisional" : "unavailable",
    aliases: [...new Set(aliases.map(String).map(value => value.trim()).filter(Boolean))],
    previousNames: [],
    firstObservedAt: null,
    lastObservedAt: null,
    observations: [],
    provenance: { source: "manual-entry", confidence: "unverified", verified: false, uncertainties: [] },
    proposedMatches: []
  };
}

function randomId() {
  const value = globalThis.crypto?.randomUUID?.();
  if (value) return `wi-${value}`;
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `wi-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createDirectoryIndex(payload) {
  validateDirectory(payload);
  const byId = new Map(payload.alliances.map(alliance => [alliance.allianceId, alliance]));
  const byName = new Map();
  for (const alliance of payload.alliances) {
    for (const value of [alliance.name, ...(alliance.aliases || []).map(item => typeof item === "string" ? item : item?.name), ...(alliance.previousNames || []).map(item => typeof item === "string" ? item : item?.name)]) {
      const key = normalizeAllianceName(value);
      if (!key) continue;
      const matches = byName.get(key) || [];
      if (!matches.some(item => item.allianceId === alliance.allianceId)) matches.push(alliance);
      byName.set(key, matches);
    }
  }
  return { payload, byId, byName };
}

export function findById(index, allianceId) {
  return index?.byId.get(allianceId) || null;
}

export function findByName(index, name) {
  const matches = index?.byName.get(normalizeAllianceName(name)) || [];
  return matches.length === 1 ? matches[0] : null;
}

export function findByAlias(index, alias) {
  return findByName(index, alias);
}

export function searchAll(index, query, { limit = 100 } = {}) {
  const needle = normalizeAllianceName(query);
  const rows = index?.payload.alliances || [];
  if (!needle) return rows.slice(0, limit);
  const exact = index.byName.get(needle);
  if (exact?.length) return exact.slice(0, limit);
  return rows.filter(alliance => {
    const values = [alliance.searchName, ...(alliance.aliases || []).map(value => typeof value === "string" ? value : value?.name), ...(alliance.previousNames || []).map(value => typeof value === "string" ? value : value?.name)];
    return values.some(value => normalizeAllianceName(value).includes(needle));
  }).slice(0, limit);
}

// Suggestions are informational only; callers must not merge identities automatically.
export function suggestMatches(index, query, { limit = 5 } = {}) {
  const needle = normalizeAllianceName(query);
  if (needle.length < 3) return [];
  const matches = (index?.payload.alliances || []).map(alliance => {
    const candidate = alliance.searchName || normalizeAllianceName(alliance.name);
    const includes = candidate.includes(needle) || needle.includes(candidate);
    const distance = editDistance(needle, candidate);
    const score = includes ? Math.min(0.92, Math.min(needle.length, candidate.length) / Math.max(needle.length, candidate.length) + 0.2)
      : 1 - distance / Math.max(needle.length, candidate.length);
    return { alliance, score };
  }).filter(item => item.score >= 0.55).sort((a, b) => b.score - a.score || a.alliance.name.localeCompare(b.alliance.name, "fr"));
  return matches.slice(0, limit).map(item => ({ ...item, status: "proposed-only" }));
}

export function getRichName(alliance) {
  return alliance?.richName?.schemaVersion === 1 && Array.isArray(alliance.richName.segments)
    ? alliance.richName : null;
}

export function renderRichName(target, richName, fallbackName) {
  target.replaceChildren();
  if (!richName?.segments?.length) {
    target.textContent = fallbackName || "Nom non disponible";
    return;
  }
  for (const segment of richName.segments) {
    const span = document.createElement("span");
    span.textContent = String(segment.text || "");
    if (/^#[0-9a-f]{6}$/i.test(segment.color || "")) span.style.color = segment.color;
    target.append(span);
  }
}

export async function loadAllianceDirectory(fetchImpl = fetch) {
  const response = await fetchImpl(DATA_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Impossible de charger l’annuaire (${response.status}).`);
  return createDirectoryIndex(await response.json());
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}
