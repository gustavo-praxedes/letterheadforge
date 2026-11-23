/**
 * Shared fixtures for the PDF tests: the vendored pdf-lib namespace, the
 * fontkit module and a measure function backed by the real font metrics.
 *
 * Both vendored files are UMD builds that attach themselves to `self`, so Node
 * needs that global before they load — the same trick the worker does not need
 * because it runs in a worker scope.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { ptToMm } from "../../src/core/units.js";

const requireFromTest = createRequire(import.meta.url);
let cached = null;

export function loadVendoredPdf() {
  if (cached) return cached;
  globalThis.self ??= globalThis;
  requireFromTest("../../vendor/pdf-lib/pdf-lib.min.js");
  requireFromTest("../../vendor/fontkit/fontkit.umd.min.js");
  if (!globalThis.PDFLib?.PDFDocument) throw new Error("pdf-lib did not attach to self.PDFLib");
  if (!globalThis.fontkit?.create) throw new Error("fontkit did not attach to self.fontkit");
  cached = { pdfLib: globalThis.PDFLib, fontkit: globalThis.fontkit };
  return cached;
}

export function readFixtureFont() {
  return new Uint8Array(readFileSync(new URL("../fixtures/inter-latin-400.woff", import.meta.url)));
}

/** Measure function in millimetres, from fontkit metrics — the production rule. */
export function makeMeasure(font) {
  return (text, style = {}) => {
    const value = typeof text === "string" ? text : String(text ?? "");
    if (value === "") return 0;
    const sizePt = style.sizePt ?? 10;
    const run = font.layout(value);
    const units = run.positions.reduce((total, position) => total + position.xAdvance, 0);
    return (units / font.unitsPerEm) * sizePt * ptToMm(1);
  };
}
