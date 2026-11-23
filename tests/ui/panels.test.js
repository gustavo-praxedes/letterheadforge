import test from "node:test";
import assert from "node:assert/strict";

import { enums, limits } from "../../src/config.js";
import { defaultPreset } from "../../src/core/schema.js";
import { strings } from "../../src/strings.pt-BR.js";
import { frameSection, marginsSection, pageSection, panelFields, rulingSection } from "../../src/ui/panels.js";

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

test("ruling section exposes type, trace and the config bounds", () => {
  const preset = presetWith((p) => {
    p.ruling.type = "grid";
    p.ruling.style = "dashed";
    p.ruling.color = "#DDDDDDFF";
    p.ruling.thickness = 0.4;
    p.ruling.dotRadius = 0.5;
  });
  const fields = rulingSection(preset);

  assert.deepEqual(fields.map((f) => f.id), [
    "ruling.enabled",
    "ruling.type",
    "ruling.style",
    "ruling.color",
    "ruling.thickness",
    "ruling.dotRadius",
    "ruling.y.mode",
    "ruling.y.spacing",
    "ruling.y.count",
    "ruling.x.mode",
    "ruling.x.spacing",
    "ruling.x.count",
    "ruling.insets.top",
    "ruling.insets.right",
    "ruling.insets.bottom",
    "ruling.insets.left",
  ]);

  const enabled = byId(fields, "ruling.enabled");
  assert.equal(enabled.type, "checkbox");
  assert.equal(enabled.value, true);

  const type = byId(fields, "ruling.type");
  assert.equal(type.type, "select");
  assert.equal(type.value, "grid");
  assert.deepEqual(type.options.map((o) => o.value), enums.rulingTypes);
  assert.ok(type.options.every((o) => typeof o.label === "string" && o.label.length > 0));

  const style = byId(fields, "ruling.style");
  assert.equal(style.value, "dashed");
  assert.deepEqual(style.options.map((o) => o.value), enums.rulingStyles);

  const color = byId(fields, "ruling.color");
  assert.equal(color.type, "color");
  assert.equal(color.value, "#DDDDDDFF");

  const thickness = byId(fields, "ruling.thickness");
  assert.equal(thickness.type, "number");
  assert.equal(thickness.min, limits.rulingThickness.min);
  assert.equal(thickness.max, limits.rulingThickness.max);
  assert.equal(thickness.value, 0.4);
  assert.equal(thickness.unit, strings.units.millimetre);

  const dotRadius = byId(fields, "ruling.dotRadius");
  assert.equal(dotRadius.min, limits.dotRadius.min);
  assert.equal(dotRadius.max, limits.dotRadius.max);
  assert.equal(dotRadius.value, 0.5);
});

test("ruling axes take their modes and bounds from config", () => {
  const preset = presetWith((p) => {
    p.ruling.type = "grid";
    p.ruling.y.mode = "count";
    p.ruling.y.count = 40;
    p.ruling.x.mode = "spacing";
    p.ruling.x.spacing = 12;
  });
  const fields = rulingSection(preset);

  for (const axis of ["x", "y"]) {
    const mode = byId(fields, `ruling.${axis}.mode`);
    assert.equal(mode.type, "select");
    assert.deepEqual(mode.options.map((o) => o.value), enums.rulingModes);
    assert.ok(mode.options.every((o) => typeof o.label === "string" && o.label.length > 0));
  }

  assert.equal(byId(fields, "ruling.y.mode").value, "count");
  const count = byId(fields, "ruling.y.count");
  assert.equal(count.value, 40);
  assert.equal(count.min, limits.count.min);
  assert.equal(count.max, limits.count.max);
  assert.equal(count.step, 1, "a count is a whole number");
  assert.equal(count.disabled, false);
  assert.equal(byId(fields, "ruling.y.spacing").disabled, true, "spacing is not used in count mode");

  assert.equal(byId(fields, "ruling.x.mode").value, "spacing");
  const spacing = byId(fields, "ruling.x.spacing");
  assert.equal(spacing.value, 12);
  assert.equal(spacing.min, limits.spacing.min);
  assert.equal(spacing.max, limits.spacing.max);
  assert.equal(spacing.unit, strings.units.millimetre);
  assert.equal(spacing.disabled, false);
  assert.equal(byId(fields, "ruling.x.count").disabled, true, "count is not used in spacing mode");
});

