#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getBenchmarkConfig, renderMarkdown, runBenchmark } from "./benchmark.mjs";

const args = process.argv.slice(2);
if (!args.includes("--execute")) {
  console.error("Aucun appel effectué. Relancez explicitement avec --execute <rapport.json> [rapport.md].");
  process.exitCode = 2;
} else {
  const executeIndex = args.indexOf("--execute");
  const providerIndex = args.indexOf("--provider");
  const provider = providerIndex === -1 ? "all" : args[providerIndex + 1];
  const input = args[executeIndex + 1];
  const output = args[executeIndex + 2] || "experiments/war-analysis-provider-benchmark/BENCHMARK_RESULT.md";
  if (!input) throw new Error("Chemin du rapport manquant après --execute.");
  const report = JSON.parse(await readFile(resolve(input), "utf8"));
  if (!provider) throw new Error("Valeur manquante après --provider.");
  const run = await runBenchmark({ report, config: getBenchmarkConfig(), provider });
  await writeFile(resolve(output), renderMarkdown(run, input));
  console.log(`Rapport écrit dans ${output}.`);
}
