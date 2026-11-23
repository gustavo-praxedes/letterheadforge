import { cutMark, limits } from "../config.js";
import { buildBlockMask } from "./mask.js";
import { cutMarks } from "./cutmarks.js";
import { normalizeStroke } from "./strokes.js";
import { buildRuling } from "./ruling.js";
import { layoutText } from "./text-layout.js";

const WATERMARK_DEFAULT_WIDTH_RATIO = 0.5;
const WATERMARK_DEFAULT_HEIGHT = 40;

function strokeOf(style, thickness) {
  const normalized = normalizeStroke({ style, thickness });
  if (normalized.ok) return normalized;
  return { ok: true, thickness, cap: "butt", dash: [], dashOffset: 0 };
}

function buildTextPrimitive({ objectId, box, style, text, measure, padding = 0, warnings, params = {} }) {
  if (typeof measure !== "function") {
    if (text.trim() !== "") throw new TypeError("buildScene requires a measure function for text");
    return null;
  }
  const widthMm = Math.max(0, box.w - padding * 2);
  const heightMm = Math.max(0, box.h - padding * 2);
  if (widthMm <= 0 || heightMm <= 0) {
    warnings.push({ code: "text.overflow", params: { objectId, ...params, reason: "boxTooSmall" } });
    return null;
  }
  const result = layoutText({
    text,
    widthMm,
    heightMm,
    style: {
      fontId: style.fontId,
      weight: style.weight,
      italic: style.italic,
      sizePt: style.sizePt,
      lineHeight: style.lineHeight,
      align: style.align,
    },
    measure,
  });
  if (!result || result.ok === false) {
    warnings.push({ code: "text.invalid", params: { objectId, code: result?.code ?? null, ...params } });
    return null;
  }
  if (result.overflow) {
    warnings.push({ code: "text.overflow", params: { objectId, hiddenLineCount: result.hiddenLineCount, ...params } });
  }
  if (result.unsupportedChars.length > 0) {
    warnings.push({ code: "font.missingGlyph", params: { objectId, chars: result.unsupportedChars, ...params } });
  }
  return {
    kind: "text",
    objectId,
    x: box.x + padding,
    y: box.y + padding,
    w: widthMm,
    h: heightMm,
    rotation: box.rotation ?? 0,
    fontId: style.fontId,
    weight: style.weight,
    italic: Boolean(style.italic),
    sizePt: style.sizePt,
    color: style.color,
    align: style.align,
    lineHeight: style.lineHeight,
    lineHeightMm: result.lineHeightMm,
    lines: result.lines,
    overflow: result.overflow,
    opacity: 1,
  };
}

function watermarkPrimitives({ preset, measure, warnings }) {
  const watermark = preset.watermark;
  if (watermark.enabled !== true) return [];

  const w = watermark.w > 0 ? watermark.w : undefined;
  const h = watermark.h > 0 ? watermark.h : undefined;

  if (watermark.kind === "image") {
    if (!watermark.imageId) {
      warnings.push({ code: "import.invalid", params: { reason: "watermarkImageMissing" } });
      return [];
    }
    return [
      {
        kind: "image",
        imageId: watermark.imageId,
        x: watermark.x,
        y: watermark.y,
        w: w ?? 0,
        h: h ?? 0,
        rotation: watermark.rotation,
        opacity: watermark.opacity,
      },
    ];
  }

  const text = watermark.text ?? {};
  const box = {
    x: watermark.x,
    y: watermark.y,
    w: w ?? 0,
    h: h ?? WATERMARK_DEFAULT_HEIGHT,
    rotation: watermark.rotation,
  };
  if (!(box.w > 0)) {
    warnings.push({ code: "text.invalid", params: { objectId: "watermark", reason: "widthNotSet" } });
    return [];
  }
  const primitive = buildTextPrimitive({
    objectId: "watermark",
    box,
    style: { ...text, color: text.color },
    text: text.content ?? "",
    measure,
    warnings,
    params: { layer: "watermark" },
  });
  if (!primitive) return [];
  primitive.opacity = watermark.opacity;
  return [primitive];
}

function framePrimitives({ preset, cell, offsetX, offsetY }) {
  const frame = preset.frame;
  if (frame.enabled === false) return [];
  const margins = preset.page.margins;
  const stroke = strokeOf(frame.style === "double" ? "solid" : frame.style, frame.thickness);
  const base = {
    x: offsetX + margins.left,
    y: offsetY + margins.top,
    w: cell.w - margins.left - margins.right,
    h: cell.h - margins.top - margins.bottom,
  };
  const radius = Math.max(0, Math.min(frame.cornerRadius ?? 0, Math.min(base.w, base.h) / 2));
  const common = {
    kind: "rect",
    fill: null,
    stroke: frame.color,
    strokeWidth: frame.thickness,
    strokeStyle: frame.style === "double" ? "solid" : frame.style,
    dash: stroke.dash,
    cap: stroke.cap,
    dashOffset: stroke.dashOffset,
  };

  if (frame.style !== "double") {
    return [{ ...common, ...base, rx: radius }];
  }

  const gap = frame.doubleGap;
  const outer = {
    x: base.x - gap / 2,
    y: base.y - gap / 2,
    w: base.w + gap,
    h: base.h + gap,
    rx: Math.max(0, radius + gap / 2),
  };
  const inner = {
    x: base.x + gap / 2,
    y: base.y + gap / 2,
    w: Math.max(0, base.w - gap),
    h: Math.max(0, base.h - gap),
    rx: Math.max(0, radius - gap / 2),
  };
  return [
    { ...common, ...outer },
    { ...common, ...inner },
  ];
}

