import test from "node:test";
import assert from "node:assert/strict";
import { axisPositions, buildRuling, rulingArea } from "../../src/core/ruling.js";
import { createMask, maskGet } from "../../src/core/mask.js";
import { defaultPreset } from "../../src/core/schema.js";
import { limits } from "../../src/config.js";

const A4_CELL = { x: 0, y: 0, w: 210, h: 297 };
const close = (a, b) => Math.abs(a - b) < 1e-6;

function presetWith(mutate) {
  const preset = defaultPreset();
  mutate(preset);
  return preset;
}

function maskWithBand(cell, fromMm, toMm, resolution = limits.maskResolution) {
  const width = Math.round(cell.w * resolution);
  const height = Math.round(cell.h * resolution);
  const mask = createMask(width, height);
  const start = Math.round(fromMm * resolution);
  const end = Math.round(toMm * resolution);
  for (let py = 0; py < height; py += 1) {
    for (let px = start; px < end; px += 1) {
      mask.data[py * width + px] = 1;
    }
  }
  assert.equal(maskGet(mask, start, 0), 1);
  assert.equal(maskGet(mask, Math.max(0, start - 1), 0), 0);
  return mask;
}

test("ruling area insets the margin rectangle", () => {
  const area = rulingArea({ preset: defaultPreset(), cell: A4_CELL });
  assert.equal(area.ok, true);
  assert.deepEqual(area.area, { x: 15, y: 15, w: 180, h: 267 });
});

test("ruling area honours individual insets", () => {
  const preset = presetWith((p) => {
    p.ruling.insets = { top: 0, right: 10, bottom: 20, left: 30 };
  });
  const area = rulingArea({ preset, cell: A4_CELL });
  assert.deepEqual(area.area, { x: 40, y: 10, w: 150, h: 257 });
});

test("ruling area too small is reported", () => {
  const preset = presetWith((p) => {
    p.ruling.insets = { top: 100, right: 100, bottom: 100, left: 100 };
  });
  const area = rulingArea({ preset, cell: A4_CELL });
  assert.equal(area.ok, false);
  assert.equal(area.code, "ruling.areaTooSmall");
});

test("count mode puts the first and last lines on the limits", () => {
  const two = axisPositions({ length: 100, mode: "count", count: 2 });
  assert.deepEqual(two.positions, [0, 100]);

  const many = axisPositions({ length: 100, mode: "count", count: 50 });
  assert.equal(many.positions.length, 50);
  assert.ok(close(many.positions[0], 0));
  assert.ok(close(many.positions[49], 100));
  assert.ok(close(many.positions[1], 100 / 49));
});

test("spacing mode splits the remainder evenly", () => {
  const result = axisPositions({ length: 267, mode: "spacing", spacing: 8 });
  assert.equal(result.ok, true);
  assert.equal(result.positions.length, 34);
  assert.ok(close(result.positions[0], 1.5));
  assert.ok(close(result.positions.at(-1), 265.5));
  assert.ok(close(267 - result.positions.at(-1), 1.5));
});

test("spacing mode with no remainder starts at zero", () => {
  const result = axisPositions({ length: 240, mode: "spacing", spacing: 8 });
  assert.ok(close(result.positions[0], 0));
  assert.ok(close(result.positions.at(-1), 240));
});

test("spacing larger than the length yields one centred position", () => {
  const result = axisPositions({ length: 20, mode: "spacing", spacing: 50 });
  assert.deepEqual(result.positions, [10]);
});

test("invalid axis settings are reported", () => {
  assert.equal(axisPositions({ length: 100, mode: "count", count: 1 }).code, "invalid.count");
  assert.equal(axisPositions({ length: 100, mode: "spacing", spacing: 0 }).code, "invalid.spacing");
  assert.equal(axisPositions({ length: 0, mode: "spacing", spacing: 8 }).ok, false);
  assert.equal(axisPositions({ length: 100, mode: "zigzag" }).ok, false);
});

