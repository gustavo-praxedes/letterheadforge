/**
 * Blocking validation before the PDF worker starts (spec 8.2 step 1, R81, P3).
 *
 * Pure: it receives what the browser already knows — the preset, the scene (with
 * its warnings), the font buffers and the image records — and returns a list of
 * blocking errors. No DOM, no fetch, so every rule is testable in Node.
 */

const BLOCKING_WARNINGS = new Set(["font.missingGlyph", "font.loadFailed", "text.invalid", "ruling.areaTooSmall"]);

/**
 * @param {object} input
 * @param {object} input.preset validated preset
 * @param {object} input.scene scene used for export (mode "sheet")
 * @param {Map<string,{ok:boolean,bytes?:Uint8Array,code?:string}>} [input.fonts]
 * @param {Map<string,{bytes:Uint8Array,type:string}>} [input.images]
 * @param {(preset:object)=>object} [input.validatePreset]
 * @param {object} [input.limits]
 */
export function validateExport({ preset, scene, fonts = new Map(), images = new Map(), validatePreset = null, limits = null } = {}) {
  const errors = [];

  if (!preset || typeof preset !== "object") {
    return { ok: false, errors: [{ code: "preset.invalid", params: {} }] };
  }
  if (typeof validatePreset === "function") {
    const result = validatePreset(preset);
    if (!result || result.ok !== true) {
      errors.push({ code: "preset.invalid", params: { reason: result?.code ?? null } });
    }
  }
  if (!scene || !Array.isArray(scene.primitives) || !(scene.widthMm > 0) || !(scene.heightMm > 0)) {
    errors.push({ code: "export.failed", params: { reason: "scene" } });
  }

  // Fonts: every referenced font must have arrived, and no glyph may be missing.
  const required = new Set();
  for (const primitive of scene?.primitives ?? []) {
    collectFonts(primitive, required);
  }
  for (const key of required) {
    const record = fonts.get(key);
    if (record && record.ok === false) {
      errors.push({ code: "font.loadFailed", params: { font: key, reason: record.code ?? null } });
    }
  }
  for (const warning of scene?.warnings ?? []) {
    if (BLOCKING_WARNINGS.has(warning.code)) {
      errors.push({ code: warning.code, params: warning.params ?? {} });
    }
  }

  // Images: every image primitive must have bytes, and the totals must respect the limits.
  const usedImages = new Set();
  let usedBytes = 0;
  for (const primitive of scene?.primitives ?? []) {
    collectImages(primitive, usedImages);
  }
  for (const id of usedImages) {
    const record = images.get(id);
    if (!record || !(record.bytes?.byteLength > 0)) {
      errors.push({ code: "image.invalidFile", params: { imageId: id } });
      continue;
    }
    usedBytes += record.bytes.byteLength;
    if (limits?.image?.maxBytes && record.bytes.byteLength > limits.image.maxBytes) {
      errors.push({ code: "image.tooLarge", params: { imageId: id, maxBytes: Math.round(limits.image.maxBytes / 1024 / 1024) } });
    }
  }
  if (limits?.image?.maxTotalBytes && usedBytes > limits.image.maxTotalBytes) {
    errors.push({ code: "image.tooLarge", params: { maxBytes: Math.round(limits.image.maxTotalBytes / 1024 / 1024) } });
  }

  const margins = preset.page?.margins;
  if (margins) {
    for (const side of ["top", "right", "bottom", "left"]) {
      const value = margins[side];
      if (!Number.isFinite(value) || value < 0 || value > (limits?.marginMax ?? 50)) {
        errors.push({ code: "invalid.margin", params: { side, value } });
      }
    }
  }

  return { ok: errors.length === 0, errors: dedupe(errors) };
}

function collectFonts(primitive, target) {
  if (!primitive || typeof primitive !== "object") return;
  if (primitive.kind === "text") {
    target.add(fontKey(primitive));
  }
  for (const child of primitive.children ?? []) collectFonts(child, target);
}

function collectImages(primitive, target) {
  if (!primitive || typeof primitive !== "object") return;
  if (primitive.kind === "image" && primitive.imageId) target.add(primitive.imageId);
  for (const child of primitive.children ?? []) collectImages(child, target);
}

/** Fonts are embedded per style, so the key carries weight and italic. */
export function fontKey(primitive) {
  const weight = primitive.weight ?? 400;
  const style = primitive.italic ? "italic" : "normal";
  return `${primitive.fontId}:${weight}:${style}`;
}

function dedupe(errors) {
  const seen = new Set();
  const out = [];
  for (const error of errors) {
    const key = `${error.code}|${JSON.stringify(error.params ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(error);
  }
  return out;
}
