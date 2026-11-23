/**
 * Object creation and text editing (spec 5.2, 5.3).
 *
 * Pure functions only: no DOM, no geometry. Every limit comes from config.js
 * (`limits.textBoxCount`, `limits.image`, `limits.minEffectivePpi`,
 * `limits.textSizePt`) and every label from strings.pt-BR.js. The input preset
 * is never mutated — each function returns a fresh preset.
 *
 * Codes are the warning-catalogue keys of spec 10.4, so the panel layer can
 * turn them into messages with `warningText(code, params)`.
 */

import { enums, limits, units } from "../config.js";
import { createImageObject, createTextObject } from "../core/schema.js";
import { strings } from "../strings.pt-BR.js";

const BYTES_PER_MB = 1024 * 1024;

function objectList(preset) {
  return Array.isArray(preset?.objects) ? preset.objects : [];
}

function fill(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    params[key] === undefined ? match : String(params[key]),
  );
}

function clonePreset(preset) {
  return structuredClone(preset);
}

/** How many text boxes the preset already has. */
export function textBoxCount(preset) {
  return objectList(preset).filter((object) => object?.type === "text").length;
}

/** How many images the preset already has (the watermark image does not count). */
export function imageCount(preset) {
  return objectList(preset).filter((object) => object?.type === "image").length;
}

/** May another text box be created? */
export function canAddTextBox(preset) {
  const count = textBoxCount(preset);
  if (count >= limits.textBoxCount) {
    return { ok: false, code: "text.limitCount", params: { max: limits.textBoxCount } };
  }
  return { ok: true, count };
}

/** May another image be created? */
export function canAddImage(preset) {
  const count = imageCount(preset);
  if (count >= limits.image.maxCount) {
    return { ok: false, code: "image.limitCount", params: { max: limits.image.maxCount } };
  }
  return { ok: true, count };
}

function nextTextName(preset) {
  return fill(strings.objects.names.text, { index: textBoxCount(preset) + 1 });
}

function nextImageName(preset) {
  return fill(strings.objects.names.image, { index: imageCount(preset) + 1 });
}

/**
 * Append a text box on top of the stack. Returns `{ ok, preset, id }`; the id is
 * the created object, handy for selecting it right after.
 */
export function addTextBox(preset) {
  if (preset === null || typeof preset !== "object") {
    return { ok: false, code: "objects.invalidPreset" };
  }
  const gate = canAddTextBox(preset);
  if (!gate.ok) return gate;

  const object = createTextObject({ name: nextTextName(preset) });
  const next = clonePreset(preset);
  next.objects = [...objectList(preset), object];
  return { ok: true, preset: next, id: object.id };
}

/**
 * Append an image object. `props` are the object properties (`imageId`, name,
 * opacity…) — the file itself lives in the store image map.
 */
export function addImage(preset, props = {}) {
  if (preset === null || typeof preset !== "object") {
    return { ok: false, code: "objects.invalidPreset" };
  }
  const gate = canAddImage(preset);
  if (!gate.ok) return gate;

  const object = createImageObject({ name: nextImageName(preset), ...props });
  const next = clonePreset(preset);
  next.objects = [...objectList(preset), object];
  return { ok: true, preset: next, id: object.id };
}

/**
 * Where a freshly imported image lands on the page: at most `ratio` of the
 * content width, never taller than the content area, aspect preserved, centred.
 */
