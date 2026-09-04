// worker.js — Cloudflare Worker
//
// Routes acceptées :
//   /zeus
//   /kronos
//   /dionysos
//   /poseidon
//   /hades
//   /athena
//
// Types d’upload :
//   roster -> conversion CSV vers docs/data/rosters_{alliance}.json
//   infos  -> conversion CSV vers docs/data/infos_{alliance}.json
//
// En-têtes attendus depuis les pages HTML :
//   x-upload-password
//   x-upload-type
//   x-upload-filename

const ALLIANCE_META = Object.freeze({
  zeus: Object.freeze({
    key: "zeus",
    name: "Zeus",
  }),

  kronos: Object.freeze({
    key: "kronos",
    name: "Kronos",
  }),

  dionysos: Object.freeze({
    key: "dionysos",
    name: "Dionysos",
  }),

  poseidon: Object.freeze({
    key: "poseidon",
    name: "Poséidon",
  }),

  hades: Object.freeze({
    key: "hades",
    name: "Hadès",
  }),

  athena: Object.freeze({
    key: "athena",
    name: "Athéna",
  }),
});

const ALLIANCES = new Set(
  Object.keys(ALLIANCE_META)
);

const UPLOAD_TYPES = Object.freeze({
  roster: Object.freeze({
    filenamePattern: /rosters?/i,
    expectedFilename:
      'Le nom du fichier doit contenir "roster" ou "rosters".',
  }),

  infos: Object.freeze({
    filenamePattern: /infos?/i,
    expectedFilename:
      'Le nom du fichier doit contenir "info" ou "infos".',
  }),
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return textResponse(
        "MSF upload endpoint ready.",
        200,
        corsHeaders
      );
    }

    try {
      validateEnvironment(env);

      const password = request.headers.get(
        "x-upload-password"
      );

      if (
        !password ||
        password !== env.UPLOAD_PASSWORD
      ) {
        return jsonResponse(
          {
            ok: false,
            error: "Mot de passe incorrect.",
          },
          401,
          corsHeaders
        );
      }

      const alliance = getAllianceFromPath(
        url.pathname
      );

      if (!alliance) {
        return jsonResponse(
          {
            ok: false,
            error: "Alliance inconnue.",
          },
          400,
          corsHeaders
        );
      }

      /*
       * Compatibilité avec les anciennes pages :
       * si x-upload-type est absent, on considère
       * qu’il s’agit d’un roster.
       */
      const uploadType = normalizeUploadType(
        request.headers.get("x-upload-type")
      );

      if (
        !uploadType ||
        !UPLOAD_TYPES[uploadType]
      ) {
        return jsonResponse(
          {
            ok: false,
            alliance,
            error:
              'Type d’upload invalide. Valeurs autorisées : "roster" ou "infos".',
          },
          400,
          corsHeaders
        );
      }

      const uploadedFilename =
        decodeHeaderFilename(
          request.headers.get(
            "x-upload-filename"
          )
        );

      /*
       * Si le nom du fichier est présent,
       * il est obligatoirement contrôlé.
       *
       * Son absence reste temporairement acceptée
       * pour ne pas casser d’anciennes pages.
       */
      if (uploadedFilename) {
        const filenameValidation =
          validateFilename(
            uploadedFilename,
            uploadType
          );

        if (!filenameValidation.ok) {
          return jsonResponse(
            {
              ok: false,
              alliance,
              uploadType,
              filename: uploadedFilename,
              error:
                filenameValidation.error,
            },
            400,
            corsHeaders
          );
        }
      }

      const contentType = (
        request.headers.get("content-type") ||
        ""
      ).toLowerCase();

      if (
        contentType &&
        !contentType.includes("text/csv") &&
        !contentType.includes(
          "application/csv"
        ) &&
        !contentType.includes(
          "application/vnd.ms-excel"
        ) &&
        !contentType.includes(
          "text/plain"
        ) &&
        !contentType.includes(
          "application/octet-stream"
        )
      ) {
        return jsonResponse(
          {
            ok: false,
            alliance,
            uploadType,
            error:
              "Le fichier envoyé doit être un fichier CSV.",
          },
          415,
          corsHeaders
        );
      }

      const csvText = removeUtf8Bom(
        await request.text()
      );

      if (!csvText.trim()) {
        return jsonResponse(
          {
            ok: false,
            alliance,
            uploadType,
            error: "Le fichier CSV est vide.",
          },
          400,
          corsHeaders
        );
      }

      if (uploadType === "roster") {
        return await handleRosterUpload({
          csvText,
          alliance,
          uploadedFilename,
          env,
          corsHeaders,
        });
      }

      return await handleInfosUpload({
        csvText,
        alliance,
        uploadedFilename,
        env,
        corsHeaders,
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: String(
            error?.message || error
          ),
        },
        500,
        corsHeaders
      );
    }
  },
};

