import { units as unitConfig, displayDecimals } from "../config.js";

/** Convert millimetres to PDF points. */
export function mmToPt(mm) {
  return (mm * unitConfig.ptPerInch) / unitConfig.mmPerInch;
}

/** Convert PDF points to millimetres. */
export function ptToMm(pt) {
  return (pt * unitConfig.mmPerInch) / unitConfig.ptPerInch;
}

const AMBIGUOUS_THOUSANDS = /^\d{1,3}\.\d{3}$/;
const PLAIN_NUMBER = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Read a number typed in pt-BR or en-US notation.
 * Never throws: invalid input returns a code.
 */
export function parseNumber(text) {
  if (typeof text === "number") {
    if (!Number.isFinite(text)) return { ok: false, code: "units.invalidNumber" };
    return { ok: true, value: text };
  }
  if (typeof text !== "string") return { ok: false, code: "units.invalidNumber" };

  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, code: "units.invalidNumber" };
  if (AMBIGUOUS_THOUSANDS.test(trimmed)) return { ok: false, code: "units.ambiguousNumber" };
  if (!PLAIN_NUMBER.test(trimmed)) return { ok: false, code: "units.invalidNumber" };

  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, code: "units.invalidNumber" };
  return { ok: true, value };
}

/**
 * Format a number for display in pt-BR: comma as decimal separator,
 * no trailing zeros, rounded to the given number of decimals.
 */
export function formatNumber(value, decimals = displayDecimals) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, code: "units.invalidNumber" };
  }
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  let text = safe.toFixed(decimals);
  if (text.includes(".")) {
    text = text.replace(/0+$/, "").replace(/\.$/, "");
  }
  return text.replace(".", ",");
}
