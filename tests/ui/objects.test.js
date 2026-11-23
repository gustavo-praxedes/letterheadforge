import test from "node:test";
import assert from "node:assert/strict";

import { limits, units } from "../../src/config.js";
import { createImageObject, createTextObject, defaultPreset } from "../../src/core/schema.js";
import { strings } from "../../src/strings.pt-BR.js";
import {
  addImage,
  addTextBox,
  canAddImage,
  canAddTextBox,
  describeObject,
  imageCount,
  textBoxCount,
  updateTextContent,
  updateTextStyle,
  validateImageFile,
} from "../../src/ui/objects.js";

function presetWith(objects) {
  const preset = defaultPreset();
  preset.objects = objects;
  return preset;
}

function manyTexts(count) {
  return Array.from({ length: count }, (_, index) => createTextObject({ name: `Texto ${index + 1}` }));
}

function manyImages(count) {
  return Array.from({ length: count }, (_, index) => createImageObject({ name: `Imagem ${index + 1}` }));
}

function frozenCopy(preset) {
  return JSON.stringify(preset);
}

test("the text box limit comes from config and blocks the eleventh box", () => {
  assert.equal(limits.textBoxCount, 10, "the rule lives in config.js");

  const full = presetWith(manyTexts(limits.textBoxCount));
  assert.equal(canAddTextBox(full).ok, false);
  assert.equal(canAddTextBox(full).code, "text.limitCount");
  assert.equal(canAddTextBox(full).params.max, limits.textBoxCount);

  const created = addTextBox(full);
  assert.equal(created.ok, false);
  assert.equal(created.code, "text.limitCount");
  assert.equal(created.preset, undefined);

  const almost = presetWith(manyTexts(limits.textBoxCount - 1));
  assert.equal(canAddTextBox(almost).ok, true);
  assert.equal(textBoxCount(almost), limits.textBoxCount - 1);
});

test("adding a text box appends one object and never mutates the input", () => {
  const preset = presetWith([createTextObject({ name: "Primeira" })]);
  const before = frozenCopy(preset);
  const originalIds = preset.objects.map((object) => object.id);

  const result = addTextBox(preset);

  assert.equal(result.ok, true);
  assert.equal(result.preset.objects.length, 2);
  assert.notEqual(result.preset, preset, "a new preset is returned");
  assert.equal(frozenCopy(preset), before, "the input preset is untouched");
  assert.deepEqual(preset.objects.map((object) => object.id), originalIds);

  const created = result.preset.objects[1];
  assert.equal(created.type, "text");
  assert.equal(created.id, result.id);
  assert.equal(created.text, "");
  assert.equal(textBoxCount(result.preset), 2);
});

test("the image limit comes from config and blocks the next image", () => {
  const full = presetWith(manyImages(limits.image.maxCount));
  assert.equal(canAddImage(full).ok, false);
  assert.equal(canAddImage(full).code, "image.limitCount");
  assert.equal(canAddImage(full).params.max, limits.image.maxCount);

  const created = addImage(full, { imageId: "img-1" });
  assert.equal(created.ok, false);
  assert.equal(created.code, "image.limitCount");

  const almost = presetWith(manyImages(limits.image.maxCount - 1));
  assert.equal(canAddImage(almost).ok, true);
  assert.equal(imageCount(almost), limits.image.maxCount - 1);
});

test("adding an image passes the properties through and keeps the input intact", () => {
  const preset = presetWith([]);
  const before = frozenCopy(preset);

  const result = addImage(preset, { imageId: "abc", opacity: 0.5 });

  assert.equal(result.ok, true);
  assert.equal(frozenCopy(preset), before);
  assert.equal(result.preset.objects.length, 1);

  const created = result.preset.objects[0];
  assert.equal(created.type, "image");
  assert.equal(created.imageId, "abc");
  assert.equal(created.opacity, 0.5);
  assert.equal(created.id, result.id);
  assert.equal(imageCount(result.preset), 1);
});

