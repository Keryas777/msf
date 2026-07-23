"use strict";

const SERVICE_NAME = "losp-msf-capabilities";
const SERVICE_VERSION = "0.1.2";

const UPDATE_PATH = "/update";
const HEALTH_PATH = "/health";

const GITHUB_DISPATCH_URL =
  "https://api.github.com/repos/Keryas777/msf/actions/workflows/update-msf-capabilities.yml/dispatches";
const GITHUB_REF = "main";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_DATABASE_BYTES = 45 * 1024;
const MIN_DATABASE_BYTES = 100;
const MAX_GITHUB_INPUT_PAYLOAD_CHARS = 65_535;

const SQLITE_HEADER = new Uint8Array([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
  0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00
]);

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

const PREFLIGHT_HEADERS = {
  ...BASE_HEADERS,
  "Access-Control-Allow-Headers": "content-type, x-upload-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

const textEncoder = new TextEncoder();

const jsonResponse = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...BASE_HEADERS,
      ...headers
    }
  });

const errorResponse = (status, code, message, headers = {}, details = {}) =>
  jsonResponse(
    {
      ok: false,
      error: code,
      message,
      ...details
    },
    status,
    headers
  );

const sanitizeGitHubMessage = (message, token) => {
  if (typeof message !== "string") return null;

  let sanitized = message;

  if (typeof token === "string" && token.length > 0) {
    sanitized = sanitized.split(token).join("[REDACTED]");
  }

  sanitized = sanitized
    .replace(
      /\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+)\b/g,
      "[REDACTED]"
    )
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 500);

  return sanitized || null;
};

const readGitHubErrorMessage = async (response, token) => {
  try {
    const body = await response.json();
    return sanitizeGitHubMessage(body?.message, token);
  } catch {
    return null;
  }
};

const secureEqual = async (provided, expected) => {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(provided)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected))
  ]);

  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
};

const decodeBase64 = value => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  ) {
    throw new Error("INVALID_BASE64");
  }

  let binary;

  try {
    binary = atob(value);
  } catch {
    throw new Error("INVALID_BASE64");
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const hasSQLiteHeader = bytes => {
  if (bytes.byteLength < SQLITE_HEADER.byteLength) return false;

  return SQLITE_HEADER.every((byte, index) => bytes[index] === byte);
};

const validatePayloadShape = payload => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Le corps de la requête doit être un objet JSON.";
  }

  const allowedKeys = new Set([
    "gameVersion",
    "gameBuild",
    "databaseBase64"
  ]);
  const unknownKeys = Object.keys(payload).filter(key => !allowedKeys.has(key));

  if (unknownKeys.length > 0) {
    return "Le corps JSON contient un champ non autorisé.";
  }

  if (
    typeof payload.gameVersion !== "string" ||
    !/^\d+(?:_\d+)+$/.test(payload.gameVersion) ||
    payload.gameVersion.length > 32
  ) {
    return "La version du jeu est absente ou invalide.";
  }

  if (
    payload.gameBuild !== undefined &&
    (typeof payload.gameBuild !== "string" ||
      !/^\d{1,20}$/.test(payload.gameBuild))
  ) {
    return "Le numéro de build est invalide.";
  }

  if (typeof payload.databaseBase64 !== "string") {
    return "La base SQLite encodée en Base64 est absente.";
  }

  return null;
};

const readJsonBody = async request => {
  const announcedLength = request.headers.get("content-length");

  if (announcedLength !== null) {
    const parsedLength = Number(announcedLength);

    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      throw new Error("INVALID_CONTENT_LENGTH");
    }

    if (parsedLength > MAX_REQUEST_BYTES) {
      throw new Error("REQUEST_TOO_LARGE");
    }
  }

  const bodyText = await request.text();

  if (textEncoder.encode(bodyText).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("REQUEST_TOO_LARGE");
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error("INVALID_JSON");
  }
};

const triggerGitHubWorkflow = async (payload, token, fetchImpl) => {
  const dispatchPayload = {
    ref: GITHUB_REF,
    inputs: {
      game_version: payload.gameVersion,
      game_build: payload.gameBuild || "",
      database_base64: payload.databaseBase64
    }
  };
  const dispatchBody = JSON.stringify(dispatchPayload);

  if (dispatchBody.length > MAX_GITHUB_INPUT_PAYLOAD_CHARS) {
    throw new Error("GITHUB_PAYLOAD_TOO_LARGE");
  }

  let response;

  try {
    response = await fetchImpl(GITHUB_DISPATCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": SERVICE_NAME,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: dispatchBody,
      redirect: "manual"
    });
  } catch (cause) {
    const error = new Error("GITHUB_DISPATCH_FAILED");
    error.githubMessage = sanitizeGitHubMessage(cause?.message, token);
    throw error;
  }

  if (!response.ok) {
    const error = new Error("GITHUB_DISPATCH_FAILED");
    error.githubStatus = response.status;
    error.githubRequestId = response.headers.get("x-github-request-id");
    error.githubMessage = await readGitHubErrorMessage(response, token);
    throw error;
  }

  return {
    requestId: response.headers.get("x-github-request-id")
  };
};

