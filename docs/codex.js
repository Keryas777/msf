import {
  FILTER_DEFAULTS,
  buildCodexHref,
  filterMechanicResults,
  formatFrenchDate,
  getModeLabel,
  getSearchMatchMessage,
  groupSearchResults,
  highlightSegments,
  mechanicInitials,
  normalizeSearch,
  parseRoute,
  prepareSearchRecords,
  rankSearchRecords,
  recordHref,
  routeBucket,
  sortMechanicResults,
  uniqueEvidence,
} from "./codex-core.js";

const DATA_ROOT = "./data/msf-capabilities-explorer/";
const PUBLISHER_MANIFEST = "./data/msf-capabilities/manifest.json";
const PAGE_SIZE = 24;
const SEARCH_PAGE_SIZE = 48;
const MOBILE_SEARCH_LIMIT = 8;
const DESKTOP_SEARCH_LIMIT = 12;
const SEARCH_DELAY_MS = 120;

const dom = {
  main: document.querySelector("#codexMain"),
  back: document.querySelector("#codexBack"),
  breadcrumbs: document.querySelector("#codexBreadcrumbs"),
  searchForm: document.querySelector("#codexSearchForm"),
  searchInput: document.querySelector("#codexSearchInput"),
  searchClear: document.querySelector("#codexSearchClear"),
  searchPanel: document.querySelector("#codexSearchPanel"),
  searchResults: document.querySelector("#codexSearchResults"),
  searchStatus: document.querySelector("#codexSearchStatus"),
  staleNotice: document.querySelector("#codexStaleNotice"),
  filterSheet: document.querySelector("#codexFilterSheet"),
  filterSheetContent: document.querySelector("#codexFilterSheetContent"),
  filterApply: document.querySelector("#codexFilterApply"),
  toast: document.querySelector("#codexToast"),
};

const state = {
  manifest: null,
  bootstrap: null,
  generationBase: null,
  route: parseRoute(window.location.search),
  renderToken: 0,
  characterCatalog: null,
  mechanicCatalog: null,
  searchIndex: null,
  preparedSearch: null,
  searchLoadPromise: null,
  characterCache: new Map(),
  mechanicCache: new Map(),
  routeCache: new Map(),
  resultCache: new Map(),
  charactersVisible: PAGE_SIZE,
  relatedVisible: PAGE_SIZE,
  mechanicsVisible: PAGE_SIZE,
  technicalMechanicsVisible: PAGE_SIZE,
  searchVisible: SEARCH_PAGE_SIZE,
  lastSearchQuery: "",
  showTechnicalEntities: false,
  showTechnicalMechanics: false,
  searchTimer: 0,
  searchSequence: 0,
  searchActiveIndex: -1,
  searchFlatResults: [],
  activeMechanicContext: null,
  filterDraft: null,
  filterReturnFocus: null,
  imageFailureShown: false,
  toastTimer: 0,
};

class ArtifactError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ArtifactError";
    this.status = status;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeId(value) {
  const id = String(value || "");
  return /^[A-Za-z0-9_.-]+$/.test(id) ? id : "";
}

function safeImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.href);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch (_) {
    return "";
  }
}

function selected(value, expected) {
  return value === expected ? " selected" : "";
}

function checked(value) {
  return value ? " checked" : "";
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralForm;
}

function currentDepth() {
  return Number(history.state?.codexDepth || 0);
}

function titleForPage(title) {
  document.title = title ? `${title} | Codex MSF` : "Codex MSF — Explorateur de capacités";
}

function proofInfo(evidence) {
  return state.bootstrap?.proof?.[evidence] || {
    label: evidence === "normalized"
      ? "Mécanique vérifiée"
      : evidence === "preserved_uninterpreted"
        ? "Action détectée"
        : "Mention dans le texte",
    explanation: "",
  };
}

function proofBadge(evidence) {
  const info = proofInfo(evidence);
  const safeEvidence = ["normalized", "preserved_uninterpreted", "official_text_only"].includes(evidence)
    ? evidence
    : "official_text_only";
  return `<span class="codexProofBadge codexProofBadge--${safeEvidence}">${escapeHtml(info.label)}</span>`;
}

function proofGuideMarkup(evidences) {
  return uniqueEvidence(evidences).map((evidence) => {
    const info = proofInfo(evidence);
    return `
      <div class="codexProofGuideItem">
        ${proofBadge(evidence)}
        <p>${escapeHtml(info.explanation)}</p>
      </div>
    `;
  }).join("");
}

function imageMarkup({
  url,
  alt,
  fallback,
  kind = "portrait",
  loading = "lazy",
  className = "",
}) {
  const imageUrl = safeImageUrl(url);
  const frameClass = kind === "ability"
    ? "codexAbilityImage"
    : kind === "result"
      ? "codexResultIcon"
      : "codexPortrait";
  const fallbackClass = kind === "ability" || kind === "result"
    ? "codexAbilityFallback"
    : "codexPortraitFallback";
  const safeFallback = escapeHtml(fallback || "?");
  if (!imageUrl) {
    return `
      <span class="${frameClass} ${className}" data-image-frame>
        <span class="${fallbackClass}" aria-hidden="true">${safeFallback}</span>
      </span>
    `;
  }
  return `
    <span class="${frameClass} ${className}" data-image-frame>
      <img
        src="${escapeHtml(imageUrl)}"
        alt="${escapeHtml(alt || "")}"
        width="96"
        height="96"
        loading="${loading}"
        decoding="async"
        data-codex-image
      />
      <span class="${fallbackClass}" aria-hidden="true" hidden>${safeFallback}</span>
    </span>
  `;
}

function abilityFallback(typeLabel) {
  const label = String(typeLabel || "?");
  return label.slice(0, 1).toLocaleUpperCase("fr-FR");
}

function generationUrl(path) {
  if (!state.generationBase) throw new ArtifactError("Génération indisponible");
  return new URL(path, state.generationBase).href;
}

async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      cache: options.cache || "force-cache",
      credentials: "same-origin",
    });
  } catch (error) {
    throw new ArtifactError(error?.message || "Erreur réseau");
  }
  if (!response.ok) {
    throw new ArtifactError(`HTTP ${response.status}`, response.status);
  }
  try {
    return await response.json();
  } catch (_) {
    throw new ArtifactError("Artefact JSON invalide", response.status);
  }
}

async function ensureCharacterCatalog() {
  if (state.characterCatalog) return state.characterCatalog;
  const data = await fetchJson(generationUrl(state.bootstrap.entrypoints.characters));
  if (data?.artifactType !== "codex_character_catalog" || !Array.isArray(data.records)) {
    throw new ArtifactError("Catalogue de personnages invalide");
  }
  state.characterCatalog = data;
  return data;
}

async function ensureMechanicCatalog() {
  if (state.mechanicCatalog) return state.mechanicCatalog;
  const data = await fetchJson(generationUrl(state.bootstrap.entrypoints.mechanics));
  if (data?.artifactType !== "codex_mechanics_catalog") {
    throw new ArtifactError("Catalogue de mécaniques invalide");
  }
  state.mechanicCatalog = data;
  return data;
}

async function ensureSearchIndex() {
  if (state.searchIndex) return state.searchIndex;
  if (!state.searchLoadPromise) {
    state.searchLoadPromise = fetchJson(generationUrl(state.bootstrap.entrypoints.search))
      .then((data) => {
        if (data?.artifactType !== "codex_search_index" || !Array.isArray(data.records)) {
          throw new ArtifactError("Index de recherche invalide");
        }
        state.searchIndex = data;
        state.preparedSearch = prepareSearchRecords(data.records);
        return data;
      })
      .catch((error) => {
        state.searchLoadPromise = null;
        throw error;
      });
  }
  return state.searchLoadPromise;
}

async function ensureCharacter(id) {
  const validId = safeId(id);
  if (!validId) throw new ArtifactError("Identifiant de personnage invalide", 404);
  if (!state.characterCache.has(validId)) {
    const pattern = state.bootstrap.entrypoints.characterShardPattern;
    const path = pattern.replace("{id}", validId);
    state.characterCache.set(validId, fetchJson(generationUrl(path)).catch((error) => {
      state.characterCache.delete(validId);
      throw error;
    }));
  }
  return state.characterCache.get(validId);
}

async function ensureMechanic(id) {
  const validId = safeId(id);
  if (!validId) throw new ArtifactError("Identifiant de mécanique invalide", 404);
  if (!state.mechanicCache.has(validId)) {
    const pattern = state.bootstrap.entrypoints.mechanicShardPattern;
    const path = pattern.replace("{id}", validId);
    state.mechanicCache.set(validId, fetchJson(generationUrl(path)).catch((error) => {
      state.mechanicCache.delete(validId);
      throw error;
    }));
  }
  return state.mechanicCache.get(validId);
}

async function ensureRouteRecord(kind, id) {
  const bucket = routeBucket(id);
  if (!bucket) throw new ArtifactError("Identifiant de route invalide", 404);
  const patternKey = kind === "ability"
    ? "abilityRoutePattern"
    : kind === "operation"
      ? "operationRoutePattern"
      : "actionRoutePattern";
  const path = state.bootstrap.entrypoints[patternKey].replace("{bucket}", bucket);
  const key = `${kind}:${bucket}`;
  if (!state.routeCache.has(key)) {
    state.routeCache.set(key, fetchJson(generationUrl(path)).catch((error) => {
      state.routeCache.delete(key);
      throw error;
    }));
  }
  const shard = await state.routeCache.get(key);
  const record = shard?.records?.[id];
  if (!record) throw new ArtifactError("Route absente", 404);
  return record;
}

async function ensureAbilityContext(abilityId) {
  const route = await ensureRouteRecord("ability", abilityId);
  const shard = await ensureCharacter(route.characterId);
  const ability = shard.abilities?.find((candidate) => candidate.id === abilityId);
  if (!ability) throw new ArtifactError("Capacité absente du personnage", 404);
  return { shard, ability };
}

function findOperationInCharacter(shard, id, route) {
  for (const ability of shard.abilities || []) {
    for (const collectionName of ["operations", "actions"]) {
      const occurrence = (ability[collectionName] || []).find((item) => item.id === id);
      if (occurrence) return { ability, occurrence };
    }
  }
  for (const context of shard.technicalContexts || []) {
    for (const collectionName of ["operations", "actions"]) {
      const occurrence = (context[collectionName] || []).find((item) => item.id === id);
      if (occurrence) return { ability: null, context, occurrence };
    }
  }
  if (route?.abilityId) {
    const ability = shard.abilities?.find((candidate) => candidate.id === route.abilityId);
    const spawn = ability?.spawns?.find((item) => item.operationId === id);
    if (spawn) return { ability, occurrence: spawn };
  }
  return null;
}

