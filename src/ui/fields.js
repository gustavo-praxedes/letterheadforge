import { displayDecimals } from "../config.js";
import { formatNumber, parseNumber } from "../core/units.js";

/**
 * Numeric field behaviour (spec 10.2): accepts comma or dot, displays a comma,
 * and clamps values outside the range while attaching a warning to the field.
 * Pure: no DOM, so the rules are testable in Node.
 */

export function clampToRange(value, { min, max } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, code: "field.invalidNumber", value };
  }
  if (typeof min === "number" && value < min) {
    return { ok: true, value: min, clamped: true, code: "field.clamped", params: { min, max } };
  }
  if (typeof max === "number" && value > max) {
    return { ok: true, value: max, clamped: true, code: "field.clamped", params: { min, max } };
  }
  return { ok: true, value, clamped: false };
}

/**
 * Read what the user typed: parse, clamp, and produce the display text.
 */
export function readField(text, range = {}, { unit = null, decimals = displayDecimals } = {}) {
  const parsed = parseNumber(text);
  if (!parsed.ok) {
    return { ok: false, code: parsed.code, display: String(text ?? ""), warning: parsed.code };
  }
  const clamped = clampToRange(parsed.value, range);
  const display = formatNumber(clamped.value, decimals);
  return {
    ok: true,
    value: clamped.value,
    display,
    unit,
    clamped: clamped.clamped,
    warning: clamped.clamped ? "field.clamped" : null,
  };
}

/**
 * Display text for a value already in the preset.
 */
export function fieldText(value, { unit = null, decimals = displayDecimals } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const text = formatNumber(value, decimals);
  return unit ? `${text} ${unit}` : text;
}

/**
 * Normalise a list of fields for rendering: keeps the order and guarantees ids.
 */
export function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((field) => field && typeof field.id === "string" && typeof field.path === "string")
    .map((field) => ({
      unit: null,
      decimals: displayDecimals,
      ...field,
      text: field.type === "number" ? fieldText(field.value, field) : field.value,
    }));
}
