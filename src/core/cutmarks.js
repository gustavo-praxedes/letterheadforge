import { cutMark, epsilon } from "../config.js";

/**
 * Cut marks for the assembled A4 sheet (spec 3.4, contracts §8).
 *
 * A mark runs along a division line, from the A4 edge inwards, over the
 * extension of one side's margin. Its length is `min(cutMark.length, margin)`
 * for that side. A zero margin produces no mark and a single
 * `cutmarks.margin.zero` warning per side (deduplicated, in the order the sides
 * are first reached), so the interface shows one message per affected margin.
 *
 * Order of the output:
 *  1. extremities of each division, vertical dividers first (top, then bottom)
 *     and horizontal dividers after (left, then right), following the divider
 *     traversal of the layout;
 *  2. crossing marks for a 2 × 2 grid (A6 only), one per direction, in the
 *     order left, right, up, down.
 *
 * The crossing mark pointing left lies inside the right margin of the page on
 * the left, and so on, per the table 3.4 of the spec.
 */

const SIDES = ["top", "right", "bottom", "left"];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidLayout(layout) {
  if (!layout || typeof layout !== "object") return false;
  if (layout.ok !== true) return false;
  const { sheet, dividers, grid } = layout;
  if (!sheet || !isFiniteNumber(sheet.w) || !isFiniteNumber(sheet.h)) return false;
  if (sheet.w <= 0 || sheet.h <= 0) return false;
  if (!Array.isArray(dividers)) return false;
  if (!grid || !isFiniteNumber(grid.cols) || !isFiniteNumber(grid.rows)) return false;
  return dividers.every(
    (divider) =>
      divider &&
      (divider.orientation === "vertical" || divider.orientation === "horizontal") &&
      isFiniteNumber(divider.x1) &&
      isFiniteNumber(divider.y1) &&
      isFiniteNumber(divider.x2) &&
      isFiniteNumber(divider.y2),
  );
}

function isValidMargins(margins) {
  if (!margins || typeof margins !== "object") return false;
  return SIDES.every((side) => isFiniteNumber(margins[side]) && margins[side] >= 0);
}

/**
 * Length of a mark that extends over the margin of `side`.
 * Returns 0 and records the warning when that margin is zero.
 */
function lengthFor(side, margins, warnings, warnedSides) {
  const margin = margins[side];
  if (margin <= epsilon) {
    if (!warnedSides.has(side)) {
      warnedSides.add(side);
      warnings.push({ code: "cutmarks.margin.zero", params: { side } });
    }
    return 0;
  }
  return Math.min(cutMark.length, margin);
}

export function cutMarks(layout, margins) {
  if (!isValidLayout(layout)) return { ok: false, code: "cutmarks.invalidLayout" };
  if (!isValidMargins(margins)) return { ok: false, code: "cutmarks.invalidMargins" };

  const { sheet, dividers, grid } = layout;
  const marks = [];
  const warnings = [];
  const warnedSides = new Set();

  const length = (side) => lengthFor(side, margins, warnings, warnedSides);

  // Extremities: the mark starts at the sheet border and grows inwards.
  for (const divider of dividers) {
    if (divider.orientation === "vertical") {
      const x = divider.x1;
      const top = length("top");
      if (top > 0) marks.push({ x1: x, y1: 0, x2: x, y2: top });
      const bottom = length("bottom");
      if (bottom > 0) marks.push({ x1: x, y1: sheet.h - bottom, x2: x, y2: sheet.h });
    } else {
      const y = divider.y1;
      const left = length("left");
      if (left > 0) marks.push({ x1: 0, y1: y, x2: left, y2: y });
      const right = length("right");
      if (right > 0) marks.push({ x1: sheet.w - right, y1: y, x2: sheet.w, y2: y });
    }
  }

  // Crossing: only a 2 x 2 grid has a central crossing (A6).
  const verticals = dividers.filter((divider) => divider.orientation === "vertical");
  const horizontals = dividers.filter((divider) => divider.orientation === "horizontal");
  if (grid.cols > 1 && grid.rows > 1 && verticals.length === 1 && horizontals.length === 1) {
    const x = verticals[0].x1;
    const y = horizontals[0].y1;

    // Leftwards mark sits in the right margin of the left page, and so on.
    const left = length("right");
    if (left > 0) marks.push({ x1: x, y1: y, x2: x - left, y2: y });
    const right = length("left");
    if (right > 0) marks.push({ x1: x, y1: y, x2: x + right, y2: y });
    const up = length("bottom");
    if (up > 0) marks.push({ x1: x, y1: y, x2: x, y2: y - up });
    const down = length("top");
    if (down > 0) marks.push({ x1: x, y1: y, x2: x, y2: y + down });
  }

  return { marks, warnings };
}
