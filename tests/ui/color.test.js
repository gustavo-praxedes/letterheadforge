import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  hsvToRgb,
  parseHex,
  pushRecent,
  readableTextColor,
  rgbToHsv,
  toHex,
} from "../../src/ui/color.js";

test("parseHex accepts short, long and alpha hex", () => {
  assert.deepEqual(parseHex("#fff"), { ok: true, r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseHex("#3A3A3A"), { ok: true, r: 58, g: 58, b: 58, a: 1 });
  const withAlpha = parseHex("#C8C8C880");
  assert.equal(withAlpha.r, 200);
  assert.ok(Math.abs(withAlpha.a - 0.5) < 0.01);
  assert.deepEqual(parseHex("#FFF"), parseHex("#ffffff"));
});

test("parseHex rejects garbage without throwing", () => {
  for (const value of ["", "#12", "#12345", "red", null, 42, "#GGGGGG"]) {
    const result = parseHex(value);
    assert.equal(result.ok, false, String(value));
    assert.equal(result.code, "color.invalid");
  }
});

test("toHex rounds channels and can append alpha", () => {
  assert.equal(toHex({ r: 58, g: 58, b: 58 }), "#3A3A3A");
  assert.equal(toHex({ r: 200.4, g: 200.6, b: 0 }), "#C8C900");
  assert.equal(toHex({ r: 200, g: 200, b: 200, a: 0.5 }, { alpha: true }), "#C8C8C880");
  assert.equal(toHex({ r: 300, g: -5, b: 0 }), "#FF0000");
});

test("rgb and hsv round trip", () => {
  for (const color of [
    { r: 47, g: 111, b: 96 },
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
    { r: 18, g: 52, b: 86 },
  ]) {
    const hsv = rgbToHsv(color);
    const back = hsvToRgb(hsv);
    assert.deepEqual(back, color, JSON.stringify(color));
  }
});

test("hsv handles the hue wraparound", () => {
  assert.deepEqual(hsvToRgb({ h: 360, s: 1, v: 1 }), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hsvToRgb({ h: -120, s: 1, v: 1 }), { r: 0, g: 0, b: 255 });
  assert.deepEqual(hsvToRgb({ h: 0, s: 0, v: 1 }), { r: 255, g: 255, b: 255 });
});

test("contrast ratio matches the WCAG formula", () => {
  assert.equal(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21);
  assert.equal(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 }), 1);
  const tone = parseHex("#4B5158");
  assert.ok(contrastRatio(tone, { r: 255, g: 255, b: 255 }) > 4.5);
});

test("readableTextColor flips on light and dark backgrounds", () => {
  assert.equal(readableTextColor({ r: 0, g: 0, b: 0 }), "#FFFFFF");
  assert.equal(readableTextColor({ r: 255, g: 255, b: 255 }), "#000000");
});

test("pushRecent keeps newest first without duplicates and capped", () => {
  let list = [];
  list = pushRecent(list, "#112233");
  list = pushRecent(list, "#445566");
  list = pushRecent(list, "#112233");
  assert.deepEqual(list.slice(0, 2), ["#112233", "#445566"]);
  assert.equal(list.length, 2);

  for (let index = 0; index < 12; index += 1) {
    list = pushRecent(list, toHex({ r: index * 10, g: 0, b: 0 }));
  }
  assert.equal(list.length, 8);
});
