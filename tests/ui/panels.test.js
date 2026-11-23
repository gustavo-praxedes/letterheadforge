import test from "node:test";
import assert from "node:assert/strict";

import { enums, limits } from "../../src/config.js";
import { defaultPreset } from "../../src/core/schema.js";
import { strings } from "../../src/strings.pt-BR.js";
import { frameSection, marginsSection, pageSection, panelFields } from "../../src/ui/panels.js";

function presetWith(mutate) {
  const preset = defaultPreset();
  mutate(preset);
  return preset;
}

function byId(fields, id) {
  const field = fields.find((entry) => entry.id === id);
  assert.ok(field, `missing field ${id}`);
  return field;
}

test("page section exposes size, orientation and colour from the preset", () => {
  const preset = presetWith((p) => {
    p.page.size = "A5";
    p.page.orientation = "landscape";
    p.page.color = "#EFEFEF";
  });
  const fields = pageSection(preset);

  assert.deepEqual(fields.map((f) => f.id), ["page.size", "page.orientation", "page.color"]);

  const size = byId(fields, "page.size");
  assert.equal(size.type, "select");
  assert.equal(size.value, "A5");
  assert.deepEqual(size.options.map((o) => o.value), enums.pageSizes);
  assert.ok(size.options.every((o) => typeof o.label === "string" && o.label.length > 0));

  const orientation = byId(fields, "page.orientation");
  assert.equal(orientation.type, "select");
  assert.equal(orientation.value, "landscape");
  assert.deepEqual(orientation.options.map((o) => o.value), enums.orientations);

  const color = byId(fields, "page.color");
  assert.equal(color.type, "color");
  assert.equal(color.value, "#EFEFEF");
});

test("margins section has the four sides bounded by config", () => {
  const preset = presetWith((p) => {
    p.page.margins = { top: 12, right: 8, bottom: 3, left: 0 };
  });
  const fields = marginsSection(preset);

  assert.deepEqual(
    fields.map((f) => f.path),
    ["page.margins.top", "page.margins.right", "page.margins.bottom", "page.margins.left"],
  );

  for (const field of fields) {
    assert.equal(field.type, "number");
    assert.equal(field.min, 0);
    assert.equal(field.max, limits.marginMax, "the upper bound must come from config");
    assert.equal(field.unit, strings.units.millimetre);
    assert.equal(typeof field.label, "string");
    assert.ok(field.label.length > 0);
  }

  assert.deepEqual(fields.map((f) => f.value), [12, 8, 3, 0]);
});

test("margins warn only between zero and the home-print limit", () => {
  const preset = presetWith((p) => {
    p.page.margins = { top: 12, right: 4, bottom: 0, left: limits.marginHomePrint };
  });
  const [top, right, bottom, left] = marginsSection(preset);

  assert.equal(top.warning, null, "12 mm is safe");
  assert.equal(left.warning, null, "exactly at the limit is safe");
  assert.equal(bottom.warning, null, "zero margin is allowed without warning");

  assert.ok(right.warning, "4 mm must warn");
  assert.equal(right.warning.code, "margin.belowHomePrint");
  assert.match(right.warning.message, new RegExp(String(limits.marginHomePrint)));
});

test("frame section reflects the preset and the config bounds", () => {
  const preset = presetWith((p) => {
    p.frame.style = "double";
    p.frame.thickness = 0.8;
  });
  const fields = frameSection(preset);

  const enabled = byId(fields, "frame.enabled");
  assert.equal(enabled.type, "checkbox");
  assert.equal(enabled.value, true);

  const color = byId(fields, "frame.color");
  assert.equal(color.type, "color");
  assert.equal(color.value, "#3A3A3AFF");

  const style = byId(fields, "frame.style");
  assert.equal(style.type, "select");
  assert.equal(style.value, "double");
  assert.deepEqual(style.options.map((o) => o.value), enums.frameStyles);

  const thickness = byId(fields, "frame.thickness");
  assert.equal(thickness.type, "number");
  assert.equal(thickness.min, limits.frameThickness.min);
  assert.equal(thickness.max, limits.frameThickness.max);
  assert.equal(thickness.value, 0.8);
  assert.equal(thickness.unit, strings.units.millimetre);

  const gap = byId(fields, "frame.doubleGap");
  assert.equal(gap.min, limits.doubleGap.min);
  assert.equal(gap.max, limits.doubleGap.max);

  const radius = byId(fields, "frame.cornerRadius");
  assert.equal(radius.min, 0);
  assert.equal(radius.max, null, "the radius ceiling depends on geometry: the core clamps it");
});

test("disabling the frame disables its dependent fields", () => {
  const preset = presetWith((p) => {
    p.frame.enabled = false;
  });
  const fields = frameSection(preset);
  const enabled = byId(fields, "frame.enabled");

  assert.equal(enabled.value, false);
  assert.equal(enabled.disabled, false, "the switch itself stays usable");
  for (const field of fields.filter((f) => f.id !== "frame.enabled")) {
    assert.equal(field.disabled, true, `${field.id} must follow the switch`);
  }
});

test("every field path resolves inside a default preset", () => {
  const fields = panelFields(defaultPreset());
  assert.ok(fields.length >= 12);

  for (const field of fields) {
    const resolved = field.path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), defaultPreset());
    assert.notEqual(resolved, undefined, `${field.path} does not exist in the preset`);
    assert.equal(field.id, field.path, "the id doubles as the history tag and the path");
  }
});

test("numeric fields carry a usable step and localised labels", () => {
  for (const field of panelFields(defaultPreset()).filter((f) => f.type === "number")) {
    assert.ok(field.step > 0, `${field.id} needs a positive step`);
    assert.equal(typeof field.label, "string");
    assert.ok(field.label.length > 0);
  }
  assert.ok(fieldsContainLabel(strings.panels.fields.size));
});

function fieldsContainLabel(label) {
  return panelFields(defaultPreset()).some((field) => field.label === label);
}
