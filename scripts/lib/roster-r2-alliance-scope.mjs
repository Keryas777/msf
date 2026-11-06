// Only LoSP members have an approved persistent GitHub roster publisher.
// Guest data must not enter the public Pages JSON through this path.
export function selectLoSPRosterAlliances(alliances) {
  if (!Array.isArray(alliances)) throw Error("Invalid alliance registry");
  const keys = new Set();
  const selected = [];
  for (const alliance of alliances) {
    if (!alliance || alliance.active === false ||
        alliance.group !== "losp") continue;
    const key = alliance.key;
    if (typeof key !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(key) ||
        keys.has(key)) throw Error("Invalid or duplicate LoSP alliance key");
    keys.add(key);
    selected.push(alliance);
  }
  if (!selected.length) throw Error("No approved LoSP alliances in registry");
  return selected;
}
