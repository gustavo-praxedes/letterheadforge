import test from "node:test";
import assert from "node:assert/strict";
import { clampToRange, fieldText, normalizeFields, readField } from "../../src/ui/fields.js";

test("values inside the range pass through", () => {
  assert.deepEqual(clampToRange(10, { min: 0, max: 50 }), { ok: true, value: 10, clamped: false });
});

test("values outside the range are clamped with a code", () => {
  const low = clampToRange(-5, { min: 0, max: 50 });
  assert.equal(low.ok, true);
  assert.equal(low.value, 0);
  assert.equal(low.clamped, true);
  assert.equal(low.code, "field.clamped");

  const high = clampToRange(90, { min: 0, max: 50 });
  assert.equal(high.value, 50);
});

test("non numeric values are refused", () => {
  assert.equal(clampToRange("10", { min: 0, max: 50 }).ok, false);
  assert.equal(clampToRange(Number.NaN).code, "field.invalidNumber");
});

test("readField accepts comma and dot", () => {
  const comma = readField("8,5", { min: 0, max: 50 }, { unit: "mm" });
  assert.equal(comma.ok, true);
  assert.equal(comma.value, 8.5);
  assert.equal(comma.display, "8,5");
  assert.equal(comma.unit, "mm");
  assert.equal(comma.warning, null);

  const dot = readField("8.5", { min: 0, max: 50 });
  assert.equal(dot.value, 8.5);
});

test("readField clamps and flags the warning", () => {
  const result = readField("120", { min: 0, max: 50 });
  assert.equal(result.value, 50);
  assert.equal(result.clamped, true);
  assert.equal(result.warning, "field.clamped");
  assert.equal(result.display, "50");
});

test("readField reports invalid and ambiguous input", () => {
  assert.equal(readField("abc").code, "units.invalidNumber");
  assert.equal(readField("1.000").code, "units.ambiguousNumber");
  assert.equal(readField("1.000").ok, false);
  assert.equal(readField("").warning, "units.invalidNumber");
});

test("fieldText formats with comma and optional unit", () => {
  assert.equal(fieldText(8.5), "8,5");
  assert.equal(fieldText(8.5, { unit: "mm" }), "8,5 mm");
  assert.equal(fieldText(0.25, { decimals: 2, unit: "mm" }), "0,25 mm");
  assert.equal(fieldText(Number.NaN), "");
});

test("normalizeFields keeps valid fields and computes display text", () => {
  const fields = normalizeFields([
    { id: "margin-top", type: "number", path: "page.margins.top", value: 12.5, unit: "mm" },
    { id: "no-path", type: "number", value: 1 },
    null,
    { id: "style", type: "select", path: "frame.style", value: "solid" },
  ]);
  assert.equal(fields.length, 2);
  assert.equal(fields[0].text, "12,5 mm");
  assert.equal(fields[1].text, "solid");
  assert.deepEqual(normalizeFields("nope"), []);
});
