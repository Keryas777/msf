import { getCropVariants, getLayoutSlots, calculatePixelRect } from "./war-counter-lab-core.js";

const JPEG_QUALITY = 0.92;
const input = document.querySelector("#captureInput");
const button = document.querySelector("#exportBenchmark");
const status = document.querySelector("#benchmarkExportStatus");

const TRUTH = [
  ["left-1", "G1", "Knull", "Knull"],
  ["left-2", "G2", "Toxin", "Toxin"],
  ["left-3", "G3", "Venom", "Venom"],
  ["left-4", "G4", "SymbioteQuicksilver", "Vif-Argent (Symbiote)"],
  ["left-5", "G5", "Riot", "Riot"],
  ["right-1", "D1", "Gwenpool", "Gwenpool"],
  ["right-2", "D2", "JeffTheLandShark", "Jeff le requin terrestre"],
  ["right-3", "D3", "SquirrelGirl", "Squirrel Girl"],
  ["right-4", "D4", "SheHulk", "She-Hulk"],
  ["right-5", "D5", "Deadpool", "Deadpool"]
].map(([slot, label, characterId, name]) => ({ slot, label, characterId, name }));

const CROP_VARIANTS = [
  { id: "base", dx: 0, dy: 0, scaleX: 1, scaleY: 1 },
  { id: "tight", dx: 0, dy: 0, scaleX: 0.84, scaleY: 0.88 },
  { id: "loose", dx: 0, dy: 0, scaleX: 1.12, scaleY: 1.12 },
  { id: "shift-left", dx: -0.06, dy: 0, scaleX: 1, scaleY: 1 },
  { id: "shift-right", dx: 0.06, dy: 0, scaleX: 1, scaleY: 1 },
  { id: "shift-up", dx: 0, dy: -0.05, scaleX: 1, scaleY: 1 },
  { id: "shift-down", dx: 0, dy: 0.05, scaleX: 1, scaleY: 1 },
  { id: "red-neutral", dx: 0, dy: 0, scaleX: 1, scaleY: 1, neutralizeRed: true }
];

const POWER_ZONES = [
  { id: "left", x: 0.02, y: 0.63, width: 0.23, height: 0.32 },
  { id: "right", x: 0.75, y: 0.63, width: 0.23, height: 0.32 }
];

let selectedFile = null;
let running = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function varyRect(base, variant, imageWidth, imageHeight) {
  const width = base.width * variant.scaleX;
  const height = base.height * variant.scaleY;
  const centerX = base.x + base.width / 2 + base.width * variant.dx;
  const centerY = base.y + base.height / 2 + base.height * variant.dy;
  const x = clamp(centerX - width / 2, 0, Math.max(0, imageWidth - 1));
  const y = clamp(centerY - height / 2, 0, Math.max(0, imageHeight - 1));
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(Math.min(width, imageWidth - x))),
    height: Math.max(1, Math.round(Math.min(height, imageHeight - y)))
  };
}

function relativeRect(zone, width, height) {
  return {
    x: Math.round(zone.x * width),
    y: Math.round(zone.y * height),
    width: Math.max(1, Math.round(zone.width * width)),
    height: Math.max(1, Math.round(zone.height * height))
  };
}

function drawCrop(image, rect, neutralizeRed = false) {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext("2d", { willReadFrequently: neutralizeRed });
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

  if (neutralizeRed) {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      if (red > 145 && red > green * 1.35 && red > blue * 1.25) {
        const gray = Math.round((green + blue) / 2);
        imageData.data[index] = gray;
        imageData.data[index + 1] = gray;
        imageData.data[index + 2] = gray;
      }
    }
    context.putImageData(imageData, 0, 0);
  }

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Impossible d’encoder un crop du benchmark.")),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ]);
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

