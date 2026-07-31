import assert from "node:assert/strict";
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const docsRoot = resolve(fileURLToPath(new URL("../docs/", import.meta.url)));
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname.replace(/^\/+/, "") || "home.html";
    const filePath = resolve(docsRoot, relative);
    if (filePath !== docsRoot && !filePath.startsWith(`${docsRoot}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const stat = statSync(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch (_) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const executablePath = process.env.CODEX_CHROMIUM_EXECUTABLE || undefined;
const customArgs = executablePath
  ? [
      "--ash-no-nudges",
      "--disable-domain-reliability",
      "--disable-print-preview",
      "--disk-cache-size=33554432",
      "--no-default-browser-check",
      "--no-pings",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--no-zygote",
      "--single-process",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
      "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
      "--enable-features=SharedArrayBuffer",
      "--ignore-gpu-blocklist",
      "--disable-web-security",
      "--disable-site-isolation-trials",
      "--in-process-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--allow-running-insecure-content",
      "--headless='shell'",
    ]
  : [];

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath, args: customArgs } : {}),
});

async function makeContext(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 390, height: 844 },
    userAgent: options.userAgent,
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  await context.route("https://losp-auth.deliriousfan7.workers.dev/**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, user: { name: "Codex Test" } }),
    });
  });
  if (options.blockImages !== false) {
    await context.route("https://assets.marvelstrikeforce.com/**", (route) => route.abort());
  }
  return context;
}

const report = {
  flows: [],
  requestPaths: new Set(),
  initialJson: [],
  errors: [],
};

try {
  const context = await makeContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  page.on("request", (request) => {
    if (request.url().startsWith(baseUrl)) {
      report.requestPaths.add(new URL(request.url()).pathname);
    }
  });

  const goto = async (path) => {
    await page.goto(`${baseUrl}/${path}`, { waitUntil: "networkidle" });
    await page.locator("#codexMain h1").first().waitFor();
  };

  await goto("codex.html");
  assert.equal(await page.locator(".codexGate").count(), 2);
  report.initialJson = [...report.requestPaths].filter((path) => path.endsWith(".json"));
  assert.equal(report.initialJson.some((path) => path.endsWith("/search.json")), false);
  assert.equal(report.initialJson.some((path) => path.endsWith("/characters.json")), false);
  report.flows.push("accueil léger");

  const historyBeforeSearch = await page.evaluate(() => history.length);
  await page.locator("#codexSearchInput").fill("Dorm");
  await page.waitForURL(/view=search&q=Dorm/);
  assert.match(page.url(), /view=search&q=Dorm/);
  assert.equal(await page.evaluate(() => history.length), historyBeforeSearch);
  await page.locator(".codexSearchResult").first().waitFor();
  await page.locator("#codexSearchInput").press("ArrowDown");
  assert.ok(await page.locator("#codexSearchInput").getAttribute("aria-activedescendant"));
  await page.locator("#codexSearchInput").press("Enter");
  await page.locator("h1", { hasText: "Dormammu" }).waitFor();
  assert.match(await page.locator("#codexImageNotice").textContent(), /images officielles sont indisponibles/);
  assert.ok(await page.locator(".codexPortraitFallback:visible").count());
  report.flows.push("recherche clavier et fallbacks d’images");

  await page.locator(".codexAbilityChip").first().click();
  await page.locator("h1", { hasText: "Ténèbres éternelles" }).waitFor();
  assert.equal(await page.locator('.codexAbilityChip[aria-current="page"]').count(), 1);
  assert.ok(await page.locator(".codexMechanicalPanel .codexProofBadge--official_text_only").count());
  const mechanicalBox = await page.locator(".codexMechanicalPanel").boundingBox();
  const officialBox = await page.locator(".codexOfficialPanel").boundingBox();
  assert.ok(mechanicalBox.y < officialBox.y);
  await page.locator(".codexOfficialText a", { hasText: "Blocage de capacité" }).click();
  await page.locator("h1", { hasText: "Blocage de capacité" }).waitFor();
  await page.locator(".codexFacet", { hasText: "Applique" }).click();
  await page.locator(".codexResultCard").first().waitFor();
  const linkedCharacter = (await page.locator(".codexResultCharacter").first().textContent()).trim();
  await page.locator(".codexResultCard").first().getByText("Voir la capacité").click();
  await page.locator(".codexIdentity h1").waitFor();
  assert.ok((await page.locator(".codexIdentity .codexEyebrow").first().textContent()).includes(linkedCharacter));
  report.flows.push("Dormammu → capacité → Blocage → Applique → autre personnage");

  await page.locator("#codexSearchInput").fill("capablock");
  await page.waitForTimeout(180);
  assert.equal(await page.locator(".codexSearchResult mark", { hasText: "capablock" }).count(), 1);
  await page.locator(".codexSearchResult", { hasText: "Blocage de capacité" }).click();
  await page.locator(".codexFacet", { hasText: "Retire" }).click();
  await page.locator(".codexResultCard").first().getByText("Voir la capacité").click();
  await page.locator(".codexMechanicalPanel").waitFor();
  report.flows.push("capablock → Retire → capacité");

  await page.locator("#codexSearchInput").fill("Trauma");
  await page.waitForTimeout(180);
  await page.locator(".codexSearchResult", { hasText: "Traumatisme" }).click();
  await page.locator("h1", { hasText: "Traumatisme" }).waitFor();
  assert.equal(await page.locator(".codexFacet").count(), 1);
  assert.match(await page.locator(".codexFacet").textContent(), /Mentions/);
  assert.ok(await page.locator(".codexProofBadge--official_text_only").count());
  report.flows.push("Trauma → fiche textuelle");

  await goto("codex.html?view=mechanic&id=barrier");
  assert.deepEqual(
    (await page.locator(".codexFacet").allTextContents()).map((text) => text.replace(/\d+/g, "").trim()),
    ["Ajoute", "Retire"]
  );
  assert.ok(await page.locator(".codexProofBadge--preserved_uninterpreted").count());
  assert.equal(await page.locator('select[data-filter="chance"]').count(), 0);
  report.flows.push("Barrière détectée sans filtre de chance inventé");

  await goto("codex.html?view=character&id=Annihilus");
  await page.locator("#character-spawns-title").waitFor();
  await page.locator('[aria-labelledby="character-spawns-title"] .codexCharacterMeta h3 a').first().click();
  await page.locator(".codexTechnicalMessage").waitFor();
  assert.match(await page.locator(".codexTechnicalMessage").textContent(), /invocation/);
  report.flows.push("personnage → capacité d’invocation → entité");

  await goto("codex.html?view=ability&id=abl_c5c0dec38fb62704");
  await page.getByRole("button", { name: "Partager" }).click();
  await page.locator("#codexToast", { hasText: "Lien copié" }).waitFor();
  report.flows.push("URL profonde et partage");

  await goto("codex.html?view=effect&id=ability-block&operation=effect_apply");
  await page.locator('[data-action="open-filters"]').click();
  await page.locator("#draft-filter-type").selectOption("passive");
  await page.locator("#codexFilterApply").click();
  assert.match(page.url(), /type=passive/);
  report.flows.push("filtres mobiles");

  await goto("codex.html?view=characters");
  const card = page.locator(".codexCharacterCard").nth(20);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await card.locator("h2 a").click();
  await page.locator(".codexIdentity h1").waitFor();
  await page.goBack();
  await page.locator("h1", { hasText: "Personnages" }).waitFor();
  await page.waitForTimeout(80);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(scrollBefore - scrollAfter) < 8);
  await page.goForward();
  await page.locator(".codexIdentity h1").waitFor();
  await page.goBack();
  await page.locator("h1", { hasText: "Personnages" }).waitFor();
  report.scroll = { before: scrollBefore, after: scrollAfter };
  report.flows.push("historique arrière/avant et restauration du scroll");

  await page.setViewportSize({ width: 320, height: 700 });
  await goto("codex.html");
  report.overflow320 = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.equal(report.overflow320, 0);
  assert.equal(await page.locator(".codexGate").count(), 2);
  report.flows.push("navigation à 320 px");

  await page.setViewportSize({ width: 1280, height: 900 });
  await goto("codex.html?view=ability&id=abl_c5c0dec38fb62704");
  const desktopMechanical = await page.locator(".codexMechanicalPanel").boundingBox();
  const desktopOfficial = await page.locator(".codexOfficialPanel").boundingBox();
  assert.ok(desktopMechanical.x < desktopOfficial.x);
  assert.ok(Math.abs(desktopMechanical.y - desktopOfficial.y) < 4);
  report.flows.push("mise en page desktop");

  await goto("codex.html?view=obsolete&id=removed");
  assert.match(await page.locator("#codexMain").textContent(), /Ce lien ne correspond plus/);
  report.flows.push("URL invalide");

  await goto("codex.html?view=ability&id=abl_c5c0dec38fb62704");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("losp:auth-ready", { detail: { ok: false } }));
  });
  await page.locator("text=Ta session a expiré. Reconnecte-toi pour revenir à cette fiche.").waitFor();
  report.flows.push("session expirée");

  assert.equal([...report.requestPaths].some((path) => path.includes("operations.json")), false);
  assert.deepEqual(report.errors, []);

  const manifestPage = await context.newPage();
  await manifestPage.route("**/data/msf-capabilities-explorer/manifest.json", (route) => {
    route.fulfill({ status: 503, body: "Unavailable" });
  });
  await manifestPage.goto(`${baseUrl}/codex.html`, { waitUntil: "networkidle" });
  assert.match(await manifestPage.locator("#codexMain").textContent(), /Impossible de charger les données du Codex/);

  const shardPage = await context.newPage();
  await shardPage.route("**/characters/Dormammu.json", (route) => {
    route.fulfill({ status: 404, body: "Missing" });
  });
  await shardPage.goto(`${baseUrl}/codex.html?view=character&id=Dormammu`, { waitUntil: "networkidle" });
  assert.match(
    await shardPage.locator("#codexMain").textContent(),
    /Cette fiche n’est pas disponible dans la génération actuelle/
  );
  report.flows.push("erreurs manifeste et shard");

  const discordPage = await context.newPage();
  await discordPage.setViewportSize({ width: 390, height: 780 });
  const discordSession = await context.newCDPSession(discordPage);
  await discordSession.send("Network.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 Discord/250.0",
  });
  await discordPage.goto(`${baseUrl}/codex.html?view=mechanic&id=trauma`, {
    waitUntil: "networkidle",
  });
  await discordPage.locator("h1", { hasText: "Traumatisme" }).waitFor();
  assert.equal(
    await discordPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    ),
    0
  );
  report.flows.push("simulation navigateur Discord");

  console.log(JSON.stringify({
    ...report,
    requestPaths: [...report.requestPaths].sort(),
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}
