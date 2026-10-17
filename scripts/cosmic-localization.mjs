// Revue linguistique obligatoire des nouvelles saisons, sans accès réseau.
// /fr/ ne garantit pas que l'article soit rédigé en français.
export const RULE_IDS = Object.freeze(["global", "room-1", "room-2", "room-3", "room-4", "room-5", "room-6"]);
const text = value => String(value || "").trim();
const officialUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["marvelstrikeforce.com", "www.marvelstrikeforce.com"].includes(url.hostname) &&
      url.pathname.includes("/updates/");
  } catch { return false; }
};

export function validateCosmicLocalization(config) {
  const review = config?.localizationReview;
  if (review?.policy !== "fr-first" || review.status !== "reviewed") {
    throw new Error("Revue française des règles non validée (localizationReview)");
  }
  if (!review.rules || typeof review.rules !== "object" ||
      Object.keys(review.rules).length !== RULE_IDS.length ||
      RULE_IDS.some(key => !Object.hasOwn(review.rules, key))) {
    throw new Error("Revue française requise pour la règle globale et les six salles");
  }
  for (const key of RULE_IDS) {
    const entry = review.rules[key];
    if (entry?.frenchOfficialChecked !== true || entry?.frenchTerminologyChecked !== true ||
        !Array.isArray(entry.sources) || !entry.sources.length ||
        !text(entry.selectedSourceUrl)) {
      throw new Error(key + " : sources et terminologie françaises non revues");
    }
    for (const source of entry.sources) {
      if (!["fr", "en"].includes(source?.contentLanguage) ||
          source.authority !== "official" ||
          source.contentVerified !== true ||
          !officialUrl(source.url)) {
        throw new Error(key + " : source officielle ou langue du contenu non vérifiée");
      }
    }
    const selected = entry.sources.find(s => s.url === entry.selectedSourceUrl);
    if (!selected) throw new Error(key + " : la source retenue est absente de la revue");
    if (entry.sources.some(s => s.contentLanguage === "fr") && selected.contentLanguage !== "fr") {
      throw new Error(key + " : la source française officielle doit être prioritaire");
    }
    if (!entry.sources.some(s => s.contentLanguage === "fr") &&
        !text(entry.fallbackExplanation)) {
      throw new Error(key + " : justifier le recours à la source anglaise");
    }
  }
  return true;
}
