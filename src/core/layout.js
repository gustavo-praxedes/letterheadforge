import { paperSizes, enums, epsilon } from "../config.js";

/**
 * Grid and derived A4 orientation per spec table 3.2.
 * "same" keeps the page orientation.
 */
const GRIDS = {
  A4: {
    portrait: { cols: 1, rows: 1, sheetOrientation: "same" },
    landscape: { cols: 1, rows: 1, sheetOrientation: "same" },
  },
  A5: {
    portrait: { cols: 2, rows: 1, sheetOrientation: "landscape" },
    landscape: { cols: 1, rows: 2, sheetOrientation: "portrait" },
  },
  A6: {
    portrait: { cols: 2, rows: 2, sheetOrientation: "same" },
    landscape: { cols: 2, rows: 2, sheetOrientation: "same" },
  },
};

function dims(size, orientation) {
  return paperSizes[size][orientation];
}

/**
 * Pure sheet layout: nominal cells on the derived A4 sheet.
 * The 1 mm slack goes 0.5 mm at each end of the affected axis; no gap between cells.
 */
export function layoutSheet(size, orientation) {
  if (!enums.pageSizes.includes(size)) return { ok: false, code: "layout.invalidSize" };
  if (!enums.orientations.includes(orientation)) return { ok: false, code: "layout.invalidSize" };

  const grid = GRIDS[size][orientation];
  const sheetOrientation = grid.sheetOrientation === "same" ? orientation : grid.sheetOrientation;
  const sheet = dims("A4", sheetOrientation);
  const cell = dims(size, orientation);

  const usedW = cell.w * grid.cols;
  const usedH = cell.h * grid.rows;
  const slackW = sheet.w - usedW;
  const slackH = sheet.h - usedH;

  if (slackW < -epsilon || slackH < -epsilon) {
    return { ok: false, code: "layout.invalidSize" };
  }

  const startX = slackW / 2;
  const startY = slackH / 2;

  const cells = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      cells.push({
        x: startX + col * cell.w,
        y: startY + row * cell.h,
        w: cell.w,
        h: cell.h,
        col,
        row,
      });
    }
  }

  const dividers = [];
  for (let col = 1; col < grid.cols; col += 1) {
    const x = startX + col * cell.w;
    dividers.push({ orientation: "vertical", x1: x, y1: 0, x2: x, y2: sheet.h });
  }
  for (let row = 1; row < grid.rows; row += 1) {
    const y = startY + row * cell.h;
    dividers.push({ orientation: "horizontal", x1: 0, y1: y, x2: sheet.w, y2: y });
  }

  return {
    ok: true,
    sheet: { w: sheet.w, h: sheet.h },
    sheetOrientation,
    cells,
    dividers,
    grid: { cols: grid.cols, rows: grid.rows },
  };
}
