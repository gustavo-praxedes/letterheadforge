import test from "node:test";
import assert from "node:assert/strict";

import { enums, limits } from "../../src/config.js";
import { defaultPreset } from "../../src/core/schema.js";
import { strings } from "../../src/strings.pt-BR.js";
import { watermarkSection } from "../../src/ui/panels.js";

const FONTS = [
  { id: "inter", family: "Inter", weights: [300, 400, 700] },
  { id: "lora", family: "Lora", weights: [400, 700] },
];

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

function textPreset() {
  return presetWith((p) => {
    p.watermark.enabled = true;
    p.watermark.text.content = "RASCUNHO";
  });
}

test("text mode exposes the descriptors in display order", () => {
  const fields = watermarkSection(textPreset(), { fonts: FONTS });

  assert.deepEqual(fields.map((f) => f.id), [
    "watermark.enabled",
    "watermark.kind",
    "watermark.text",
    "watermark.fontId",
    "watermark.sizePt",
    "watermark.weight",
    "watermark.italic",
    "watermark.color",
    "watermark.opacity",
    "watermark.rotation",
  ]);
  assert.equal(fields.length, 10);
});

test("image mode swaps the text group for the image select", () => {
  const preset = presetWith((p) => {
    p.watermark.enabled = true;
    p.watermark.kind = "image";
  });
  const fields = watermarkSection(preset, { images: [{ id: "img-1", name: "Logotipo" }] });

  assert.deepEqual(fields.map((f) => f.id), [
    "watermark.enabled",
    "watermark.kind",
    "watermark.imageId",
    "watermark.opacity",
    "watermark.rotation",
  ]);
  for (const id of ["watermark.text", "watermark.fontId", "watermark.sizePt", "watermark.weight", "watermark.italic", "watermark.color"]) {
    assert.equal(fields.some((f) => f.id === id), false, `${id} must not exist in image mode`);
  }
});

test("the two modes never mix, whichever way the preset is read", () => {
  const kinds = ["text", "image"];
  for (const kind of kinds) {
    const fields = watermarkSection(presetWith((p) => { p.watermark.kind = kind; }));
    const ids = fields.map((f) => f.id);
    assert.equal(ids.includes("watermark.text"), kind === "text");
    assert.equal(ids.includes("watermark.imageId"), kind === "image");
  }
});

test("the kind select lists every configured kind with localised labels", () => {
  const kind = byId(watermarkSection(textPreset()), "watermark.kind");
  assert.equal(kind.type, "select");
  assert.equal(kind.value, "text");
  assert.deepEqual(kind.options.map((o) => o.value), enums.watermarkKinds);
  assert.deepEqual(kind.options.map((o) => o.label), enums.watermarkKinds.map((v) => strings.panels.enums.watermarkKind[v]));
});

test("switching the watermark off disables every other field", () => {
  const fields = watermarkSection(presetWith((p) => { p.watermark.enabled = false; }));
  const enabled = byId(fields, "watermark.enabled");

  assert.equal(enabled.value, false);
  assert.equal(enabled.disabled, false, "the switch itself stays usable");
  for (const field of fields.filter((f) => f.id !== "watermark.enabled")) {
    assert.equal(field.disabled, true, `${field.id} must follow the switch`);
    assert.equal(field.warning ?? null, null, `${field.id} must not warn while the watermark is off`);
  }
});

test("opacity is shown as a percentage and stored as a 0–1 fraction", () => {
  const field = byId(watermarkSection(presetWith((p) => { p.watermark.opacity = 0.15; })), "watermark.opacity");

  assert.equal(field.type, "number");
  assert.equal(field.value, 15, "0.15 becomes 15 %");
  assert.equal(field.min, limits.opacity.min * 100);
  assert.equal(field.max, limits.opacity.max * 100);
  assert.equal(field.unit, strings.units.percentage);
  assert.equal(field.toModel(15), 0.15);
  assert.equal(field.toModel(0), limits.opacity.min);
  assert.equal(field.toModel(250), limits.opacity.max, "the model clamp never leaves the config range");
  assert.equal(field.toModel(-10), limits.opacity.min);
});

test("rotation and font size keep the config bounds", () => {
  const fields = watermarkSection(textPreset());

  const rotation = byId(fields, "watermark.rotation");
  assert.equal(rotation.type, "number");
  assert.equal(rotation.min, limits.rotation.min);
  assert.equal(rotation.max, limits.rotation.max);
  assert.equal(rotation.unit, strings.units.degree);

  const size = byId(fields, "watermark.sizePt");
  assert.equal(size.type, "number");
  assert.equal(size.min, limits.textSizePt.min);
  assert.equal(size.max, limits.textSizePt.max);
  assert.equal(size.step, 1);
  assert.equal(size.unit, strings.units.point);
  assert.match(size.help, new RegExp(String(limits.textSizePt.min)));
});

test("the colour field carries the preset value and no invented default", () => {
  const field = byId(watermarkSection(presetWith((p) => { p.watermark.text.color = "#112233"; })), "watermark.color");
  assert.equal(field.type, "color");
  assert.equal(field.value, "#112233");
  assert.equal(byId(watermarkSection(textPreset()), "watermark.color").value, "#000000");
});