test("lines only span the area width and use the y axis", () => {
  const result = buildRuling({ preset: defaultPreset(), cell: A4_CELL });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.dots.length, 0);
  assert.equal(result.segments.length, 34);
  for (const segment of result.segments) {
    assert.ok(close(segment.x1, 15));
    assert.ok(close(segment.x2, 195));
    assert.ok(close(segment.y1, segment.y2));
  }
  assert.ok(close(result.segments[0].y1, 16.5));
});

test("grid adds vertical segments after the horizontal ones", () => {
  const preset = presetWith((p) => {
    p.ruling.type = "grid";
    p.ruling.x = { mode: "spacing", spacing: 20, count: 10 };
  });
  const result = buildRuling({ preset, cell: A4_CELL });
  const verticals = result.segments.filter((s) => close(s.x1, s.x2));
  const horizontals = result.segments.filter((s) => close(s.y1, s.y2));
  assert.ok(verticals.length > 0);
  assert.ok(horizontals.length > 0);
  const firstVertical = result.segments.findIndex((s) => close(s.x1, s.x2));
  assert.ok(firstVertical >= horizontals.length);
});

test("dots are placed on both axes with the configured radius", () => {
  const preset = presetWith((p) => {
    p.ruling.type = "dots";
    p.ruling.x = { mode: "spacing", spacing: 8, count: 20 };
    p.ruling.dotRadius = 0.3;
  });
  const result = buildRuling({ preset, cell: A4_CELL });
  assert.equal(result.segments.length, 0);
  assert.ok(result.dots.length > 100);
  assert.equal(result.dots[0].r, 0.3);
  const sorted = [...result.dots].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  assert.deepEqual(result.dots, sorted);
});

test("a blocked object cuts the line and the line continues after it", () => {
  const mask = maskWithBand(A4_CELL, 100, 120);
  const result = buildRuling({ preset: defaultPreset(), cell: A4_CELL, blockMask: mask });
  const firstLine = result.segments.filter((s) => close(s.y1, result.segments[0].y1));
  assert.equal(firstLine.length, 2);
  assert.ok(close(firstLine[0].x1, 15));
  assert.ok(close(firstLine[0].x2, 100));
  assert.ok(close(firstLine[1].x1, 120));
  assert.ok(close(firstLine[1].x2, 195));
});

test("short remainders are dropped only on cut lines", () => {
  const mask = maskWithBand(A4_CELL, 180, 195);
  const result = buildRuling({ preset: defaultPreset(), cell: A4_CELL, blockMask: mask });
  const firstLine = result.segments.filter((s) => close(s.y1, result.segments[0].y1));
  assert.equal(firstLine.length, 1);
  assert.ok(close(firstLine[0].x2, 180));
});

test("a dot touching the mask is omitted", () => {
  const preset = presetWith((p) => {
    p.ruling.type = "dots";
    p.ruling.x = { mode: "spacing", spacing: 20, count: 10 };
  });
  const clean = buildRuling({ preset, cell: A4_CELL });
  const mask = maskWithBand(A4_CELL, 54.5, 55.5);
  const cut = buildRuling({ preset, cell: A4_CELL, blockMask: mask });
  assert.ok(cut.dots.length < clean.dots.length);
  const removed = clean.dots.filter((dot) => !cut.dots.some((kept) => kept.cx === dot.cx && kept.cy === dot.cy));
  assert.ok(removed.length > 0);
  for (const dot of removed) {
    assert.ok(Math.abs(dot.cx - 55) < 1.1, `removed dot at ${dot.cx} should be the one over the band`);
  }
});

test("disabled ruling produces nothing", () => {
  const preset = presetWith((p) => {
    p.ruling.enabled = false;
  });
  assert.deepEqual(buildRuling({ preset, cell: A4_CELL }), { segments: [], dots: [], warnings: [] });
});

test("output ordering is deterministic", () => {
  const first = buildRuling({ preset: defaultPreset(), cell: A4_CELL });
  const second = buildRuling({ preset: defaultPreset(), cell: A4_CELL });
  assert.deepEqual(first, second);
});
