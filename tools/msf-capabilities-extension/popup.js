import {
  sendCapabilitiesUpdate,
  WorkerUpdateError
} from "./worker-client.mjs";

const TARGET_HOST = "webplayable.m3.scopelypv.com";
const PASSWORD_STORAGE_KEY = "msfCapabilitiesUploadPassword";

const analyzeButton = document.querySelector("#analyzeButton");
const downloadButton = document.querySelector("#downloadButton");
const forgetPasswordButton = document.querySelector("#forgetPasswordButton");
const passwordInput = document.querySelector("#uploadPassword");
const rememberPasswordInput = document.querySelector("#rememberPassword");
const status = document.querySelector("#status");
const report = document.querySelector("#report");

const reportFields = {
  gameVersion: document.querySelector("#gameVersion"),
  gameBuild: document.querySelector("#gameBuild"),
  chunkCount: document.querySelector("#chunkCount"),
  databaseSize: document.querySelector("#databaseSize")
};

let latestDatabase = null;

const setStatus = (message, kind) => {
  status.textContent = message;
  status.dataset.kind = kind;
};

const setBusy = (busy, label = "Mettre à jour les capacités") => {
  analyzeButton.disabled = busy;
  passwordInput.disabled = busy;
  rememberPasswordInput.disabled = busy;
  forgetPasswordButton.disabled = busy;
  analyzeButton.textContent = label;
};

const formatBytes = byteLength =>
  new Intl.NumberFormat("fr-FR", {
    style: "unit",
    unit: "byte",
    unitDisplay: "long",
    maximumFractionDigits: 0
  }).format(byteLength);

const base64ToBytes = base64 => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const clearReport = () => {
  latestDatabase = null;
  report.hidden = true;
};

const showReport = result => {
  reportFields.gameVersion.textContent = result.version || "Non détectée";
  reportFields.gameBuild.textContent = result.build || "Non détecté";
  reportFields.chunkCount.textContent = String(result.chunkCount);
  reportFields.databaseSize.textContent = formatBytes(result.byteLength);
  report.hidden = false;
};

const loadSavedPassword = async () => {
  const stored = await chrome.storage.local.get(PASSWORD_STORAGE_KEY);
  const savedPassword = stored[PASSWORD_STORAGE_KEY];

  if (typeof savedPassword !== "string" || savedPassword.length === 0) {
    return;
  }

  passwordInput.value = savedPassword;
  rememberPasswordInput.checked = true;
  forgetPasswordButton.hidden = false;
};

const persistPassword = async password => {
  if (rememberPasswordInput.checked) {
    await chrome.storage.local.set({
      [PASSWORD_STORAGE_KEY]: password
    });
    forgetPasswordButton.hidden = false;
    return;
  }

  await chrome.storage.local.remove(PASSWORD_STORAGE_KEY);
  forgetPasswordButton.hidden = true;
  passwordInput.value = "";
};

const forgetSavedPassword = async () => {
  await chrome.storage.local.remove(PASSWORD_STORAGE_KEY);
  passwordInput.value = "";
  rememberPasswordInput.checked = false;
  forgetPasswordButton.hidden = true;
  passwordInput.focus();
  setStatus(
    "Le mot de passe mémorisé a été effacé de ce profil Chrome.",
    "success"
  );
};

const getActiveTabId = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab || !Number.isInteger(tab.id)) {
    throw new Error("Impossible d’identifier l’onglet actif.");
  }

  return tab.id;
};

const getGameFrames = async tabId => {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });

  return (frames || []).filter(frame => {
    try {
      return new URL(frame.url).hostname === TARGET_HOST;
    } catch {
      return false;
    }
  });
};