// ============================================================
// Traitement des uploads
// ============================================================

async function handleRosterUpload({
  csvText,
  alliance,
  uploadedFilename,
  env,
  corsHeaders,
}) {
  let payload;

  try {
    payload = parseRosterCSV(
      csvText,
      alliance
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        alliance,
        uploadType: "roster",
        filename:
          uploadedFilename || undefined,
        error: String(
          error?.message || error
        ),
      },
      400,
      corsHeaders
    );
  }

  if (!payload.length) {
    return jsonResponse(
      {
        ok: false,
        alliance,
        uploadType: "roster",
        filename:
          uploadedFilename || undefined,
        error:
          "Aucun joueur valide n’a été trouvé dans le fichier roster.",
      },
      400,
      corsHeaders
    );
  }

  const path =
    `docs/data/rosters_${alliance}.json`;

  const fileContent =
    `${JSON.stringify(payload, null, 2)}\n`;

  const githubResult =
    await writeGithubFile({
      env,
      path,
      content: fileContent,
      commitMessage:
        `Update ${alliance} rosters`,
    });

  if (!githubResult.ok) {
    return jsonResponse(
      {
        ok: false,
        alliance,
        uploadType: "roster",
        players: payload.length,
        file: path,
        filename:
          uploadedFilename || undefined,
        step: githubResult.step,
        githubStatus:
          githubResult.status,
        error: githubResult.error,
      },
      502,
      corsHeaders
    );
  }

  return jsonResponse(
    {
      ok: true,
      alliance,
      uploadType: "roster",
      players: payload.length,
      file: path,
      filename:
        uploadedFilename || undefined,
      githubStatus:
        githubResult.status,
      message:
        `Roster ${ALLIANCE_META[alliance].name} mis à jour avec succès.`,
    },
    200,
    corsHeaders
  );
}

async function handleInfosUpload({
  csvText,
  alliance,
  uploadedFilename,
  env,
  corsHeaders,
}) {
  let payload;

  try {
    payload = parseInfosCSV(
      csvText,
      alliance
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        alliance,
        uploadType: "infos",
        filename:
          uploadedFilename || undefined,
        error: String(
          error?.message || error
        ),
      },
      400,
      corsHeaders
    );
  }

  if (!payload.length) {
    return jsonResponse(
      {
        ok: false,
        alliance,
        uploadType: "infos",
        filename:
          uploadedFilename || undefined,
        error:
          "Aucun joueur valide n’a été trouvé dans le fichier Infos.",
      },
      400,
      corsHeaders
    );
  }

  const path =
    `docs/data/infos_${alliance}.json`;

  const fileContent =
    `${JSON.stringify(payload, null, 2)}\n`;

  const githubResult =
    await writeGithubFile({
      env,
      path,
      content: fileContent,
      commitMessage:
        `Update ${alliance} infos`,
    });

  if (!githubResult.ok) {
    return jsonResponse(
      {
        ok: false,
        alliance,
        uploadType: "infos",
        players: payload.length,
        file: path,
        filename:
          uploadedFilename || undefined,
        step: githubResult.step,
        githubStatus:
          githubResult.status,
        error: githubResult.error,
      },
      502,
      corsHeaders
    );
  }

  return jsonResponse(
    {
      ok: true,
      alliance,
      uploadType: "infos",
      players: payload.length,
      file: path,
      filename:
        uploadedFilename || undefined,
      githubStatus:
        githubResult.status,
      message:
        `Infos ${ALLIANCE_META[alliance].name} mises à jour avec succès.`,
    },
    200,
    corsHeaders
  );
}

// ============================================================
// Validation de l’alliance, du type et du nom du fichier
// ============================================================

function getAllianceFromPath(pathname) {
  const segments = String(
    pathname || ""
  )
    .toLowerCase()
    .split("/")
    .map((segment) =>
      segment.trim()
    )
    .filter(Boolean);

  for (const segment of segments) {
    if (ALLIANCES.has(segment)) {
      return segment;
    }
  }

  return "";
}

