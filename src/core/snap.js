import { epsilon, rotationSnapStepDeg, snap as snapConfig } from "../config.js";
import { axisPositions, rulingArea } from "./ruling.js";

function pushUnique(list, value) {
  if (!list.some((entry) => Math.abs(entry - value) < epsilon)) list.push(value);
}

/**
 * Snap targets for a cell, in cell-local millimetres.
 * Covers page borders and centres, margins, frame, ruling area and ruling lines,
 * plus the borders and centres of every other object.
 */
export function snapTargets({ preset, cell, excludeId = null }) {
  const vertical = [];
  const horizontal = [];

  pushUnique(vertical, 0);
  pushUnique(vertical, cell.w);
  pushUnique(vertical, cell.w / 2);
  pushUnique(horizontal, 0);
  pushUnique(horizontal, cell.h);
  pushUnique(horizontal, cell.h / 2);

  const margins = preset.page.margins;
  const frameLeft = margins.left;
  const frameRight = cell.w - margins.right;
  const frameTop = margins.top;
  const frameBottom = cell.h - margins.bottom;

  for (const value of [frameLeft, frameRight, (frameLeft + frameRight) / 2]) pushUnique(vertical, value);
  for (const value of [frameTop, frameBottom, (frameTop + frameBottom) / 2]) pushUnique(horizontal, value);

  const area = preset.ruling.enabled === false ? { ok: false } : rulingArea({ preset, cell });
  if (area.ok) {
    pushUnique(vertical, area.area.x);
    pushUnique(vertical, area.area.x + area.area.w);
    pushUnique(horizontal, area.area.y);
    pushUnique(horizontal, area.area.y + area.area.h);

    const yPositions = axisPositions({
      length: area.area.h,
      mode: preset.ruling.y.mode,
      spacing: preset.ruling.y.spacing,
      count: preset.ruling.y.count,
    });
    if (yPositions.ok) {
      for (const offset of yPositions.positions) pushUnique(horizontal, area.area.y + offset);
    }
    const xPositions = axisPositions({
      length: area.area.w,
      mode: preset.ruling.x.mode,
      spacing: preset.ruling.x.spacing,
      count: preset.ruling.x.count,
    });
    if (xPositions.ok) {
      for (const offset of xPositions.positions) pushUnique(vertical, area.area.x + offset);
    }
  }

  for (const object of preset.objects ?? []) {
    if (object.id === excludeId) continue;
    if (object.visible === false) continue;
    pushUnique(vertical, object.x);
    pushUnique(vertical, object.x + object.w);
    pushUnique(vertical, object.x + object.w / 2);
    pushUnique(horizontal, object.y);
    pushUnique(horizontal, object.y + object.h);
    pushUnique(horizontal, object.y + object.h / 2);
  }

  vertical.sort((a, b) => a - b);
  horizontal.sort((a, b) => a - b);
  return { vertical, horizontal };
}

/**
 * Snap one scalar value to the nearest target inside the tolerance.
 */
export function snapValue(value, targets, tolerance = snapConfig.toleranceMm) {
  let best = null;
  for (const target of targets) {
    const delta = Math.abs(target - value);
    if (delta <= tolerance + epsilon && (best === null || delta < best.delta)) {
      best = { target, delta };
    }
  }
  if (best === null) return { value, hit: false, target: null };
  return { value: best.target, hit: true, target: best.target };
}

/**
 * Snap a rectangle by its borders and centres. Returns the adjusted rect and the
 * guide lines to draw.
 */
export function snapRect(rect, targets, { tolerance = snapConfig.toleranceMm, disabled = false } = {}) {
  const result = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, guides: [], hit: false };
  if (disabled) return result;

  const xCandidates = [
    { offset: 0, value: rect.x },
    { offset: rect.w / 2, value: rect.x + rect.w / 2 },
    { offset: rect.w, value: rect.x + rect.w },
  ];
  const yCandidates = [
    { offset: 0, value: rect.y },
    { offset: rect.h / 2, value: rect.y + rect.h / 2 },
    { offset: rect.h, value: rect.y + rect.h },
  ];

  let bestX = null;
  for (const candidate of xCandidates) {
    const snapped = snapValue(candidate.value, targets.vertical, tolerance);
    if (!snapped.hit) continue;
    const delta = Math.abs(snapped.target - candidate.value);
    if (bestX === null || delta < bestX.delta) bestX = { delta, target: snapped.target, offset: candidate.offset };
  }

  let bestY = null;
  for (const candidate of yCandidates) {
    const snapped = snapValue(candidate.value, targets.horizontal, tolerance);
    if (!snapped.hit) continue;
    const delta = Math.abs(snapped.target - candidate.value);
    if (bestY === null || delta < bestY.delta) bestY = { delta, target: snapped.target, offset: candidate.offset };
  }

  if (bestX) {
    result.x = bestX.target - bestX.offset;
    result.guides.push({ axis: "x", position: bestX.target });
    result.hit = true;
  }
  if (bestY) {
    result.y = bestY.target - bestY.offset;
    result.guides.push({ axis: "y", position: bestY.target });
    result.hit = true;
  }

  return result;
}

/** Round an angle to the configured step, normalised to (-180, 180]. */
export function snapAngle(angle, step = rotationSnapStepDeg) {
  if (typeof angle !== "number" || !Number.isFinite(angle)) return angle;
  const snapped = Math.round(angle / step) * step;
  const normalized = ((((snapped + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
}
