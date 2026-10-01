let sourcePromise = null;
let sourceConfig = null;

function canonicalTeamKey(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

export function configureWarCounterTeamSource({ fetchImpl, url }) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl requis");
  const href = String(url || "").trim();
  if (!href) throw new TypeError("url requise");
  sourceConfig = { fetchImpl, url: href };
  sourcePromise = null;
}

export async function loadSharedWarCounterTeams() {
  if (!sourceConfig) throw new Error("Source teams.json non configurée.");
  if (!sourcePromise) {
    sourcePromise = sourceConfig.fetchImpl(sourceConfig.url, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`teams.json -> HTTP ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("teams.json invalide.");
        return rows;
      });
  }
  return sourcePromise;
}

export async function createSharedWarCounterTeamsResponse() {
  const teams = await loadSharedWarCounterTeams();
  const response = new Response("[]", {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
  Object.defineProperty(response, "json", {
    configurable: true,
    value: async () => teams
  });
  return response;
}

export async function registerManualWarCounterTeam({ name, characters, mode = "Guerre" }) {
  const teamName = String(name || "").trim();
  const ids = [...new Set((Array.isArray(characters) ? characters : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];

  if (!teamName) throw new Error("Nom d’équipe requis.");
  if (ids.length < 3 || ids.length > 5) throw new Error("Composition d’équipe invalide.");

  const teams = await loadSharedWarCounterTeams();
  const key = canonicalTeamKey(ids);

  for (let index = teams.length - 1; index >= 0; index -= 1) {
    if (canonicalTeamKey(teams[index]?.characters) === key) teams.splice(index, 1);
  }

  const row = {
    team: teamName,
    mode: String(mode || "Guerre").trim() || "Guerre",
    characters: ids,
    __warCounterManual: true
  };
  teams.push(row);
  return row;
}

export function __resetWarCounterTeamSourceForTests() {
  sourcePromise = null;
  sourceConfig = null;
}