async function ensureOperationContext(id) {
  const kind = String(id).startsWith("op_")
    ? "operation"
    : String(id).startsWith("act_")
      ? "action"
      : "";
  if (!kind) throw new ArtifactError("Identifiant d’opération invalide", 404);
  const route = await ensureRouteRecord(kind, id);
  const shard = await ensureCharacter(route.characterId);
  const found = findOperationInCharacter(shard, id, route);
  if (!found) throw new ArtifactError("Opération absente de la fiche", 404);
  return { route, shard, ...found };
}

async function ensureFacetResults(mechanic, facet) {
  const key = `${mechanic.id}:${facet.id}`;
  let entry = state.resultCache.get(key);
  if (!entry) {
    entry = {
      records: [],
      complete: false,
      error: null,
      remainingPromise: null,
    };
    state.resultCache.set(key, entry);
    const pages = Array.isArray(facet.pages) ? facet.pages : [];
    if (!pages.length) {
      entry.complete = true;
      return entry;
    }
    const first = await fetchJson(generationUrl(pages[0].path));
    entry.records = Array.isArray(first.records) ? first.records : [];
    if (pages.length === 1) {
      entry.complete = true;
      return entry;
    }
    entry.remainingPromise = Promise.all(
      pages.slice(1).map((page) => fetchJson(generationUrl(page.path)))
    ).then((shards) => {
      shards.forEach((shard) => {
        if (Array.isArray(shard.records)) entry.records.push(...shard.records);
      });
      entry.complete = true;
      if (
        state.route.id === mechanic.id &&
        (state.route.operation || facet.id) === facet.id
      ) {
        renderRoute(state.route, { background: true, preserveScroll: true });
      }
    }).catch((error) => {
      entry.error = error;
      entry.complete = true;
      if (state.route.id === mechanic.id) {
        renderRoute(state.route, { background: true, preserveScroll: true });
      }
    });
  }
  return entry;
}

function renderLoading(message = "Chargement du Codex…") {
  dom.main.innerHTML = `
    <section class="codexLoadingState" aria-live="polite">
      <span class="codexSpinner" aria-hidden="true"></span>
      <p>${escapeHtml(message)}</p>
    </section>
  `;
}

function renderError(message, title = "Fiche indisponible", action = true) {
  return `
    <section class="codexErrorState">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${action ? `<a class="codexPrimaryButton" href="./codex.html" data-codex-link>Revenir au Codex</a>` : ""}
    </section>
  `;
}

function setBreadcrumbs(items = []) {
  if (!items.length) {
    dom.breadcrumbs.hidden = true;
    dom.breadcrumbs.replaceChildren();
    return;
  }
  const fullItems = [{ label: "Codex", route: { view: "home" } }, ...items];
  dom.breadcrumbs.innerHTML = fullItems.map((item, index) => {
    const isLast = index === fullItems.length - 1;
    const separator = index
      ? `<span class="codexBreadcrumbSeparator" aria-hidden="true">›</span>`
      : "";
    if (isLast || !item.route) {
      return `${separator}<span aria-current="page">${escapeHtml(item.label)}</span>`;
    }
    return `${separator}<a href="${escapeHtml(buildCodexHref(item.route))}" data-codex-link>${escapeHtml(item.label)}</a>`;
  }).join("");
  dom.breadcrumbs.hidden = false;
  dom.breadcrumbs.scrollLeft = dom.breadcrumbs.scrollWidth;
}

function commitView(model, token, options = {}) {
  if (token !== state.renderToken) return;
  dom.main.innerHTML = model.html;
  titleForPage(model.title || "");
  setBreadcrumbs(model.breadcrumbs || []);
  state.activeMechanicContext = model.mechanicContext || null;
  if (typeof model.afterRender === "function") model.afterRender();

  const restore = Number.isFinite(options.restoreScroll) ? options.restoreScroll : null;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (restore !== null) {
        scrollImmediately(restore);
      } else if (options.scrollTop) {
        scrollImmediately(0);
      }
      if (options.focusMain) dom.main.focus({ preventScroll: true });
    });
  });
}

function scrollImmediately(top) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, Math.max(0, Number(top) || 0));
  requestAnimationFrame(() => {
    root.style.scrollBehavior = previous;
  });
}

function saveScrollState() {
  const current = history.state || {};
  if (!current.codex) return;
  history.replaceState({ ...current, scrollY: window.scrollY }, "", window.location.href);
}

async function navigate(route, mode = "push", options = {}) {
  saveScrollState();
  const href = buildCodexHref(route);
  const parsed = parseRoute(new URL(href, window.location.href).search);
  const current = history.state || { codex: true, codexDepth: 0, scrollY: 0 };
  if (mode === "push") {
    history.pushState(
      { codex: true, codexDepth: currentDepth() + 1, scrollY: 0 },
      "",
      href
    );
  } else {
    history.replaceState(
      { ...current, codex: true, scrollY: options.preserveScroll ? window.scrollY : 0 },
      "",
      href
    );
  }
  state.route = parsed;
  await renderRoute(parsed, {
    scrollTop: mode === "push" && !options.preserveScroll,
    preserveScroll: options.preserveScroll,
    restoreScroll: options.preserveScroll ? window.scrollY : undefined,
    focusMain: options.focusMain !== false && mode === "push",
  });
}

function searchResultLimit() {
  return window.matchMedia("(min-width: 900px)").matches
    ? DESKTOP_SEARCH_LIMIT
    : MOBILE_SEARCH_LIMIT;
}

function highlightMarkup(label, query) {
  return highlightSegments(label, query)
    .map((part) => part.match
      ? `<mark>${escapeHtml(part.text)}</mark>`
      : escapeHtml(part.text))
    .join("");
}

function searchVisual(record) {
  const kind = record.kind === "ability" ? "ability" : "portrait";
  const source = record.iconUrl || record.portraitUrl;
  const fallback = record.kind === "mechanic"
    ? mechanicInitials(record.label)
    : record.kind === "ability"
      ? abilityFallback(record.context)
      : String(record.label || "?").slice(0, 2).toLocaleUpperCase("fr-FR");
  return imageMarkup({
    url: source,
    alt: "",
    fallback,
    kind,
    className: "codexSearchResultVisual",
  });
}

function searchContextMarkup(record, query) {
  const primary = [record.parentLabel, record.context].filter(Boolean).join(" · ");
  const matchMessage = getSearchMatchMessage(record.match);
  return [
    primary ? escapeHtml(primary) : "",
    matchMessage ? highlightMarkup(matchMessage, query) : "",
  ].filter(Boolean).join(" · ");
}

function renderSearchPanel(results, query) {
  state.searchFlatResults = results;
  state.searchActiveIndex = -1;
  if (!results.length) {
    dom.searchResults.innerHTML = `
      <p class="codexSearchEmpty">Aucun résultat pour “${escapeHtml(query)}”</p>
    `;
    dom.searchStatus.textContent = `Aucun résultat pour “${query}”`;
    dom.searchPanel.hidden = false;
    dom.searchInput.setAttribute("aria-expanded", "true");
    return;
  }
  let flatIndex = 0;
  dom.searchResults.innerHTML = groupSearchResults(results).map((group) => `
    <section class="codexSearchGroup" aria-labelledby="search-group-${group.id}">
      <h2 id="search-group-${group.id}" class="codexSearchGroupTitle">${escapeHtml(group.label)}</h2>
      ${group.results.map((record) => {
        const index = flatIndex++;
        return `
          <a
            id="codex-search-option-${index}"
            class="codexSearchResult"
            href="${escapeHtml(recordHref(record))}"
            role="option"
            aria-selected="false"
            data-search-index="${index}"
            data-codex-link
          >
            ${searchVisual(record)}
            <span class="codexSearchResultText">
              <strong>${highlightMarkup(record.label, query)}</strong>
              <small>${searchContextMarkup(record, query)}</small>
            </span>
          </a>
        `;
      }).join("")}
    </section>
  `).join("");
  dom.searchStatus.textContent = `${results.length} ${plural(results.length, "résultat")} affiché${results.length > 1 ? "s" : ""}`;
  dom.searchPanel.hidden = false;
  dom.searchInput.setAttribute("aria-expanded", "true");
}

function renderSearchHint(message = "Saisis au moins 2 caractères.") {
  state.searchFlatResults = [];
  state.searchActiveIndex = -1;
  dom.searchResults.innerHTML = `<p class="codexSearchHint">${escapeHtml(message)}</p>`;
  dom.searchPanel.hidden = false;
  dom.searchInput.setAttribute("aria-expanded", "true");
}

function closeSearchPanel() {
  dom.searchPanel.hidden = true;
  dom.searchInput.setAttribute("aria-expanded", "false");
  dom.searchInput.removeAttribute("aria-activedescendant");
  state.searchActiveIndex = -1;
}

function setActiveSearchResult(nextIndex) {
  const options = [...dom.searchResults.querySelectorAll("[data-search-index]")];
  if (!options.length) return;
  const index = ((nextIndex % options.length) + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    option.setAttribute("aria-selected", String(optionIndex === index));
  });
  state.searchActiveIndex = index;
  const active = options[index];
  dom.searchInput.setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView({ block: "nearest" });
}

function syncSearchUrl(query) {
  if (normalizeSearch(query).replace(/ /g, "").length < 2) return;
  const current = history.state || { codex: true, codexDepth: 0, scrollY: window.scrollY };
  const route = { view: "search", q: query };
  history.replaceState(
    { ...current, codex: true, scrollY: window.scrollY },
    "",
    buildCodexHref(route)
  );
  state.route = parseRoute(window.location.search);
}

async function updateSearchPreview() {
  const sequence = ++state.searchSequence;
  const query = dom.searchInput.value.trim();
  dom.searchClear.hidden = !query;
  const compactLength = normalizeSearch(query).replace(/ /g, "").length;
  if (compactLength < 2) {
    if (document.activeElement === dom.searchInput) renderSearchHint();
    else closeSearchPanel();
    dom.searchStatus.textContent = "";
    return;
  }
  syncSearchUrl(query);
  renderSearchHint("Chargement de la recherche…");
  try {
    await ensureSearchIndex();
    if (sequence !== state.searchSequence) return;
    const results = rankSearchRecords(state.preparedSearch, query, searchResultLimit());
    renderSearchPanel(results, query);
  } catch (_) {
    if (sequence !== state.searchSequence) return;
    renderSearchHint("Impossible de charger la recherche.");
  }
}

