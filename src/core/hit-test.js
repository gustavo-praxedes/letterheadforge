import { snapAngle, snapRect } from "./snap.js";
import { rotationSnapStepDeg } from "../config.js";

/**
 * Pointer geometry for the interactive preview (task 04.01.10).
 *
 * Pure functions in millimetres: the canvas converts client pixels to mm before
 * calling in, so nothing here knows about zoom, DOM or events.
 */

/** Local (unrotated) coordinates of a point, relative to the object centre. */
export function toLocal(object, point) {
  const cx = object.x + object.w / 2;
  const cy = object.y + object.h / 2;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const angle = ((object.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function containsPoint(object, point) {
  if (object.visible === false) return false;
  const local = toLocal(object, point);
  return local.x >= object.x && local.x <= object.x + object.w && local.y >= object.y && local.y <= object.y + object.h;
}

/**
 * Topmost object under the point: the last visible entry in paint order wins.
 */
export function objectAt(objects, point) {
  if (!Array.isArray(objects)) return null;
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    if (containsPoint(objects[index], point)) return objects[index];
  }
  return null;
}

/**
 * Handle under the pointer: eight resize handles, the rotation hotspot above the
 * top edge and `move` inside the body.
 */
export function handleAt(object, point, { handleSizeMm = 3 } = {}) {
  if (!object) return null;
  const local = toLocal(object, point);
  const half = handleSizeMm / 2;
  const near = (value, target) => Math.abs(value - target) <= half;

  const left = object.x;
  const right = object.x + object.w;
  const top = object.y;
  const bottom = object.y + object.h;
  const midX = object.x + object.w / 2;

  if (near(local.x, midX) && near(local.y, top - handleSizeMm * 2)) return "rotate";
  if (near(local.x, left) && near(local.y, top)) return "nw";
  if (near(local.x, right) && near(local.y, top)) return "ne";
  if (near(local.x, left) && near(local.y, bottom)) return "sw";
  if (near(local.x, right) && near(local.y, bottom)) return "se";
  if (near(local.x, midX) && near(local.y, top)) return "n";
  if (near(local.x, midX) && near(local.y, bottom)) return "s";
  if (near(local.x, left) && near(local.y, top + object.h / 2)) return "w";
  if (near(local.x, right) && near(local.y, top + object.h / 2)) return "e";
  return containsPoint(object, point) ? "move" : null;
}

const HANDLE_CURSOR = {
  move: "move",
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  rotate: "crosshair",
};

export function cursorFor(handle) {
  return HANDLE_CURSOR[handle] ?? "default";
}

const MIN_SIZE_MM = 5;

function clampSize(value) {
  return Math.max(MIN_SIZE_MM, value);
}

/**
 * Apply a drag from `startPoint` to `point`.
 *
 * - `snap: false` (Alt held) disables snapping entirely.
 * - targets come from core/snap.js; the returned guides are lines to draw.
 */
export function dragObject(object, startPoint, point, { targets = [], snap = true } = {}) {
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;
  const rect = { x: object.x + dx, y: object.y + dy, w: object.w, h: object.h };
  if (!snap) return { ...rect, guides: [] };

  const snapped = snapRect(rect, targets, { disabled: false });
  return { x: snapped.x, y: snapped.y, w: rect.w, h: rect.h, guides: snapped.guides };
}

/**
 * Apply a resize from one of the eight handles, keeping the opposite edge fixed.
 */
export function resizeObject(object, handle, startPoint, point, { targets = [], snap = true, aspect = false } = {}) {
  if (!handle || handle === "move" || handle === "rotate") return { ...object, guides: [] };
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;

  let left = object.x;
  let top = object.y;
  let right = object.x + object.w;
  let bottom = object.y + object.h;

  if (handle.includes("w")) left = object.x + dx;
  if (handle.includes("e")) right = object.x + object.w + dx;
  if (handle.includes("n")) top = object.y + dy;
  if (handle.includes("s")) bottom = object.y + object.h + dy;

  if (handle === "n" || handle === "s") {
    left = object.x;
    right = object.x + object.w;
  }
  if (handle === "e" || handle === "w") {
    top = object.y;
    bottom = object.y + object.h;
  }

  let w = clampSize(right - left);
  let h = clampSize(bottom - top);

  if (aspect && object.w > 0 && object.h > 0) {
    const ratio = object.w / object.h;
    if (handle === "n" || handle === "s") w = h * ratio;
    else h = w / ratio;
  }

  const rect = { x: left, y: top, w, h };
  if (!snap) return { ...rect, guides: [] };
  const snapped = snapRect(rect, targets, { disabled: false });
  return { x: snapped.x, y: snapped.y, w: snapped.w, h: snapped.h, guides: snapped.guides };
}

/**
 * Rotation from the pointer position, snapped to 15° unless Shift-free.
 */
export function rotateObject(object, point, { snap = true } = {}) {
  const cx = object.x + object.w / 2;
  const cy = object.y + object.h / 2;
  const raw = (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI + 90;
  const normalized = ((raw % 360) + 360) % 360;
  const angle = snap ? snapAngle(normalized, rotationSnapStepDeg) : Number(normalized.toFixed(2));
  return { ...object, rotation: angle > 180 ? angle - 360 : angle };
}
