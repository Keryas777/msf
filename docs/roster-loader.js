// Shared, static-only roster reader. Downloads only authorized alliance shards.
// No persistent browser cache; no cross-tenant roster mixing.
(() => {
  "use strict";
  const ROOT = "./data/rosters_";
  const PRIVATE = "https://losp-roster-service.deliriousfan7.workers.dev/api/secure/guest-rosters";
  const SIGNED = /^v1\.[A-Za-z0-9_-]{12,4096}\.[A-Za-z0-9_-]{40,80}$/;
  const SLUG = /^[a-z][a-z0-9-]{1,63}$/;
  const cache = new Map();

  function metaFor(value) {
    const helper = window.LoSPAlliances;
    const meta = helper?.getAllianceMeta?.(value);
    const key = meta?.key || "";
    const slug = meta?.sourceKey || "";
    if (!key || !SLUG.test(slug) ||
        window.LoSP_SESSION?.ok !== true ||
        window.LoSPAccess?.isAllianceAllowed?.(key) !== true)
      throw new Error("Alliance non autorisée ou inconnue.");
    return {key,slug,group:meta.group};
  }
  function validate(rows, meta) {
    if (!Array.isArray(rows)) throw new Error("Roster JSON invalide.");
    return rows.map(row => {
      if (!row || typeof row.player !== "string" || !row.player.trim() ||
          !row.chars || typeof row.chars !== "object" ||
          Array.isArray(row.chars))
        throw new Error("Roster incohérent pour " + meta.slug);
      // Old LoSP individual exports sometimes omitted this field. Their
      // per-alliance file path proves the provenance; guests must be tagged.
      const alliance = row.alliance ||
        (meta.group === "losp" ? meta.slug : "");
      if (window.LoSPAlliances?.getAllianceKey?.(alliance) !== meta.key)
        throw new Error("Roster incohérent pour " + meta.slug);
      return row.alliance ? row : {...row,alliance};
    });
  }
  async function guestFallback(meta) {
    let token = "";
    try { token = localStorage.getItem("losp_session") || ""; } catch {}
    if (!SIGNED.test(token))
      throw new Error("Session Discord signée nécessaire pour le roster invité.");
    const reply = await fetch(PRIVATE+"?alliance="+encodeURIComponent(meta.slug),{
      mode:"cors",cache:"no-store",headers:{Authorization:"Bearer "+token}
    });
    if (!reply.ok) {
      const reason = reply.status === 409
        ? "alliance non liée ou non approuvée dans le Roster Service (HTTP 409)"
        : "HTTP " + reply.status;
      throw new Error("Roster invité : " + reason);
    }
    const json = await reply.json();
    if (json?.status !== "ok" || json.kind !== "authorized-guest-rosters" ||
        json.alliance !== meta.slug || json.state !== "complete" ||
        !Array.isArray(json.rosters))
      throw new Error("Aucune collecte invitée complète disponible.");
    return validate(json.rosters,meta);
  }
  async function read(meta) {
    const url = ROOT+meta.slug+".json";
    const response = await fetch(url,{cache:"no-store"});
    if (!response.ok) {
      // The first approved guest publication may not exist yet.
      if (response.status === 404 && meta.group !== "losp")
        return guestFallback(meta);
      throw new Error(url+" : HTTP "+response.status);
    }
    return validate(await response.json(),meta);
  }
  async function load(value) {
    if (window.LoSP_AUTH_READY) await window.LoSP_AUTH_READY;
    await window.LoSPAlliances?.loadAlliances?.();
    const meta = metaFor(value);
    // Cache scoped by true canonical file key, not a normalized display name.
    let pending = cache.get(meta.slug);
    if (!pending) {
      pending = read(meta).catch(error => {
        cache.delete(meta.slug); // failed reads can be retried
        throw error;
      });
      cache.set(meta.slug,pending);
    }
    const rows = await pending;
    // Recheck after network I/O: a Discord role may have changed.
    metaFor(value);
    return rows;
  }
  async function loadMany(keys) {
    const unique = [...new Set((Array.isArray(keys)?keys:[])
      .filter(value=>typeof value==="string"&&value.trim()))];
    const results = await Promise.allSettled(unique.map(load));
    const warnings=[],rosters=[],byAlliance=new Map();
    results.forEach((result,i)=>{
      if(result.status==="fulfilled") {
        rosters.push(...result.value);
        byAlliance.set(unique[i],result.value);
      } else {
        warnings.push(unique[i]+" : "+String(result.reason?.message||"roster indisponible"));
      }
    });
    return {rosters,byAlliance,warnings};
  }
  function clear() { cache.clear(); }
  window.LoSPRosterLoader=Object.freeze({load,loadMany,clear});
})();
