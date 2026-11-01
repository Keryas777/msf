// Optional publication of a rolling 30-day arena history to PRIVATE R2.
// A Cloudflare R2 lifecycle rule for prefix arena-history/v1/ is also required
// to delete the object after 30 days if daily Actions stop running.
// Browser access must use an approved public projection, never R2 credentials.
import fs from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import path from "node:path";

const hash = value => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const enc = value => encodeURIComponent(value).replace(/[!'()*]/g, x =>
  "%" + x.charCodeAt(0).toString(16).toUpperCase());
const OBJECT_KEY = "arena-history/v1/rolling.json";

export function earliestAllowedDay(day) {
  const date = new Date(day + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new Error("Invalid snapshot day");
  }
  date.setUTCDate(date.getUTCDate() - 29);
  return date.toISOString().slice(0, 10);
}

export function mergeHistory(previous, newSnapshots, today) {
  const first = earliestAllowedDay(today);
  const byDate = new Map();
  for (const item of previous?.snapshots || []) {
    if (item?.date >= first && item?.date <= today) byDate.set(item.date, item);
  }
  for (const item of newSnapshots) {
    if (!item || item.version !== 1 || !Array.isArray(item.players) ||
        typeof item.date !== "string" || item.date < first || item.date > today) {
      throw new Error("Invalid/out-of-window arena snapshot");
    }
    // Idempotent: a date's historical source is immutable once archived.
    if (!byDate.has(item.date)) byDate.set(item.date, item);
  }
  return {
    version: 1,
    retentionDays: 30,
    snapshots: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  };
}

function r2Client(env = process.env) {
  const account = env.LOSP_R2_ACCOUNT_ID;
  const bucket = env.LOSP_R2_BUCKET;
  const access = env.LOSP_R2_ARENA_ACCESS_KEY_ID;
  const secret = env.LOSP_R2_ARENA_SECRET_ACCESS_KEY;
  if (!/^[a-f0-9]{32}$/.test(account || "") ||
      !/^[a-z0-9-]{3,64}$/.test(bucket || "") || !access || !secret) {
    throw new Error("Missing R2 arena write credentials");
  }
  const host = account + ".r2.cloudflarestorage.com";
  const uri = "/" + [bucket, ...OBJECT_KEY.split("/")].map(enc).join("/");

  async function request(method, payload = "") {
    const bytes = Buffer.from(payload, "utf8");
    const digest = hash(method === "PUT" ? bytes : "");
    const date = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
    const short = date.slice(0, 8);
    const signed = "host;x-amz-content-sha256;x-amz-date";
    const canonical = [method, uri, "", "host:" + host + "\n" +
      "x-amz-content-sha256:" + digest + "\n" + "x-amz-date:" + date + "\n",
      signed, digest].join("\n");
    const scope = short + "/auto/s3/aws4_request";
    const signing = hmac(hmac(hmac(hmac("AWS4" + secret, short), "auto"), "s3"), "aws4_request");
    const signature = hmac(signing, ["AWS4-HMAC-SHA256", date, scope, hash(canonical)].join("\n")).toString("hex");
    const headers = {
      "x-amz-content-sha256": digest,
      "x-amz-date": date,
      Authorization: "AWS4-HMAC-SHA256 Credential=" + access + "/" + scope +
        ", SignedHeaders=" + signed + ", Signature=" + signature
    };
    if (method === "PUT") headers["content-type"] = "application/json";
    const response = await fetch("https://" + host + uri, {
      method, headers, body: method === "PUT" ? bytes : undefined,
      redirect: "error", signal: AbortSignal.timeout(30000)
    });
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) throw new Error("Arena R2 " + method + " failed (HTTP " + response.status + ")");
    return method === "GET" ? response.text() : "";
  }
  return {
    async read() {
      const raw = await request("GET");
      if (raw === null) return { version: 1, retentionDays: 30, snapshots: [] };
      if (raw.length > 2000000) throw new Error("Arena R2 history exceeds size limit");
      const data = JSON.parse(raw);
      if (data?.version !== 1 || !Array.isArray(data.snapshots)) {
        throw new Error("Unexpected Arena R2 history schema");
      }
      return data;
    },
    async write(data) { await request("PUT", JSON.stringify(data) + "\n"); }
  };
}

async function main() {
  const dayArg = process.argv.find(x => x.startsWith("--day="));
  const dirArg = process.argv.find(x => x.startsWith("--dir="));
  const day = dayArg ? dayArg.slice(6) : new Date().toISOString().slice(0, 10);
  const dir = dirArg ? dirArg.slice(6) : ".tmp/arena-snapshots";
  const files = (await fs.readdir(dir)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  const incoming = await Promise.all(files.map(async f =>
    JSON.parse(await fs.readFile(path.join(dir, f), "utf8"))));
  const r2 = r2Client();
  const previous = await r2.read();
  const next = mergeHistory(previous, incoming, day);
  if (JSON.stringify(previous.snapshots) === JSON.stringify(next.snapshots)) {
    console.log("[arena] R2 rolling history unchanged");
    return;
  }
  await r2.write(next);
  console.log("[arena] R2 rolling history updated: " + next.snapshots.length + " dates, 30-day window");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => { console.error("[arena] " + error.message); process.exitCode = 1; });
}
