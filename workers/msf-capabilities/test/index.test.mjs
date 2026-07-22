import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/index.js";

const WORKER_URL = "https://losp-msf-capabilities.example";
const PASSWORD = "test-upload-password";
const TOKEN = "test-github-token";

const ENV = {
  MSF_CAPABILITIES_UPLOAD_PASSWORD: PASSWORD,
  MSF_GITHUB_TOKEN: TOKEN
};

const sqliteBase64 = (byteLength = 512) => {
  const bytes = new Uint8Array(byteLength);
  const header = Buffer.from("SQLite format 3\0", "binary");
  bytes.set(header);
  return Buffer.from(bytes).toString("base64");
};

const updateRequest = (overrides = {}, headers = {}) =>
  new Request(`${WORKER_URL}/update`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-upload-password": PASSWORD,
      ...headers
    },
    body: JSON.stringify({
      gameVersion: "10_3_0",
      gameBuild: "1654625",
      databaseBase64: sqliteBase64(),
      ...overrides
    })
  });

const responseJson = async response => ({
  status: response.status,
  body: await response.json()
});

test("GET /health exposes no configuration or secret", async () => {
  const response = await handleRequest(
    new Request(`${WORKER_URL}/health`),
    ENV,
    () => assert.fail("GitHub must not be contacted")
  );
  const result = await responseJson(response);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    service: "losp-msf-capabilities",
    version: "0.1.0"
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("OPTIONS /update allows the extension preflight", async () => {
  const response = await handleRequest(
    new Request(`${WORKER_URL}/update`, { method: "OPTIONS" }),
    ENV,
    () => assert.fail("GitHub must not be contacted")
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(
    response.headers.get("access-control-allow-headers"),
    /x-upload-password/
  );
});

test("POST /update rejects an incorrect password before reading the body", async () => {
  const request = updateRequest({}, { "x-upload-password": "wrong" });
  const result = await responseJson(
    await handleRequest(request, ENV, () =>
      assert.fail("GitHub must not be contacted")
    )
  );

  assert.equal(result.status, 401);
  assert.equal(result.body.error, "UNAUTHORIZED");
});

test("POST /update rejects fields not used by the pipeline", async () => {
  const result = await responseJson(
    await handleRequest(updateRequest({ cookie: "must-not-pass" }), ENV, () =>
      assert.fail("GitHub must not be contacted")
    )
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "INVALID_PAYLOAD");
});

test("POST /update validates the version and SQLite header", async () => {
  const invalidVersion = await responseJson(
    await handleRequest(
      updateRequest({ gameVersion: "10.3.0" }),
      ENV,
      () => assert.fail("GitHub must not be contacted")
    )
  );
  const invalidDatabase = await responseJson(
    await handleRequest(
      updateRequest({
        databaseBase64: Buffer.alloc(512).toString("base64")
      }),
      ENV,
      () => assert.fail("GitHub must not be contacted")
    )
  );

  assert.equal(invalidVersion.status, 400);
  assert.equal(invalidVersion.body.error, "INVALID_PAYLOAD");
  assert.equal(invalidDatabase.status, 400);
  assert.equal(invalidDatabase.body.error, "INVALID_SQLITE_HEADER");
});

test("POST /update dispatches only the three validated GitHub inputs", async () => {
  let capturedUrl;
  let capturedOptions;

  const githubFetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;

    return new Response(JSON.stringify({ workflow_run_id: 123 }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-github-request-id": "request-123"
      }
    });
  };

  const response = await handleRequest(updateRequest(), ENV, githubFetch);
  const result = await responseJson(response);

  assert.equal(result.status, 202);
  assert.equal(result.body.status, "queued");
  assert.equal(result.body.githubRequestId, "request-123");
  assert.equal(
    capturedUrl,
    "https://api.github.com/repos/Keryas777/msf/actions/workflows/update-msf-capabilities.yml/dispatches"
  );
  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(capturedOptions.body), {
    ref: "main",
    inputs: {
      game_version: "10_3_0",
      game_build: "1654625",
      database_base64: sqliteBase64()
    }
  });
  assert.doesNotMatch(capturedOptions.body, /test-upload-password/);
});

test("POST /update does not expose GitHub's error body or token", async () => {
  const githubFetch = async () =>
    new Response(JSON.stringify({ message: `bad token ${TOKEN}` }), {
      status: 403,
      headers: { "x-github-request-id": "request-error" }
    });

  const response = await handleRequest(updateRequest(), ENV, githubFetch);
  const result = await responseJson(response);

  assert.equal(result.status, 502);
  assert.equal(result.body.error, "GITHUB_DISPATCH_FAILED");
  assert.doesNotMatch(JSON.stringify(result.body), /test-github-token/);
  assert.equal(response.headers.get("x-github-request-id"), "request-error");
});

test("POST /update refuses an unconfigured Worker", async () => {
  const result = await responseJson(
    await handleRequest(updateRequest(), {}, () =>
      assert.fail("GitHub must not be contacted")
    )
  );

  assert.equal(result.status, 503);
  assert.equal(result.body.error, "SERVICE_NOT_CONFIGURED");
});
