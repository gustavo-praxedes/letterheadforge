import assert from "node:assert/strict";
import test from "node:test";

import { baselinePt, hexToPdfColor, mmToPt, pageSizePt, rectPt, textBaselinePt } from "../../src/pdf/geometry.js";
import { exportFileName, stampDate } from "../../src/pdf/filename.js";
import { fontKey, validateExport } from "../../src/pdf/validate.js";

test("millimetres become points with the PDF ratio", () => {
  assert.equal(Number(mmToPt(210).toFixed(3)), 595.276);
  assert.equal(Number(mmToPt(297).toFixed(3)), 841.89);
  assert.equal(mmToPt(0), 0);
});

test("the page keeps the A4 proportions in points", () => {
  const { widthPt, heightPt } = pageSizePt({ widthMm: 210, heightMm: 297 });
  assert.equal(Number(widthPt.toFixed(3)), 595.276);
  assert.equal(Number(heightPt.toFixed(3)), 841.89);

  const landscape = pageSizePt({ widthMm: 297, heightMm: 210 });
  assert.equal(Number(landscape.widthPt.toFixed(3)), 841.89);
  assert.equal(Number(landscape.heightPt.toFixed(3)), 595.276);
});

test("a rectangle flips to the PDF origin at the bottom-left", () => {
  const heightPt = mmToPt(297);
  const box = rectPt({ x: 10, y: 20, w: 30, h: 40 }, heightPt);
  assert.equal(Number(box.x.toFixed(3)), 28.346);
  assert.equal(Number(box.width.toFixed(3)), 85.039);
  assert.equal(Number(box.height.toFixed(3)), 113.386);
  // top edge is y=20 mm, so the PDF y is the bottom edge: 297 - 60 mm
  assert.equal(Number(box.y.toFixed(3)), Number(mmToPt(297 - 60).toFixed(3)));
});

test("a baseline measured from the top lands at the right height", () => {
  const heightPt = mmToPt(297);
  assert.equal(baselinePt(0, heightPt), heightPt);
  assert.equal(Number(baselinePt(297, heightPt).toFixed(6)), 0);
  const point = textBaselinePt({ x: 15, y: 50, baselineYMm: 4 }, heightPt);
  assert.equal(Number(point.xPt.toFixed(3)), Number(mmToPt(15).toFixed(3)));
  assert.equal(Number(point.yPt.toFixed(3)), Number(mmToPt(297 - 54).toFixed(3)));
});

test("hex colours become 0..1 channels and keep alpha", () => {
  assert.deepEqual(hexToPdfColor("#FFFFFF"), { r: 1, g: 1, b: 1, a: 1 });
  const dark = hexToPdfColor("#081525FF");
  assert.equal(Number(dark.r.toFixed(4)), Number((8 / 255).toFixed(4)));
  assert.equal(dark.a, 1);
  const half = hexToPdfColor("#00000080");
  assert.equal(Number(half.a.toFixed(4)), Number((128 / 255).toFixed(4)));
  assert.deepEqual(hexToPdfColor("nope"), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(hexToPdfColor(undefined), { r: 0, g: 0, b: 0, a: 1 });
});

test("the export file name follows R105", () => {
  const date = new Date(2026, 10, 23);
  assert.deepEqual(exportFileName({ size: "A4", orientation: "portrait", date }), {
    ok: true,
    name: "letterheadforge-a4-retrato-20261123.pdf",
  });
  assert.equal(exportFileName({ size: "a5", orientation: "landscape", date }).name, "letterheadforge-a5-paisagem-20261123.pdf");
  assert.equal(exportFileName({ size: "A6", date }).name, "letterheadforge-a6-retrato-20261123.pdf");
  assert.deepEqual(exportFileName({ size: "A3", date }), { ok: false, code: "export.invalidSize" });
  assert.equal(stampDate(new Date(2026, 0, 5)), "20260105");
});

test("fonts are keyed per weight and style", () => {
  assert.equal(fontKey({ fontId: "inter", weight: 400 }), "inter:400:normal");
  assert.equal(fontKey({ fontId: "lora", weight: 700, italic: true }), "lora:700:italic");
});

test("validation blocks missing fonts, glyphs and images", () => {
  const scene = {
    widthMm: 210,
    heightMm: 297,
    warnings: [{ code: "font.missingGlyph", params: { objectId: "a" } }],
    primitives: [
      { kind: "clip", x: 0, y: 0, w: 210, h: 297, children: [
        { kind: "text", fontId: "inter", weight: 400, lines: [] },
        { kind: "image", imageId: "img-1" },
      ] },
    ],
  };
  const fonts = new Map([["inter:400:normal", { ok: false, code: "font.loadFailed" }]]);
  const result = validateExport({ preset: { page: { margins: { top: 10, right: 10, bottom: 10, left: 10 } } }, scene, fonts, images: new Map() });
  assert.equal(result.ok, false);
  const codes = result.errors.map((error) => error.code).sort();
  assert.deepEqual(codes, ["font.loadFailed", "font.missingGlyph", "image.invalidFile"]);
});

test("validation passes a clean scene", () => {
  const scene = {
    widthMm: 210,
    heightMm: 297,
    warnings: [],
    primitives: [{ kind: "clip", x: 0, y: 0, w: 210, h: 297, children: [{ kind: "text", fontId: "inter", weight: 400 }] }],
  };
  const result = validateExport({
    preset: { page: { margins: { top: 10, right: 10, bottom: 10, left: 10 } } },
    scene,
    fonts: new Map([["inter:400:normal", { ok: true, bytes: new Uint8Array([1]) }]]),
  });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("validation rejects margins outside the allowed range", () => {
  const result = validateExport({
    preset: { page: { margins: { top: 90, right: 10, bottom: -1, left: 10 } } },
    scene: { widthMm: 210, heightMm: 297, primitives: [], warnings: [] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.filter((error) => error.code === "invalid.margin").length, 2);
});
