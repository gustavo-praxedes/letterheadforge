import test from "node:test";
import assert from "node:assert/strict";
import { validateImage, validatePreset } from "../../src/core/validate.js";
import { defaultPreset } from "../../src/core/schema.js";

const codes = (issues) => issues.map((item) => item.code);

function presetWith(mutate) {
  const preset = defaultPreset();
  mutate(preset);
  return preset;
}

test("the initial configuration is valid", () => {
  const result = validatePreset(defaultPreset());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("non-object input returns an actionable error instead of throwing", () => {
  for (const value of [null, undefined, [], "preset", 3]) {
    const result = validatePreset(value);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result.errors), ["invalid.preset"]);
  }
});

test("margins are checked against the limit and the home print advisory", () => {
  const tooBig = validatePreset(presetWith((p) => { p.page.margins.top = 60; }));
  assert.ok(codes(tooBig.errors).includes("invalid.margin"));

  const small = validatePreset(presetWith((p) => { p.page.margins.left = 3; }));
  assert.equal(small.ok, true);
  assert.deepEqual(codes(small.warnings), ["margin.belowHomePrint"]);

  const zero = validatePreset(presetWith((p) => { p.page.margins.left = 0; }));
  assert.equal(zero.ok, true);
  assert.deepEqual(zero.warnings, []);
});

test("an unusable content area is refused", () => {
  const result = validatePreset(presetWith((p) => {
    p.page.size = "A6";
    p.page.margins.left = 50;
    p.page.margins.right = 50;
  }));
  assert.ok(codes(result.errors).includes("invalid.contentArea"));
});

test("frame limits are enforced", () => {
  assert.ok(codes(validatePreset(presetWith((p) => { p.frame.thickness = 20; })).errors).includes("invalid.frameThickness"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.frame.doubleGap = 40; })).errors).includes("invalid.doubleGap"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.frame.cornerRadius = 400; })).errors).includes("invalid.cornerRadius"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.frame.style = "wavy"; })).errors).includes("invalid.enum"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.frame.color = "red"; })).errors).includes("invalid.color"));
});

test("ruling limits are enforced", () => {
  assert.ok(codes(validatePreset(presetWith((p) => { p.ruling.thickness = 9; })).errors).includes("invalid.rulingThickness"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.ruling.dotRadius = 9; })).errors).includes("invalid.dotRadius"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.ruling.insets.top = 90; })).errors).includes("invalid.insets"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.ruling.objectDistance = 90; })).errors).includes("invalid.objectDistance"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.ruling.x.spacing = 0.1; })).errors).includes("invalid.spacing"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.ruling.y = { mode: "count", count: 1 }; })).errors).includes("invalid.count"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.ruling.type = "squares"; })).errors).includes("invalid.enum"));
});

test("object limits and image counts are enforced", () => {
  const tooManyImages = validatePreset(presetWith((p) => {
    p.objects = Array.from({ length: 4 }, () => ({ type: "image", imageId: "x", rotation: 0, opacity: 1 }));
  }));
  assert.ok(codes(tooManyImages.errors).includes("image.limitCount"));

  const tooManyTexts = validatePreset(presetWith((p) => {
    p.objects = Array.from({ length: 11 }, () => ({
      type: "text",
      text: "a",
      sizePt: 10,
      lineHeight: 1.2,
      align: "left",
      padding: 2,
      border: { thickness: 0 },
      color: "#222222",
      rotation: 0,
      opacity: 1,
    }));
  }));
  assert.ok(codes(tooManyTexts.errors).includes("invalid.textCount"));
});

test("text and watermark limits are enforced", () => {
  const badText = validatePreset(presetWith((p) => {
    p.objects = [{ type: "text", text: "a", sizePt: 2, lineHeight: 5, align: "middle", padding: 40, border: { thickness: 9 }, color: "#222222", rotation: 0, opacity: 1 }];
  }));
  const found = codes(badText.errors);
  for (const code of ["invalid.fontSize", "invalid.lineHeight", "invalid.enum", "invalid.padding", "invalid.borderThickness"]) {
    assert.ok(found.includes(code), code);
  }

  const badWatermark = validatePreset(presetWith((p) => {
    p.watermark.enabled = true;
    p.watermark.kind = "text";
    p.watermark.opacity = 2;
    p.watermark.text.sizePt = 500;
  }));
  assert.ok(codes(badWatermark.errors).includes("invalid.opacity"));
  assert.ok(codes(badWatermark.errors).includes("invalid.fontSize"));
});

test("preset name rules", () => {
  assert.ok(codes(validatePreset(presetWith((p) => { p.name = ""; })).errors).includes("invalid.presetName"));
  assert.ok(codes(validatePreset(presetWith((p) => { p.name = "x".repeat(61); })).errors).includes("invalid.presetName"));
  assert.equal(validatePreset(presetWith((p) => { p.name = "x".repeat(60); })).ok, true);
});

test("future schema versions are refused", () => {
  const result = validatePreset(presetWith((p) => { p.schemaVersion = 2; }));
  assert.ok(codes(result.errors).includes("schema.unsupportedVersion"));
});

test("error order is stable and deterministic", () => {
  const broken = presetWith((p) => {
    p.page.margins.top = 60;
    p.frame.thickness = 20;
    p.ruling.thickness = 9;
  });
  const first = validatePreset(broken);
  const second = validatePreset(broken);
  assert.deepEqual(first, second);
  assert.deepEqual(codes(first.errors), ["invalid.margin", "invalid.frameThickness", "invalid.rulingThickness"]);
});

test("image metadata validation", () => {
  assert.deepEqual(validateImage({ bytes: 1024, width: 800, height: 600, mime: "image/png" }).ok, true);
  assert.ok(codes(validateImage({ bytes: 30 * 1024 * 1024, width: 10, height: 10, mime: "image/png" }).errors).includes("image.tooLarge"));
  assert.ok(codes(validateImage({ bytes: 10, width: 4000, height: 10, mime: "image/png" }).errors).includes("image.dimensions"));
  assert.ok(codes(validateImage({ bytes: 10, width: 10, height: 10, mime: "image/gif" }).errors).includes("invalid.imageMime"));
  assert.equal(validateImage(null).ok, false);
});