async function extractCombatDatabase() {
  const DB_NAME = "/idbfs";
  const STORE_NAME = "FILE_DATA";
  const CHUNK_PATTERN = /\/Config\/combat_data\.db\/(\d+)$/i;
  const MAX_DATABASE_BYTES = 45 * 1024;

  const describeError = error =>
    error instanceof Error ? error.message : String(error);

  const openExistingDatabase = (name, version) =>
    new Promise((resolve, reject) => {
      const request = Number.isInteger(version)
        ? indexedDB.open(name, version)
        : indexedDB.open(name);

      request.onupgradeneeded = () => {
        request.transaction?.abort();
        reject(
          new Error(
            "Ouverture annulée pour garantir qu’aucune base ne soit créée ou modifiée."
          )
        );
      };

      request.onerror = () =>
        reject(request.error || new Error("Ouverture IndexedDB impossible."));

      request.onblocked = () =>
        reject(new Error("La base IndexedDB est temporairement bloquée."));

      request.onsuccess = () => resolve(request.result);
    });

  const getAllKeys = database =>
    new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAllKeys();

      request.onerror = () =>
        reject(request.error || new Error("Lecture des clés impossible."));
      request.onsuccess = () => resolve(request.result);
      transaction.onabort = () =>
        reject(transaction.error || new Error("Transaction de lecture annulée."));
    });

  const getRecord = (database, key) =>
    new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);

      request.onerror = () =>
        reject(request.error || new Error("Lecture d’un morceau impossible."));
      request.onsuccess = () => resolve(request.result);
      transaction.onabort = () =>
        reject(transaction.error || new Error("Transaction de lecture annulée."));
    });

  const toBytes = async record => {
    let value = record;

    for (const property of ["contents", "data"]) {
      if (
        value &&
        typeof value === "object" &&
        Object.prototype.hasOwnProperty.call(value, property)
      ) {
        value = value[property];
        break;
      }
    }

    if (value instanceof Blob) {
      return new Uint8Array(await value.arrayBuffer());
    }

    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }

    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength
      );
    }

    if (Array.isArray(value)) {
      return Uint8Array.from(value);
    }

    if (typeof value === "string") {
      return new TextEncoder().encode(value);
    }

    throw new Error("Un morceau de combat_data.db utilise un format inconnu.");
  };

  const bytesToBase64 = bytes => {
    const blockSize = 0x8000;
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += blockSize) {
      const block = bytes.subarray(offset, offset + blockSize);
      binary += String.fromCharCode(...block);
    }

    return btoa(binary);
  };

  const detectBuild = () => {
    const pattern = /\/((?:\d+_)+\d+)\/(\d+)\/Build(?:\/|["'?#]|$)/i;

    const inspect = (candidate, source) => {
      if (typeof candidate !== "string") return null;

      const match = candidate.match(pattern);

      if (!match) return null;

      return {
        version: match[1],
        build: match[2],
        buildUrl: `/${match[1]}/${match[2]}/Build`,
        versionSource: source
      };
    };

    const directMatch = inspect(globalThis.buildUrl, "window.buildUrl");
    if (directMatch) return directMatch;

    for (const script of document.scripts) {
      const sourceMatch = inspect(script.src, "URL d’un script");
      if (sourceMatch) return sourceMatch;

      const inlineMatch = inspect(script.textContent, "script intégré");
      if (inlineMatch) return inlineMatch;
    }

    for (const entry of performance.getEntriesByType("resource")) {
      const resourceMatch = inspect(entry.name, "ressource chargée");
      if (resourceMatch) return resourceMatch;
    }

    return inspect(document.documentElement?.innerHTML, "document HTML");
  };

  try {
    if (typeof indexedDB.databases !== "function") {
      throw new Error(
        "Cette version de Chrome ne permet pas d’inventorier les bases IndexedDB."
      );
    }

    const databaseInfo = (await indexedDB.databases()).find(
      info => info.name === DB_NAME
    );

    if (!databaseInfo) {
      throw new Error(
        "La base /idbfs est introuvable. Attends la fin du chargement de MSF puis réessaie."
      );
    }

    const database = await openExistingDatabase(DB_NAME, databaseInfo.version);

    try {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        throw new Error(
          "Le magasin FILE_DATA est introuvable dans /idbfs. Vérifie que MSF est complètement chargé."
        );
      }

      const allKeys = await getAllKeys(database);

      const chunkEntries = allKeys
        .map(originalKey => {
          const match = String(originalKey).match(CHUNK_PATTERN);

          return match
            ? {
                originalKey,
                index: Number(match[1])
              }
            : null;
        })
        .filter(Boolean)
        .sort((left, right) => left.index - right.index);

      if (chunkEntries.length === 0) {
        throw new Error(
          "Aucun morceau de /Config/combat_data.db n’a été trouvé. Attends la fin du chargement du jeu."
        );
      }

      const hasMissingChunk = chunkEntries.some(
        (entry, position) => entry.index !== position
      );

      if (hasMissingChunk) {
        throw new Error(
          "Les morceaux de combat_data.db sont incomplets ou ne commencent pas à zéro."
        );
      }

      const chunks = [];
      let totalSize = 0;

      for (const entry of chunkEntries) {
        const bytes = await toBytes(
          await getRecord(database, entry.originalKey)
        );

        totalSize += bytes.byteLength;

        if (totalSize > MAX_DATABASE_BYTES) {
          throw new Error(
            "La base reconstruite dépasse la limite actuelle de 45 Kio du pipeline."
          );
        }

        chunks.push({
          index: entry.index,
          bytes
        });
      }

      const databaseBytes = new Uint8Array(totalSize);
      let offset = 0;

      for (const chunk of chunks) {
        databaseBytes.set(chunk.bytes, offset);
        offset += chunk.bytes.byteLength;
      }

      const header = new TextDecoder()
        .decode(databaseBytes.subarray(0, 16));

      if (!header.startsWith("SQLite format 3")) {
        throw new Error(
          "Le fichier reconstruit n’a pas l’en-tête d’une base SQLite valide."
        );
      }

      const buildMetadata = detectBuild();

      return {
        ok: true,
        databaseBase64: bytesToBase64(databaseBytes),
        byteLength: databaseBytes.byteLength,
        chunkCount: chunks.length,
        chunkSizes: chunks.map(chunk => chunk.bytes.byteLength),
        version: buildMetadata?.version || null,
        build: buildMetadata?.build || null,
        buildUrl: buildMetadata?.buildUrl || null,
        versionSource: buildMetadata?.versionSource || null,
        frameOrigin: location.origin
      };
    } finally {
      database.close();
    }
  } catch (error) {
    return {
      ok: false,
      error: describeError(error)
    };
  }
}

