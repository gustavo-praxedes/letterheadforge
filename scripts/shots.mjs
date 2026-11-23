#!/usr/bin/env node
/**
 * Screenshot capture for the visual review agent (AGENTS.md 1.1).
 * Captures only; never inspects or judges the images.
 *
 * Usage:
 *   npm run serve &
 *   npm run shots -- --revisao m2-01 [--url http://localhost:8080/] [--mobile] [--config scripts/shots.config.json]
 *
 * Output: temp/shots/<revisao>/NN-<label>.png + manifest.json
 */
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

function parseArgs(argv) {
  const args = { revisao: "manual", url: "http://localhost:8080/", mobile: false, theme: "light" };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--mobile") args.mobile = true;
    else if (token === "--revisao") args.revisao = rest[++i];
    else if (token === "--url") args.url = rest[++i];
    else if (token === "--theme") args.theme = rest[++i];
    else if (token === "--config") args.config = rest[++i];
    else if (token.startsWith("--")) throw new Error(`Unknown flag: ${token}`);
  }
  return args;
}

async function loadShots(path) {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  const shots = Array.isArray(parsed) ? parsed : parsed.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    throw new Error(`No shots defined in ${path}`);
  }
  return shots;
}

async function applyAction(page, action) {
  if (action.type === "click") await page.click(action.selector);
  else if (action.type === "fill") await page.fill(action.selector, action.value ?? "");
  else if (action.type === "press") await page.press(action.selector ?? "body", action.key);
  else if (action.type === "wait") await page.waitForTimeout(action.ms ?? 200);
  else if (action.type === "scrollIntoView") await page.locator(action.selector).scrollIntoViewIfNeeded();
  else if (action.type === "dump") {
    const value = await page.evaluate(action.script ?? "1");
    process.stdout.write(`  dump ${action.label ?? ""}: ${JSON.stringify(value)}\n`);
  }
  else throw new Error(`Unknown action type: ${action.type}`);
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const args = parseArgs(process.argv);
  const configPath = resolve(args.config ?? "scripts/shots.config.json");
  const shots = await loadShots(configPath);
  const baseDir = resolve("temp/shots", slug(args.revisao));
  await mkdir(baseDir, { recursive: true });

  const browser = await chromium.launch();
  const manifest = {
    revisao: args.revisao,
    url: args.url,
    theme: args.theme,
    capturedAt: new Date().toISOString(),
    shots: [],
  };

  try {
    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index];
      const viewportName = shot.viewport ?? (args.mobile ? "mobile" : "desktop");
      const viewport = VIEWPORTS[viewportName] ?? VIEWPORTS.desktop;
      const context = await browser.newContext({
        viewport,
        colorScheme: args.theme === "dark" ? "dark" : "light",
        deviceScaleFactor: shot.scale ?? 1,
      });
      const page = await context.newPage();
      const baseUrl = new URL(args.url).toString();
      const target = shot.path && shot.path !== "/" ? new URL(shot.path, baseUrl).toString() : baseUrl;
      await page.goto(target, { waitUntil: "load" });
      // waitFor first: the app mounts its panels from module JS, so actions
      // fired before that selector exists click into the void.
      if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 15000 });
      for (const action of shot.actions ?? []) await applyAction(page, action);
      if (shot.settleMs) await page.waitForTimeout(shot.settleMs);
      const name = `${String(index + 1).padStart(2, "0")}-${slug(shot.label ?? `shot-${index + 1}`)}.png`;
      const file = join(baseDir, name);
      await page.screenshot({ path: file, fullPage: Boolean(shot.fullPage) });
      manifest.shots.push({
        file,
        label: shot.label ?? name,
        viewport: viewportName,
        url: target,
        fullPage: Boolean(shot.fullPage),
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const manifestPath = join(baseDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${manifest.shots.length} shot(s) -> ${baseDir}\n`);
  for (const shot of manifest.shots) process.stdout.write(`  ${shot.label}: ${shot.file}\n`);
  process.stdout.write(`  manifest: ${manifestPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`shots failed: ${error.message}\n`);
  process.exitCode = 1;
});

export { parseArgs, slug, VIEWPORTS };
void dirname;
