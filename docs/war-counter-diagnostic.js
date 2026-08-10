import { getCropVariants, getLayoutSlots, calculatePixelRect } from "./war-counter-lab-core.js";
import { signatureFromImageData, rankPortraitSignatures } from "./war-counter-prefilter.js";

const TRUTH = [
  ["left-1", "Knull", "Knull"],
  ["left-2", "Toxin", "Toxin"],
  ["left-3", "Venom", "Venom"],
  ["left-4", "SymbioteQuicksilver", "Vif-Argent (Symbiote)"],
  ["left-5", "Riot", "Riot"],
  ["right-1", "Gwenpool", "Gwenpool"],
  ["right-2", "JeffTheLandShark", "Jeff le requin terrestre"],
  ["right-3", "SquirrelGirl", "Squirrel Girl"],
  ["right-4", "SheHulk", "She-Hulk"],
  ["right-5", "Deadpool", "Deadpool"]
].map(([slot, characterId, name]) => ({ slot, characterId, name }));

const input = document.querySelector("#captureInput");
const button = document.querySelector("#runDiagnostic");
const summary = document.querySelector("#diagnosticSummary");
const results = document.querySelector("#diagnosticResults");
let selectedFile = null;
let signatures = [];
let names = new Map();
let running = false;

function drawVariant(image, rect, kind) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  if (kind === "grayscale" || kind === "redMask") {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      if (kind === "grayscale") {
        const gray = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
        imageData.data[index] = imageData.data[index + 1] = imageData.data[index + 2] = gray;
      } else if (red > 145 && red > green * 1.35 && red > blue * 1.25) {
        imageData.data[index] = imageData.data[index + 1] = imageData.data[index + 2] = 9;
      }
    }
    context.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function rowNode(slot, expected, ranking) {
  const rankIndex = ranking.findIndex((candidate) => candidate.id === expected.characterId);
  const top = ranking.slice(0, 5);
  const article = document.createElement("article");
  article.className = "slot-card diagnostic-card";
  const rankText = rankIndex >= 0 ? `${rankIndex + 1}/${ranking.length}` : `absent/${ranking.length}`;
  const scoreText = rankIndex >= 0 ? ranking[rankIndex].score.toFixed(4) : "—";
  article.innerHTML = `<div class="slot-head"><strong>${slot.label}</strong><span>${slot.slot}</span></div>
    <p><strong>Attendu :</strong> ${expected.name}</p>
    <p><strong>Rang réel :</strong> ${rankText}</p>
    <p><strong>Distance :</strong> ${scoreText}</p>
    <details><summary>Top 5 obtenu</summary><ol>${top.map((candidate) => `<li>${names.get(candidate.id) || candidate.name || candidate.id} — ${candidate.id} · ${candidate.score.toFixed(4)}</li>`).join("")}</ol></details>`;
  return { article, rankIndex };
}

async function loadData() {
  const [signatureResponse, charactersResponse] = await Promise.all([
    fetch("data/war-counter-vision/portrait-signatures.json", { cache: "no-store" }),
    fetch("data/msf-characters.json", { cache: "no-store" })
  ]);
  if (!signatureResponse.ok || !charactersResponse.ok) throw new Error("Données de diagnostic indisponibles.");
  signatures = (await signatureResponse.json()).items || [];
  names = new Map((await charactersResponse.json()).map((item) => [item.id, item.nameKey || item.id]));
  if (!signatures.length) throw new Error("Aucune signature disponible.");
  summary.textContent = `${signatures.length} références prêtes. Charge la capture symbiotes/Jeff.`;
}

input.addEventListener("change", () => {
  selectedFile = input.files?.[0] || null;
  button.disabled = !selectedFile || !signatures.length;
  results.replaceChildren();
  summary.textContent = selectedFile ? "Capture prête pour le classement complet." : `${signatures.length} références prêtes.`;
});

button.addEventListener("click", async () => {
  if (!selectedFile || running) return;
  running = true;
  button.disabled = true;
  results.replaceChildren();
  summary.textContent = `Classement complet en cours sur ${signatures.length} références…`;
  const startedAt = performance.now();
  try {
    const image = await createImageBitmap(selectedFile, { imageOrientation: "from-image" });
    let top1 = 0;
    let top20 = 0;
    let rankTotal = 0;
    let evaluated = 0;
    for (const slot of getLayoutSlots()) {
      const variants = [];
      for (const [kind, variant] of Object.entries(getCropVariants(slot))) {
        const crop = drawVariant(image, calculatePixelRect(variant, image.width, image.height), kind);
        const context = crop.getContext("2d", { willReadFrequently: true });
        variants.push(signatureFromImageData(context.getImageData(0, 0, crop.width, crop.height)));
      }
      const ranking = rankPortraitSignatures(variants, signatures, signatures.length);
      const expected = TRUTH.find((item) => item.slot === slot.slot);
      const { article, rankIndex } = rowNode(slot, expected, ranking);
      results.append(article);
      evaluated += 1;
      if (rankIndex === 0) top1 += 1;
      if (rankIndex >= 0 && rankIndex < 20) top20 += 1;
      rankTotal += rankIndex >= 0 ? rankIndex + 1 : ranking.length + 1;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    image.close();
    summary.textContent = `Top 1 ${top1}/${evaluated} · Top 20 ${top20}/${evaluated} · rang moyen ${(rankTotal / evaluated).toFixed(1)} · ${Math.round(performance.now() - startedAt)} ms · 0 appel Groq`;
  } catch (error) {
    summary.textContent = error?.message || "Échec du diagnostic.";
  } finally {
    running = false;
    button.disabled = false;
  }
});

loadData().catch((error) => { summary.textContent = error.message; });