/**
 * Assemble the single scene consumed by both the SVG preview and the PDF renderer.
 * Primitives are ordered bottom to top: sheet, watermark, ruling, objects, frame.
 */
export function buildScene({ preset, layout, cellIndex = 0, alphaMasks = new Map(), mode = "sheet", measure }) {
  if (!preset || !layout || !Array.isArray(layout.cells) || layout.cells.length === 0) {
    throw new TypeError("buildScene requires a preset and a layout with cells");
  }

  const isPage = mode === "page";
  const cells = isPage ? [layout.cells[cellIndex]] : layout.cells;
  if (!cells[0]) throw new RangeError(`cellIndex ${cellIndex} is out of range`);

  const widthMm = isPage ? cells[0].w : layout.sheet.w;
  const heightMm = isPage ? cells[0].h : layout.sheet.h;
  const primitives = [
    { kind: "rect", x: 0, y: 0, w: widthMm, h: heightMm, rx: 0, fill: preset.page.color, stroke: null },
  ];
  const warnings = [];

  for (const cell of cells) {
    const offsetX = isPage ? -cell.x : cell.x;
    const offsetY = isPage ? -cell.y : cell.y;
    const children = [];

    children.push(...watermarkPrimitives({ preset, measure, warnings }).map((primitive) => ({
      ...primitive,
      x: primitive.x + offsetX,
      y: primitive.y + offsetY,
    })));

    const localCell = { x: 0, y: 0, w: cell.w, h: cell.h };
    let blockMask = null;
    const objects = Array.isArray(preset.objects) ? preset.objects : [];
    if (objects.length > 0) {
      blockMask = buildBlockMask({
        objects,
        alphaMasks,
        cell: localCell,
        objectDistance: preset.ruling.objectDistance,
        resolution: limits.maskResolution,
      });
    }

    const ruling = buildRuling({ preset, cell: localCell, blockMask });
    for (const warning of ruling.warnings) {
      warnings.push({ ...warning, params: { ...warning.params, cell: { x: cell.x, y: cell.y } } });
    }
    const rulingStroke = strokeOf(preset.ruling.style, preset.ruling.thickness);
    for (const segment of ruling.segments) {
      children.push({
        kind: "line",
        x1: segment.x1 + offsetX,
        y1: segment.y1 + offsetY,
        x2: segment.x2 + offsetX,
        y2: segment.y2 + offsetY,
        stroke: preset.ruling.color,
        strokeWidth: preset.ruling.thickness,
        strokeStyle: preset.ruling.style,
        dash: rulingStroke.dash,
        cap: rulingStroke.cap,
        dashOffset: rulingStroke.dashOffset,
      });
    }
    for (const dot of ruling.dots) {
      children.push({
        kind: "dot",
        cx: dot.cx + offsetX,
        cy: dot.cy + offsetY,
        r: dot.r,
        fill: preset.ruling.color,
      });
    }

    for (const object of objects) {
      if (object.visible === false) continue;
      const box = {
        x: object.x + offsetX,
        y: object.y + offsetY,
        w: object.w,
        h: object.h,
        rotation: object.rotation ?? 0,
      };
      if (object.type === "image") {
        children.push({
          kind: "image",
          objectId: object.id,
          imageId: object.imageId,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          rotation: box.rotation,
          opacity: object.opacity ?? 1,
        });
        continue;
      }
      const primitive = buildTextPrimitive({
        objectId: object.id,
        box,
        style: { ...object },
        text: object.text ?? "",
        measure,
        padding: object.padding ?? 0,
        warnings,
        params: { layer: "object" },
      });
      if (primitive) {
        primitive.opacity = object.opacity ?? 1;
        primitive.background = object.background ?? null;
        primitive.border = object.border ?? null;
        children.push(primitive);
      }
    }

    children.push(...framePrimitives({ preset, cell, offsetX, offsetY }));

    primitives.push({
      kind: "clip",
      x: offsetX,
      y: offsetY,
      w: cell.w,
      h: cell.h,
      children,
    });
  }

  if (!isPage) {
    const marks = cutMarks(layout, preset.page.margins);
    if (marks.ok !== false) {
      for (const mark of marks.marks) {
        primitives.push({
          kind: "line",
          x1: mark.x1,
          y1: mark.y1,
          x2: mark.x2,
          y2: mark.y2,
          stroke: preset.ruling.color,
          strokeWidth: cutMark.thickness,
          strokeStyle: "solid",
          dash: [],
          cap: "butt",
          dashOffset: 0,
        });
      }
      for (const warning of marks.warnings) warnings.push(warning);
    }
  }

  return { widthMm, heightMm, background: preset.page.color, primitives, warnings };
}

export { WATERMARK_DEFAULT_WIDTH_RATIO, WATERMARK_DEFAULT_HEIGHT };
