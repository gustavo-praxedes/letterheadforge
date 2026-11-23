import { ptToMm } from "../core/units.js";

/**
 * Text measurement for the core (spec 8.2): `buildScene` needs to know how wide a
 * string is, in millimetres, before it can lay out lines.
 *
 * Uses a 2D canvas with the same font family, weight, style and size the SVG and
 * the PDF will use, so the preview and the export agree. Results are cached by
 * font + size + text.
 */

const PT_TO_PX = 96 / 72;
const PX_TO_MM = 25.4 / 96;

export function createMeasure({ fontFamily } = {}) {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const context = canvas ? canvas.getContext("2d") : null;
  const cache = new Map();

  function familyFor(fontId) {
    const resolved = typeof fontFamily === "function" ? fontFamily(fontId) : null;
    return resolved ?? fontId ?? "sans-serif";
  }

  function measure(text, style = {}) {
    const value = typeof text === "string" ? text : String(text ?? "");
    const { fontId = "inter", weight = 400, italic = false, sizePt = 10 } = style;
    if (value.length === 0) return 0;

    const key = `${fontId}|${weight}|${italic}|${sizePt}|${value}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    let widthMm;
    if (context) {
      context.font = `${italic ? "italic " : ""}${weight} ${sizePt * PT_TO_PX}px "${familyFor(fontId)}", sans-serif`;
      widthMm = context.measureText(value).width * PX_TO_MM;
    } else {
      // No canvas (Node): approximate with a monospaced assumption, good enough
      // for tests that only need a positive number.
      widthMm = value.length * ptToMm(sizePt) * 0.55;
    }

    cache.set(key, widthMm);
    return widthMm;
  }

  measure.clear = () => cache.clear();
  measure.size = () => cache.size;
  return measure;
}

export const measureText = createMeasure();
