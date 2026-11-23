import { epsilon, limits } from "../config.js";
import { isBlockedMm } from "./mask.js";

/**
 * Ruling area inside a cell, in cell-local millimetres.
 * With a frame the area is the frame rectangle (page inset by margins); without a
 * frame it is the same rectangle, so the geometry is identical (spec 4.1, R69).
 */
export function rulingArea({ preset, cell }) {
  const margins = preset.page.margins;
  const insets = preset.ruling.insets;
  const base = {
    x: margins.left,
    y: margins.top,
    w: cell.w - margins.left - margins.right,
    h: cell.h - margins.top - margins.bottom,
  };
  const area = {
    x: base.x + insets.left,
    y: base.y + insets.top,
    w: base.w - insets.left - insets.right,
    h: base.h - insets.top - insets.bottom,
  };
  if (area.w < limits.minRulingArea || area.h < limits.minRulingArea) {
    return { ok: false, code: "ruling.areaTooSmall", area };
  }
  return { ok: true, area };
}

/**
 * Positions along one axis (spec 4.2).
 * count mode: first at 0, last at length. spacing mode: remainder split evenly.
 */
export function axisPositions({ length, mode, spacing, count }) {
  if (typeof length !== "number" || !Number.isFinite(length) || length <= 0) {
    return { ok: false, code: "ruling.invalidLength" };
  }

  if (mode === "count") {
    if (typeof count !== "number" || !Number.isInteger(count) || count < limits.count.min) {
      return { ok: false, code: "invalid.count" };
    }
    const step = length / (count - 1);
    const positions = Array.from({ length: count }, (_, index) => index * step);
    return { ok: true, positions, step };
  }

  if (mode === "spacing") {
    if (typeof spacing !== "number" || !Number.isFinite(spacing) || spacing <= 0) {
      return { ok: false, code: "invalid.spacing" };
    }
    if (spacing > length + epsilon) {
      return { ok: true, positions: [length / 2], step: spacing };
    }
    const n = Math.floor(length / spacing + epsilon) + 1;
    if (n < 2) return { ok: true, positions: [length / 2], step: spacing };
    const remainder = length - (n - 1) * spacing;
    const start = remainder / 2;
    const positions = Array.from({ length: n }, (_, index) => start + index * spacing);
    return { ok: true, positions, step: spacing };
  }

  return { ok: false, code: "invalid.enum" };
}

/**
 * Free runs along a horizontal sample line, in cell-local millimetres.
 */
function horizontalRuns(mask, y, x0, x1, resolution) {
  const span = x1 - x0;
  const steps = Math.max(1, Math.round(span / limits.sampleStepMm));
  const step = span / steps;
  const runs = [];
  let start = null;
  for (let index = 0; index < steps; index += 1) {
    const x = x0 + (index + 0.5) * step;
    const blocked = mask ? isBlockedMm(mask, x, y, resolution) : false;
    if (!blocked && start === null) start = index === 0 ? x0 : x0 + index * step;
    if (blocked && start !== null) {
      runs.push([start, x0 + index * step]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, x1]);
  return runs;
}

function verticalRuns(mask, x, y0, y1, resolution) {
  const span = y1 - y0;
  const steps = Math.max(1, Math.round(span / limits.sampleStepMm));
  const step = span / steps;
  const runs = [];
  let start = null;
  for (let index = 0; index < steps; index += 1) {
    const y = y0 + (index + 0.5) * step;
    const blocked = mask ? isBlockedMm(mask, x, y, resolution) : false;
    if (!blocked && start === null) start = index === 0 ? y0 : y0 + index * step;
    if (blocked && start !== null) {
      runs.push([start, y0 + index * step]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, y1]);
  return runs;
}

function cutRuns(runs, from, to) {
  const touched = runs.length > 1 || (runs.length === 1 && (runs[0][0] > from + epsilon || runs[0][1] < to - epsilon));
  if (!touched) return [[from, to]];
  return runs.filter(([start, end]) => end - start >= limits.minSegment - epsilon);
}

/**
 * Build the ruling for one cell (spec 4.7).
 * Returns segments and dots in cell-local millimetres.
 */
export function buildRuling({ preset, cell, blockMask = null, resolution = limits.maskResolution }) {
  const ruling = preset.ruling;
  const empty = { segments: [], dots: [], warnings: [] };
  if (ruling.enabled === false) return empty;

  const area = rulingArea({ preset, cell });
  if (!area.ok) {
    return { segments: [], dots: [], warnings: [{ code: "ruling.areaTooSmall", params: { area: area.area } }] };
  }

  const { x, y, w, h } = area.area;
  const type = ruling.type;
  const yPositions = axisPositions({
    length: h,
    mode: ruling.y.mode,
    spacing: ruling.y.spacing,
    count: ruling.y.count,
  });
  const xPositions = axisPositions({
    length: w,
    mode: ruling.x.mode,
    spacing: ruling.x.spacing,
    count: ruling.x.count,
  });

  const warnings = [];
  if (!yPositions.ok) warnings.push({ code: yPositions.code, params: { axis: "y" } });
  if (!xPositions.ok) warnings.push({ code: xPositions.code, params: { axis: "x" } });

  const horizontalSegments = [];
  const verticalSegments = [];
  const dots = [];

  if (type === "lines" || type === "grid") {
    for (const offset of yPositions.ok ? yPositions.positions : []) {
      const lineY = y + offset;
      const runs = horizontalRuns(blockMask, lineY, x, x + w, resolution);
      for (const [start, end] of cutRuns(runs, x, x + w)) {
        if (end - start <= epsilon) continue;
        horizontalSegments.push({ x1: start, y1: lineY, x2: end, y2: lineY });
      }
    }
  }

  if (type === "grid") {
    for (const offset of xPositions.ok ? xPositions.positions : []) {
      const lineX = x + offset;
      const runs = verticalRuns(blockMask, lineX, y, y + h, resolution);
      for (const [start, end] of cutRuns(runs, y, y + h)) {
        if (end - start <= epsilon) continue;
        verticalSegments.push({ x1: lineX, y1: start, x2: lineX, y2: end });
      }
    }
  }

  if (type === "dots") {
    const radius = ruling.dotRadius;
    const rowsY = yPositions.ok ? yPositions.positions : [];
    const colsX = xPositions.ok ? xPositions.positions : [];
    for (const offsetY of rowsY) {
      for (const offsetX of colsX) {
        const cx = x + offsetX;
        const cy = y + offsetY;
        if (blockMask && dotTouchesMask(blockMask, cx, cy, radius, resolution)) continue;
        dots.push({ cx, cy, r: radius });
      }
    }
  }

  horizontalSegments.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  verticalSegments.sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
  dots.sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  return { segments: [...horizontalSegments, ...verticalSegments], dots, warnings };
}

const DOT_PROBES = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7071, 0.7071],
  [-0.7071, 0.7071],
  [0.7071, -0.7071],
  [-0.7071, -0.7071],
];

function dotTouchesMask(mask, cx, cy, radius, resolution) {
  return DOT_PROBES.some(([dx, dy]) => isBlockedMm(mask, cx + dx * radius, cy + dy * radius, resolution));
}

export { DOT_PROBES, cutRuns, horizontalRuns, verticalRuns };
