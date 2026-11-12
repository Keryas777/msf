#!/usr/bin/env node
const fs = require("node:fs");
const { createWorker } = require("tesseract.js");
const core = require("../../docs/war-result-recognition-core.js");
const truth = JSON.parse(fs.readFileSync(`${__dirname}/ground-truth.json`, "utf8"));

(async () => {
  const startup = Date.now();
  const worker = await createWorker("eng", 1, {
    langPath: process.env.WAR_OCR_TESSDATA_PATH || "/usr/share/tesseract-ocr/5/tessdata",
    gzip: false,
    cacheMethod: "none"
  });
  const loadedAt = Date.now();
  const captures = [];
  const times = [];
  try {
    for (const item of truth.captures) {
      const imagePath = `${__dirname}/../../upload/${item.file}`;
      const image = await createImageData(imagePath);
      const passes = {};
      for (const psm of [6, 11]) {
        await worker.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: "1" });
        const t0 = Date.now();
        const recognized = await worker.recognize(imagePath, {}, { text: true, tsv: true });
        times.push(Date.now() - t0);
        passes[`psm${psm}`] = { text: recognized.data.text, fields: core.extract(core.parseTsv(recognized.data.tsv || ""), image.width, image.height) };
      }
      captures.push({ id: item.id, split: item.split, width: image.width, height: image.height, passes });
    }
  } finally { await worker.terminate(); }
  const output = {
    schemaVersion: "1.0.0",
    engine: `Tesseract.js ${require("tesseract.js/package.json").version} in Node.js ${process.version}; local traineddata; not a browser test`,
    measurements: { startupMs: loadedAt - startup, meanRecognitionPassMs: Math.round(times.reduce((a,b)=>a+b,0)/times.length), totalPasses: times.length, elapsedMs: Date.now()-startup, peakMemoryRssMb: Math.round(process.resourceUsage().maxRSS/1024) },
    captures
  };
  fs.writeFileSync(`${__dirname}/tesseractjs-node-raw-results.json`, `${JSON.stringify(output,null,2)}\n`);
  console.log(JSON.stringify(output.measurements));
})().catch((error) => { console.error(error); process.exitCode = 1; });

function createImageData(path) {
  const { spawnSync } = require("node:child_process");
  const out = spawnSync("identify", ["-format", "%w %h", path], { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`Cannot inspect ${path}`);
  const [width, height] = out.stdout.split(" ").map(Number);
  return { width, height };
}