function normalizeUploadType(value) {
  const normalized = String(
    value || ""
  )
    .trim()
    .toLowerCase();

  if (!normalized) {
    return "roster";
  }

  if (
    normalized === "roster" ||
    normalized === "rosters"
  ) {
    return "roster";
  }

  if (
    normalized === "info" ||
    normalized === "infos"
  ) {
    return "infos";
  }

  return "";
}

function decodeHeaderFilename(value) {
  if (!value) {
    return "";
  }

  const filename = String(
    value
  ).trim();

  if (!filename) {
    return "";
  }

  try {
    return decodeURIComponent(
      filename
    );
  } catch {
    return filename;
  }
}

function validateFilename(
  filename,
  uploadType
) {
  const config =
    UPLOAD_TYPES[uploadType];

  if (!config) {
    return {
      ok: false,
      error:
        "Type de fichier inconnu.",
    };
  }

  const cleanFilename = String(
    filename || ""
  ).trim();

  if (!cleanFilename) {
    return {
      ok: false,
      error:
        "Le nom du fichier est manquant.",
    };
  }

  if (
    !cleanFilename
      .toLowerCase()
      .endsWith(".csv")
  ) {
    return {
      ok: false,
      error:
        "Le fichier doit avoir l’extension .csv.",
    };
  }

  if (
    !config.filenamePattern.test(
      cleanFilename
    )
  ) {
    return {
      ok: false,
      error:
        config.expectedFilename,
    };
  }

  return {
    ok: true,
    error: "",
  };
}

// ============================================================
// GitHub
// ============================================================

async function writeGithubFile({
  env,
  path,
  content,
  commitMessage,
}) {
  const branch =
    env.GH_BRANCH || "main";

  const baseUrl =
    `https://api.github.com/repos/` +
    `${encodeURIComponent(env.GH_OWNER)}/` +
    `${encodeURIComponent(env.GH_REPO)}/contents/` +
    path
      .split("/")
      .map((segment) =>
        encodeURIComponent(segment)
      )
      .join("/");

  const existingUrl =
    `${baseUrl}?ref=${encodeURIComponent(branch)}`;

  const githubHeaders = {
    Authorization:
      `Bearer ${env.GH_TOKEN}`,
    Accept:
      "application/vnd.github+json",
    "Content-Type":
      "application/json",
    "User-Agent":
      "msf-upload-worker",
    "X-GitHub-Api-Version":
      "2022-11-28",
  };

  let sha;
  let getExisting;

  try {
    getExisting = await fetch(
      existingUrl,
      {
        method: "GET",
        headers: githubHeaders,
      }
    );
  } catch (error) {
    return {
      ok: false,
      step:
        "github-get-existing",
      status: 0,
      error: {
        message: String(
          error?.message || error
        ),
      },
    };
  }

  if (getExisting.ok) {
    const existing =
      await getExisting.json();

    sha = existing?.sha;
  } else if (
    getExisting.status !== 404
  ) {
    const errorText =
      await getExisting.text();

    return {
      ok: false,
      step:
        "github-get-existing",
      status:
        getExisting.status,
      error:
        safeJsonMaybe(errorText),
    };
  }

  let putResponse;

  try {
    putResponse = await fetch(
      baseUrl,
      {
        method: "PUT",
        headers: githubHeaders,
        body: JSON.stringify({
          message: commitMessage,
          content:
            base64EncodeUtf8(content),
          branch,
          ...(sha ? { sha } : {}),
        }),
      }
    );
  } catch (error) {
    return {
      ok: false,
      step: "github-put",
      status: 0,
      error: {
        message: String(
          error?.message || error
        ),
      },
    };
  }

  const putText =
    await putResponse.text();

  if (!putResponse.ok) {
    return {
      ok: false,
      step: "github-put",
      status:
        putResponse.status,
      error:
        safeJsonMaybe(putText),
    };
  }

  return {
    ok: true,
    step: "github-put",
    status:
      putResponse.status,
    data:
      safeJsonMaybe(putText),
  };
}

function validateEnvironment(env) {
  const requiredVariables = [
    "UPLOAD_PASSWORD",
    "GH_OWNER",
    "GH_REPO",
    "GH_TOKEN",
  ];

  const missing =
    requiredVariables.filter(
      (key) =>
        !String(
          env?.[key] || ""
        ).trim()
    );

  if (missing.length) {
    throw new Error(
      `Variables Cloudflare manquantes : ${missing.join(", ")}`
    );
  }
}

