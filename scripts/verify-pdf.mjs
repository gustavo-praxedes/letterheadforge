/**
 * End-to-end proof of Marco 3: image import, export, cancel and 0.2 mm tolerance.
 *
 *   node scripts/verify-pdf.mjs
 *
 * Needs a local server on :8080 (`npm run serve`) and poppler on PATH or in
 * `%LOCALAPPDATA%\vault-runtime\poppler\Library\bin`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { chromium } from "playwright";

const OUT = "temp/verify";
const POPPLER = [
  join(process.env.LOCALAPPDATA ?? "", "vault-runtime", "poppler", "Library", "bin"),
  "",
];

mkdirSync(OUT, { recursive: true });

function poppler(name, args) {
  for (const dir of POPPLER) {
    const exe = dir ? join(dir, name) : name;
    try {
      return execFileSync(exe, args, { encoding: "buffer" });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
  }
  throw new Error(`${name} não encontrado`);
}

/** PNG with coloured bands so the raster check has something to find. */
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2; // truecolour
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      // top third red, middle third green, bottom third blue
      const band = Math.floor((y / height) * 3);
      row[1 + x * 3] = band === 0 ? 220 : 20;
      row[2 + x * 3] = band === 1 ? 200 : 20;
      row[3 + x * 3] = band === 2 ? 220 : 20;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Bounding box of dark pixels in a grayscale PGM, in pixels. */
function darkBBox(ppm) {
  const text = ppm.subarray(0, 64).toString("latin1");
  const match = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(text);
  if (!match) throw new Error("PGM inesperado");
  const width = Number(match[1]);
  const height = Number(match[2]);
  const offset = match[0].length;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (ppm[offset + y * width + x] < 128) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { width, height, minX, minY, maxX, maxY };
}

/** Bounding box of non-grey pixels in a P6 PPM, in pixels. */
function colourBBox(ppm) {
  const header = ppm.subarray(0, 64).toString("latin1");
  const match = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(header);
  if (!match) throw new Error("PPM inesperado");
  const width = Number(match[1]);
  const height = Number(match[2]);
  const offset = match[0].length;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = offset + (y * width + x) * 3;
      const r = ppm[i];
      const g = ppm[i + 1];
      const b = ppm[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 30) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { width, height, minX, minY, maxX, maxY };
}

const report = [];

