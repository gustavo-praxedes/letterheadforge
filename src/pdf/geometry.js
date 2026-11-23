/**
 * PDF geometry (spec 8.3).
 *
 * The Scene speaks millimetres with the origin at the top-left corner and Y
 * growing downwards; a PDF page speaks points with the origin at the bottom-left
 * and Y growing upwards. Everything here is a pure conversion, so the renderer
 * never does arithmetic of its own.
 */
import { mmToPt } from "../core/units.js";

export { mmToPt };

/** PDF page size in points for a sheet measured in millimetres. */
export function pageSizePt(scene) {
  if (!scene || !(scene.widthMm > 0) || !(scene.heightMm > 0)) {
    throw new TypeError("pageSizePt requires a scene with widthMm and heightMm");
  }
  return { widthPt: mmToPt(scene.widthMm), heightPt: mmToPt(scene.heightMm) };
}

/** Baseline Y in PDF points for a millimetre Y measured from the top of the page. */
export function baselinePt(yMm, heightPt) {
  return heightPt - mmToPt(yMm);
}

/**
 * Rectangle in PDF space: `y` in the Scene is the top edge, so the PDF `y` is
 * the bottom edge.
 */
export function rectPt({ x, y, w, h }, heightPt) {
  return { x: mmToPt(x), y: heightPt - mmToPt(y + h), width: mmToPt(w), height: mmToPt(h) };
}

/**
 * Absolute millimetre position of a scene primitive's baseline. Text primitives
 * carry their own box origin plus a per-line baseline offset.
 */
export function textBaselinePt({ x, y, baselineYMm }, heightPt) {
  return { xPt: mmToPt(x), yPt: heightPt - mmToPt(y + baselineYMm) };
}

/**
 * `#RRGGBB`/`#RRGGBBAA` → 0..1 channels plus alpha. Invalid input falls back to
 * black without alpha so a bad colour never kills the export.
 */
export function hexToPdfColor(hex) {
  const fallback = { r: 0, g: 0, b: 0, a: 1 };
  if (typeof hex !== "string") return fallback;
  const value = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) return fallback;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const a = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}