function scheduleSearchPreview() {
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(updateSearchPreview, SEARCH_DELAY_MS);
}

function abilityRoute(ability) {
  return { view: "ability", id: ability.id };
}

function characterRoute(character) {
  return {
    view: character.official === false ? "entity" : "character",
    id: character.id,
  };
}

function mechanicRoute(mechanic, operation = "") {
  return {
    view: mechanic.kind === "effect" ? "effect" : "mechanic",
    id: mechanic.id,
    operation: operation || mechanic.facets?.[0]?.id || "",
  };
}

function abilityStripMarkup(abilities, activeAbilityId = "") {
  if (!abilities?.length) return "";
  return `
    <nav class="codexAbilityStrip" aria-label="Capacités du personnage">
      ${abilities.map((ability) => {
        const isActive = ability.id === activeAbilityId;
        return `
          <a
            class="codexAbilityChip${ability.isEmpowered ? " codexAbilityChip--empowered" : ""}"
            href="${escapeHtml(buildCodexHref(abilityRoute(ability)))}"
            data-codex-link
            ${isActive ? 'aria-current="page"' : ""}
            aria-label="${escapeHtml(`${ability.typeLabel} : ${ability.name}`)}"
          >
            ${imageMarkup({
              url: ability.iconUrl,
              alt: "",
              fallback: abilityFallback(ability.typeLabel),
              kind: "ability",
            })}
            <small>${escapeHtml(ability.typeLabel)}</small>
          </a>
        `;
      }).join("")}
    </nav>
  `;
}

function statusMarkup(status) {
  if (!status?.label) return "";
  return `<span class="codexStatusBadge">${escapeHtml(status.label)}</span>`;
}

function traitsMarkup(traits, limit = Infinity) {
  const values = (traits || []).slice(0, limit);
  if (!values.length) return "";
  return `
    <ul class="codexTraitList" aria-label="Traits">
      ${values.map((trait) => `<li class="codexTrait">${escapeHtml(trait)}</li>`).join("")}
    </ul>
  `;
}

function homeModel() {
  const source = state.bootstrap.source || {};
  const version = source.gameVersion ? source.gameVersion.replaceAll("_", ".") : "";
  const generated = formatFrenchDate(source.updatedAt);
  const generationText = [version ? `Version MSF ${version}` : "", generated ? `données du ${generated}` : ""]
    .filter(Boolean)
    .join(" · ");

  const suggestions = (state.bootstrap.suggestions || []).map((suggestion) => `
    <li>
      <a
        class="codexSuggestion"
        href="${escapeHtml(buildCodexHref({
          view: suggestion.view,
          id: suggestion.id,
          operation: suggestion.operation,
        }))}"
        data-codex-link
      >${escapeHtml(suggestion.label)}</a>
    </li>
  `).join("");

  return {
    title: "",
    breadcrumbs: [],
    html: `
      <section class="codexHero">
        <p class="codexEyebrow">Personnages, capacités et mécaniques</p>
        <h1 class="codexPageTitle">Codex MSF</h1>
        <p class="codexLead">
          Explore les kits officiels, leurs capacités, les effets structurés,
          les actions détectées et les mentions des textes français.
        </p>
        ${generationText ? `<p class="codexGeneration">${escapeHtml(generationText)}</p>` : ""}
      </section>

      <nav class="codexGateGrid" aria-label="Portes d’entrée">
        <a class="codexGate" href="${escapeHtml(buildCodexHref({ view: "characters" }))}" data-codex-link>
          <span class="codexGateIcon" aria-hidden="true">◉</span>
          <span>
            <strong>Personnages</strong>
            <small>Kits officiels, capacités et invocations</small>
          </span>
        </a>
        <a class="codexGate" href="${escapeHtml(buildCodexHref({ view: "mechanics" }))}" data-codex-link>
          <span class="codexGateIcon" aria-hidden="true">⌘</span>
          <span>
            <strong>Mécaniques</strong>
            <small>Effets, actions et mentions officielles</small>
          </span>
        </a>
      </nav>

      <div class="codexHomeColumns">
        <section class="codexSection" aria-labelledby="codex-suggestions-title">
          <div class="codexSectionHeader">
            <div>
              <h2 id="codex-suggestions-title">Explorer…</h2>
              <p>Quelques chemins pris en charge par cette génération.</p>
            </div>
          </div>
          <ul class="codexSuggestionList">${suggestions}</ul>
        </section>

        <section class="codexSection" aria-labelledby="codex-proof-title">
          <div class="codexSectionHeader">
            <div>
              <h2 id="codex-proof-title">Niveaux de preuve</h2>
              <p>Le badge appartient à chaque occurrence affichée.</p>
            </div>
          </div>
          <div class="codexProofGuide">
            ${proofGuideMarkup(["normalized", "preserved_uninterpreted", "official_text_only"])}
          </div>
        </section>
      </div>
    `,
  };
}

function characterCardMarkup(record) {
  const route = { view: "character", id: record.id };
  return `
    <article class="codexCharacterCard">
      <div class="codexCharacterTop">
        <a
          class="codexPortraitLink"
          href="${escapeHtml(buildCodexHref(route))}"
          data-codex-link
          aria-label="Voir ${escapeHtml(record.name)}"
        >
          ${imageMarkup({
            url: record.portraitUrl,
            alt: `Portrait de ${record.name}`,
            fallback: String(record.name || "?").slice(0, 2).toLocaleUpperCase("fr-FR"),
          })}
        </a>
        <div class="codexCharacterMeta">
          <h2><a href="${escapeHtml(buildCodexHref(route))}" data-codex-link>${escapeHtml(record.name)}</a></h2>
          ${traitsMarkup(record.cardTraits, 3)}
          ${record.hasEmpowered ? '<span class="codexTypeBadge codexTypeBadge--empowered">Version renforcée</span>' : ""}
        </div>
      </div>
      ${abilityStripMarkup(record.abilities || [])}
    </article>
  `;
}

function entityCardMarkup(record) {
  const route = { view: "entity", id: record.id };
  return `
    <article class="codexCharacterCard">
      <div class="codexCharacterTop">
        <a class="codexPortraitLink" href="${escapeHtml(buildCodexHref(route))}" data-codex-link>
          ${imageMarkup({
            url: record.portraitUrl,
            alt: `Portrait de ${record.label}`,
            fallback: String(record.label || "?").slice(0, 2).toLocaleUpperCase("fr-FR"),
          })}
        </a>
        <div class="codexCharacterMeta">
          <h2><a href="${escapeHtml(buildCodexHref(route))}" data-codex-link>${escapeHtml(record.label)}</a></h2>
          <span class="codexStatusBadge">${escapeHtml(record.context || "Entité de combat")}</span>
          <p class="codexMechanicSource">Nom source : ${escapeHtml(record.sourceName || "")}</p>
        </div>
      </div>
    </article>
  `;
}

async function charactersModel() {
  const catalog = await ensureCharacterCatalog();
  const visible = catalog.records.slice(0, state.charactersVisible);
  let technicalMarkup = "";

  if (state.showTechnicalEntities) {
    await ensureSearchIndex();
    const technical = state.searchIndex.records
      .filter((record) => record.resultGroup === "related")
      .slice(0, state.relatedVisible);
    const total = state.searchIndex.records.filter((record) => record.resultGroup === "related").length;
    technicalMarkup = `
      <section class="codexSection" aria-labelledby="technical-entities-title">
        <div class="codexSectionHeader">
          <div>
            <h2 id="technical-entities-title">Invocations et entités techniques</h2>
            <p>Ces fiches ne font pas partie de la liste des kits officiels.</p>
          </div>
        </div>
        <div class="codexCardGrid codexCardGrid--characters">
          ${technical.map(entityCardMarkup).join("")}
        </div>
        ${state.relatedVisible < total ? `
          <div class="codexLoadMore">
            <button class="codexSecondaryButton" type="button" data-action="more-related">
              Afficher ${Math.min(PAGE_SIZE, total - state.relatedVisible)} entités de plus
            </button>
          </div>
        ` : ""}
      </section>
    `;
  }

  return {
    title: "Personnages",
    breadcrumbs: [{ label: "Personnages" }],
    html: `
      <div class="codexToolbar">
        <div>
          <p class="codexEyebrow">Kits officiels</p>
          <h1>Personnages</h1>
        </div>
      </div>
      <p class="codexLead">
        ${catalog.recordCount} kits officiels, triés par nom français. Les icônes ouvrent directement les capacités.
      </p>

      <section class="codexSection" aria-label="Liste des personnages">
        <div class="codexCardGrid codexCardGrid--characters">
          ${visible.map(characterCardMarkup).join("")}
        </div>
        ${state.charactersVisible < catalog.records.length ? `
          <div class="codexLoadMore">
            <button class="codexPrimaryButton" type="button" data-action="more-characters">
              Afficher 24 personnages de plus
            </button>
          </div>
        ` : ""}
      </section>

      <section class="codexSection" aria-labelledby="technical-access-title">
        <div class="codexSectionHeader">
          <div>
            <h2 id="technical-access-title">Entités techniques</h2>
            <p>Invocations, variantes de combat et autres entités restent séparées des kits officiels.</p>
          </div>
          <button
            class="codexSecondaryButton"
            type="button"
            data-action="toggle-technical-entities"
            aria-expanded="${state.showTechnicalEntities}"
          >${state.showTechnicalEntities ? "Masquer" : "Afficher"}</button>
        </div>
      </section>
      ${technicalMarkup}
    `,
  };
}

function mechanicCardMarkup(mechanic) {
  const operation = mechanic.facets?.[0]?.id || "";
  const route = mechanicRoute(mechanic, operation);
  return `
    <article class="codexMechanicCard">
      <div class="codexMechanicCardTop">
        <span class="codexEffectFallback" aria-hidden="true">${escapeHtml(mechanicInitials(mechanic.label))}</span>
        <div>
          <h2>${escapeHtml(mechanic.label)}</h2>
          ${mechanic.sourceName && normalizeSearch(mechanic.sourceName) !== normalizeSearch(mechanic.label)
            ? `<p class="codexMechanicSource">Nom source : ${escapeHtml(mechanic.sourceName)}</p>`
            : ""}
        </div>
      </div>
      <p>${escapeHtml(mechanic.description || "")}</p>
      <div class="codexMechanicCardFooter">
        ${proofBadge(mechanic.globalEvidence)}
        <a class="codexTextButton" href="${escapeHtml(buildCodexHref(route))}" data-codex-link>Explorer</a>
      </div>
    </article>
  `;
}