// ============================================================
// Conversion du fichier Infos CSV vers JSON
// ============================================================

/**
 * Format MSF attendu :
 *
 * ID,Rank,Name,Icon,Frame,Level,Gear Tier,TCP,STP,
 * War MVP,Characters Collected,Roster Share,Days In Alliance
 *
 * Le JSON produit conserve exactement le contrat utilisé
 * actuellement par docs/data/infos.json :
 *
 * {
 *   name,
 *   alliance,
 *   tcp,
 *   war_mvp,
 *   icon,
 *   frame
 * }
 */
function parseInfosCSV(
  csvText,
  alliance
) {
  const rows = parseCsvRows(csvText)
    .filter((row) =>
      row.some(
        (cell) =>
          String(cell || "")
            .trim()
            .length > 0
      )
    );

  if (rows.length < 2) {
    throw new Error(
      "Le fichier Infos est vide ou ne contient aucune ligne de données."
    );
  }

  const header = rows[0].map(
    (value) =>
      String(value || "").trim()
  );

  const colIndex =
    buildColumnIndex(header);

  const idxName =
    requireColumn(
      colIndex,
      ["name"],
      "Name"
    );

  const idxIcon =
    requireColumn(
      colIndex,
      ["icon"],
      "Icon"
    );

  const idxFrame =
    requireColumn(
      colIndex,
      ["frame"],
      "Frame"
    );

  const idxTcp =
    requireColumn(
      colIndex,
      ["tcp"],
      "TCP"
    );

  const idxWarMvp =
    requireColumn(
      colIndex,
      [
        "warmvp",
        "warmvps",
      ],
      "War MVP"
    );

  const allianceLabel =
    ALLIANCE_META[alliance]?.name ||
    alliance;

  const byPlayer = new Map();

  for (
    let rowIndex = 1;
    rowIndex < rows.length;
    rowIndex++
  ) {
    const cols = rows[rowIndex];

    const name = String(
      cols[idxName] ?? ""
    ).trim();

    if (!name) {
      continue;
    }

    const playerKey =
      normalizeKey(name);

    if (!playerKey) {
      continue;
    }

    const player = {
      name,
      alliance: allianceLabel,
      tcp: toInt(
        cols[idxTcp]
      ),
      war_mvp: toInt(
        cols[idxWarMvp]
      ),
      icon: String(
        cols[idxIcon] ?? ""
      ).trim(),
      frame: String(
        cols[idxFrame] ?? ""
      ).trim(),
    };

    const previous =
      byPlayer.get(playerKey);

    if (!previous) {
      byPlayer.set(
        playerKey,
        player
      );

      continue;
    }

    /*
     * En cas de doublon dans le CSV :
     * - on garde la ligne au TCP le plus élevé ;
     * - à TCP égal, celle au War MVP le plus élevé.
     */
    if (
      player.tcp >
        previous.tcp ||
      (
        player.tcp ===
          previous.tcp &&
        player.war_mvp >
          previous.war_mvp
      )
    ) {
      byPlayer.set(
        playerKey,
        player
      );
    }
  }

  return Array.from(
    byPlayer.values()
  );
}

// ============================================================
// Conversion du roster CSV vers JSON
// ============================================================

/**
 * Format attendu :
 *
 * Name,Character Id,Level,Power,Stars,Red Stars,Gear Tier,
 * Basic,Special,Ultimate,Passive,ISO Class,ISO Matrix,
 * Striker,Fortifier,Healer,Raider,Skirmisher,
 * ISO Health,ISO Damage,ISO Armor,ISO Focus,ISO Resist
 */