test("a file above the byte limit is rejected before anything else", () => {
  const result = validateImageFile({ bytes: limits.image.maxBytes + 1, width: 900, height: 900 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "image.tooLarge");
  assert.equal(result.params.maxBytes, Math.round(limits.image.maxBytes / (1024 * 1024)));

  const accepted = validateImageFile({ bytes: limits.image.maxBytes, width: 900, height: 900 });
  assert.equal(accepted.ok, true, "exactly at the limit is still accepted");
});

test("a file whose longest side exceeds the limit asks for resampling", () => {
  const result = validateImageFile({
    bytes: 1024,
    width: limits.image.maxSidePx + 1,
    height: 800,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "image.dimensions");
  assert.equal(result.params.maxSidePx, limits.image.maxSidePx);

  const square = validateImageFile({ bytes: 1024, width: 800, height: limits.image.maxSidePx });
  assert.equal(square.ok, true, "a side exactly at the limit passes");
});

test("the effective resolution warns below the configured ppi", () => {
  // 300 px across 60 mm = 127 ppi, below the 150 ppi minimum.
  const low = validateImageFile({ bytes: 1024, width: 300, height: 300, widthMm: 60, heightMm: 60 });
  assert.equal(low.ok, false);
  assert.equal(low.code, "image.lowPpi");
  assert.equal(low.params.minPpi, limits.minEffectivePpi);
  assert.ok(low.params.ppi < limits.minEffectivePpi);

  // 600 px across 60 mm = 254 ppi, comfortable.
  const high = validateImageFile({ bytes: 1024, width: 600, height: 600, widthMm: 60, heightMm: 60 });
  assert.equal(high.ok, true);
  assert.ok(high.ppi >= limits.minEffectivePpi);

  // Without the placed size there is no resolution to judge.
  assert.equal(validateImageFile({ bytes: 1024, width: 300, height: 300 }).ok, true);
});

test("the ppi conversion uses the millimetre-per-inch constant from config", () => {
  const width = limits.minEffectivePpi * 10; // 1500 px
  const widthMm = 10 * units.mmPerInch; // exactly 150 ppi
  const atLimit = validateImageFile({ bytes: 1024, width, height: width, widthMm, heightMm: widthMm });
  assert.equal(atLimit.ok, true, "exactly at the minimum passes");
  assert.equal(atLimit.ppi, limits.minEffectivePpi);

  const below = validateImageFile({
    bytes: 1024,
    width,
    height: width,
    widthMm: widthMm + 1,
    heightMm: widthMm + 1,
  });
  assert.equal(below.code, "image.lowPpi");
});

test("the font size is clamped to the configured range", () => {
  const preset = presetWith([createTextObject({ sizePt: 10 })]);
  const id = preset.objects[0].id;
  const before = frozenCopy(preset);

  const big = updateTextStyle(preset, id, { sizePt: 500 });
  assert.equal(big.ok, true);
  assert.equal(big.preset.objects[0].sizePt, limits.textSizePt.max);
  assert.equal(big.clamped, true);

  const small = updateTextStyle(preset, id, { sizePt: 1 });
  assert.equal(small.preset.objects[0].sizePt, limits.textSizePt.min);
  assert.equal(small.clamped, true);

  const exact = updateTextStyle(preset, id, { sizePt: 42 });
  assert.equal(exact.preset.objects[0].sizePt, 42);
  assert.equal(exact.clamped, false);

  assert.equal(frozenCopy(preset), before, "the input preset is untouched");
  assert.equal(preset.objects[0].sizePt, 10);
});

test("style updates only touch the keys that were sent", () => {
  const preset = presetWith([createTextObject({ name: "Caixa", sizePt: 10, weight: 400 })]);
  const id = preset.objects[0].id;

  const result = updateTextStyle(preset, id, {
    fontId: "lora",
    weight: 700,
    italic: true,
    color: "#112233",
    align: "center",
  });

  const object = result.preset.objects[0];
  assert.equal(object.fontId, "lora");
  assert.equal(object.weight, 700);
  assert.equal(object.italic, true);
  assert.equal(object.color, "#112233");
  assert.equal(object.align, "center");
  assert.equal(object.sizePt, 10, "size is untouched");
  assert.equal(object.name, "Caixa", "the name is untouched");

  const refusedAlign = updateTextStyle(preset, id, { align: "middle" });
  assert.equal(refusedAlign.preset.objects[0].align, "left", "unknown alignments are ignored");
});

test("text and style edits refuse ids that are not text boxes", () => {
  const image = createImageObject({ name: "Foto" });
  const preset = presetWith([image]);

  assert.equal(updateTextContent(preset, image.id, "oi").code, "objects.notFound");
  assert.equal(updateTextStyle(preset, image.id, { sizePt: 12 }).code, "objects.notFound");
  assert.equal(updateTextContent(preset, "missing", "oi").code, "objects.notFound");
});

test("the content edit replaces only the selected box", () => {
  const first = createTextObject({ name: "A", text: "um" });
  const second = createTextObject({ name: "B", text: "dois" });
  const preset = presetWith([first, second]);
  const before = frozenCopy(preset);

  const result = updateTextContent(preset, first.id, "linha 1\nlinha 2");

  assert.equal(result.ok, true);
  assert.equal(result.preset.objects[0].text, "linha 1\nlinha 2");
  assert.equal(result.preset.objects[1].text, "dois");
  assert.equal(frozenCopy(preset), before);
});

test("describeObject labels the layer with its name, type and excerpt", () => {
  const text = describeObject(createTextObject({ name: "Cabeçalho", text: "  Primeira linha\nsegunda" }));
  assert.match(text, new RegExp(strings.layers.types.text));
  assert.ok(text.includes("Cabeçalho"));
  assert.ok(text.includes("Primeira linha"));
  assert.ok(!text.includes("segunda"), "only the first non-empty line is shown");

  const empty = describeObject(createTextObject({ name: "Vazia", text: "   " }));
  assert.ok(empty.includes("Vazia"));
  assert.ok(empty.includes("vazio"));

  const image = describeObject(createImageObject({ name: "Logotipo" }));
  assert.ok(image.includes("Logotipo"));
  assert.match(image, new RegExp(strings.layers.types.image));

  const long = describeObject(createTextObject({ text: "a".repeat(200) }));
  assert.ok(long.length < 200, "the excerpt is capped");
  assert.ok(long.includes("…"));

  assert.equal(describeObject(null), "");
  assert.equal(describeObject(undefined), "");
});