async function mechanicsModel() {
  const catalog = await ensureMechanicCatalog();
  const primary = (catalog.primary || []).slice(0, state.mechanicsVisible);
  const technical = state.showTechnicalMechanics
    ? (catalog.technical || []).slice(0, state.technicalMechanicsVisible)
    : [];
  return {
    title: "Mécaniques",
    breadcrumbs: [{ label: "Mécaniques" }],
    html: `
      <div class="codexToolbar">
        <div>
          <p class="codexEyebrow">Effets, actions et mentions</p>
          <h1>Mécaniques</h1>
        </div>
      </div>
      <p class="codexLead">
        Chaque occurrence conserve son propre niveau de preuve. Les facettes affichées proviennent uniquement des données disponibles.
      </p>

      <section class="codexSection" aria-labelledby="primary-mechanics-title">
        <div class="codexSectionHeader">
          <div>
            <h2 id="primary-mechanics-title">Mécaniques principales</h2>
            <p>Concepts structurés, actions détectées et mentions pédagogiques.</p>
          </div>
        </div>
        <div class="codexCardGrid codexCardGrid--mechanics">
          ${primary.map(mechanicCardMarkup).join("")}
        </div>
        ${state.mechanicsVisible < (catalog.primary || []).length ? `
          <div class="codexLoadMore">
            <button class="codexPrimaryButton" type="button" data-action="more-mechanics">
              Afficher ${Math.min(PAGE_SIZE, catalog.primary.length - state.mechanicsVisible)} mécaniques de plus
            </button>
          </div>
        ` : ""}
      </section>

      <section class="codexSection" aria-labelledby="technical-mechanics-title">
        <div class="codexSectionHeader">
          <div>
            <h2 id="technical-mechanics-title">Catalogue technique</h2>
            <p>Effets source et actions moins courantes, accessibles séparément.</p>
          </div>
          <button
            class="codexSecondaryButton"
            type="button"
            data-action="toggle-technical-mechanics"
            aria-expanded="${state.showTechnicalMechanics}"
          >${state.showTechnicalMechanics ? "Masquer" : "Afficher"}</button>
        </div>
        ${state.showTechnicalMechanics ? `
          <div class="codexCardGrid codexCardGrid--mechanics">
            ${technical.map(mechanicCardMarkup).join("")}
          </div>
          ${state.technicalMechanicsVisible < (catalog.technical || []).length ? `
            <div class="codexLoadMore">
              <button class="codexSecondaryButton" type="button" data-action="more-technical-mechanics">
                Afficher ${Math.min(PAGE_SIZE, catalog.technical.length - state.technicalMechanicsVisible)} mécaniques de plus
              </button>
            </div>
          ` : ""}
        ` : ""}
      </section>
    `,
  };
}

function fullSearchResultMarkup(record, query) {
  return `
    <a class="codexAbilityCard" href="${escapeHtml(recordHref(record))}" data-codex-link>
      ${searchVisual(record)}
      <span class="codexAbilityCardBody">
        <h3>${highlightMarkup(record.label, query)}</h3>
        <p>${searchContextMarkup(record, query)}</p>
      </span>
    </a>
  `;
}

async function searchModel(route) {
  const query = String(route.q || "").trim();
  if (normalizeSearch(query).replace(/ /g, "").length < 2) {
    return {
      title: "Recherche",
      breadcrumbs: [{ label: "Recherche" }],
      html: `
        <section class="codexEmptyState">
          <h1>Explorer…</h1>
          <p>Saisis au moins deux caractères dans la recherche.</p>
        </section>
      `,
    };
  }
  await ensureSearchIndex();
  if (state.lastSearchQuery !== query) {
    state.searchVisible = SEARCH_PAGE_SIZE;
    state.lastSearchQuery = query;
  }
  const ranked = rankSearchRecords(state.preparedSearch, query);
  const visible = ranked.slice(0, state.searchVisible);
  const groups = groupSearchResults(visible);
  const html = ranked.length
    ? `
      <div class="codexToolbar">
        <div>
          <p class="codexEyebrow">Recherche unifiée</p>
          <h1>Résultats pour “${escapeHtml(query)}”</h1>
        </div>
      </div>
      <p class="codexLead" role="status">${ranked.length} ${plural(ranked.length, "résultat")}.</p>
      ${groups.map((group) => `
        <section class="codexSection" aria-labelledby="full-search-${group.id}">
          <div class="codexSectionHeader">
            <h2 id="full-search-${group.id}">${escapeHtml(group.label)}</h2>
          </div>
          <div class="codexAbilityCards">
            ${group.results.map((record) => fullSearchResultMarkup(record, query)).join("")}
          </div>
        </section>
      `).join("")}
      ${state.searchVisible < ranked.length ? `
        <div class="codexLoadMore">
          <button class="codexPrimaryButton" type="button" data-action="more-search">
            Afficher ${Math.min(SEARCH_PAGE_SIZE, ranked.length - state.searchVisible)} résultats de plus
          </button>
        </div>
      ` : ""}
    `
    : `
      <section class="codexEmptyState">
        <h1>Aucun résultat</h1>
        <p>Aucun résultat pour “${escapeHtml(query)}”</p>
        <button class="codexPrimaryButton" type="button" data-action="focus-search">Modifier la recherche</button>
      </section>
    `;
  return {
    title: `Recherche : ${query}`,
    breadcrumbs: [{ label: `Recherche “${query}”` }],
    html,
  };
}

function abilityCardMarkup(ability) {
  const mechanicsCount = (ability.operations?.length || 0) +
    (ability.actions?.length || 0) +
    (ability.mentions?.length || 0);
  return `
    <a
      class="codexAbilityCard"
      href="${escapeHtml(buildCodexHref(abilityRoute(ability)))}"
      data-codex-link
    >
      ${imageMarkup({
        url: ability.iconUrl,
        alt: `Icône de ${ability.name}`,
        fallback: abilityFallback(ability.typeLabel),
        kind: "ability",
      })}
      <span class="codexAbilityCardBody">
        <span class="codexTypeBadge${ability.isEmpowered ? " codexTypeBadge--empowered" : ""}">
          ${escapeHtml(ability.typeLabel)}
        </span>
        <h3>${escapeHtml(ability.name)}</h3>
        <p>
          ${ability.isEmpowered ? "Version renforcée · " : ""}
          ${mechanicsCount
            ? `${mechanicsCount} ${plural(mechanicsCount, "lecture mécanique", "lectures mécaniques")}`
            : "Aucune mécanique vérifiée"}
        </p>
      </span>
    </a>
  `;
}

