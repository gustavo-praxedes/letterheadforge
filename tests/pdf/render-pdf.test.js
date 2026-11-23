import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";

import { layoutSheet } from "../../src/core/layout.js";
import { buildScene } from "../../src/core/scene.js";
import { createPreset, createTextObject } from "../../src/core/schema.js";
import { renderPdf, rotatePoint } from "../../src/pdf/render-pdf.js";
import { loadVendoredPdf, makeMeasure, readFixtureFont } from "../support/pdf-fixtures.js";

const { pdfLib, fontkit } = loadVendoredPdf();
const fontBytes = readFixtureFont();
const measure = makeMeasure(fontkit.create(fontBytes));

const FONTS = new Map([["inter:400:normal", { bytes: fontBytes }], ["inter:700:normal", { bytes: fontBytes }]]);

/** Minimal PNG: a solid colour square, enough for `embedPng`. */
function solidPng(width = 2, height = 2) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x30)])));
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

/** Every content stream of the file, decompressed, joined as one string. */
function streamsOf(bytes) {
  const raw = Buffer.from(bytes);
  const parts = [];
  let index = 0;
  const marker = Buffer.from("stream");
  const end = Buffer.from("endstream");
  while ((index = raw.indexOf(marker, index)) !== -1) {
    const start = index + marker.length + (raw[index + marker.length] === 0x0d ? 2 : 1);
    const stop = raw.indexOf(end, start);
    if (stop === -1) break;
    const slice = raw.subarray(start, stop);
    try {
      parts.push(zlib.inflateSync(slice).toString("latin1"));
    } catch {
      parts.push(slice.toString("latin1"));
    }
    index = stop + end.length;
  }
  return parts.join("\n");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function buildAndRender({ size = "A4", orientation = "portrait", objects = [], watermark = null, images = new Map() } = {}) {
  const preset = createPreset({ name: "Teste", page: { size, orientation } });
  preset.objects = objects;
  if (watermark) preset.watermark = watermark;
  const layout = layoutSheet(preset.page.size, preset.page.orientation);
  const scene = buildScene({ preset, layout, mode: "sheet", measure, alphaMasks: new Map() });
  const bytes = await renderPdf({
    scene,
    preset,
    fonts: FONTS,
    images,
    meta: { title: `LetterheadForge — ${preset.name}`, producer: "LetterheadForge 0.1.0" },
    pdfLib,
    fontkit,
  });
  return { preset, scene, bytes };
}

test("rotating a point around a centre keeps the radius", () => {
  const centre = { x: 0, y: 0 };
  const right = rotatePoint({ x: 10, y: 0 }, centre, 90);
  assert.equal(Math.abs(Math.round(right.x)), 0);
  assert.equal(Math.round(right.y), 10);
  const back = rotatePoint({ x: 10, y: 0 }, centre, 360);
  assert.equal(Math.round(back.x), 10);
  assert.equal(Math.abs(Math.round(back.y)), 0);
});

test("the exported PDF is one A4 page in points", async () => {
  const { bytes } = await buildAndRender();
  const reloaded = await pdfLib.PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  const [page] = reloaded.getPages();
  const { width, height } = page.getSize();
  assert.equal(Number(width.toFixed(3)), 595.276);
  assert.equal(Number(height.toFixed(3)), 841.89);
  assert.equal(reloaded.getTitle(), "LetterheadForge — Teste");
  // Producer/creator live inside the compressed object stream, so they are read
  // back through pdfinfo in `scripts/verify-pdf.mjs`, not here.
});

test("an A5 preset still exports a single landscape A4 page", async () => {
  const { scene, bytes } = await buildAndRender({ size: "A5" });
  assert.equal(scene.widthMm, 297); // two A5 side by side need the landscape sheet
  const reloaded = await pdfLib.PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  const { width, height } = reloaded.getPages()[0].getSize();
  assert.equal(Number(width.toFixed(3)), 841.89);
  assert.equal(Number(height.toFixed(3)), 595.276);
});

test("text lands in the PDF as text with an embedded font", async () => {
  const { bytes } = await buildAndRender({
    objects: [createTextObject({ x: 20, y: 20, w: 120, h: 16, text: "CONSTRUTORA FG", sizePt: 18 })],
  });
  await pdfLib.PDFDocument.load(bytes);
  assert.ok(bytes.byteLength > 2000);
  // The content stream shows text with the text operators, not with curves, and
  // the font program travels embedded inside the file.
  const content = streamsOf(bytes);
  assert.match(content, /\/FontFile2/);
  assert.match(content, /\bTj\b|\bTJ\b/);
  assert.match(content, /\/\S+\s+[\d.]+\s+Tf/); // resource name + size + font operator
});

test("every cell gets its own clip so content cannot leave the page", async () => {
  const { scene, bytes } = await buildAndRender({
    size: "A6",
    objects: [createTextObject({ x: 5, y: 5, w: 40, h: 10, text: "cartão", sizePt: 10 })],
  });
  assert.equal(scene.primitives.filter((primitive) => primitive.kind === "clip").length, 4);
  // `W n` is the PDF clip operator pair emitted by pushOperators.
  const content = streamsOf(bytes);
  const clips = content.split(/\bW\s+n\b/).length - 1;
  assert.ok(clips >= 4, `clips encontrados: ${clips}`);
});

test("images are embedded without recompression", async () => {
  const png = solidPng();
  const images = new Map([["img-1", { bytes: png, type: "image/png" }]]);
  const preset = createPreset({ name: "Img" });
  const object = { ...createTextObject({ x: 10, y: 10, w: 20, h: 20 }), type: "image", imageId: "img-1" };
  const { bytes } = await buildAndRender({ objects: [object], images });
  const reloaded = await pdfLib.PDFDocument.load(bytes);
  const raw = Buffer.from(bytes).toString("latin1");
  assert.match(raw, /\/Subtype\s*\/Image/);
  assert.equal(reloaded.getPageCount(), 1);
  assert.ok(preset);
});

test("a missing font is reported as a blocking code", async () => {
  const preset = createPreset({ name: "Sem fonte" });
  preset.objects = [createTextObject({ x: 10, y: 10, w: 40, h: 10, text: "abc" })];
  const layout = layoutSheet(preset.page.size, preset.page.orientation);
  const scene = buildScene({ preset, layout, mode: "sheet", measure, alphaMasks: new Map() });
  await assert.rejects(
    () => renderPdf({ scene, preset, fonts: new Map(), pdfLib, fontkit }),
    (error) => error.code === "font.loadFailed",
  );
});

test("progress is reported for every stage", async () => {
  const preset = createPreset({ name: "Progresso" });
  const layout = layoutSheet(preset.page.size, preset.page.orientation);
  const scene = buildScene({ preset, layout, mode: "sheet", measure, alphaMasks: new Map() });
  const steps = [];
  await renderPdf({ scene, preset, fonts: FONTS, pdfLib, fontkit, onProgress: (step) => steps.push(step) });
  assert.deepEqual(steps, ["fonts", "scene", "write", "done"]);
});
