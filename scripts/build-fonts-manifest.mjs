#!/usr/bin/env node
/**
 * Build `data/fonts.json` from the public Fontsource API (spec 7.1, no API key).
 *
 * The URL model needs the npm package version, not the API `version` field
 * (decision D11 noted in docs/02.01.00-DECISOES.md), so this script stores
 * `version` = npmVersion and `subsets` filtered to the ones the project uses.
 *
 * Usage: npm run manifest:fonts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fonts } from "../src/config.js";

const SHORT_LIST = [
  "inter",
  "roboto",
  "open-sans",
  "lato",
  "montserrat",
  "poppins",
  "playfair-display",
  "merriweather",
  "lora",
  "oswald",
  "roboto-mono",
  "dancing-script",
  "caveat",
  "pacifico",
  "great-vibes",
];

const API = "https://api.fontsource.org/v1/fonts";
const OUTPUT = resolve("data/fonts.json");
const WEIGHTS = ["300", "400", "500", "600", "700"];
const STYLES = ["normal", "italic"];

async function fetchFont(id) {
  const response = await fetch(`${API}/${id}`);
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const data = await response.json();
  const subsets = (data.subsets ?? []).filter((subset) => fonts.subsets.includes(subset));
  const weights = (data.weights ?? []).filter((weight) => WEIGHTS.includes(String(weight)));
  const styles = (data.styles ?? []).filter((style) => STYLES.includes(style));

  if (!subsets.includes("latin")) throw new Error(`${id}: no latin subset`);
  if (weights.length === 0) throw new Error(`${id}: no supported weight`);

  return {
    id,
    family: data.family ?? id,
    category: data.category ?? "sans-serif",
    weights: weights.map(Number).sort((a, b) => a - b),
    styles,
    subsets,
    version: data.npmVersion,
  };
}

async function main() {
  const entries = [];
  for (const id of SHORT_LIST) {
    entries.push(await fetchFont(id));
    process.stdout.write(`ok ${id}@${entries.at(-1).version}\n`);
  }
  entries.sort((a, b) => SHORT_LIST.indexOf(a.id) - SHORT_LIST.indexOf(b.id));
  const payload = { generatedAt: new Date().toISOString().slice(0, 10), shortList: SHORT_LIST, fonts: entries };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${entries.length} fonts -> ${OUTPUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`manifest:fonts failed: ${error.message}\n`);
  process.exitCode = 1;
});