function invocationMarkup(shard) {
  const entries = [];
  const seen = new Set();
  (shard.invocations || []).forEach((spawn) => {
    (spawn.pool || []).forEach((entity) => {
      const key = `${spawn.abilityId || ""}:${entity.characterId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const ability = shard.abilities?.find((candidate) => candidate.id === spawn.abilityId);
      entries.push({ spawn, entity, ability });
    });
  });
  if (!entries.length) return "";
  return `
    <section class="codexSection" aria-labelledby="character-spawns-title">
      <div class="codexSectionHeader">
        <div>
          <h2 id="character-spawns-title">Invocations</h2>
          <p>Relations exactes reliées aux opérations d’invocation.</p>
        </div>
      </div>
      <div class="codexCardGrid">
        ${entries.map(({ spawn, entity, ability }) => `
          <article class="codexCharacterCard">
            <div class="codexCharacterTop">
              <a
                class="codexPortraitLink"
                href="${escapeHtml(buildCodexHref({ view: "entity", id: entity.characterId }))}"
                data-codex-link
              >
                ${imageMarkup({
                  url: entity.portraitUrl,
                  alt: `Portrait de ${entity.name}`,
                  fallback: String(entity.name || "?").slice(0, 2).toLocaleUpperCase("fr-FR"),
                })}
              </a>
              <div class="codexCharacterMeta">
                <h3>
                  <a href="${escapeHtml(buildCodexHref({ view: "entity", id: entity.characterId }))}" data-codex-link>
                    ${escapeHtml(entity.name)}
                  </a>
                </h3>
                ${statusMarkup(entity.status)}
                ${Number.isFinite(spawn.selectionCount)
                  ? `<p>Quantité structurée : ${spawn.selectionCount}</p>`
                  : ""}
              </div>
            </div>
            ${ability ? `
              <a class="codexInlineLink" href="${escapeHtml(buildCodexHref(abilityRoute(ability)))}" data-codex-link>
                Invoquée par ${escapeHtml(ability.name)}
              </a>
            ` : ""}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function relatedMechanicsMarkup(shard) {
  const mechanics = shard.relatedMechanics || [];
  if (!mechanics.length) return "";
  return `
    <section class="codexSection" aria-labelledby="related-mechanics-title">
      <div class="codexSectionHeader">
        <div>
          <h2 id="related-mechanics-title">Mécaniques liées</h2>
          <p>Liens issus des occurrences de ce personnage.</p>
        </div>
      </div>
      <div class="codexCardGrid codexCardGrid--mechanics">
        ${mechanics.map((mechanic) => {
          const route = {
            view: mechanic.kind === "effect" ? "effect" : "mechanic",
            id: mechanic.id,
          };
          return `
            <article class="codexMechanicCard">
              <div class="codexMechanicCardTop">
                <span class="codexEffectFallback" aria-hidden="true">${escapeHtml(mechanicInitials(mechanic.label))}</span>
                <div>
                  <h3>${escapeHtml(mechanic.label)}</h3>
                  <p>${mechanic.occurrenceCount} ${plural(mechanic.occurrenceCount, "occurrence")}</p>
                </div>
              </div>
              <div class="codexMechanicCardFooter">
                ${proofBadge(mechanic.globalEvidence)}
                <a class="codexTextButton" href="${escapeHtml(buildCodexHref(route))}" data-codex-link>Explorer</a>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function technicalContextsMarkup(shard) {
  if (!shard.technicalContexts?.length) return "";
  const occurrenceCount = shard.technicalContexts.reduce(
    (total, context) => total + (context.operations?.length || 0) + (context.actions?.length || 0),
    0
  );
  return `
    <details class="codexTechnicalDetails">
      <summary>
        Opérations techniques sans capacité présentée
        <span class="codexCountBadge">${occurrenceCount}</span>
      </summary>
      <div class="codexTechnicalDetailsBody">
        <p class="codexLead">
          Ces opérations restent consultables sans être associées de façon incertaine à une capacité.
        </p>
        ${shard.technicalContexts.map((context) => `
          <section class="codexSection">
            <h3>${escapeHtml(context.label)}</h3>
            <ul class="codexChipList">
              ${[...(context.operations || []), ...(context.actions || [])].map((occurrence) => `
                <li>
                  <a
                    class="codexSuggestion"
                    href="${escapeHtml(buildCodexHref({ view: "operation", id: occurrence.id }))}"
                    data-codex-link
                  >
                    ${escapeHtml(occurrence.kindLabel || occurrence.label || "Opération")}
                    · ${escapeHtml(proofInfo(occurrence.evidence).label)}
                  </a>
                </li>
              `).join("")}
            </ul>
          </section>
        `).join("")}
      </div>
    </details>
  `;
}

function characterModel(shard) {
  const character = shard.character;
  const routeView = character.official ? "character" : "entity";
  const technicalMessage = !character.official
    ? '<p class="codexTechnicalMessage">Cette fiche représente une invocation, une variante ou une entité de combat.</p>'
    : "";
  return {
    title: character.name,
    breadcrumbs: [{ label: "Personnages", route: { view: "characters" } }, { label: character.name }],
    html: `
      <section class="codexIdentity">
        <div class="codexIdentityTop">
          ${imageMarkup({
            url: character.portraitUrl,
            alt: `Portrait de ${character.name}`,
            fallback: String(character.name || "?").slice(0, 2).toLocaleUpperCase("fr-FR"),
            loading: "eager",
            className: "codexIdentityPortrait",
          })}
          <div class="codexIdentityText">
            <p class="codexEyebrow">${escapeHtml(character.status?.label || "Personnage")}</p>
            <h1>${escapeHtml(character.name)}</h1>
            ${statusMarkup(character.status)}
            ${traitsMarkup(character.displayTraits)}
          </div>
        </div>
        ${technicalMessage}
        <div class="codexIdentityActions">
          <button
            class="codexSecondaryButton"
            type="button"
            data-action="share"
            data-share-title="${escapeHtml(`${character.name} | Codex MSF`)}"
          >Partager</button>
          ${routeView === "entity"
            ? `<a class="codexSecondaryButton" href="${escapeHtml(buildCodexHref({ view: "characters" }))}" data-codex-link>Voir les kits officiels</a>`
            : ""}
        </div>
        ${abilityStripMarkup(shard.abilities || [])}
      </section>

      <section class="codexSection" aria-labelledby="character-abilities-title">
        <div class="codexSectionHeader">
          <div>
            <h2 id="character-abilities-title">Capacités</h2>
            <p>Ordre : Basique, Spéciale, Ultime, Passive, avec les versions renforcées adjacentes.</p>
          </div>
        </div>
        ${shard.abilities?.length
          ? `<div class="codexAbilityCards">${shard.abilities.map(abilityCardMarkup).join("")}</div>`
          : '<p class="codexNotice codexNotice--info">Aucune capacité n’est publiée pour cette entité.</p>'}
      </section>

      ${invocationMarkup(shard)}
      ${relatedMechanicsMarkup(shard)}
      ${technicalContextsMarkup(shard)}
    `,
  };
}

function formatMetricValue(metric) {
  if (!metric || metric.value === null || metric.value === undefined) return "";
  const value = Array.isArray(metric.value) ? metric.value.join(", ") : String(metric.value);
  if (!metric.unit) return value;
  return metric.unit === "%" ? `${value} %` : `${value} ${metric.unit}`;
}

function definitionRow(label, value, valueIsHtml = false) {
  if (value === null || value === undefined || value === "") return "";
  return `<dt>${escapeHtml(label)}</dt><dd>${valueIsHtml ? value : escapeHtml(value)}</dd>`;
}

function mechanicsLinksMarkup(occurrence, ability) {
  const mechanics = [];
  const knownMechanics = new Map(
    (ability?.relatedMechanics || []).map((mechanic) => [mechanic.id, mechanic])
  );
  if (occurrence.effect?.mechanicId) {
    mechanics.push({
      id: occurrence.effect.mechanicId,
      label: occurrence.effect.label || occurrence.effect.sourceName,
      view: "effect",
    });
  }
  if (occurrence.mechanicId) {
    const known = knownMechanics.get(occurrence.mechanicId);
    const label = occurrence.term || occurrence.label || known?.label;
    if (label) {
      mechanics.push({
        id: occurrence.mechanicId,
        label,
        view: known?.kind === "effect" ? "effect" : "mechanic",
      });
    }
  }
  (occurrence.mechanicIds || []).forEach((id) => {
    if (mechanics.some((item) => item.id === id)) return;
    const known = knownMechanics.get(id);
    if (!known?.label) return;
    mechanics.push({
      id,
      label: known.label,
      view: known.kind === "effect" ? "effect" : "mechanic",
    });
  });
  return mechanics.map((mechanic) => `
    <a
      class="codexInlineLink"
      href="${escapeHtml(buildCodexHref({ view: mechanic.view, id: mechanic.id }))}"
      data-codex-link
    >${escapeHtml(mechanic.label)}</a>
  `).join(" · ");
}

function occurrenceTitle(occurrence) {
  if (occurrence.kind === "mention") {
    return occurrence.term || "Mention dans le texte";
  }
  if (occurrence.effect?.label) {
    return `${occurrence.kindLabel || "Action"} : ${occurrence.effect.label}`;
  }
  if (occurrence.label) return occurrence.label;
  return occurrence.kindLabel || "Opération structurée";
}

function occurrenceMarkup(occurrence, ability) {
  const links = mechanicsLinksMarkup(occurrence, ability);
  const rows = [];
  rows.push(definitionRow("Action", occurrence.kindLabel || occurrence.label || ""));
  if (links) rows.push(definitionRow("Effet ou mécanique", links, true));
  if (occurrence.target) rows.push(definitionRow("Cible", occurrence.target));
  if (occurrence.scope && occurrence.scope !== occurrence.target) {
    rows.push(definitionRow("Portée", occurrence.scope));
  }
  if (occurrence.chance !== null && occurrence.chance !== undefined) {
    rows.push(definitionRow("Chance", `${occurrence.chance} %`));
  }
  if (occurrence.trigger) rows.push(definitionRow("Déclencheur", occurrence.trigger));
  if (occurrence.modes?.length) rows.push(definitionRow("Mode", occurrence.modes.join(", ")));
  if (occurrence.sides?.length) rows.push(definitionRow("Contexte", occurrence.sides.join(", ")));
  if (occurrence.conditions?.length) {
    rows.push(definitionRow("Conditions", occurrence.conditions.join(" · ")));
  }
  (occurrence.metrics || [])
    .filter((metric) => metric.key !== "chancePct")
    .forEach((metric) => {
      rows.push(definitionRow(metric.label || "Valeur", formatMetricValue(metric)));
    });

  const spawn = ability?.spawns?.find((item) => item.operationId === occurrence.id);
  if (spawn?.pool?.length) {
    const entities = spawn.pool.map((entity) => `
      <a
        class="codexInlineLink"
        href="${escapeHtml(buildCodexHref({ view: "entity", id: entity.characterId }))}"
        data-codex-link
      >${escapeHtml(entity.name)}</a>
    `).join(", ");
    rows.push(definitionRow("Invocation", entities, true));
  }

  if (occurrence.kind === "mention" && occurrence.excerpt) {
    rows.push(definitionRow("Extrait", occurrence.excerpt));
  }

  const operationLink = /^(op|act)_/.test(occurrence.id || "")
    ? `
      <a
        class="codexInlineLink"
        href="${escapeHtml(buildCodexHref({ view: "operation", id: occurrence.id }))}"
        data-codex-link
      >Voir le détail</a>
    `
    : "";

  return `
    <li class="codexOccurrence">
      <div class="codexOccurrenceHeader">
        <strong>${escapeHtml(occurrenceTitle(occurrence))}</strong>
        ${proofBadge(occurrence.evidence)}
      </div>
      ${rows.filter(Boolean).length ? `<dl class="codexDefinitionGrid">${rows.join("")}</dl>` : ""}
      ${operationLink}
    </li>
  `;
}

function linkifyOfficialText(text, mentions) {
  const source = String(text || "");
  const terms = [];
  const byNormalizedTerm = new Map();
  (mentions || []).forEach((mention) => {
    const term = String(mention.term || "").trim();
    if (!term || !mention.mechanicId) return;
    const key = normalizeSearch(term);
    if (byNormalizedTerm.has(key)) return;
    byNormalizedTerm.set(key, mention);
    terms.push(term);
  });
  if (!terms.length) return escapeHtml(source);
  terms.sort((left, right) => right.length - left.length);
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "giu");
  let cursor = 0;
  let html = "";
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    html += escapeHtml(source.slice(cursor, start));
    const mention = byNormalizedTerm.get(normalizeSearch(match[0]));
    if (mention) {
      html += `<a href="${escapeHtml(buildCodexHref({
        view: "mechanic",
        id: mention.mechanicId,
        operation: "mention",
      }))}" data-codex-link>${escapeHtml(match[0])}</a>`;
    } else {
      html += escapeHtml(match[0]);
    }
    cursor = start + match[0].length;
  }
  html += escapeHtml(source.slice(cursor));
  return html;
}

function empoweredRelationshipMarkup(ability, shard) {
  const links = [];
  if (ability.parentAbilityId) {
    const parent = shard.abilities?.find((candidate) => candidate.id === ability.parentAbilityId);
    if (parent) {
      links.push(`
        <a class="codexInlineLink" href="${escapeHtml(buildCodexHref(abilityRoute(parent)))}" data-codex-link>
          Capacité d’origine : ${escapeHtml(parent.name)}
        </a>
      `);
    }
  }
  (shard.abilities || [])
    .filter((candidate) => candidate.parentAbilityId === ability.id)
    .forEach((empowered) => {
      links.push(`
        <a class="codexInlineLink" href="${escapeHtml(buildCodexHref(abilityRoute(empowered)))}" data-codex-link>
          Version renforcée : ${escapeHtml(empowered.name)}
        </a>
      `);
    });
  if (!links.length) return "";
  return `<div class="codexNotice codexNotice--info">${links.join("<br />")}</div>`;
}

function abilityModel(shard, ability) {
  const character = shard.character;
  const occurrences = [
    ...(ability.operations || []),
    ...(ability.actions || []),
    ...(ability.mentions || []),
  ];
  const evidences = uniqueEvidence(occurrences.map((occurrence) => occurrence.evidence));
  const energy = ability.energy;
  const energyText = energy && typeof energy === "object"
    ? [
        Number.isFinite(energy.cost) ? `Coût ${energy.cost}` : "",
        Number.isFinite(energy.start) ? `départ ${energy.start}` : "",
      ].filter(Boolean).join(" · ")
    : "";
  const shareTitle = `${ability.name} — ${character.name} | Codex MSF`;

  const mechanicsContent = occurrences.length
    ? `
      ${evidences.length ? `<div class="codexProofGuide">${proofGuideMarkup(evidences)}</div>` : ""}
      <ul class="codexOccurrenceList">
        ${occurrences.map((occurrence) => occurrenceMarkup(occurrence, ability)).join("")}
      </ul>
    `
    : '<p class="codexNotice codexNotice--info">Aucune mécanique vérifiée n’est disponible pour cette capacité.</p>';

  const officialContent = ability.officialText
    ? `<p class="codexOfficialText">${linkifyOfficialText(ability.officialText, ability.mentions)}</p>`
    : '<p class="codexNotice codexNotice--info">Texte officiel indisponible pour cette capacité.</p>';

  return {
    title: `${ability.name} — ${character.name}`,
    breadcrumbs: [
      { label: character.name, route: characterRoute(character) },
      { label: ability.typeLabel },
    ],
    html: `
      <section class="codexIdentity">
        <div class="codexIdentityTop">
          ${imageMarkup({
            url: ability.iconUrl,
            alt: `Icône de ${ability.name}`,
            fallback: abilityFallback(ability.typeLabel),
            kind: "ability",
            loading: "eager",
            className: "codexIdentityPortrait",
          })}
          <div class="codexIdentityText">
            <p class="codexEyebrow">${escapeHtml(character.name)}</p>
            <h1>${escapeHtml(ability.name)}</h1>
            <div class="codexMetaList">
              <span class="codexTypeBadge${ability.isEmpowered ? " codexTypeBadge--empowered" : ""}">
                ${escapeHtml(ability.typeLabel)}
              </span>
              ${energyText ? `<span class="codexMetaChip">Énergie : ${escapeHtml(energyText)}</span>` : ""}
              ${ability.maxLevel ? `<span class="codexMetaChip">Niveau max : ${escapeHtml(ability.maxLevel)}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="codexIdentityActions">
          <a
            class="codexSecondaryButton"
            href="${escapeHtml(buildCodexHref(characterRoute(character)))}"
            data-codex-link
          >Voir ${escapeHtml(character.name)}</a>
          <button
            class="codexSecondaryButton"
            type="button"
            data-action="share"
            data-share-title="${escapeHtml(shareTitle)}"
          >Partager</button>
        </div>
        ${abilityStripMarkup(shard.abilities || [], ability.id)}
        ${empoweredRelationshipMarkup(ability, shard)}
      </section>

      <div class="codexSplitLayout">
        <section class="codexMechanicalPanel" aria-labelledby="mechanical-reading-title">
          <div class="codexPanelTitle">
            <h2 id="mechanical-reading-title">Lecture mécanique</h2>
          </div>
          ${mechanicsContent}
        </section>

        <section class="codexOfficialPanel" aria-labelledby="official-text-title">
          <div class="codexPanelTitle">
            <h2 id="official-text-title">
              Texte officiel${ability.maxLevel ? ` · niveau ${escapeHtml(ability.maxLevel)}` : " de niveau maximal"}
            </h2>
          </div>
          ${officialContent}
        </section>
      </div>
    `,
  };
}

function renderFilterControls(filters, records, draft = false) {
  const prefix = draft ? "draft-" : "";
  const dataAttribute = draft ? "data-filter-draft" : "data-filter";
  const hasModes = records.some((record) => record.modes?.length);
  const hasChance = records.some((record) => ["100", "less"].includes(record.chanceCategory));
  const hasSides = filters.mode !== "all" && records.some((record) => record.sides?.length);

  return `
    <h2>Filtres</h2>
    <fieldset class="codexFilterGroup">
      <legend>Personnages</legend>
      <label class="codexCheckRow" for="${prefix}filter-playable">
        <input
          id="${prefix}filter-playable"
          type="checkbox"
          ${dataAttribute}="playable"
          ${checked(filters.playable)}
        />
        Personnages jouables seulement
      </label>
    </fieldset>

    <div class="codexFilterGroup">
      <label class="codexFilterLabel" for="${prefix}filter-type">Type de capacité</label>
      <select id="${prefix}filter-type" class="codexSelect" ${dataAttribute}="type">
        <option value="all"${selected(filters.type, "all")}>Toutes</option>
        <option value="basic"${selected(filters.type, "basic")}>Basique</option>
        <option value="special"${selected(filters.type, "special")}>Spéciale</option>
        <option value="ultimate"${selected(filters.type, "ultimate")}>Ultime</option>
        <option value="passive"${selected(filters.type, "passive")}>Passive</option>
        <option value="empowered"${selected(filters.type, "empowered")}>Renforcée</option>
      </select>
    </div>

    ${hasModes ? `
      <div class="codexFilterGroup">
        <label class="codexFilterLabel" for="${prefix}filter-mode">Mode</label>
        <select id="${prefix}filter-mode" class="codexSelect" ${dataAttribute}="mode">
          <option value="all"${selected(filters.mode, "all")}>Tous</option>
          <option value="war"${selected(filters.mode, "war")}>Guerre</option>
          <option value="raid"${selected(filters.mode, "raid")}>Raid</option>
          <option value="crucible"${selected(filters.mode, "crucible")}>Épreuve</option>
          <option value="battleworld"${selected(filters.mode, "battleworld")}>Battleworld</option>
        </select>
      </div>
    ` : ""}

    ${hasChance ? `
      <div class="codexFilterGroup">
        <label class="codexFilterLabel" for="${prefix}filter-chance">Chance</label>
        <select id="${prefix}filter-chance" class="codexSelect" ${dataAttribute}="chance">
          <option value="all"${selected(filters.chance, "all")}>Toutes</option>
          <option value="100"${selected(filters.chance, "100")}>100 % indiqué</option>
          <option value="less"${selected(filters.chance, "less")}>Moins de 100 %</option>
        </select>
      </div>
    ` : ""}

    ${hasSides ? `
      <div class="codexFilterGroup">
        <label class="codexFilterLabel" for="${prefix}filter-side">Attaque ou défense</label>
        <select id="${prefix}filter-side" class="codexSelect" ${dataAttribute}="side">
          <option value="all"${selected(filters.side, "all")}>Tous</option>
          <option value="attack"${selected(filters.side, "attack")}>Attaque</option>
          <option value="defense"${selected(filters.side, "defense")}>Défense</option>
        </select>
      </div>
    ` : ""}
  `;
}

function conditionsMarkup(conditions) {
  if (!conditions?.length) return "";
  const visible = conditions.slice(0, 2);
  const hiddenCount = conditions.length - visible.length;
  return `
    <ul class="codexConditions" aria-label="Conditions importantes">
      ${visible.map((condition) => `<li>${escapeHtml(condition)}</li>`).join("")}
      ${hiddenCount ? `<li>+ ${hiddenCount} autres conditions</li>` : ""}
    </ul>
  `;
}

function resultDetailMarkup(record) {
  const first = record.occurrences?.[0] || {};
  const details = [];
  if (first.target) details.push(`Cible : ${first.target}`);
  else if (first.scope) details.push(`Cible : ${first.scope}`);
  if (record.chanceCategory === "100") details.push("Chance : 100 % indiqué");
  if (record.chanceCategory === "less") {
    const chances = [...new Set(
      (record.occurrences || [])
        .map((occurrence) => occurrence.chance)
        .filter((chance) => Number.isFinite(chance) && chance < 100)
    )];
    details.push(chances.length ? `Chance : ${chances.join(" / ")} %` : "Chance : moins de 100 %");
  }
  if (record.modes?.length) details.push(`Mode : ${record.modes.join(", ")}`);
  if (record.sides?.length) details.push(record.sides.join(", "));
  if (first.trigger) details.push(`Déclencheur : ${first.trigger}`);
  return details.length
    ? `<div class="codexResultDetails">${details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join("")}</div>`
    : "";
}

function mechanicResultCardMarkup(record) {
  const firstOperation = (record.occurrences || []).find((occurrence) => /^(op|act)_/.test(occurrence.id || ""));
  return `
    <li class="codexResultCard">
      <div class="codexResultMain">
        <div class="codexResultVisuals" aria-hidden="true">
          ${imageMarkup({
            url: record.portraitUrl,
            alt: "",
            fallback: String(record.characterName || "?").slice(0, 2).toLocaleUpperCase("fr-FR"),
            className: "codexResultPortrait",
          })}
          ${imageMarkup({
            url: record.iconUrl,
            alt: "",
            fallback: abilityFallback(record.abilityTypeLabel),
            kind: "result",
          })}
        </div>
        <div class="codexResultBody">
          <p class="codexResultCharacter">${escapeHtml(record.characterName)}</p>
          <h3>${escapeHtml(record.abilityName)}</h3>
          <span class="codexTypeBadge${record.isEmpowered ? " codexTypeBadge--empowered" : ""}">
            ${escapeHtml(record.abilityTypeLabel)}
          </span>
          <p class="codexResultSummary">${escapeHtml(record.summary || "")}</p>
          ${record.occurrences?.[0]?.excerpt
            ? `<p class="codexOccurrenceSummary">“${escapeHtml(record.occurrences[0].excerpt)}”</p>`
            : ""}
          ${resultDetailMarkup(record)}
          ${conditionsMarkup(record.conditions)}
        </div>
      </div>
      <div class="codexResultFooter">
        <span>${uniqueEvidence(record.evidence).map(proofBadge).join(" ")}</span>
        <span>
          ${firstOperation ? `
            <a
              class="codexTextButton"
              href="${escapeHtml(buildCodexHref({ view: "operation", id: firstOperation.id }))}"
              data-codex-link
            >Détail</a>
          ` : ""}
          <a
            class="codexPrimaryButton"
            href="${escapeHtml(buildCodexHref({ view: "ability", id: record.abilityId }))}"
            data-codex-link
          >Voir la capacité</a>
        </span>
      </div>
    </li>
  `;
}

async function mechanicModel(route) {
  const mechanic = await ensureMechanic(route.id);
  const facet = mechanic.facets?.find((candidate) => candidate.id === route.operation)
    || mechanic.facets?.[0]
    || null;
  if (!facet) {
    return {
      title: mechanic.label,
      breadcrumbs: [{ label: "Mécaniques", route: { view: "mechanics" } }, { label: mechanic.label }],
      html: `
        <section class="codexMechanicHeader">
          <h1>${escapeHtml(mechanic.label)}</h1>
          <p class="codexNotice codexNotice--info">Aucun résultat n’est publié pour cette mécanique.</p>
        </section>
      `,
    };
  }

  const resultEntry = await ensureFacetResults(mechanic, facet);
  const rawRecords = resultEntry.records || [];
  const filtered = filterMechanicResults(rawRecords, route.filters);
  const sorted = sortMechanicResults(filtered, route.filters);
  const routeView = mechanic.kind === "effect" ? "effect" : "mechanic";
  const hasSideContext = route.filters.mode !== "all" && rawRecords.some((record) => record.sides?.length);
  const activeFilters = [
    !route.filters.playable ? "toutes les entités" : "",
    route.filters.type !== "all" ? route.filters.type : "",
    route.filters.mode !== "all" ? getModeLabel(route.filters.mode) : "",
    route.filters.chance !== "all" ? route.filters.chance : "",
    hasSideContext && route.filters.side !== "all" ? route.filters.side : "",
  ].filter(Boolean).length;

  const resultContent = sorted.length
    ? `<ul class="codexResultList">${sorted.map(mechanicResultCardMarkup).join("")}</ul>`
    : `
      <section class="codexEmptyState">
        <h2>Aucun résultat</h2>
        <p>Aucune capacité ne correspond aux filtres choisis.</p>
        <button class="codexSecondaryButton" type="button" data-action="reset-filters">Réinitialiser les filtres</button>
      </section>
    `;

  return {
    title: mechanic.label,
    breadcrumbs: [
      { label: "Mécaniques", route: { view: "mechanics" } },
      { label: mechanic.label },
      { label: facet.label },
    ],
    mechanicContext: { mechanic, facet, rawRecords },
    html: `
      <section class="codexMechanicHeader">
        <div class="codexMechanicTitleRow">
          <span class="codexEffectFallback" aria-hidden="true">${escapeHtml(mechanicInitials(mechanic.label))}</span>
          <div>
            <p class="codexEyebrow">${escapeHtml(
              mechanic.globalEvidence === "normalized"
                ? "Mécanique structurée"
                : mechanic.globalEvidence === "preserved_uninterpreted"
                  ? "Action détectée"
                  : "Mention textuelle"
            )}</p>
            <h1>${escapeHtml(mechanic.label)}</h1>
            ${mechanic.sourceName
              ? `<p class="codexMechanicSource">Nom source : ${escapeHtml(mechanic.sourceName)}</p>`
              : ""}
          </div>
        </div>
        <p class="codexMechanicDescription">${escapeHtml(mechanic.description || "")}</p>
        <div class="codexMetricRow">
          <div class="codexMetric">
            <strong>${mechanic.counts?.abilities ?? 0}</strong>
            <span>${plural(mechanic.counts?.abilities ?? 0, "capacité")}</span>
          </div>
          <div class="codexMetric">
            <strong>${mechanic.counts?.occurrences ?? 0}</strong>
            <span>${plural(mechanic.counts?.occurrences ?? 0, "occurrence")}</span>
          </div>
        </div>
        <div class="codexIdentityActions">
          ${proofBadge(mechanic.globalEvidence)}
          <button
            class="codexSecondaryButton"
            type="button"
            data-action="share"
            data-share-title="${escapeHtml(`${mechanic.label} | Codex MSF`)}"
          >Partager</button>
        </div>
        <p class="codexNotice ${
          mechanic.globalEvidence === "preserved_uninterpreted"
            ? "codexNotice--warning"
            : "codexNotice--info"
        }">${escapeHtml(mechanic.warning || proofInfo(mechanic.globalEvidence).explanation)}</p>

        <nav class="codexFacetBar" aria-label="Opérations disponibles">
          ${(mechanic.facets || []).map((candidate) => `
            <a
              class="codexFacet"
              href="${escapeHtml(buildCodexHref({
                view: routeView,
                id: mechanic.id,
                operation: candidate.id,
                filters: route.filters,
              }))}"
              data-codex-link
              ${candidate.id === facet.id ? 'aria-current="page"' : ""}
            >
              ${escapeHtml(candidate.label)}
              <span class="codexCountBadge">${candidate.abilityCount}</span>
            </a>
          `).join("")}
        </nav>
      </section>

      <div class="codexMechanicLayout">
        <aside class="codexFilters" aria-label="Filtres des résultats">
          ${renderFilterControls(route.filters, rawRecords)}
        </aside>

        <section class="codexResultsPane" aria-labelledby="mechanic-results-title">
          <button
            class="codexSecondaryButton codexMobileFilterButton"
            type="button"
            data-action="open-filters"
          >Filtres${activeFilters ? ` (${activeFilters})` : ""}</button>

          <div class="codexResultsToolbar">
            <p id="mechanic-results-title" class="codexResultsCount" role="status">
              ${sorted.length} ${plural(sorted.length, "capacité")} affichée${sorted.length > 1 ? "s" : ""}
              ${resultEntry.complete ? "" : " · chargement des résultats…"}
            </p>
            <div class="codexSortControl">
              <label for="mechanic-sort">Tri</label>
              <select id="mechanic-sort" class="codexSelect" data-filter="sort">
                <option value="relevance"${selected(route.filters.sort, "relevance")}>Pertinence</option>
                <option value="az"${selected(route.filters.sort, "az")}>A–Z</option>
              </select>
            </div>
            <p class="codexSortHelp">Pertinence : contexte choisi, chance indiquée, puis ordre alphabétique.</p>
          </div>
          ${resultEntry.error
            ? '<p class="codexNotice codexNotice--error">Cette fiche n’est pas disponible dans la génération actuelle.</p>'
            : ""}
          ${resultContent}
        </section>
      </div>
    `,
  };
}

function operationModel(context) {
  const { shard, ability, occurrence } = context;
  const character = shard.character;
  const evidence = occurrence.evidence;
  const title = occurrenceTitle(occurrence);
  const contextRoute = ability ? abilityRoute(ability) : characterRoute(character);
  const contextLabel = ability?.name || character.name;
  return {
    title: `${title} — ${contextLabel}`,
    breadcrumbs: [
      { label: character.name, route: characterRoute(character) },
      ...(ability ? [{ label: ability.typeLabel, route: abilityRoute(ability) }] : []),
      { label: title },
    ],
    html: `
      <div class="codexOperationHero">
        <section class="codexIdentity">
          <div class="codexOperationContext">
            ${ability
              ? imageMarkup({
                  url: ability.iconUrl,
                  alt: `Icône de ${ability.name}`,
                  fallback: abilityFallback(ability.typeLabel),
                  kind: "ability",
                  loading: "eager",
                })
              : imageMarkup({
                  url: character.portraitUrl,
                  alt: `Portrait de ${character.name}`,
                  fallback: String(character.name || "?").slice(0, 2).toLocaleUpperCase("fr-FR"),
                  loading: "eager",
                })}
            <div>
              <p class="codexEyebrow">${escapeHtml(contextLabel)}</p>
              <h1>${escapeHtml(title)}</h1>
            </div>
          </div>
          <div class="codexIdentityActions">
            <a class="codexSecondaryButton" href="${escapeHtml(buildCodexHref(contextRoute))}" data-codex-link>
              Retour à ${escapeHtml(contextLabel)}
            </a>
            <button
              class="codexSecondaryButton"
              type="button"
              data-action="share"
              data-share-title="${escapeHtml(`${title} — ${contextLabel} | Codex MSF`)}"
            >Partager</button>
          </div>
        </section>

        <aside class="codexOperationPanel" aria-labelledby="operation-proof-title">
          <div class="codexPanelTitle">
            <h2 id="operation-proof-title">Niveau de preuve</h2>
          </div>
          ${proofGuideMarkup([evidence])}
        </aside>
      </div>

      <section class="codexMechanicalPanel" aria-labelledby="operation-detail-title">
        <div class="codexPanelTitle">
          <h2 id="operation-detail-title">Détail de l’opération</h2>
        </div>
        <ul class="codexOccurrenceList">
          ${occurrenceMarkup(occurrence, ability)}
        </ul>
      </section>
    `,
  };
}

async function renderRoute(route, options = {}) {
  const token = ++state.renderToken;
  state.route = route;
  if (!options.background) renderLoading(route.view === "home" ? "Chargement du Codex…" : "Chargement de la fiche…");

  if (route.invalid) {
    commitView({
      title: "Lien invalide",
      breadcrumbs: [{ label: "Lien invalide" }],
      html: renderError("Ce lien ne correspond plus à une fiche du Codex.", "Lien invalide"),
    }, token, options);
    return;
  }

  try {
    let model;
    switch (route.view) {
      case "home":
        model = homeModel();
        break;
      case "characters":
        model = await charactersModel();
        break;
      case "mechanics":
        model = await mechanicsModel();
        break;
      case "character":
      case "entity":
        if (!route.id) throw new ArtifactError("Identifiant absent", 404);
        model = characterModel(await ensureCharacter(route.id));
        break;
      case "ability": {
        if (!route.id) throw new ArtifactError("Identifiant absent", 404);
        const context = await ensureAbilityContext(route.id);
        model = abilityModel(context.shard, context.ability);
        break;
      }
      case "effect":
      case "mechanic":
        if (!route.id) throw new ArtifactError("Identifiant absent", 404);
        model = await mechanicModel(route);
        break;
      case "operation":
        if (!route.id) throw new ArtifactError("Identifiant absent", 404);
        model = operationModel(await ensureOperationContext(route.id));
        break;
      case "search":
        model = await searchModel(route);
        break;
      default:
        throw new ArtifactError("Vue inconnue", 404);
    }
    commitView(model, token, options);
  } catch (error) {
    if (token !== state.renderToken) return;
    const missing = error?.status === 404;
    commitView({
      title: missing ? "Fiche indisponible" : "Erreur du Codex",
      breadcrumbs: [{ label: missing ? "Fiche indisponible" : "Erreur" }],
      html: renderError(
        missing
          ? "Cette fiche n’est pas disponible dans la génération actuelle."
          : "Impossible de charger les données du Codex.",
        missing ? "Fiche indisponible" : "Chargement impossible"
      ),
    }, token, options);
  }
}

function renderCurrentPreservingScroll() {
  const scrollY = window.scrollY;
  return renderRoute(state.route, {
    background: true,
    preserveScroll: true,
    restoreScroll: scrollY,
  });
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, 2200);
}

async function copyCurrentLink() {
  const url = window.location.href;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      throw new Error("Clipboard API indisponible");
    }
  } catch (_) {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand?.("copy");
    textarea.remove();
    if (!copied) {
      window.prompt("Copie ce lien :", url);
      return;
    }
  }
  showToast("Lien copié");
}

async function shareCurrent(title) {
  const data = { title: title || document.title, url: window.location.href };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyCurrentLink();
}

function renderFilterDraft() {
  const context = state.activeMechanicContext;
  if (!context || !state.filterDraft) return;
  dom.filterSheetContent.innerHTML = renderFilterControls(
    state.filterDraft,
    context.rawRecords,
    true
  );
}

function openFilterSheet(trigger) {
  if (!state.activeMechanicContext) return;
  state.filterReturnFocus = trigger || document.activeElement;
  state.filterDraft = { ...state.route.filters };
  renderFilterDraft();
  dom.filterSheet.hidden = false;
  document.body.dataset.codexOverflow = document.body.style.overflow || "";
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    dom.filterSheet.querySelector("[data-filter-close]")?.focus();
  });
}

function closeFilterSheet() {
  if (dom.filterSheet.hidden) return;
  dom.filterSheet.hidden = true;
  document.body.style.overflow = document.body.dataset.codexOverflow || "";
  delete document.body.dataset.codexOverflow;
  const returnFocus = state.filterReturnFocus;
  state.filterReturnFocus = null;
  state.filterDraft = null;
  returnFocus?.focus?.();
}

async function applyFilter(name, value, draft = false) {
  const target = draft ? state.filterDraft : state.route.filters;
  if (!target) return;
  target[name] = value;
  if (name === "mode" && value === "all") target.side = "all";
  if (draft) {
    renderFilterDraft();
    return;
  }
  await navigate(
    { ...state.route, filters: { ...target } },
    "replace",
    { preserveScroll: true, focusMain: false }
  );
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (action === "more-characters") {
    state.charactersVisible += PAGE_SIZE;
    await renderCurrentPreservingScroll();
    return;
  }
  if (action === "more-related") {
    state.relatedVisible += PAGE_SIZE;
    await renderCurrentPreservingScroll();
    return;
  }
  if (action === "toggle-technical-entities") {
    state.showTechnicalEntities = !state.showTechnicalEntities;
    await renderCurrentPreservingScroll();
    return;
  }
  if (action === "more-mechanics") {
    state.mechanicsVisible += PAGE_SIZE;
    await renderCurrentPreservingScroll();
    return;
  }
  if (action === "more-technical-mechanics") {
    state.technicalMechanicsVisible += PAGE_SIZE;
    await renderCurrentPreservingScroll();
    return;
  }
  if (action === "toggle-technical-mechanics") {
    state.showTechnicalMechanics = !state.showTechnicalMechanics;
    await renderCurrentPreservingScroll();
    return;
  }
  if (action === "more-search") {
    state.searchVisible += SEARCH_PAGE_SIZE;
    await renderCurrentPreservingScroll();
    return;
  }
  if (action === "focus-search") {
    dom.searchInput.focus();
    updateSearchPreview();
    return;
  }
  if (action === "share") {
    await shareCurrent(button.dataset.shareTitle || document.title);
    return;
  }
  if (action === "open-filters") {
    openFilterSheet(button);
    return;
  }
  if (action === "reset-filters") {
    await navigate(
      { ...state.route, filters: { ...FILTER_DEFAULTS } },
      "replace",
      { preserveScroll: true, focusMain: false }
    );
  }
}

function showImageFailureNotice() {
  if (state.imageFailureShown) return;
  state.imageFailureShown = true;
  const notice = document.createElement("div");
  notice.id = "codexImageNotice";
  notice.className = "codexNotice codexNotice--warning";
  notice.setAttribute("role", "status");
  notice.textContent = "Les images officielles sont indisponibles. Les données restent consultables.";
  dom.main.before(notice);
}

function bindEvents() {
  dom.back.addEventListener("click", () => {
    closeSearchPanel();
    if (currentDepth() > 0) {
      history.back();
      return;
    }
    if (state.route.view !== "home") {
      navigate({ view: "home" }, "replace");
      return;
    }
    window.location.href = "./home.html";
  });

  dom.searchInput.addEventListener("input", scheduleSearchPreview);
  dom.searchInput.addEventListener("focus", () => {
    if (normalizeSearch(dom.searchInput.value).replace(/ /g, "").length >= 2) {
      scheduleSearchPreview();
    } else {
      renderSearchHint();
      ensureSearchIndex().catch(() => {});
    }
  });
  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchResult(state.searchActiveIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchResult(state.searchActiveIndex - 1);
    } else if (event.key === "Enter" && state.searchActiveIndex >= 0) {
      event.preventDefault();
      dom.searchResults
        .querySelector(`[data-search-index="${state.searchActiveIndex}"]`)
        ?.click();
    } else if (event.key === "Escape") {
      closeSearchPanel();
      dom.searchInput.blur();
    }
  });

  dom.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = dom.searchInput.value.trim();
    if (normalizeSearch(query).replace(/ /g, "").length < 2) {
      renderSearchHint();
      return;
    }
    closeSearchPanel();
    dom.searchInput.blur();
    await navigate({ view: "search", q: query }, "replace", { focusMain: true });
  });

  dom.searchClear.addEventListener("click", async () => {
    window.clearTimeout(state.searchTimer);
    dom.searchInput.value = "";
    dom.searchClear.hidden = true;
    dom.searchStatus.textContent = "";
    closeSearchPanel();
    if (state.route.view === "search") {
      await navigate({ view: "home" }, "replace", { focusMain: false });
    }
    dom.searchInput.focus();
  });

  document.addEventListener("click", async (event) => {
    const link = event.target.closest("a[data-codex-link]");
    if (link) {
      const url = new URL(link.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname.split("/").pop() === "codex.html"
      ) {
        event.preventDefault();
        closeSearchPanel();
        dom.searchInput.blur();
        await navigate(parseRoute(url.search), "push");
        return;
      }
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.preventDefault();
      await handleAction(actionButton);
      return;
    }

    if (event.target.closest("[data-filter-close]")) {
      event.preventDefault();
      closeFilterSheet();
      return;
    }

    if (!event.target.closest("#codexSearchForm")) closeSearchPanel();
  });

  document.addEventListener("change", async (event) => {
    const control = event.target.closest("[data-filter], [data-filter-draft]");
    if (!control) return;
    const draft = control.hasAttribute("data-filter-draft");
    const name = draft ? control.dataset.filterDraft : control.dataset.filter;
    const value = control.type === "checkbox" ? control.checked : control.value;
    await applyFilter(name, value, draft);
  });

  dom.filterApply.addEventListener("click", async () => {
    if (!state.filterDraft) return;
    const filters = { ...state.filterDraft };
    closeFilterSheet();
    await navigate(
      { ...state.route, filters },
      "replace",
      { preserveScroll: true, focusMain: false }
    );
  });

  dom.filterSheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFilterSheet();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dom.filterSheet.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]'
    )].filter((element) => !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.hasAttribute("data-codex-image")) return;
    image.hidden = true;
    const fallback = image.parentElement?.querySelector(
      ".codexPortraitFallback, .codexAbilityFallback"
    );
    if (fallback) fallback.hidden = false;
    showImageFailureNotice();
  }, true);

  window.addEventListener("popstate", (event) => {
    closeFilterSheet();
    closeSearchPanel();
    const route = parseRoute(window.location.search);
    state.route = route;
    if (route.view === "search") {
      dom.searchInput.value = route.q;
      dom.searchClear.hidden = !route.q;
    }
    renderRoute(route, {
      restoreScroll: Number(event.state?.scrollY || 0),
      focusMain: false,
    });
  });

  let scrollFrame = 0;
  window.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      saveScrollState();
    });
  }, { passive: true });

  window.addEventListener("pagehide", saveScrollState);
  window.addEventListener("losp:auth-ready", (event) => {
    if (event.detail?.ok !== false) return;
    const token = ++state.renderToken;
    commitView({
      title: "Session expirée",
      breadcrumbs: [{ label: "Session expirée" }],
      html: renderError(
        "Ta session a expiré. Reconnecte-toi pour revenir à cette fiche.",
        "Session expirée",
        false
      ),
    }, token);
  });
}

async function checkFreshness() {
  try {
    const publisher = await fetchJson(PUBLISHER_MANIFEST, { cache: "no-cache" });
    const builtFrom = state.bootstrap?.source?.publisherPayloadSetChecksum;
    if (builtFrom && publisher.currentPayloadSetChecksum && builtFrom !== publisher.currentPayloadSetChecksum) {
      dom.staleNotice.hidden = false;
    }
  } catch (_) {
    // Le Codex reste utilisable lorsque le manifeste amont est temporairement indisponible.
  }
}

async function initialize() {
  bindEvents();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  try {
    const manifestUrl = new URL("manifest.json", new URL(DATA_ROOT, window.location.href));
    state.manifest = await fetchJson(manifestUrl.href, { cache: "no-cache" });
    if (
      state.manifest?.artifactType !== "msf_capabilities_explorer_publication" ||
      !state.manifest.currentPath ||
      String(state.manifest.currentPath).includes("..")
    ) {
      throw new ArtifactError("Manifeste du Codex invalide");
    }
    const rootUrl = new URL(DATA_ROOT, window.location.href);
    state.generationBase = new URL(state.manifest.currentPath, rootUrl);
    if (!state.generationBase.pathname.startsWith(rootUrl.pathname)) {
      throw new ArtifactError("Chemin de génération invalide");
    }
    state.bootstrap = await fetchJson(generationUrl(state.manifest.bootstrap.path));
    if (
      state.bootstrap?.artifactType !== "codex_bootstrap" ||
      state.bootstrap.compatibility?.operationsJsonBrowserDependency !== false
    ) {
      throw new ArtifactError("Bootstrap du Codex invalide");
    }

    const initialState = history.state || {};
    history.replaceState({
      ...initialState,
      codex: true,
      codexDepth: Number(initialState.codexDepth || 0),
      scrollY: Number(initialState.scrollY || 0),
    }, "", window.location.href);

    state.route = parseRoute(window.location.search);
    if (state.route.view === "search" && state.route.q) {
      dom.searchInput.value = state.route.q;
      dom.searchClear.hidden = false;
    }
    await renderRoute(state.route, {
      restoreScroll: Number(history.state?.scrollY || 0),
      focusMain: false,
    });
    checkFreshness();
  } catch (_) {
    ++state.renderToken;
    titleForPage("Chargement impossible");
    setBreadcrumbs([]);
    dom.main.innerHTML = renderError(
      "Impossible de charger les données du Codex.",
      "Chargement impossible",
      false
    );
  }
}

initialize();
