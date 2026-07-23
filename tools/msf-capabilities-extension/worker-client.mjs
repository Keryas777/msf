export const UPDATE_ENDPOINT =
  "https://losp-msf-capabilities.deliriousfan7.workers.dev/update";

export class WorkerUpdateError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    this.name = "WorkerUpdateError";
    this.status = status;
    this.code = code;
  }
}

const readResponseBody = async response => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const createPayload = ({ gameVersion, gameBuild, databaseBase64 }) => {
  if (
    typeof gameVersion !== "string" ||
    gameVersion.length === 0 ||
    typeof databaseBase64 !== "string" ||
    databaseBase64.length === 0
  ) {
    throw new WorkerUpdateError(
      "La version du jeu ou la base SQLite est absente.",
      { code: "INVALID_LOCAL_PAYLOAD" }
    );
  }

  const payload = {
    gameVersion,
    databaseBase64
  };

  if (typeof gameBuild === "string" && gameBuild.length > 0) {
    payload.gameBuild = gameBuild;
  }

  return payload;
};

const createErrorMessage = (response, body) => {
  const parts = [
    typeof body?.message === "string" && body.message.trim()
      ? body.message.trim()
      : `Le Worker a répondu HTTP ${response.status}.`
  ];

  if (typeof body?.githubMessage === "string" && body.githubMessage.trim()) {
    parts.push(body.githubMessage.trim());
  }

  if (
    typeof body?.githubRequestId === "string" &&
    body.githubRequestId.trim()
  ) {
    parts.push(`requête GitHub ${body.githubRequestId.trim()}`);
  }

  return parts.join(" — ");
};

export const sendCapabilitiesUpdate = async (
  {
    gameVersion,
    gameBuild,
    databaseBase64,
    uploadPassword
  },
  fetchImpl = globalThis.fetch
) => {
  if (typeof uploadPassword !== "string" || uploadPassword.length === 0) {
    throw new WorkerUpdateError("Le mot de passe d’upload est absent.", {
      code: "MISSING_PASSWORD"
    });
  }

  if (typeof fetchImpl !== "function") {
    throw new WorkerUpdateError("Le navigateur ne permet pas l’envoi.", {
      code: "FETCH_UNAVAILABLE"
    });
  }

  const payload = createPayload({
    gameVersion,
    gameBuild,
    databaseBase64
  });

  let response;

  try {
    response = await fetchImpl(UPDATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-upload-password": uploadPassword
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
  } catch {
    throw new WorkerUpdateError(
      "Impossible de joindre le Worker LoSP. Vérifie la connexion Internet puis réessaie.",
      { code: "NETWORK_ERROR" }
    );
  }

  const body = await readResponseBody(response);

  if (
    response.status !== 202 ||
    body?.ok !== true ||
    body?.status !== "queued"
  ) {
    throw new WorkerUpdateError(createErrorMessage(response, body), {
      status: response.status,
      code: typeof body?.error === "string" ? body.error : "UNEXPECTED_RESPONSE"
    });
  }

  return body;
};
