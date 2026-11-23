import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMA_VERSION,
  createImageObject,
  createObject,
  createPreset,
  createTextObject,
  defaultPreset,
  isPresetShape,
  uuid,
} from "../../src/core/schema.js";

const SPEC_PRESET = {
  schemaVersion: 1,
  name: "Meu papel timbrado",
  page: {
    size: "A4",
    orientation: "portrait",
    color: "#FFFFFF",
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
  },
  frame: {
    enabled: true,
    color: "#3A3A3AFF",
    thickness: 0.5,
    style: "solid",
    doubleGap: 1.0,
    cornerRadius: 5,
  },
  ruling: {
    enabled: true,
    type: "lines",
    color: "#C8C8C8FF",
    thickness: 0.25,
    style: "solid",
    dotRadius: 0.3,
    insets: { top: 5, right: 5, bottom: 5, left: 5 },
    objectDistance: 5,
    x: { mode: "spacing", spacing: 8, count: 20 },
    y: { mode: "spacing", spacing: 8, count: 30 },
  },
  watermark: {
    enabled: false,
    kind: "text",
    text: {
      content: "",
      fontId: "inter",
      weight: 400,
      italic: false,
      sizePt: 48,
      color: "#000000",
      align: "center",
      lineHeight: 1.2,
    },
    imageId: null,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    opacity: 0.15,
  },
  objects: [],
};

test("defaultPreset matches spec section 2.1", () => {
  const preset = defaultPreset();
  const { id, ...rest } = preset;
  assert.equal(typeof id, "string");
  assert.equal(SCHEMA_VERSION, 1);
  assert.deepEqual(rest, SPEC_PRESET);
});

test("uuid returns unique identifiers", () => {
  const ids = new Set(Array.from({ length: 50 }, () => uuid()));
  assert.equal(ids.size, 50);
});

test("createPreset merges nested sections over the defaults", () => {
  const preset = createPreset({
    name: "Caderno",
    page: { size: "A5", orientation: "landscape" },
    ruling: { type: "dots" },
  });
  assert.equal(preset.name, "Caderno");
  assert.equal(preset.page.size, "A5");
  assert.equal(preset.page.orientation, "landscape");
  assert.equal(preset.page.color, "#FFFFFF");
  assert.deepEqual(preset.page.margins, SPEC_PRESET.page.margins);
  assert.equal(preset.ruling.type, "dots");
  assert.equal(preset.ruling.dotRadius, 0.3);
  assert.notEqual(preset.id, defaultPreset().id);
});

test("createImageObject and createTextObject apply the spec defaults", () => {
  const image = createImageObject();
  assert.equal(image.type, "image");
  assert.equal(image.visible, true);
  assert.equal(image.locked, false);
  assert.equal(image.rotation, 0);
  assert.equal(image.opacity, 1);
  assert.equal(image.aspectLocked, true);
  assert.equal(image.imageId, null);

  const text = createTextObject({ text: "Rua Exemplo, 100" });
  assert.equal(text.type, "text");
  assert.equal(text.fontId, "inter");
  assert.equal(text.sizePt, 10);
  assert.equal(text.align, "left");
  assert.equal(text.lineHeight, 1.3);
  assert.deepEqual(text.border, { color: "#000000FF", thickness: 0 });
  assert.equal(text.padding, 2);
  assert.equal(text.text, "Rua Exemplo, 100");
  assert.notEqual(text.id, image.id);
});

test("createObject dispatches by type and rejects unknown types", () => {
  assert.equal(createObject("image").type, "image");
  assert.equal(createObject("text").type, "text");
  assert.throws(() => createObject("shape"), TypeError);
});

test("isPresetShape accepts presets and rejects junk", () => {
  assert.equal(isPresetShape(defaultPreset()), true);
  for (const junk of [null, undefined, [], "preset", 42, {}, { schemaVersion: 1 }, { schemaVersion: 1, page: {} }]) {
    assert.equal(isPresetShape(junk), false, JSON.stringify(junk));
  }
  assert.equal(isPresetShape({ schemaVersion: 1, page: { size: "A3", orientation: "portrait" } }), false);
  assert.equal(isPresetShape({ schemaVersion: 1, page: { size: "A4", orientation: "portrait" }, objects: {} }), false);
});
