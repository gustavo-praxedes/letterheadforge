import test from "node:test";
import assert from "node:assert/strict";
import { cutMarks } from "../../src/core/cutmarks.js";
import { layoutSheet } from "../../src/core/layout.js";
import { cutMark, epsilon } from "../../src/config.js";

const EVEN = { top: 10, right: 10, bottom: 10, left: 10 };

const close = (a, b) => Math.abs(a - b) < 1e-9;

function assertMark(mark, expected) {
  for (const key of ["x1", "y1", "x2", "y2"]) {
    assert.ok(close(mark[key], expected[key]), `${key}: ${mark[key]} != ${expected[key]}`);
  }
}

function markLength(mark) {
  return Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1);
}

test("A4 has no divisions and therefore no cut marks", () => {
  for (const orientation of ["portrait", "landscape"]) {
    const layout = layoutSheet("A4", orientation);
    assert.deepEqual(cutMarks(layout, EVEN), { marks: [], warnings: [] });
  }
});

test("A5 portrait draws two marks on the vertical division", () => {
  const layout = layoutSheet("A5", "portrait");
  const { marks, warnings } = cutMarks(layout, EVEN);
  assert.deepEqual(warnings, []);
  assert.equal(marks.length, 2);
  assertMark(marks[0], { x1: 148.5, y1: 0, x2: 148.5, y2: 3 });
  assertMark(marks[1], { x1: 148.5, y1: 207, x2: 148.5, y2: 210 });
});

test("A5 landscape draws two marks on the horizontal division", () => {
  const layout = layoutSheet("A5", "landscape");
  const { marks, warnings } = cutMarks(layout, EVEN);
  assert.deepEqual(warnings, []);
  assert.equal(marks.length, 2);
  assertMark(marks[0], { x1: 0, y1: 148.5, x2: 3, y2: 148.5 });
  assertMark(marks[1], { x1: 207, y1: 148.5, x2: 210, y2: 148.5 });
});

test("A6 draws the four extremities plus the four crossing marks", () => {
  const layout = layoutSheet("A6", "portrait");
  assert.deepEqual(layout.sheet, { w: 210, h: 297 });
  const { marks, warnings } = cutMarks(layout, EVEN);
  assert.deepEqual(warnings, []);
  assert.equal(marks.length, 8);

  // Extremities, in divider order (vertical first, then horizontal).
  assertMark(marks[0], { x1: 105, y1: 0, x2: 105, y2: 3 });
  assertMark(marks[1], { x1: 105, y1: 294, x2: 105, y2: 297 });
  assertMark(marks[2], { x1: 0, y1: 148.5, x2: 3, y2: 148.5 });
  assertMark(marks[3], { x1: 207, y1: 148.5, x2: 210, y2: 148.5 });

  // Crossing, one mark per direction: left, right, up, down.
  assertMark(marks[4], { x1: 105, y1: 148.5, x2: 102, y2: 148.5 });
  assertMark(marks[5], { x1: 105, y1: 148.5, x2: 108, y2: 148.5 });
  assertMark(marks[6], { x1: 105, y1: 148.5, x2: 105, y2: 145.5 });
  assertMark(marks[7], { x1: 105, y1: 148.5, x2: 105, y2: 151.5 });
});

test("A6 landscape also has extremities and a central crossing", () => {
  const layout = layoutSheet("A6", "landscape");
  assert.deepEqual(layout.sheet, { w: 297, h: 210 });
  const { marks } = cutMarks(layout, EVEN);
  assert.equal(marks.length, 8);
  assertMark(marks[0], { x1: 148.5, y1: 0, x2: 148.5, y2: 3 });
  assertMark(marks[3], { x1: 294, y1: 105, x2: 297, y2: 105 });
  assertMark(marks[4], { x1: 148.5, y1: 105, x2: 145.5, y2: 105 });
  assertMark(marks[7], { x1: 148.5, y1: 105, x2: 148.5, y2: 108 });
});

test("mark length is min(cutMark.length, margin of its side)", () => {
  const layout = layoutSheet("A5", "portrait");

  const short = cutMarks(layout, { ...EVEN, top: 2, bottom: 1.5 });
  assertMark(short.marks[0], { x1: 148.5, y1: 0, x2: 148.5, y2: 2 });
  assertMark(short.marks[1], { x1: 148.5, y1: 208.5, x2: 148.5, y2: 210 });

  const long = cutMarks(layout, { ...EVEN, top: 20, bottom: 20 });
  assert.equal(markLength(long.marks[0]), cutMark.length);
  assert.equal(markLength(long.marks[1]), cutMark.length);
});

