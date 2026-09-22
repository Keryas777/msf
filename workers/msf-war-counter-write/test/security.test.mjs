import test from "node:test";
import assert from "node:assert/strict";
import { constantTimeEqual, hasValidWriteKey } from "../index.js";

test("compare correctement la clé d'écriture", async () => {
  assert.equal(await constantTimeEqual("abc", "abc"), true);
  assert.equal(await constantTimeEqual("abc", "abd"), false);
});

test("refuse une requête sans clé ou avec une mauvaise clé", async () => {
  const env = { WRITE_ADMIN_SECRET: "secret-test" };
  assert.equal(await hasValidWriteKey(new Request("https://example.test/apply"), env), false);
  assert.equal(await hasValidWriteKey(new Request("https://example.test/apply", {
    headers: { "X-War-Counter-Write-Key": "wrong" }
  }), env), false);
  assert.equal(await hasValidWriteKey(new Request("https://example.test/apply", {
    headers: { "X-War-Counter-Write-Key": "secret-test" }
  }), env), true);
});