/* ---------- 1. frame geometry: 0.2 mm tolerance ---------- */
{
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("http://localhost:8080/", { waitUntil: "load" });
  await page.waitForSelector("main");
  await page.waitForTimeout(1400);

  // Read the geometry that is actually applied, instead of assuming defaults.
  const preset = await page.evaluate(async () => {
    const mod = await import("/src/main.js");
    const current = mod.store.getPreset();
    return { margins: current.page.margins, frame: current.frame, size: current.page.size };
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.click("#export-pdf");
  const download = await downloadPromise;
  const file = join(OUT, await download.suggestedFilename());
  await download.saveAs(file);
  await browser.close();

  poppler("pdftoppm", ["-r", "300", "-gray", "-singlefile", file, join(OUT, "quadro")]);
  const raster = readFileSync(join(OUT, "quadro.pgm"));
  const bbox = darkBBox(raster);

  // A4 is 210 mm wide; the raster width gives the exact scale pdftoppm used.
  const mmPerPx = 210 / bbox.width;
  const mm = (value) => Number((value * mmPerPx).toFixed(3));

  // The frame is a rect stroked with `thickness`, so its ink starts half a
  // stroke outside the margin.
  const half = (preset.frame.thickness ?? 0.5) / 2;
  const expected = {
    left: Number((preset.margins.left - half).toFixed(3)),
    top: Number((preset.margins.top - half).toFixed(3)),
    right: Number((210 - preset.margins.right + half).toFixed(3)),
    bottom: Number((297 - preset.margins.bottom + half).toFixed(3)),
  };
  const actual = { left: mm(bbox.minX), top: mm(bbox.minY), right: mm(bbox.maxX + 1), bottom: mm(bbox.maxY + 1) };
  const deltas = Object.fromEntries(Object.keys(expected).map((side) => [side, Number(Math.abs(actual[side] - expected[side]).toFixed(3))]));
  const worst = Math.max(...Object.values(deltas));

  report.push({
    prova: "moldura no PDF × posição esperada",
    presetLido: { margens: preset.margins, espessura: preset.frame.thickness },
    rasterPx: [bbox.width, bbox.height],
    esperado: expected,
    medido: actual,
    erroMm: deltas,
    dentroDeTolerancia: worst <= 0.2,
  });
}

/* ---------- 2. image import + export ---------- */
{
  const pngPath = join(OUT, "faixas.png");
  writeFileSync(pngPath, makePng(3000, 2000));

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:8080/", { waitUntil: "load" });
  await page.waitForSelector("main");
  await page.waitForTimeout(1400);

  await page.click('[data-section="objects"] .panel__summary');
  await page.waitForTimeout(300);
  page.once("filechooser", (chooser) => chooser.setFiles(pngPath));
  await page.click("#panel-field-objects-addImage");
  await page.waitForTimeout(2500);

  const placedImageRect = await page.evaluate(async () => {
    const mod = await import("/src/main.js");
    const preset = mod.store.getPreset();
    const image = preset.objects.find((object) => object.type === "image");
    return image ? { x: image.x, y: image.y, w: image.w, h: image.h } : { x: 0, y: 0, w: 0, h: 0 };
  });

  const afterImport = await page.evaluate(() => ({
    camadas: document.querySelectorAll(".layers__row").length,
    imagensNoSvg: document.querySelectorAll("#preview-stage svg image").length,
    toasts: [...document.querySelectorAll(".toast")].map((node) => node.textContent.trim()),
  }));

  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.click("#export-pdf");
  const download = await downloadPromise;
  const file = join(OUT, "com-imagem.pdf");
  await download.saveAs(file);
  await browser.close();

  const info = poppler("pdfimages", ["-list", file]).toString("latin1");
  poppler("pdftoppm", ["-r", "150", "-singlefile", file, join(OUT, "com-imagem")]);
  const raster = colourBBox(readFileSync(join(OUT, "com-imagem.ppm")));
  const mmPerPx = 210 / raster.width;
  const placed = placedImageRect;

  const medidas = {
    esquerda: Number((raster.minX * mmPerPx).toFixed(3)),
    topo: Number((raster.minY * mmPerPx).toFixed(3)),
    direita: Number(((raster.maxX + 1) * mmPerPx).toFixed(3)),
    base: Number(((raster.maxY + 1) * mmPerPx).toFixed(3)),
  };
  const esperadoImg = {
    esquerda: Number(placed.x.toFixed(3)),
    topo: Number(placed.y.toFixed(3)),
    direita: Number((placed.x + placed.w).toFixed(3)),
    base: Number((placed.y + placed.h).toFixed(3)),
  };
  const erroImg = Math.max(
    ...Object.keys(esperadoImg).map((side) => Number(Math.abs(medidas[side] - esperadoImg[side]).toFixed(3))),
  );

  report.push({
    prova: "imagem importada e exportada",
    posicaoNoPdf: { medido: medidas, esperado: esperadoImg, erroMaximoMm: erroImg, dentroDeTolerancia: erroImg <= 0.2 },
    camadasDepoisDeImportar: afterImport.camadas,
    imagensNoPreview: afterImport.imagensNoSvg,
    avisos: afterImport.toasts,
    pdfimages: info.split("\n").slice(0, 3).join(" | ").trim(),
    erros: errors.slice(0, 2),
  });
}

/* ---------- 3. cancel ---------- */
{
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("http://localhost:8080/", { waitUntil: "load" });
  await page.waitForSelector("main");
  await page.waitForTimeout(1400);

  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });

  await page.click("#export-pdf");
  await page.waitForTimeout(20);
  await page.click("#export-cancel");
  await page.waitForTimeout(3000);

  const state = await page.evaluate(() => ({
    botao: document.getElementById("export-pdf").textContent,
    cancelarVisivel: !document.getElementById("export-cancel").hidden,
    toasts: [...document.querySelectorAll(".toast")].map((node) => node.textContent.trim()),
  }));
  await browser.close();

  report.push({
    prova: "cancelar interrompe sem baixar",
    baixouArquivo: downloaded,
    estado: state,
    passou: downloaded === false && state.toasts.some((text) => /cancelada/i.test(text)),
  });
}

console.log(JSON.stringify(report, null, 2));