test("a zero margin drops the mark and warns once per side", () => {
  const layout = layoutSheet("A5", "portrait");
  const { marks, warnings } = cutMarks(layout, { ...EVEN, top: 0 });
  assert.equal(marks.length, 1);
  assertMark(marks[0], { x1: 148.5, y1: 207, x2: 148.5, y2: 210 });
  assert.deepEqual(warnings, [{ code: "cutmarks.margin.zero", params: { side: "top" } }]);
});

test("every zero margin of A6 yields a single warning, without marks", () => {
  const layout = layoutSheet("A6", "portrait");
  const { marks, warnings } = cutMarks(layout, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(marks, []);
  assert.deepEqual(warnings, [
    { code: "cutmarks.margin.zero", params: { side: "top" } },
    { code: "cutmarks.margin.zero", params: { side: "bottom" } },
    { code: "cutmarks.margin.zero", params: { side: "left" } },
    { code: "cutmarks.margin.zero", params: { side: "right" } },
  ]);
});

test("asymmetric margins follow the side table, including the crossing", () => {
  const layout = layoutSheet("A6", "portrait");
  const { marks, warnings } = cutMarks(layout, { top: 2, right: 0, bottom: 5, left: 1 });

  assert.equal(marks.length, 6);
  assertMark(marks[0], { x1: 105, y1: 0, x2: 105, y2: 2 });
  assertMark(marks[1], { x1: 105, y1: 294, x2: 105, y2: 297 });
  assertMark(marks[2], { x1: 0, y1: 148.5, x2: 1, y2: 148.5 });
  // Right extremity is suppressed by right = 0; the leftwards crossing mark too.
  // The rightwards mark uses the left margin, the vertical ones bottom and top.
  assertMark(marks[3], { x1: 105, y1: 148.5, x2: 106, y2: 148.5 });
  assertMark(marks[4], { x1: 105, y1: 148.5, x2: 105, y2: 145.5 });
  assertMark(marks[5], { x1: 105, y1: 148.5, x2: 105, y2: 150.5 });

  assert.deepEqual(warnings, [{ code: "cutmarks.margin.zero", params: { side: "right" } }]);
});

test("marks stay inside their margin and inside the sheet", () => {
  const margins = { top: 7, right: 1, bottom: 2.5, left: 0 };
  for (const size of ["A4", "A5", "A6"]) {
    for (const orientation of ["portrait", "landscape"]) {
      const layout = layoutSheet(size, orientation);
      const { marks } = cutMarks(layout, margins);
      for (const mark of marks) {
        assert.ok(mark.x1 >= -epsilon && mark.x1 <= layout.sheet.w + epsilon);
        assert.ok(mark.x2 >= -epsilon && mark.x2 <= layout.sheet.w + epsilon);
        assert.ok(mark.y1 >= -epsilon && mark.y1 <= layout.sheet.h + epsilon);
        assert.ok(mark.y2 >= -epsilon && mark.y2 <= layout.sheet.h + epsilon);
        assert.ok(markLength(mark) <= cutMark.length + epsilon);
        assert.ok(markLength(mark) <= Math.max(...Object.values(margins)) + epsilon);
      }
    }
  }
});

test("horizontal extremities use the left and right margins", () => {
  const layout = layoutSheet("A5", "landscape");
  const { marks } = cutMarks(layout, { top: 0.5, right: 2, bottom: 9, left: 1 });
  assert.equal(marks.length, 2);
  assertMark(marks[0], { x1: 0, y1: 148.5, x2: 1, y2: 148.5 });
  assertMark(marks[1], { x1: 208, y1: 148.5, x2: 210, y2: 148.5 });
});

test("invalid layout or margins return a code instead of throwing", () => {
  const layout = layoutSheet("A5", "portrait");
  assert.deepEqual(cutMarks(null, EVEN), { ok: false, code: "cutmarks.invalidLayout" });
  assert.deepEqual(cutMarks({ ok: false, code: "layout.invalidSize" }, EVEN), {
    ok: false,
    code: "cutmarks.invalidLayout",
  });
  assert.deepEqual(cutMarks(layout, null), { ok: false, code: "cutmarks.invalidMargins" });
  assert.deepEqual(cutMarks(layout, { top: 10, right: 10, bottom: -1, left: 10 }), {
    ok: false,
    code: "cutmarks.invalidMargins",
  });
  assert.deepEqual(cutMarks(layout, { top: 10, right: 10, bottom: "10", left: 10 }), {
    ok: false,
    code: "cutmarks.invalidMargins",
  });
});