export const handleRequest = async (
  request,
  env,
  fetchImpl = globalThis.fetch
) => {
  const url = new URL(request.url);

  if (url.pathname === HEALTH_PATH) {
    if (request.method !== "GET") {
      return errorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        "Cette route accepte uniquement GET.",
        { Allow: "GET" }
      );
    }

    return jsonResponse({
      ok: true,
      service: SERVICE_NAME,
      version: SERVICE_VERSION
    });
  }

  if (url.pathname !== UPDATE_PATH) {
    return errorResponse(404, "NOT_FOUND", "Route introuvable.");
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: PREFLIGHT_HEADERS
    });
  }

  if (request.method !== "POST") {
    return errorResponse(
      405,
      "METHOD_NOT_ALLOWED",
      "Cette route accepte uniquement POST.",
      { Allow: "POST, OPTIONS" }
    );
  }

  const uploadPassword = env?.MSF_CAPABILITIES_UPLOAD_PASSWORD;
  const githubToken = env?.MSF_GITHUB_TOKEN;
  const normalizedGithubToken =
    typeof githubToken === "string" ? githubToken.trim() : "";

  if (
    typeof uploadPassword !== "string" ||
    uploadPassword.length === 0 ||
    normalizedGithubToken.length === 0
  ) {
    return errorResponse(
      503,
      "SERVICE_NOT_CONFIGURED",
      "Le Worker n’est pas encore entièrement configuré."
    );
  }

  const providedPassword = request.headers.get("x-upload-password") || "";

  if (!(await secureEqual(providedPassword, uploadPassword))) {
    return errorResponse(
      401,
      "UNAUTHORIZED",
      "Mot de passe d’upload incorrect."
    );
  }

  const contentType = request.headers.get("content-type") || "";

  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return errorResponse(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Le contenu doit être envoyé en JSON."
    );
  }

  let payload;

  try {
    payload = await readJsonBody(request);
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      return errorResponse(
        413,
        "REQUEST_TOO_LARGE",
        "La requête dépasse la limite autorisée."
      );
    }

    if (error.message === "INVALID_CONTENT_LENGTH") {
      return errorResponse(
        400,
        "INVALID_CONTENT_LENGTH",
        "La taille annoncée de la requête est invalide."
      );
    }

    return errorResponse(400, "INVALID_JSON", "Le JSON envoyé est invalide.");
  }

  const payloadError = validatePayloadShape(payload);

  if (payloadError) {
    return errorResponse(400, "INVALID_PAYLOAD", payloadError);
  }

  let databaseBytes;

  try {
    databaseBytes = decodeBase64(payload.databaseBase64);
  } catch {
    return errorResponse(
      400,
      "INVALID_DATABASE_BASE64",
      "La base SQLite n’utilise pas un encodage Base64 valide."
    );
  }

  if (databaseBytes.byteLength < MIN_DATABASE_BYTES) {
    return errorResponse(
      400,
      "DATABASE_TOO_SMALL",
      "La base SQLite est trop petite pour être valide."
    );
  }

  if (databaseBytes.byteLength > MAX_DATABASE_BYTES) {
    return errorResponse(
      413,
      "DATABASE_TOO_LARGE",
      "La base SQLite dépasse la limite compatible avec GitHub Actions."
    );
  }

  if (!hasSQLiteHeader(databaseBytes)) {
    return errorResponse(
      400,
      "INVALID_SQLITE_HEADER",
      "L’en-tête de combat_data.db est invalide."
    );
  }

  let githubResult;

  try {
    githubResult = await triggerGitHubWorkflow(
      payload,
      normalizedGithubToken,
      fetchImpl
    );
  } catch (error) {
    if (error.message === "GITHUB_PAYLOAD_TOO_LARGE") {
      return errorResponse(
        413,
        "GITHUB_PAYLOAD_TOO_LARGE",
        "La base est trop volumineuse pour le déclenchement GitHub."
      );
    }

    return errorResponse(
      502,
      "GITHUB_DISPATCH_FAILED",
      "GitHub n’a pas accepté le déclenchement du pipeline.",
      error.githubRequestId
        ? { "X-GitHub-Request-Id": error.githubRequestId }
        : {},
      {
        ...(Number.isInteger(error.githubStatus)
          ? { githubStatus: error.githubStatus }
          : {}),
        ...(error.githubMessage
          ? { githubMessage: error.githubMessage }
          : {}),
        ...(error.githubRequestId
          ? { githubRequestId: error.githubRequestId }
          : {})
      }
    );
  }

  return jsonResponse(
    {
      ok: true,
      status: "queued",
      gameVersion: payload.gameVersion,
      gameBuild: payload.gameBuild || null,
      githubRequestId: githubResult.requestId || null
    },
    202
  );
};

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  }
};
