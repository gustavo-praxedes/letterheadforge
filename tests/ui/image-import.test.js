import test from "node:test";
import assert from "node:assert/strict";

import { addImage, canAddImage, fitImageInPage, validateImageFile } from "../../src/ui/objects.js";
import { defaultPreset } from "../../src/core/schema.js";
import { limits } from "../../src/config.js";

const PAGE = { pageWidthMm: 210, pageHeightMm: 297 };
const MARGINS = { top: 10, right: 10, bottom: 10, left: 10 };

test("a landscape image fits the content width and stays centred", () => {
  const box = fitImageInPage({ ...PAGE, margins: MARGINS, pixelWidth: 1800, pixelHeight: 1350 });
  assert.equal(box.ok, true);
  assert.equal(box.w, 114); // 60% of the 190 mm content width
  assert.equal(box.h, 85.5); // aspect preserved
  assert.equal(box.x, 48); // (210 - 114) / 2
  assert.equal(box.y, 105.75); // (297 - 85.5) / 2
});

test("a very tall image is limited by the content height, not the width", () => {
  const box = fitImageInPage({ ...PAGE, margins: MARGINS, pixelWidth: 400, pixelHeight: 2000 });
  assert.equal(box.ok, true);
  assert.equal(box.h, 277); // full content height
  assert.equal(box.w, 55.4);
  assert.ok(box.w <= 114);
});

test("the box never leaves the content area", () => {
  const boxes = [
    { pixelWidth: 1, pixelHeight: 1 },
    { pixelWidth: 10000, pixelHeight: 3 },
    { pixelWidth: 900, pixelHeight: 5000 },
  ].map((pixels) => fitImageInPage({ ...PAGE, margins: MARGINS, ...pixels }));
  for (const box of boxes) {
    assert.equal(box.ok, true);
    assert.ok(box.x >= 0 && box.x + box.w <= 210.01);
    assert.ok(box.y >= 0 && box.y + box.h <= 297.01);
  }
});

test("invalid measurements are rejected instead of throwing", () => {
  assert.deepEqual(fitImageInPage().ok, false);
  assert.equal(fitImageInPage({ ...PAGE, margins: MARGINS, pixelWidth: 0, pixelHeight: 10 }).code, "image.invalidFile");
  const squeezed = fitImageInPage({ pageWidthMm: 50, pageHeightMm: 50, margins: { top: 30, right: 30, bottom: 30, left: 30 }, pixelWidth: 10, pixelHeight: 10 });
  assert.equal(squeezed.code, "invalid.contentArea");
});

test("a file under the limits but placed too large is refused for low ppi", () => {
  const tooBig = validateImageFile({ bytes: 300000, width: 400, height: 300, widthMm: 114, heightMm: 85.5 });
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.code, "image.lowPpi");
  const fine = validateImageFile({ bytes: 300000, width: 1800, height: 1350, widthMm: 114, heightMm: 85.5 });
  assert.equal(fine.ok, true);
  assert.ok(fine.ppi > limits.minEffectivePpi);
});

test("an image object needs an imageId to be worth creating", () => {
  const preset = defaultPreset();
  const withoutFile = addImage(preset);
  assert.equal(withoutFile.ok, true);
  assert.equal(withoutFile.preset.objects.at(-1).imageId, null);
  assert.equal(withoutFile.preset.objects.at(-1).type, "image");

  const withFile = addImage(preset, { imageId: "img-1", w: 114, h: 85.5, x: 48, y: 105.75 });
  const created = withFile.preset.objects.at(-1);
  assert.equal(created.imageId, "img-1");
  assert.equal(created.w, 114);
});

test("the image count limit is enforced", () => {
  const preset = defaultPreset();
  preset.objects = Array.from({ length: limits.image.maxCount }, (_, index) => ({
    id: `img${index}`,
    type: "image",
    name: `Imagem ${index}`,
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    rotation: 0,
    visible: true,
    locked: false,
    imageId: `img-${index}`,
    opacity: 1,
    aspectLocked: true,
  }));
  assert.equal(canAddImage(preset).ok, false);
  assert.equal(addImage(preset).code, "image.limitCount");
});