test("ruling insets carry the small-area warning when the margins grow", () => {
  const roomy = presetWith((p) => {
    p.page.size = "A6";
    p.page.margins = { top: 10, right: 10, bottom: 10, left: 10 };
  });
  for (const inset of rulingSection(roomy).filter((f) => f.id.startsWith("ruling.insets."))) {
    assert.equal(inset.warning, null, `${inset.id} must be quiet with room to spare`);
  }

  const cramped = presetWith((p) => {
    p.page.size = "A6";
    p.page.margins = { top: 45, right: 45, bottom: 45, left: 45 };
    p.ruling.insets = { top: 10, right: 10, bottom: 10, left: 10 };
  });
  const insets = rulingSection(cramped).filter((f) => f.id.startsWith("ruling.insets."));
  assert.equal(insets.length, 4);
  for (const inset of insets) {
    assert.ok(inset.warning, `${inset.id} must warn`);
    assert.equal(inset.warning.code, "ruling.areaTooSmall");
    assert.equal(inset.warning.message, strings.warnings.catalog["ruling.areaTooSmall"]);
  }
});

test("insets use the config bounds", () => {
  const insets = rulingSection(defaultPreset()).filter((f) => f.id.startsWith("ruling.insets."));
  for (const inset of insets) {
    assert.equal(inset.type, "number");
    assert.equal(inset.min, limits.insets.min);
    assert.equal(inset.max, limits.insets.max);
    assert.equal(inset.unit, strings.units.millimetre);
    assert.equal(inset.value, 5);
  }
});

test("disabling the ruling disables every dependent field", () => {
  const preset = presetWith((p) => {
    p.ruling.enabled = false;
  });
  const fields = rulingSection(preset);
  const enabled = byId(fields, "ruling.enabled");

  assert.equal(enabled.value, false);
  assert.equal(enabled.disabled, false, "the switch itself stays usable");
  for (const field of fields.filter((f) => f.id !== "ruling.enabled")) {
    assert.equal(field.disabled, true, `${field.id} must follow the switch`);
    assert.equal(field.warning ?? null, null, `${field.id} must not warn while the ruling is off`);
  }
});

test("dots skip the trace style and lines skip the vertical axis", () => {
  const dots = rulingSection(presetWith((p) => { p.ruling.type = "dots"; }));
  assert.equal(byId(dots, "ruling.style").disabled, true, "the trace style does not apply to dots");
  assert.equal(byId(dots, "ruling.dotRadius").disabled, false);
  assert.equal(byId(dots, "ruling.x.mode").disabled, false, "dots use both axes");

  const lines = rulingSection(defaultPreset());
  assert.equal(byId(lines, "ruling.style").disabled, false);
  assert.equal(byId(lines, "ruling.dotRadius").disabled, true, "the radius only matters for dots");
  for (const id of ["ruling.x.mode", "ruling.x.spacing", "ruling.x.count"]) {
    assert.equal(byId(lines, id).disabled, true, "horizontal lines only use the vertical axis");
  }
  assert.equal(byId(lines, "ruling.y.mode").disabled, false);
});

test("the ruling panel sits between the margins and the frame", () => {
  const ids = panelFields(defaultPreset()).map((f) => f.id);
  const margins = ids.indexOf("page.margins.left");
  const ruling = ids.indexOf("ruling.enabled");
  const frame = ids.indexOf("frame.enabled");

  assert.ok(margins >= 0 && ruling >= 0 && frame >= 0);
  assert.ok(margins < ruling, "the ruling comes after the margins");
  assert.ok(ruling < frame, "the ruling comes before the frame");
});

function fieldsContainLabel(label) {
  return panelFields(defaultPreset()).some((field) => field.label === label);
}
