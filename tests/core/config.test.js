import test from "node:test";
import assert from "node:assert/strict";
import * as config from "../../src/config.js";

test("paperSizes holds the six nominal combinations", () => {
  const expected = {
    A4: { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } },
    A5: { portrait: { w: 148, h: 210 }, landscape: { w: 210, h: 148 } },
    A6: { portrait: { w: 105, h: 148 }, landscape: { w: 148, h: 105 } },
  };
  assert.deepEqual(config.paperSizes, expected);
});

test("limits exposes every rule number required by the spec", () => {
  const required = [
    "marginMax",
    "marginHomePrint",
    "minContentSize",
    "minRulingArea",
    "minSegment",
    "minEffectivePpi",
    "maskResolution",
    "alphaThreshold",
    "sampleStepMm",
    "textBoxCount",
    "presetNameMaxLength",
    "presetsMax",
  ];
  for (const key of required) {
    assert.equal(typeof config.limits[key], "number", `limits.${key} must be a number`);
  }

  const ranges = [
    "frameThickness",
    "doubleGap",
    "rulingThickness",
    "dotRadius",
    "insets",
    "objectDistance",
    "spacing",
    "count",
    "textSizePt",
    "lineHeight",
    "rotation",
    "opacity",
    "padding",
    "borderThickness",
  ];
  for (const key of ranges) {
    assert.equal(typeof config.limits[key]?.min, "number", `limits.${key}.min`);
    assert.equal(typeof config.limits[key]?.max, "number", `limits.${key}.max`);
  }

  assert.equal(config.limits.image.maxBytes, 25 * 1024 * 1024);
  assert.equal(config.limits.image.maxSidePx, 3508);
  assert.equal(config.limits.image.maxCount, 3);
  assert.equal(config.limits.image.totalBytes, 75 * 1024 * 1024);
  assert.equal(config.limits.maskResolution, 4);
  assert.equal(config.limits.alphaThreshold, 0.1);
});

test("stroke patterns are multiples of the thickness", () => {
  assert.deepEqual(config.strokePatterns.solid, []);
  assert.deepEqual(config.strokePatterns.dashed, [4, 3]);
  assert.deepEqual(config.strokePatterns.dotted, [0, 3]);
  assert.deepEqual(config.strokePatterns.dashdot, [6, 3, 0, 3]);
  assert.equal(config.strokeScale, 1);
});

test("cut marks, snap, keyboard and history settings exist", () => {
  assert.equal(config.cutMark.length, 3);
  assert.equal(config.cutMark.thickness, 0.25);
  assert.equal(config.snap.toleranceMm, 2);
  assert.equal(config.rotationSnapStepDeg, 15);
  assert.equal(config.keyboard.nudgeMm, 1);
  assert.equal(config.keyboard.nudgeShiftMm, 10);
  assert.equal(config.history.size, 100);
  assert.equal(config.autosaveMs, 1000);
  assert.equal(config.maskResolution, config.limits.maskResolution);
});

test("enums match the spec catalogues", () => {
  assert.deepEqual(config.enums.pageSizes, ["A4", "A5", "A6"]);
  assert.deepEqual(config.enums.orientations, ["portrait", "landscape"]);
  assert.deepEqual(config.enums.frameStyles, ["solid", "dashed", "dotted", "dashdot", "double"]);
  assert.deepEqual(config.enums.rulingTypes, ["lines", "grid", "dots"]);
  assert.deepEqual(config.enums.rulingStyles, ["solid", "dashed", "dotted", "dashdot"]);
  assert.deepEqual(config.enums.rulingModes, ["spacing", "count"]);
  assert.deepEqual(config.enums.alignments, ["left", "center", "right", "justify"]);
  assert.deepEqual(config.enums.watermarkKinds, ["text", "image"]);
  assert.deepEqual(config.enums.objectTypes, ["image", "text"]);
});

test("unit constants and font url template", () => {
  assert.equal(config.units.mmPerInch, 25.4);
  assert.equal(config.units.ptPerInch, 72);
  assert.equal(config.epsilon, 1e-6);
  assert.equal(config.displayDecimals, 1);
  assert.equal(config.schemaVersion, 1);
  assert.match(config.fonts.urlTemplate, /\{id\}@\{version\}/);
  assert.deepEqual(config.fonts.subsets, ["latin", "latin-ext"]);
});
