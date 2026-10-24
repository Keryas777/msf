// Navigation des deux vues Evolution sans rechargement de document.
// Chaque vue conserve son DOM, ses filtres et son initialisation JS en memoire.
(() => {
  "use strict";

  const MAIN = "main.app";
  const TABS = ".evolutionTabs .evolutionTab";
  const names = new Set(["evolution.html", "evolution-classement.html"]);
  const directory = new URL("./", window.location.href).pathname;

  function pageKey(url) {
    if (url.origin !== window.location.origin || !url.pathname.startsWith(directory)) return null;
    const name = url.pathname.slice(directory.length);
    return names.has(name) ? url.pathname : null;
  }

  const initialKey = pageKey(new URL(window.location.href));
  const initialMain = document.querySelector(MAIN);
  if (!initialKey || !initialMain) return;

  const pages = new Map([[initialKey, {
    main: initialMain,
    bodyClass: document.body.className,
    title: document.title,
    styles: [],
    scripts: [],
    initialized: true,
    scrollY: 0,
  }]]);
  const pendingPages = new Map();
  const styles = new Map(
    [...document.querySelectorAll('link[rel="stylesheet"][href]')]
      .map((link) => [link.href, Promise.resolve()])
  );
  const loadedScripts = new Set(
    [...document.querySelectorAll("script[src]")].map((script) => script.src)
  );
  let activeKey = initialKey;
  let navigationQueue = Promise.resolve();

  function preparePage(url) {
    const key = pageKey(url);
    if (!key) return Promise.reject(new Error("Onglet Evolution inconnu"));
    if (pages.has(key)) return Promise.resolve(pages.get(key));
    if (pendingPages.has(key)) return pendingPages.get(key);

    const pending = (async () => {
      const response = await fetch(url.href, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Chargement Evolution : HTTP " + response.status);

      const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
      const main = parsed.querySelector(MAIN);
      if (!main || !parsed.querySelector(TABS)) {
        throw new Error("Structure de page Evolution introuvable");
      }

      const entry = {
        main: document.importNode(main, true),
        bodyClass: parsed.body.className,
        title: parsed.title,
        styles: [...parsed.querySelectorAll('link[rel="stylesheet"][href]')]
          .map((link) => new URL(link.getAttribute("href"), url.href).href),
        scripts: [...parsed.querySelectorAll("script[src][defer]")]
          .map((script) => new URL(script.getAttribute("src"), url.href).href),
        initialized: false,
        scrollY: 0,
      };
      pages.set(key, entry);
      return entry;
    })().finally(() => pendingPages.delete(key));

    pendingPages.set(key, pending);
    return pending;
  }

  function loadStyle(url) {
    if (styles.has(url)) return styles.get(url);
    const pending = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = resolve;
      link.onerror = () => {
        link.remove();
        reject(new Error("CSS Evolution indisponible : " + url));
      };
      document.head.appendChild(link);
    }).catch((error) => {
      styles.delete(url);
      throw error;
    });
    styles.set(url, pending);
    return pending;
  }

  async function loadScripts(entry) {
    if (entry.initialized) return;
    for (const url of entry.scripts) {
      if (loadedScripts.has(url)) continue;
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = false;
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          reject(new Error("JavaScript Evolution indisponible : " + url));
        };
        document.body.appendChild(script);
      });
      loadedScripts.add(url);
    }
    entry.initialized = true;
  }

  async function showPage(url, pushHistory) {
    const key = pageKey(url);
    if (!key) return;
    if (key === activeKey) {
      await loadScripts(pages.get(key)); // Autoriser un nouvel essai après une erreur réseau.
      document.querySelector('#evolutionNavigationError')?.remove();
      return;
    }

    const entry = await preparePage(url);
    await Promise.all(entry.styles.map(loadStyle));

    const previous = pages.get(activeKey);
    previous.scrollY = window.scrollY;
    document.querySelector(MAIN).replaceWith(entry.main);
    document.body.className = entry.bodyClass;
    document.title = entry.title;
    activeKey = key;

    if (pushHistory) window.history.pushState({ evolutionTab: true }, "", url.href);

    // Executer les scripts uniquement lorsque leur vue est dans le document :
    // les deux moteurs existants utilisent des selecteurs ID identiques.
    await loadScripts(entry);
    document.querySelector('#evolutionNavigationError')?.remove();
    window.scrollTo(0, entry.scrollY);
  }

  function displayError(error) {
    console.error("Navigation Evolution :", error);
    const nav = document.querySelector(".evolutionTabs");
    if (!nav) return;
    let message = document.querySelector("#evolutionNavigationError");
    if (!message) {
      message = document.createElement("p");
      message.id = "evolutionNavigationError";
      message.className = "card";
      message.setAttribute("role", "alert");
      nav.insertAdjacentElement("afterend", message);
    }
    message.textContent = "Impossible d’ouvrir cet onglet pour le moment.";
  }

  function navigate(url, pushHistory) {
    // Serialiser les transitions : un script ne doit jamais s'initialiser
    // pendant que son DOM est detache, meme en cas de tapotements rapides.
    navigationQueue = navigationQueue.then(
      () => showPage(url, pushHistory)
    ).catch(displayError);
  }

  document.addEventListener("click", (event) => {
    const tab = event.target.closest && event.target.closest(TABS);
    if (!tab || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        (tab.target && tab.target !== "_self")) return;

    const url = new URL(tab.href);
    if (!pageKey(url)) return;
    event.preventDefault();
    navigate(url, true);
  });

  window.addEventListener("popstate", () => {
    const url = new URL(window.location.href);
    if (pageKey(url)) navigate(url, false);
  });

  // Preparer tranquillement l'autre vue pour que le premier changement
  // d'onglet ne dependa plus du telechargement de son HTML et de ses CSS.
  const otherTab = [...document.querySelectorAll(TABS)]
    .find((tab) => !tab.classList.contains("is-active"));
  if (otherTab) {
    const prefetch = () => {
      const url = new URL(otherTab.href);
      preparePage(url)
        .then((entry) => Promise.all(entry.styles.map(loadStyle)))
        .catch(() => {}); // En cas de hors-ligne, reessayer au clic.
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(prefetch, { timeout: 2500 });
    } else {
      window.setTimeout(prefetch, 500);
    }
  }
})();