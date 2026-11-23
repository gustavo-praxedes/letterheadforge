import test from "node:test";
import assert from "node:assert/strict";
import { layoutSheet } from "../../src/core/layout.js";
import { epsilon, paperSizes } from "../../src/config.js";

const close = (a, b) => Math.abs(a - b) < 1e-9;

test("A4 keeps orientation and has a single cell without dividers", () => {
  for (const orientation of ["portrait", "landscape"]) {
    const layout = layoutSheet("A4", orientation);
    assert.equal(layout.ok, true);
    assert.deepEqual(layout.sheet, paperSizes.A4[orientation]);
    assert.equal(layout.cells.length, 1);
    assert.equal(layout.dividers.length, 0);
    const [cell] = layout.cells;
    assert.deepEqual([cell.x, cell.y, cell.w, cell.h], [0, 0, layout.sheet.w, layout.sheet.h]);
  }
});

test("A5 portrait fills an A4 landscape sheet with two columns", () => {
  const layout = layoutSheet("A5", "portrait");
  assert.equal(layout.ok, true);
  assert.deepEqual(layout.sheet, { w: 297, h: 210 });
  assert.equal(layout.cells.length, 2);
  assert.ok(close(layout.cells[0].x, 0.5));
  assert.ok(close(layout.cells[1].x, 148.5));
  for (const cell of layout.cells) {
    assert.ok(close(cell.y, 0));
    assert.ok(close(cell.w, 148));
    assert.ok(close(cell.h, 210));
  }
  assert.equal(layout.dividers.length, 1);
  assert.deepEqual(layout.dividers[0], {
    orientation: "vertical",
    x1: 148.5,
    y1: 0,
    x2: 148.5,
    y2: 210,
  });
});

test("A5 landscape fills an A4 portrait sheet with two rows", () => {
  const layout = layoutSheet("A5", "landscape");
  assert.deepEqual(layout.sheet, { w: 210, h: 297 });
  assert.equal(layout.cells.length, 2);
  assert.ok(close(layout.cells[0].y, 0.5));
  assert.ok(close(layout.cells[1].y, 148.5));
  assert.equal(layout.dividers.length, 1);
  assert.equal(layout.dividers[0].orientation, "horizontal");
  assert.ok(close(layout.dividers[0].y1, 148.5));
});

test("A6 portrait maps four cells onto an A4 portrait sheet", () => {
  const layout = layoutSheet("A6", "portrait");
  assert.deepEqual(layout.sheet, { w: 210, h: 297 });
  assert.equal(layout.cells.length, 4);
  assert.deepEqual(
    layout.cells.map((c) => [c.x, c.y]),
    [
      [0, 0.5],
      [105, 0.5],
      [0, 148.5],
      [105, 148.5],
    ],
  );
  assert.equal(layout.dividers.length, 2);
  assert.deepEqual(
    layout.dividers.map((d) => d.orientation),
    ["vertical", "horizontal"],
  );
});

test("A6 landscape maps four cells onto an A4 landscape sheet", () => {
  const layout = layoutSheet("A6", "landscape");
  assert.deepEqual(layout.sheet, { w: 297, h: 210 });
  assert.equal(layout.cells.length, 4);
  assert.ok(close(layout.cells[0].x, 0.5));
  assert.ok(close(layout.cells[0].y, 0));
  assert.ok(close(layout.cells[1].x, 148.5));
  assert.ok(close(layout.cells[2].y, 105));
});

test("cells never overlap and stay inside the sheet for every combination", () => {
  for (const size of ["A4", "A5", "A6"]) {
    for (const orientation of ["portrait", "landscape"]) {
      const { sheet, cells } = layoutSheet(size, orientation);
      for (const cell of cells) {
        assert.ok(cell.x >= -epsilon && cell.y >= -epsilon);
        assert.ok(cell.x + cell.w <= sheet.w + epsilon);
        assert.ok(cell.y + cell.h <= sheet.h + epsilon);
      }
      for (let i = 0; i < cells.length; i += 1) {
        for (let j = i + 1; j < cells.length; j += 1) {
          const a = cells[i];
          const b = cells[j];
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          assert.ok(overlapX <= epsilon || overlapY <= epsilon, `${size} ${orientation} overlap`);
        }
      }
    }
  }
});

test("dividers land exactly on the inner cell borders", () => {
  const layout = layoutSheet("A6", "portrait");
  const vertical = layout.dividers.find((d) => d.orientation === "vertical");
  const horizontal = layout.dividers.find((d) => d.orientation === "horizontal");
  assert.ok(close(vertical.x1, layout.cells[0].x + layout.cells[0].w));
  assert.ok(close(horizontal.y1, layout.cells[0].y + layout.cells[0].h));
});

test("invalid size or orientation returns a code", () => {
  assert.deepEqual(layoutSheet("A3", "portrait"), { ok: false, code: "layout.invalidSize" });
  assert.deepEqual(layoutSheet("A4", "square"), { ok: false, code: "layout.invalidSize" });
});
