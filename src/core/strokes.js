import { enums, epsilon, limits, strokePatterns, strokeScale } from "../config.js";

/**
 * Normalise a stroke style into renderer-agnostic dash data.
 * Patterns are multiples of the thickness, scaled by config.strokeScale.
 * The pattern starts at the beginning of every segment (dashOffset 0).
 */
export function normalizeStroke({ style = "solid", thickness } = {}) {
  if (!enums.rulingStyles.includes(style)) {
    return { ok: false, code: "strokes.invalidStyle" };
  }
  if (typeof thickness !== "number" || !Number.isFinite(thickness)) {
    return { ok: false, code: "strokes.invalidThickness" };
  }
  const { min, max } = limits.rulingThickness;
  if (thickness < min - epsilon || thickness > max + epsilon) {
    return { ok: false, code: "strokes.invalidThickness" };
  }

  const pattern = strokePatterns[style] ?? [];
  const dash = pattern.map((multiple) => multiple * thickness * strokeScale);
  const cap = style === "solid" || style === "dashed" ? "butt" : "round";

  return {
    ok: true,
    style,
    thickness,
    cap,
    dash,
    dashOffset: 0,
  };
}