async function zipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const now = dosDateTime(new Date());
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const localHeader = new Blob([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(now.time),
      u16(now.date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes
    ]);
    localParts.push(localHeader, data);

    centralParts.push(new Blob([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(now.time),
      u16(now.date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes
    ]));

    offset += localHeader.size + data.length;
  }

  const centralBlob = new Blob(centralParts);
  const end = new Blob([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBlob.size),
    u32(offset),
    u16(0)
  ]);

  return new Blob([...localParts, centralBlob, end], { type: "application/zip" });
}

async function buildBenchmarkZip(file) {
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  const files = [];
  const manifestSlots = [];

  try {
    for (const slot of getLayoutSlots()) {
      const truth = TRUTH.find((item) => item.slot === slot.slot);
      const wide = getCropVariants(slot).wide;
      const baseRect = calculatePixelRect(wide, image.width, image.height);
      const variants = [];

      for (const variant of CROP_VARIANTS) {
        const rect = varyRect(baseRect, variant, image.width, image.height);
        const canvas = drawCrop(image, rect, Boolean(variant.neutralizeRed));
        const blob = await canvasToBlob(canvas);
        const filename = `crops/${truth.label}-${truth.characterId}/${variant.id}.jpg`;
        files.push({ name: filename, blob });
        variants.push({ id: variant.id, file: filename, rect, neutralizeRed: Boolean(variant.neutralizeRed) });
      }

      manifestSlots.push({
        slot: truth.slot,
        label: truth.label,
        characterId: truth.characterId,
        name: truth.name,
        baseRect,
        variants
      });

      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const powerZones = [];
    for (const zone of POWER_ZONES) {
      const rect = relativeRect(zone, image.width, image.height);
      const canvas = drawCrop(image, rect, false);
      const blob = await canvasToBlob(canvas);
      const filename = `power/power-${zone.id}.jpg`;
      files.push({ name: filename, blob });
      powerZones.push({ side: zone.id, file: filename, rect });
    }

    const manifest = {
      schemaVersion: "1.0.0",
      purpose: "MSF War Counter Vision R5 embedding benchmark",
      generatedAt: new Date().toISOString(),
      source: {
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        width: image.width,
        height: image.height,
        ratio: Number((image.width / image.height).toFixed(6)),
        note: "La capture peut être recadrée manuellement et avoir des dimensions légèrement différentes. Les croix rouges peuvent être à gauche ou à droite."
      },
      benchmarkRules: {
        targetTop20: "au moins 9/10",
        cropVariations: CROP_VARIANTS.map((variant) => variant.id),
        knownTeamContext: "docs/data/war-counters.json est un bonus de cohérence, jamais un filtre fermé"
      },
      slots: manifestSlots,
      powerZones
    };

    files.unshift({
      name: "manifest.json",
      blob: new Blob([JSON.stringify(manifest, null, 2) + "\n"], { type: "application/json" })
    });

    return zipBlob(files);
  } finally {
    image.close();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

input.addEventListener("change", () => {
  selectedFile = input.files?.[0] || null;
  button.disabled = !selectedFile || running;
  status.textContent = selectedFile
    ? "Capture prête. L’export crée 8 variantes par slot + les 2 zones de puissance."
    : "Charge une capture pour préparer le benchmark R5.";
});

button.addEventListener("click", async () => {
  if (!selectedFile || running) return;
  running = true;
  button.disabled = true;
  const startedAt = performance.now();
  status.textContent = "Création du ZIP de benchmark sur le téléphone…";

  try {
    const blob = await buildBenchmarkZip(selectedFile);
    const filename = `war-counter-r5-benchmark-${Date.now()}.zip`;
    downloadBlob(blob, filename);
    status.textContent = `Benchmark exporté (${Math.round(blob.size / 1024)} Ko) en ${Math.round(performance.now() - startedAt)} ms. Aucun appel Groq.`;
  } catch (error) {
    status.textContent = error?.message || "Échec de l’export du benchmark.";
  } finally {
    running = false;
    button.disabled = !selectedFile;
  }
});