const updateCapabilities = async () => {
  const uploadPassword = passwordInput.value;

  if (uploadPassword.length === 0) {
    setStatus("Saisis d’abord le mot de passe d’upload.", "error");
    passwordInput.focus();
    return;
  }

  clearReport();
  setBusy(true, "Lecture de MSF…");
  setStatus("Recherche du frame Unity de MSF…", "working");

  try {
    const tabId = await getActiveTabId();
    const frames = await getGameFrames(tabId);

    if (frames.length === 0) {
      throw new Error(
        "Frame du jeu introuvable. Ouvre MSF dans cet onglet et attends son chargement complet."
      );
    }

    let result = null;
    const frameErrors = [];

    for (const frame of frames) {
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: {
            tabId,
            frameIds: [frame.frameId]
          },
          world: "MAIN",
          func: extractCombatDatabase
        });

        if (!injection?.result) {
          throw new Error("Le frame n’a renvoyé aucun résultat.");
        }

        if (!injection.result.ok) {
          throw new Error(injection.result.error || "Analyse impossible.");
        }

        result = injection.result;
        break;
      } catch (error) {
        frameErrors.push(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (!result) {
      throw new Error(
        frameErrors[0] || "Aucun frame MSF exploitable n’a été trouvé."
      );
    }

    latestDatabase = base64ToBytes(result.databaseBase64);

    if (latestDatabase.byteLength !== result.byteLength) {
      throw new Error(
        "La taille du fichier a changé pendant son transfert vers l’extension."
      );
    }

    showReport(result);

    if (!result.version) {
      throw new Error(
        "Base SQLite reconstruite, mais la version du jeu n’a pas été détectée. L’envoi est interrompu ; le téléchargement de secours reste disponible."
      );
    }

    setBusy(true, "Envoi au Worker…");
    setStatus(
      "Base SQLite reconstruite. Envoi sécurisé vers le Worker LoSP…",
      "working"
    );

    const workerResult = await sendCapabilitiesUpdate({
      gameVersion: result.version,
      gameBuild: result.build,
      databaseBase64: result.databaseBase64,
      uploadPassword
    });

    let passwordWasPersisted = true;

    try {
      await persistPassword(uploadPassword);
    } catch {
      passwordWasPersisted = false;
    }

    const versionLabel = workerResult.gameVersion
      ? ` pour MSF ${workerResult.gameVersion.replaceAll("_", ".")}`
      : "";

    setStatus(
      passwordWasPersisted
        ? `Mise à jour envoyée${versionLabel}. GitHub vérifie maintenant les données officielles.`
        : `Mise à jour envoyée${versionLabel}, mais Chrome n’a pas pu mémoriser le mot de passe.`,
      passwordWasPersisted ? "success" : "warning"
    );
  } catch (error) {
    if (error instanceof WorkerUpdateError && error.status === 401) {
      passwordInput.focus();
      passwordInput.select();
    }

    setStatus(
      error instanceof Error ? error.message : String(error),
      "error"
    );
  } finally {
    setBusy(false);
  }
};

const downloadDatabase = () => {
  if (!latestDatabase) {
    setStatus("Aucune base n’est disponible au téléchargement.", "error");
    return;
  }

  const url = URL.createObjectURL(
    new Blob([latestDatabase], { type: "application/vnd.sqlite3" })
  );
  const link = document.createElement("a");

  link.href = url;
  link.download = "combat_data.db";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("combat_data.db a été téléchargé.", "success");
};

const initialize = async () => {
  if (typeof chrome.storage.local.setAccessLevel === "function") {
    try {
      await chrome.storage.local.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS"
      });
    } catch {
      // Aucun content script n’est déclaré ; ce durcissement reste optionnel.
    }
  }

  try {
    await loadSavedPassword();
    (passwordInput.value ? analyzeButton : passwordInput).focus();
  } catch {
    setStatus(
      "Prêt, mais Chrome n’a pas pu relire le mot de passe mémorisé.",
      "warning"
    );
  }
};

analyzeButton.addEventListener("click", updateCapabilities);
downloadButton.addEventListener("click", downloadDatabase);
passwordInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !analyzeButton.disabled) {
    updateCapabilities();
  }
});
forgetPasswordButton.addEventListener("click", () => {
  forgetSavedPassword().catch(() => {
    setStatus(
      "Chrome n’a pas pu effacer le mot de passe mémorisé.",
      "error"
    );
  });
});

initialize();
