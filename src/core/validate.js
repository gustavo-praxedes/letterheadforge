import { enums, epsilon, limits, paperSizes } from "../config.js";

const HEX_OPAQUE = /^#[0-9a-fA-F]{6}$/;
const HEX_WITH_ALPHA = /^#[0-9a-fA-F]{8}$/;
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];

function issue(code, path, params) {
  return params === undefined ? { code, path } : { code, path, params };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkRange(value, range, code, path, errors) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(issue(code, path, { min: range.min, max: range.max }));
    return false;
  }
  if (value < range.min - epsilon || value > range.max + epsilon) {
    errors.push(issue(code, path, { min: range.min, max: range.max, value }));
    return false;
  }
  return true;
}

function checkColor(value, { alpha }, path, errors) {
  const pattern = alpha ? HEX_WITH_ALPHA : HEX_OPAQUE;
  const accepted = alpha ? HEX_WITH_ALPHA.test(value ?? "") || HEX_OPAQUE.test(value ?? "") : pattern.test(value ?? "");
  if (!accepted) errors.push(issue("invalid.color", path, { alpha: Boolean(alpha) }));
}

function checkEnum(value, catalogue, path, errors) {
  if (!catalogue.includes(value)) errors.push(issue("invalid.enum", path, { allowed: catalogue.join("|") }));
}

function validateAxis(axis, path, errors) {
  if (!isObject(axis)) {
    errors.push(issue("invalid.enum", `${path}.mode`, { allowed: enums.rulingModes.join("|") }));
    return;
  }
  checkEnum(axis.mode, enums.rulingModes, `${path}.mode`, errors);
  if (axis.mode === "spacing") {
    checkRange(axis.spacing, limits.spacing, "invalid.spacing", `${path}.spacing`, errors);
  } else if (axis.mode === "count") {
    checkRange(axis.count, limits.count, "invalid.count", `${path}.count`, errors);
  }
}

function validateObject(object, path, errors) {
  if (!isObject(object)) {
    errors.push(issue("invalid.object", path));
    return;
  }
  checkEnum(object.type, enums.objectTypes, `${path}.type`, errors);
  checkRange(object.rotation ?? 0, limits.rotation, "invalid.rotation", `${path}.rotation`, errors);
  checkRange(object.opacity ?? 1, limits.opacity, "invalid.opacity", `${path}.opacity`, errors);
  checkColor(object.color ?? "#000000", { alpha: false }, `${path}.color`, errors);

  if (object.type === "text") {
    checkRange(object.sizePt, limits.textSizePt, "invalid.fontSize", `${path}.sizePt`, errors);
    checkRange(object.lineHeight, limits.lineHeight, "invalid.lineHeight", `${path}.lineHeight`, errors);
    checkRange(object.padding ?? 0, limits.padding, "invalid.padding", `${path}.padding`, errors);
    checkEnum(object.align, enums.alignments, `${path}.align`, errors);
    const thickness = object.border?.thickness ?? 0;
    checkRange(thickness, limits.borderThickness, "invalid.borderThickness", `${path}.border.thickness`, errors);
  }
}

/**
 * Validate a preset against every limit from config.
 * Returns stable, ordered code lists; never throws.
 */
