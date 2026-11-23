import test from "node:test";
import assert from "node:assert/strict";
import { formatNumber, mmToPt, parseNumber, ptToMm } from "../../src/core/units.js";
import { epsilon } from "../../src/config.js";

test("mm and pt conversion round trips", () => {
  assert.ok(Math.abs(mmToPt(25.4) - 72) < epsilon);
  assert.ok(Math.abs(ptToMm(72) - 25.4) < epsilon);
  assert.ok(Math.abs(mmToPt(210) - 595.2755905511812) < 1e-9);
  assert.equal(mmToPt(0), 0);
});

test("parseNumber accepts comma and dot notation", () => {
  for (const [input, expected] of [
    ["8,5", 8.5],
    ["8.5", 8.5],
    [" 8,5 ", 8.5],
    ["-3,25", -3.25],
    ["0", 0],
    ["148", 148],
  ]) {
    assert.deepEqual(parseNumber(input), { ok: true, value: expected }, input);
  }
});

test("parseNumber rejects invalid and ambiguous input without throwing", () => {
  const invalid = ["", "   ", "abc", "1,2,3", "8,5.2", "1e5", "--2", "8,", ",5"];
  for (const input of invalid) {
    const result = parseNumber(input);
    assert.equal(result.ok, false, `${input} must be rejected`);
    assert.equal(result.code, "units.invalidNumber", input);
  }

  const ambiguous = parseNumber("1.000");
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, "units.ambiguousNumber");

  assert.equal(parseNumber(null).code, "units.invalidNumber");
  assert.equal(parseNumber(undefined).code, "units.invalidNumber");
  assert.equal(parseNumber(Number.NaN).code, "units.invalidNumber");
});

test("parseNumber passes numbers through", () => {
  assert.deepEqual(parseNumber(8.5), { ok: true, value: 8.5 });
});

test("formatNumber uses comma and drops unnecessary zeros", () => {
  assert.equal(formatNumber(8.5), "8,5");
  assert.equal(formatNumber(8), "8");
  assert.equal(formatNumber(8.25, 2), "8,25");
  assert.equal(formatNumber(0.5), "0,5");
  assert.equal(formatNumber(-3.25, 2), "-3,25");
  assert.equal(formatNumber(1.04, 1), "1");
  assert.equal(formatNumber(1.05, 1), "1,1");
  assert.equal(formatNumber(-0.0001, 2), "0");
});

test("formatNumber reports invalid numbers", () => {
  assert.equal(formatNumber(Number.NaN).ok, false);
  assert.equal(formatNumber("8").ok, false);
});