test("the text field targets watermark.text.content", () => {
  const field = byId(watermarkSection(textPreset()), "watermark.text");
  assert.equal(field.type, "textarea");
  assert.equal(field.path, "watermark.text.content");
  assert.equal(field.value, "RASCUNHO");
  assert.equal(field.disabled, false);
});

test("the font select uses the catalogue and keeps the current font without one", () => {
  const withCatalogue = watermarkSection(textPreset(), { fonts: FONTS });
  const font = byId(withCatalogue, "watermark.fontId");
  assert.equal(font.type, "select");
  assert.equal(font.value, "inter");
  assert.deepEqual(font.options.map((o) => o.value), ["inter", "lora"]);
  assert.deepEqual(font.options.map((o) => o.label), ["Inter", "Lora"]);

  const weight = byId(withCatalogue, "watermark.weight");
  assert.equal(weight.type, "select");
  assert.equal(weight.value, "400");
  assert.deepEqual(weight.options.map((o) => o.value), ["300", "400", "700"]);

  const withoutCatalogue = watermarkSection(textPreset());
  assert.deepEqual(byId(withoutCatalogue, "watermark.fontId").options.map((o) => o.value), ["inter"]);
  assert.deepEqual(byId(withoutCatalogue, "watermark.weight").options.map((o) => o.value), ["400"]);
});

test("the image select warns and disables itself when no image exists", () => {
  const preset = presetWith((p) => {
    p.watermark.enabled = true;
    p.watermark.kind = "image";
  });
  const field = byId(watermarkSection(preset), "watermark.imageId");

  assert.equal(field.type, "select");
  assert.equal(field.disabled, true);
  assert.equal(field.value, "");
  assert.ok(field.gate === undefined);
  assert.ok(field.warning, "a watermark without an image must warn");
  assert.equal(field.warning.code, "watermark.imageMissing");
  assert.equal(field.warning.message, strings.warnings.catalog["watermark.imageMissing"]);
  assert.equal(field.options.length, 1);
  assert.equal(field.options[0].value, "");
});

test("the image select lists the store images and keeps the chosen one", () => {
  const preset = presetWith((p) => {
    p.watermark.enabled = true;
    p.watermark.kind = "image";
    p.watermark.imageId = "img-2";
  });
  const field = byId(watermarkSection(preset, { images: [{ id: "img-1", name: "Logotipo" }, "img-2"] }), "watermark.imageId");

  assert.equal(field.disabled, false);
  assert.equal(field.value, "img-2");
  assert.equal(field.warning, null);
  assert.ok(field.options.some((option) => option.value === "img-2"));
  assert.equal(field.toModel(""), null, "clearing the select clears the model field");
});

test("every descriptor label comes from the strings file", () => {
  const labels = new Set();
  const walk = (node) => {
    if (typeof node === "string") {
      labels.add(node);
      return;
    }
    if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(strings);

  const fields = [
    ...watermarkSection(textPreset(), { fonts: FONTS }),
    ...watermarkSection(presetWith((p) => { p.watermark.enabled = true; p.watermark.kind = "image"; }), {
      images: [{ id: "img-1", name: "Logotipo" }],
    }),
  ];
  for (const field of fields) {
    assert.equal(typeof field.label, "string");
    assert.ok(field.label.length > 0);
    assert.ok(labels.has(field.label), `${field.id} label is not in strings.pt-BR.js`);
  }
});

test("no descriptor invents a number outside config", () => {
  const allowed = new Set();
  const walk = (node) => {
    if (typeof node === "number") {
      allowed.add(node);
      allowed.add(node * 100);
      return;
    }
    if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(limits);

  const modes = [
    watermarkSection(textPreset(), { fonts: FONTS }),
    watermarkSection(presetWith((p) => { p.watermark.enabled = true; p.watermark.kind = "image"; }), {
      images: [{ id: "img-1", name: "Logotipo" }],
    }),
  ];

  for (const fields of modes) {
    for (const field of fields) {
      if (field.type !== "number") continue;
      assert.ok(Number.isFinite(field.value), `${field.id} needs a finite value`);
      assert.ok(Number.isFinite(field.step) && field.step > 0, `${field.id} needs a positive step`);
      for (const bound of [field.min, field.max]) {
        if (bound === null) continue;
        assert.ok(Number.isFinite(bound), `${field.id} bound must be finite`);
        assert.ok(allowed.has(bound), `${field.id} bound ${bound} does not come from config.js`);
      }
      if (field.min !== null && field.max !== null) assert.ok(field.min <= field.max);
    }
  }
});

test("every descriptor path resolves inside a default preset", () => {
  const modes = [
    watermarkSection(textPreset(), { fonts: FONTS }),
    watermarkSection(presetWith((p) => { p.watermark.enabled = true; p.watermark.kind = "image"; p.watermark.imageId = null; }), {
      images: [{ id: "img-1", name: "Logotipo" }],
    }),
  ];
  const preset = defaultPreset();

  for (const fields of modes) {
    for (const field of fields) {
      const resolved = field.path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), preset);
      assert.notEqual(resolved, undefined, `${field.path} does not exist in the preset`);
    }
  }
});

test("a preset without a watermark block falls back to the defaults", () => {
  const preset = defaultPreset();
  delete preset.watermark;
  const fields = watermarkSection(preset);
  assert.equal(byId(fields, "watermark.enabled").value, false);
  assert.equal(byId(fields, "watermark.opacity").value, 0);
});
