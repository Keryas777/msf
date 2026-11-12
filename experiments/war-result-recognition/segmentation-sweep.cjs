#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const core = require("../../docs/war-result-recognition-core.js");
const truth = JSON.parse(fs.readFileSync(`${__dirname}/ground-truth.json`, "utf8"));
const normalizeName = (value) => String(value || "").normalize("NFKC").replace(/[’‘]/g,"'").replace(/\s+/g," ").trim().toLocaleLowerCase();
const results = [];
for (const psm of [3, 6, 7, 11, 13]) {
  const captures = [];
  for (const item of truth.captures) {
    const image = `${__dirname}/../../upload/${item.file}`;
    const sizes = spawnSync("identify", ["-format", "%w %h", image], { encoding: "utf8" });
    const [width,height] = sizes.stdout.split(" ").map(Number);
    const proc = spawnSync("tesseract", [image,"stdout","-l","eng","--psm",String(psm),"tsv"], { encoding: "utf8", maxBuffer: 20_000_000 });
    if (proc.status !== 0) throw new Error(proc.stderr);
    const parsed = core.extract(core.parseTsv(proc.stdout), width, height);
    captures.push({id:item.id,split:item.split,fields:parsed.fields});
  }
  const summary={};
  for (const split of ["train","holdout","all"]) {
    const subset=captures.filter(c=>split==="all"||c.split===split);summary[split]={};
    for (const field of core.FIELDS.filter(x=>x!=="result")) {
      const eligible=subset.map(c=>({capture:c,truth:truth.captures.find(t=>t.id===c.id)})).filter(x=>x.truth[field]!==null&&x.truth[field]!==undefined);
      const correct=eligible.filter(x=>normalizeName(x.capture.fields[field].value)===normalizeName(x.truth[field])).length;
      summary[split][field]={exact:correct,total:eligible.length};
    }
  }
  results.push({id:`full-page-psm${psm}`,parameters:{psm,lang:"eng",preprocess:"none"},summary});
}
const tesseractVersion = spawnSync("tesseract", ["--version"], { encoding: "utf8" }).stdout.split("\n")[0];
const output={schemaVersion:"1.0.0",engine:`${tesseractVersion}; field attribution via shared JS core; result color measured separately`,metric:"strict field value and side attribution; result cue excluded from the segmentation mode comparison",results};
fs.writeFileSync(`${__dirname}/segmentation-sweep-results.json`,`${JSON.stringify(output,null,2)}\n`);
for (const row of results) console.log(row.id, row.summary.all);
