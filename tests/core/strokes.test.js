import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStroke } from "../../src/core/strokes.js";
import { limits, strokePatterns, strokeScale } from "../../src/config.js";

const thickness = 0.5;

test("solid has no dash and a butt cap", () => {
  const stroke = normalizeStroke({ style: "solid", thickness });
  assert.equal(stroke.ok, true);
  assert.deepEqual(stroke.dash, []);
  assert.equal(stroke.cap, "butt");
  assert.equal(stroke.dashOffset, 0);
});

test("dashed scales the pattern by thickness and strokeScale", () => {
  const stroke = normalizeStroke({ style: "dashed", thickness });
  assert.deepEqual(stroke.dash, strokePatterns.dashed.map((m) => m * thickness * strokeScale));
  assert.deepEqual(stroke.dash, [2, 1.5]);
  assert.equal(stroke.cap, "butt");
});

test("dotted starts with a zero-length dash and a round cap", () => {
  const stroke = normalizeStroke({ style: "dotted", thickness });
  assert.equal(stroke.dash[0], 0);
  assert.equal(stroke.dash[1], 1.5);
  assert.equal(stroke.cap, "round");
});

test("dashdot keeps four entries and a round cap", () => {
  const stroke = normalizeStroke({ style: "dashdot", thickness });
  assert.equal(stroke.dash.length, 4);
  assert.deepEqual(stroke.dash, [3, 1.5, 0, 1.5]);
  assert.equal(stroke.cap, "round");
});

test("dash phase always starts at the beginning of the segment", () => {
  for (const style of ["solid", "dashed", "dotted", "dashdot"]) {
    assert.equal(normalizeStroke({ style, thickness }).dashOffset, 0);
  }
});

test("thickness outside the allowed range is refused", () => {
  assert.equal(normalizeStroke({ style: "solid", thickness: 0.001 }).code, "strokes.invalidThickness");
  assert.equal(
    normalizeStroke({ style: "solid", thickness: limits.rulingThickness.max + 1 }).code,
    "strokes.invalidThickness",
  );
  assert.equal(normalizeStroke({ style: "solid", thickness: "0,5" }).code, "strokes.invalidThickness");
  assert.equal(normalizeStroke({ style: "solid" }).code, "strokes.invalidThickness");
});

test("unknown style is refused", () => {
  assert.equal(normalizeStroke({ style: "wavy", thickness }).code, "strokes.invalidStyle");
});