export function validatePreset(preset) {
  const errors = [];
  const warnings = [];

  if (!isObject(preset)) {
    return { ok: false, errors: [issue("invalid.preset", "")], warnings };
  }

  if (preset.schemaVersion !== undefined && preset.schemaVersion > 1) {
    errors.push(issue("schema.unsupportedVersion", "schemaVersion"));
  }

  if (typeof preset.name !== "string" || preset.name.trim() === "") {
    errors.push(issue("invalid.presetName", "name", { reason: "empty" }));
  } else if (preset.name.length > limits.presetNameMaxLength) {
    errors.push(issue("invalid.presetName", "name", { maxLength: limits.presetNameMaxLength }));
  }

  const page = isObject(preset.page) ? preset.page : {};
  checkEnum(page.size, enums.pageSizes, "page.size", errors);
  checkEnum(page.orientation, enums.orientations, "page.orientation", errors);
  checkColor(page.color, { alpha: false }, "page.color", errors);

  const margins = isObject(page.margins) ? page.margins : {};
  for (const side of ["top", "right", "bottom", "left"]) {
    const value = margins[side];
    const valid = checkRange(value, { min: 0, max: limits.marginMax }, "invalid.margin", `page.margins.${side}`, errors);
    if (valid && value > 0 && value < limits.marginHomePrint) {
      warnings.push(issue("margin.belowHomePrint", `page.margins.${side}`, { limit: limits.marginHomePrint }));
    }
  }

  if (enums.pageSizes.includes(page.size) && enums.orientations.includes(page.orientation)) {
    const dims = paperSizes[page.size][page.orientation];
    const usableW = dims.w - (typeof margins.left === "number" ? margins.left : 0) - (typeof margins.right === "number" ? margins.right : 0);
    const usableH = dims.h - (typeof margins.top === "number" ? margins.top : 0) - (typeof margins.bottom === "number" ? margins.bottom : 0);
    if (usableW < limits.minContentSize || usableH < limits.minContentSize) {
      errors.push(issue("invalid.contentArea", "page.margins", { usableW, usableH, min: limits.minContentSize }));
    }
  }

  const frame = isObject(preset.frame) ? preset.frame : {};
  checkColor(frame.color, { alpha: true }, "frame.color", errors);
  checkRange(frame.thickness, limits.frameThickness, "invalid.frameThickness", "frame.thickness", errors);
  checkRange(frame.doubleGap, limits.doubleGap, "invalid.doubleGap", "frame.doubleGap", errors);
  if (typeof frame.cornerRadius === "number" && frame.cornerRadius > 0) {
    const frameW = (paperSizes[page.size]?.[page.orientation]?.w ?? 0) - (margins.left ?? 0) - (margins.right ?? 0);
    const frameH = (paperSizes[page.size]?.[page.orientation]?.h ?? 0) - (margins.top ?? 0) - (margins.bottom ?? 0);
    const maxRadius = Math.max(0, Math.min(frameW, frameH) / 2);
    if (frame.cornerRadius > maxRadius + epsilon) {
      errors.push(issue("invalid.cornerRadius", "frame.cornerRadius", { max: maxRadius }));
    }
  }
  if (frame.enabled !== false) checkEnum(frame.style, enums.frameStyles, "frame.style", errors);

  const ruling = isObject(preset.ruling) ? preset.ruling : {};
  if (ruling.enabled !== false) {
    checkEnum(ruling.type, enums.rulingTypes, "ruling.type", errors);
    if (ruling.type !== "dots") checkEnum(ruling.style, enums.rulingStyles, "ruling.style", errors);
  }
  checkColor(ruling.color, { alpha: true }, "ruling.color", errors);
  checkRange(ruling.thickness, limits.rulingThickness, "invalid.rulingThickness", "ruling.thickness", errors);
  checkRange(ruling.dotRadius, limits.dotRadius, "invalid.dotRadius", "ruling.dotRadius", errors);
  if (isObject(ruling.insets)) {
    for (const side of ["top", "right", "bottom", "left"]) {
      checkRange(ruling.insets[side], limits.insets, "invalid.insets", `ruling.insets.${side}`, errors);
    }
  } else {
    errors.push(issue("invalid.insets", "ruling.insets"));
  }
  checkRange(ruling.objectDistance, limits.objectDistance, "invalid.objectDistance", "ruling.objectDistance", errors);
  validateAxis(ruling.x, "ruling.x", errors);
  validateAxis(ruling.y, "ruling.y", errors);

  const watermark = isObject(preset.watermark) ? preset.watermark : {};
  checkRange(watermark.rotation ?? 0, limits.rotation, "invalid.rotation", "watermark.rotation", errors);
  checkRange(watermark.opacity ?? 0, limits.opacity, "invalid.opacity", "watermark.opacity", errors);
  if (watermark.enabled === true) {
    checkEnum(watermark.kind, enums.watermarkKinds, "watermark.kind", errors);
    if (watermark.kind === "text" && isObject(watermark.text)) {
      checkRange(watermark.text.sizePt, limits.textSizePt, "invalid.fontSize", "watermark.text.sizePt", errors);
      checkRange(watermark.text.lineHeight, limits.lineHeight, "invalid.lineHeight", "watermark.text.lineHeight", errors);
      checkEnum(watermark.text.align, enums.alignments, "watermark.text.align", errors);
      checkColor(watermark.text.color, { alpha: false }, "watermark.text.color", errors);
    }
  }

  const objects = Array.isArray(preset.objects) ? preset.objects : [];
  if (!Array.isArray(preset.objects)) errors.push(issue("invalid.object", "objects"));

  const imageCount = objects.filter((object) => isObject(object) && object.type === "image").length;
  const textCount = objects.filter((object) => isObject(object) && object.type === "text").length;
  if (imageCount > limits.image.maxCount) {
    errors.push(issue("image.limitCount", "objects", { count: imageCount, max: limits.image.maxCount }));
  }
  if (textCount > limits.textBoxCount) {
    errors.push(issue("invalid.textCount", "objects", { count: textCount, max: limits.textBoxCount }));
  }

  objects.forEach((object, index) => validateObject(object, `objects.${index}`, errors));

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validate image metadata before importing a file.
 */
export function validateImage(meta) {
  const errors = [];
  const warnings = [];
  if (!isObject(meta)) {
    return { ok: false, errors: [issue("invalid.imageMeta", "")], warnings };
  }

  if (typeof meta.bytes === "number" && meta.bytes > limits.image.maxBytes) {
    errors.push(issue("image.tooLarge", "bytes", { maxBytes: limits.image.maxBytes }));
  }
  const maxSide = Math.max(Number(meta.width) || 0, Number(meta.height) || 0);
  if (maxSide > limits.image.maxSidePx) {
    errors.push(issue("image.dimensions", "dimensions", { maxSidePx: limits.image.maxSidePx, maxSide }));
  }
  if (meta.mime !== undefined && !IMAGE_MIMES.includes(meta.mime)) {
    errors.push(issue("invalid.imageMime", "mime", { allowed: IMAGE_MIMES.join("|") }));
  }

  return { ok: errors.length === 0, errors, warnings };
}