function parseRosterCSV(
  csvText,
  alliance
) {
  const rows = parseCsvRows(csvText)
    .filter((row) =>
      row.some(
        (cell) =>
          String(cell || "")
            .trim()
            .length > 0
      )
    );

  if (rows.length < 2) {
    throw new Error(
      "Le fichier roster est vide ou ne contient aucune ligne de données."
    );
  }

  const header = rows[0].map(
    (value) =>
      String(value || "").trim()
  );

  const colIndex =
    buildColumnIndex(header);

  const idxName =
    requireColumn(
      colIndex,
      ["name"],
      "Name"
    );

  const idxChar =
    requireColumn(
      colIndex,
      [
        "characterid",
        "character",
      ],
      "Character Id"
    );

  const idxLevel =
    requireColumn(
      colIndex,
      ["level"],
      "Level"
    );

  const idxPower =
    requireColumn(
      colIndex,
      ["power"],
      "Power"
    );

  const idxGear =
    requireColumn(
      colIndex,
      [
        "geartier",
        "gear",
      ],
      "Gear Tier"
    );

  const idxIsoClass =
    requireColumn(
      colIndex,
      ["isoclass"],
      "ISO Class"
    );

  const idxIsoMatrix =
    requireColumn(
      colIndex,
      ["isomatrix"],
      "ISO Matrix"
    );

  const idxIsoFive = [
    requireColumn(
      colIndex,
      ["striker"],
      "Striker"
    ),

    requireColumn(
      colIndex,
      ["fortifier"],
      "Fortifier"
    ),

    requireColumn(
      colIndex,
      ["healer"],
      "Healer"
    ),

    requireColumn(
      colIndex,
      ["raider"],
      "Raider"
    ),

    requireColumn(
      colIndex,
      ["skirmisher"],
      "Skirmisher"
    ),
  ];

  const byPlayer = new Map();

  for (
    let rowIndex = 1;
    rowIndex < rows.length;
    rowIndex++
  ) {
    const cols = rows[rowIndex];

    const player = String(
      cols[idxName] ?? ""
    ).trim();

    const character = String(
      cols[idxChar] ?? ""
    ).trim();

    if (
      !player ||
      !character
    ) {
      continue;
    }

    const power =
      toInt(cols[idxPower]);

    const level =
      toInt(cols[idxLevel]);

    const gear =
      toInt(cols[idxGear]);

    const isoMax =
      computeIsoMaxFromFive(
        cols,
        idxIsoFive
      );

    const isoClass =
      normIsoClass(
        cols[idxIsoClass]
      );

    const isoColor =
      normIsoColor(
        cols[idxIsoMatrix]
      );

    const playerKey =
      normalizeKey(player);

    const characterKey =
      normalizeKey(character);

    if (
      !playerKey ||
      !characterKey
    ) {
      continue;
    }

    if (
      !byPlayer.has(playerKey)
    ) {
      byPlayer.set(
        playerKey,
        {
          alliance,
          player,
          playerKey,
          chars: {},
          iso: {},
        }
      );
    }

    const entry =
      byPlayer.get(playerKey);

    const previous =
      entry.chars[characterKey];

    const previousPower =
      previous &&
      typeof previous === "object"
        ? toInt(previous.power)
        : 0;

    if (
      power > previousPower
    ) {
      entry.chars[
        characterKey
      ] = {
        power,
        level,
        gear,
        isoMax,
      };

      if (
        isoClass ||
        isoColor
      ) {
        entry.iso[
          characterKey
        ] = {
          isoClass:
            isoClass || "",
          isoColor:
            isoColor || "",
        };
      } else {
        delete entry.iso[
          characterKey
        ];
      }

      continue;
    }

    if (
      power === previousPower &&
      previous &&
      typeof previous === "object"
    ) {
      previous.level = Math.max(
        toInt(previous.level),
        level
      );

      previous.gear = Math.max(
        toInt(previous.gear),
        gear
      );

      previous.isoMax = Math.max(
        toInt(previous.isoMax),
        isoMax
      );

      if (
        (
          isoClass ||
          isoColor
        ) &&
        !entry.iso[
          characterKey
        ]
      ) {
        entry.iso[
          characterKey
        ] = {
          isoClass:
            isoClass || "",
          isoColor:
            isoColor || "",
        };
      }

      continue;
    }

    if (
      !previous &&
      power === 0
    ) {
      entry.chars[
        characterKey
      ] = {
        power,
        level,
        gear,
        isoMax,
      };

      if (
        isoClass ||
        isoColor
      ) {
        entry.iso[
          characterKey
        ] = {
          isoClass:
            isoClass || "",
          isoColor:
            isoColor || "",
        };
      }
    }
  }

  return Array.from(
    byPlayer.values()
  );
}

// ============================================================
// Lecture CSV
// ============================================================

/**
 * Analyse le CSV caractère par caractère.
 *
 * Prend en charge :
 * - les cellules entre guillemets ;
 * - les virgules dans les cellules ;
 * - les guillemets doublés ;
 * - les retours à la ligne dans une cellule entre guillemets.
 */
