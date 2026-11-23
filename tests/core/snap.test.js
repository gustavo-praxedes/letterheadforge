import test from "node:test";
import assert from "node:assert/strict";
import { snapAngle, snapRect, snapTargets, snapValue } from "../../src/core/snap.js";
import { defaultPreset } from "../../src/core/schema.js";

const A4_CELL = { x: 0, y: 0, w: 210, h: 297 };
const close = (a, b) => Math.abs(a - b) < 1e-6;
const preset = defaultPreset();

test("targets cover page, margins, frame and ruling lines", () => {
  const targets = snapTargets({ preset, cell: A4_CELL });
  for (const value of [0, 105, 210]) {
    assert.ok(targets.vertical.some((t) => close(t, value)), `vertical ${value}`);
  }
  for (const value of [0, 148.5, 297]) {
    assert.ok(targets.horizontal.some((t) => close(t, value)), `horizontal ${value}`);
  }
  assert.ok(targets.vertical.some((t) => close(t, 10)));
  assert.ok(targets.vertical.some((t) => close(t, 200)));
  assert.ok(targets.horizontal.some((t) => close(t, 10)));
  assert.ok(targets.horizontal.some((t) => close(t, 287)));
  assert.ok(targets.vertical.some((t) => close(t, 15)));
  assert.ok(targets.horizontal.some((t) => close(t, 16.5)));
  assert.deepEqual(targets.vertical, [...targets.vertical].sort((a, b) => a - b));
});

test("other objects contribute borders and centres, excluding the moved object", () => {
  const withObject = {
    ...preset,
    objects: [{ id: "a", type: "image", x: 40, y: 60, w: 20, h: 10, visible: true }],
  };
  const targets = snapTargets({ preset: withObject, cell: A4_CELL });
  for (const value of [40, 50, 60]) {
    assert.ok(targets.vertical.some((t) => close(t, value)), `vertical ${value}`);
  }
  for (const value of [60, 65, 70]) {
    assert.ok(targets.horizontal.some((t) => close(t, value)), `horizontal ${value}`);
  }

  const excluded = snapTargets({ preset: withObject, cell: A4_CELL, excludeId: "a" });
  assert.ok(!excluded.horizontal.some((t) => close(t, 65)));
});

test("hidden objects are not snap targets", () => {
  const withHidden = {
    ...preset,
    objects: [{ id: "b", type: "text", x: 12.7, y: 44.3, w: 5, h: 5, visible: false }],
  };
  const targets = snapTargets({ preset: withHidden, cell: A4_CELL });
  assert.ok(!targets.vertical.some((value) => close(value, 12.7)));
});

test("snapValue respects the tolerance", () => {
  const targets = [0, 10, 100];
  assert.deepEqual(snapValue(10.5, targets), { value: 10, hit: true, target: 10 });
  assert.equal(snapValue(12.5, targets).hit, false);
  assert.equal(snapValue(98.5, targets).value, 100);
  assert.equal(snapValue(5, targets).value, 5);
});

test("snapRect moves the closest edge and returns guides", () => {
  const plain = defaultPreset();
  plain.ruling.enabled = false;
  const targets = snapTargets({ preset: plain, cell: A4_CELL });
  const result = snapRect({ x: 9, y: 40, w: 40, h: 20 }, targets);
  assert.ok(close(result.x, 10));
  assert.equal(result.hit, true);
  assert.deepEqual(result.guides, [{ axis: "x", position: 10 }]);
  assert.equal(result.y, 40);
});

test("snapRect can align centres", () => {
  const targets = snapTargets({ preset, cell: A4_CELL });
  const result = snapRect({ x: 99, y: 20, w: 10, h: 10 }, targets);
  assert.ok(close(result.x + result.w / 2, 105));
  assert.ok(result.guides.some((guide) => guide.axis === "x" && close(guide.position, 105)));
});

test("snapRect outside the tolerance leaves the rect untouched", () => {
  const plain = defaultPreset();
  plain.ruling.enabled = false;
  const targets = snapTargets({ preset: plain, cell: A4_CELL });
  const result = snapRect({ x: 60, y: 60, w: 20, h: 20 }, targets);
  assert.deepEqual(result, { x: 60, y: 60, w: 20, h: 20, guides: [], hit: false });
});

test("snapRect with disabled flag returns the input unchanged", () => {
  const targets = snapTargets({ preset, cell: A4_CELL });
  const result = snapRect({ x: 9, y: 9, w: 20, h: 20 }, targets, { disabled: true });
  assert.deepEqual(result, { x: 9, y: 9, w: 20, h: 20, guides: [], hit: false });
});

test("snapAngle uses 15 degree steps and normalises the range", () => {
  assert.equal(snapAngle(21), 15);
  assert.equal(snapAngle(23), 30);
  assert.equal(snapAngle(0), 0);
  assert.equal(snapAngle(180), 180);
  assert.equal(snapAngle(-180), 180);
  assert.equal(snapAngle(-7), 0);
  assert.equal(snapAngle(359), 0);
  assert.equal(snapAngle(-21), -15);
});
