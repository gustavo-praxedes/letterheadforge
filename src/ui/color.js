/**
 * Colour maths for the picker (spec 6). Pure, no DOM.
 * Hex accepts #RGB, #RRGGBB and #RRGGBBAA.
 */

const SHORT_HEX = /^#([0-9a-fA-F]{3})$/;
const HEX_6 = /^#([0-9a-fA-F]{6})$/;
const HEX_8 = /^#([0-9a-fA-F]{8})$/;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function roundByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function parseHex(input) {
  if (typeof input !== "string") return { ok: false, code: "color.invalid" };
  const text = input.trim();
  let match = SHORT_HEX.exec(text);
  if (match) {
    const [r, g, b] = match[1].split("").map((char) => parseInt(char + char, 16));
    return { ok: true, r, g, b, a: 1 };
  }
  match = HEX_6.exec(text);
  if (match) {
    const value = match[1];
    return {
      ok: true,
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
      a: 1,
    };
  }
  match = HEX_8.exec(text);
  if (match) {
    const value = match[1];
    return {
      ok: true,
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
      a: parseInt(value.slice(6, 8), 16) / 255,
    };
  }
  return { ok: false, code: "color.invalid" };
}

export function toHex({ r, g, b, a = 1 }, { alpha = false } = {}) {
  const bytes = [r, g, b].map((channel) => roundByte(channel).toString(16).padStart(2, "0"));
  if (!alpha) return `#${bytes.join("").toUpperCase()}`;
  const alfa = roundByte(clamp01(a) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${bytes.join("").toUpperCase()}${alfa.toUpperCase()}`;
}

export function rgbToHsv({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

export function hsvToRgb({ h, s, v }) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const table = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[Math.floor(hue / 60) % 6];
  return {
    r: roundByte((r + m) * 255),
    g: roundByte((g + m) * 255),
    b: roundByte((b + m) * 255),
  };
}

function channelLuminance(value) {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color) {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

export function contrastRatio(colorA, colorB) {
  const first = relativeLuminance(colorA);
  const second = relativeLuminance(colorB);
  const [high, low] = first >= second ? [first, second] : [second, first];
  return Number(((high + 0.05) / (low + 0.05)).toFixed(2));
}

/**
 * Text colour that stays readable on top of `background` (used by swatches).
 */
export function readableTextColor(background) {
  return contrastRatio(background, { r: 255, g: 255, b: 255 }) >=
    contrastRatio(background, { r: 0, g: 0, b: 0 })
    ? "#FFFFFF"
    : "#000000";
}

/**
 * Recent colours: newest first, no duplicates, capped.
 */
export function pushRecent(list, color, { limit = 8 } = {}) {
  const normalized = toHex(parseHex(color) ?? { r: 0, g: 0, b: 0 }, { alpha: false });
  const next = [normalized, ...(Array.isArray(list) ? list : []).filter((entry) => entry !== normalized)];
  return next.slice(0, limit);
}
