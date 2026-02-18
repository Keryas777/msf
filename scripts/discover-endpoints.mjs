import { chromium } from "playwright";

const URL = "https://marvelstrikeforce.com/fr/characters";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const hits = new Map();

page.on("request", (req) => {
  const rt = req.resourceType(); // "xhr", "fetch", "script", ...
  if (rt === "xhr" || rt === "fetch") {
    const u = req.url();
    // garde surtout les réponses potentiellement JSON/API
    if (u.includes("api") || u.includes("graphql") || u.includes("character") || u.includes("content")) {
      hits.set(u, (hits.get(u) || 0) + 1);
    }
  }
});

await page.goto(URL, { waitUntil: "networkidle" });

// Scroll pour déclencher les chargements lazy
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(250);
}

await browser.close();

const sorted = [...hits.entries()].sort((a,b) => b[1]-a[1]);

console.log("\n=== CANDIDATE ENDPOINTS (xhr/fetch) ===");
for (const [u, n] of sorted) console.log(`${n}x  ${u}`);
console.log("=== END ===\n");