function parseCsvRows(csvText) {
  const text = removeUtf8Bom(
    String(csvText || "")
  );

  const rows = [];

  let row = [];
  let cell = "";
  let inQuotes = false;

  for (
    let index = 0;
    index < text.length;
    index++
  ) {
    const char = text[index];
    const nextChar =
      text[index + 1];

    if (char === '"') {
      if (
        inQuotes &&
        nextChar === '"'
      ) {
        cell += '"';
        index++;
      } else {
        inQuotes =
          !inQuotes;
      }

      continue;
    }

    if (
      char === "," &&
      !inQuotes
    ) {
      row.push(cell);
      cell = "";

      continue;
    }

    if (
      (
        char === "\n" ||
        char === "\r"
      ) &&
      !inQuotes
    ) {
      if (
        char === "\r" &&
        nextChar === "\n"
      ) {
        index++;
      }

      row.push(cell);
      rows.push(row);

      row = [];
      cell = "";

      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new Error(
      "Le CSV contient une cellule avec des guillemets non refermés."
    );
  }

  if (
    cell.length ||
    row.length
  ) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

// ============================================================
// Utilitaires CSV / roster / infos
// ============================================================

function buildColumnIndex(
  header
) {
  const colIndex = {};

  for (
    let index = 0;
    index < header.length;
    index++
  ) {
    const key =
      normalizeHeader(
        header[index]
      );

    if (
      key &&
      !(key in colIndex)
    ) {
      colIndex[key] =
        index;
    }
  }

  return colIndex;
}

function requireColumn(
  map,
  keys,
  displayName
) {
  for (const key of keys) {
    if (key in map) {
      return map[key];
    }
  }

  throw new Error(
    `Colonne obligatoire absente du CSV : ${displayName}.`
  );
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/\s+/g, "")
    .replace(
      /[-_‐-‒–—―﹘﹣－]/g,
      ""
    )
    .replace(
      /[’'`´]/g,
      ""
    )
    .replace(
      /[^a-z0-9]/g,
      ""
    );
}

function normalizeHeader(
  value
) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/\s+/g, "")
    .replace(
      /[-_‐-‒–—―﹘﹣－]/g,
      ""
    )
    .replace(
      /[’'`´]/g,
      ""
    )
    .replace(
      /[^a-z0-9]/g,
      ""
    );
}

function toInt(value) {
  const text = String(
    value ?? ""
  ).trim();

  if (!text) {
    return 0;
  }

  const cleaned = text
    .replace(/\s/g, "")
    .replace(/,/g, "");

  const number =
    Number.parseInt(
      cleaned,
      10
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function normIsoClass(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normIsoColor(value) {
  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (!normalized) {
    return "";
  }

  if (
    normalized === "vert"
  ) {
    return "green";
  }

  if (
    normalized === "bleu"
  ) {
    return "blue";
  }

  if (
    normalized === "violet"
  ) {
    return "purple";
  }

  return normalized;
}

function computeIsoMaxFromFive(
  cols,
  indexes
) {
  let maximum = 0;

  for (
    const index of indexes
  ) {
    const value =
      toInt(cols[index]);

    if (value > maximum) {
      maximum = value;
    }
  }

  return maximum;
}

// ============================================================
// Réponses HTTP
// ============================================================

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Methods":
      "POST,OPTIONS,GET",

    "Access-Control-Allow-Headers":
      [
        "content-type",
        "x-upload-password",
        "x-upload-type",
        "x-upload-filename",
      ].join(","),

    "Access-Control-Max-Age":
      "86400",
  };
}

function jsonResponse(
  data,
  status,
  corsHeaders
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json; charset=utf-8",
        "Content-Disposition":
          "inline",
        "Cache-Control":
          "no-store",
      },
    }
  );
}

function textResponse(
  text,
  status,
  corsHeaders
) {
  return new Response(text, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type":
        "text/plain; charset=utf-8",
      "Content-Disposition":
        "inline",
      "Cache-Control":
        "no-store",
    },
  });
}

// ============================================================
// Utilitaires généraux
// ============================================================

function removeUtf8Bom(value) {
  return String(
    value || ""
  ).replace(
    /^\uFEFF/,
    ""
  );
}

function base64EncodeUtf8(
  value
) {
  const bytes =
    new TextEncoder().encode(
      value
    );

  let binary = "";

  const chunkSize =
    0x8000;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        offset,
        offset + chunkSize
      );

    binary +=
      String.fromCharCode(
        ...chunk
      );
  }

  return btoa(binary);
}

function safeJsonMaybe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}