export function fitImageInPage({ pageWidthMm, pageHeightMm, margins = {}, pixelWidth, pixelHeight, ratio = 0.6 } = {}) {
  const numbers = [pageWidthMm, pageHeightMm, pixelWidth, pixelHeight];
  if (numbers.some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
    return { ok: false, code: "image.invalidFile" };
  }
  const left = typeof margins.left === "number" ? margins.left : 0;
  const right = typeof margins.right === "number" ? margins.right : 0;
  const top = typeof margins.top === "number" ? margins.top : 0;
  const bottom = typeof margins.bottom === "number" ? margins.bottom : 0;
  const contentWidth = pageWidthMm - left - right;
  const contentHeight = pageHeightMm - top - bottom;
  if (contentWidth <= 0 || contentHeight <= 0) {
    return { ok: false, code: "invalid.contentArea" };
  }

  let width = contentWidth * ratio;
  let height = (pixelHeight / pixelWidth) * width;
  if (height > contentHeight) {
    height = contentHeight;
    width = (pixelWidth / pixelHeight) * height;
  }
  return {
    ok: true,
    w: round(width),
    h: round(height),
    x: round((pageWidthMm - width) / 2),
    y: round((pageHeightMm - height) / 2),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Check an image file before importing it (spec 5.2, R82/R83/R102/R121).
 *
 * `bytes` and the pixel size decide the hard limits. The effective resolution
 * needs the placed size, so it is only checked when `widthMm`/`heightMm` are
 * given — the caller passes the object box it is about to create.
 */
export function validateImageFile({ bytes, width, height, widthMm = null, heightMm = null } = {}) {
  const maxBytesMb = Math.round(limits.image.maxBytes / BYTES_PER_MB);

  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, code: "image.invalidFile" };
  }
  if (bytes > limits.image.maxBytes) {
    return { ok: false, code: "image.tooLarge", params: { maxBytes: maxBytesMb } };
  }
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return { ok: false, code: "image.invalidFile" };
  }
  if (Math.max(width, height) > limits.image.maxSidePx) {
    return { ok: false, code: "image.dimensions", params: { maxSidePx: limits.image.maxSidePx } };
  }

  const ppi = effectivePpi({ width, height, widthMm, heightMm });
  if (ppi !== null && ppi < limits.minEffectivePpi) {
    return {
      ok: false,
      code: "image.lowPpi",
      params: { minPpi: limits.minEffectivePpi, ppi: Math.round(ppi) },
    };
  }
  return { ok: true, ppi: ppi === null ? null : Math.round(ppi) };
}

/** Pixels per inch once the image is placed at the given size in millimetres. */
function effectivePpi({ width, height, widthMm, heightMm }) {
  const pxPerMm = [];
  if (typeof widthMm === "number" && widthMm > 0) pxPerMm.push(width / widthMm);
  if (typeof heightMm === "number" && heightMm > 0) pxPerMm.push(height / heightMm);
  if (pxPerMm.length === 0) return null;
  return Math.min(...pxPerMm) * units.mmPerInch;
}

function firstLine(text) {
  if (typeof text !== "string") return "";
  const line = text.split(/\r?\n/).find((entry) => entry.trim() !== "");
  if (!line) return "";
  const trimmed = line.trim();
  const max = strings.objects.describe.excerptMax;
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

/**
 * Ready-to-read label for a layer list entry: `name · type`, plus a one-line
 * excerpt for text boxes and an explicit "empty" marker when there is no text.
 */
export function describeObject(object) {
  if (object === null || typeof object !== "object") return "";
  const type = strings.layers.types[object.type] ?? String(object.type ?? "");
  const name = typeof object.name === "string" && object.name.trim() !== "" ? object.name.trim() : type;
  const base = fill(strings.objects.describe.label, { name, type });
  if (object.type !== "text") return base;

  const excerpt = firstLine(object.text);
  if (excerpt === "") return fill(strings.objects.describe.emptyText, { label: base });
  return fill(strings.objects.describe.excerpt, { label: base, excerpt });
}

function findTextObject(preset, id) {
  return objectList(preset).find((object) => object?.id === id && object.type === "text") ?? null;
}

/** Replace the content of one text box. */
export function updateTextContent(preset, id, text) {
  if (!findTextObject(preset, id)) return { ok: false, code: "objects.notFound" };
  const next = clonePreset(preset);
  const target = next.objects.find((object) => object.id === id);
  target.text = typeof text === "string" ? text : String(text ?? "");
  return { ok: true, preset: next };
}

/**
 * Update the style of one text box. Only the given keys change; the font size is
 * clamped to `limits.textSizePt` and the alignment must be in `enums.alignments`.
 */
export function updateTextStyle(preset, id, style = {}) {
  if (!findTextObject(preset, id)) return { ok: false, code: "objects.notFound" };

  const next = clonePreset(preset);
  const target = next.objects.find((object) => object.id === id);
  let clamped = false;

  if (typeof style.fontId === "string" && style.fontId.trim() !== "") {
    target.fontId = style.fontId.trim();
  }
  if (typeof style.sizePt === "number" && Number.isFinite(style.sizePt)) {
    const min = limits.textSizePt.min;
    const max = limits.textSizePt.max;
    const value = Math.min(Math.max(style.sizePt, min), max);
    clamped = value !== style.sizePt;
    target.sizePt = value;
  }
  if (typeof style.weight === "number" && Number.isFinite(style.weight)) {
    target.weight = style.weight;
  }
  if (typeof style.italic === "boolean") {
    target.italic = style.italic;
  }
  if (typeof style.color === "string" && style.color.trim() !== "") {
    target.color = style.color.trim();
  }
  if (typeof style.align === "string" && enums.alignments.includes(style.align)) {
    target.align = style.align;
  }

  return { ok: true, preset: next, clamped };
}
