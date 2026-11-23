import test from "node:test";
import assert from "node:assert/strict";
import { layoutText } from "../../src/core/text-layout.js";
import { ptToMm } from "../../src/core/units.js";
import { epsilon } from "../../src/config.js";

/** Fixture metric: one millimetre per character, never a real font. */
const unitMeasure = (str) => str.length;

const style = (overrides = {}) => ({
  fontId: "inter",
  weight: 400,
  italic: false,
  sizePt: 10,
  lineHeight: 1.2,
  align: "left",
  ...overrides,
});

const close = (a, b) => Math.abs(a - b) < 1e-9;

const texts = (result) => result.lines.map((line) => line.text);

test("breaks lines by word and records word positions", () => {
  const result = layoutText({
    text: "aaaa bbbb cccc",
    widthMm: 10,
    heightMm: 100,
    style: style(),
    measure: unitMeasure,
  });

  assert.deepEqual(texts(result), ["aaaa bbbb", "cccc"]);
  assert.ok(close(result.lines[0].widthMm, 9));
  assert.ok(close(result.lines[1].widthMm, 4));
  assert.deepEqual(
    result.lines[0].words.map((word) => [word.text, word.xMm, word.widthMm]),
    [
      ["aaaa", 0, 4],
      ["bbbb", 5, 4],
    ],
  );
  assert.equal(result.overflow, false);
  assert.equal(result.hiddenLineCount, 0);
  assert.deepEqual(result.unsupportedChars, []);
});

test("a word wider than the box is broken by character", () => {
  const result = layoutText({
    text: "abcdefghijklmnop",
    widthMm: 10,
    heightMm: 100,
    style: style(),
    measure: unitMeasure,
  });

  assert.deepEqual(texts(result), ["abcdefghij", "klmnop"]);
  assert.ok(close(result.lines[0].widthMm, 10));
  assert.ok(close(result.lines[1].widthMm, 6));
});

test("a single character wider than the box still gets its own line", () => {
  const result = layoutText({
    text: "abc",
    widthMm: 0.5,
    heightMm: 100,
    style: style(),
    measure: unitMeasure,
  });

  assert.deepEqual(texts(result), ["a", "b", "c"]);
});

test("left, center and right alignments offset the words", () => {
  const left = layoutText({ text: "ab", widthMm: 10, heightMm: 100, style: style(), measure: unitMeasure });
  const center = layoutText({
    text: "ab",
    widthMm: 10,
    heightMm: 100,
    style: style({ align: "center" }),
    measure: unitMeasure,
  });
  const right = layoutText({
    text: "ab",
    widthMm: 10,
    heightMm: 100,
    style: style({ align: "right" }),
    measure: unitMeasure,
  });

  assert.ok(close(left.lines[0].words[0].xMm, 0));
  assert.ok(close(center.lines[0].words[0].xMm, 4));
  assert.ok(close(right.lines[0].words[0].xMm, 8));
  for (const result of [left, center, right]) {
    assert.equal(result.lines[0].justified, false);
  }
});

test("justify stretches every line except the last of the paragraph", () => {
  const result = layoutText({
    text: "aa bb cc dd ee",
    widthMm: 10,
    heightMm: 100,
    style: style({ align: "justify" }),
    measure: unitMeasure,
  });

  assert.deepEqual(texts(result), ["aa bb cc", "dd ee"]);
  assert.equal(result.lines[0].justified, true);
  assert.equal(result.lines[1].justified, false);

  assert.deepEqual(
    result.lines[0].words.map((word) => word.xMm),
    [0, 4, 8],
  );
  const lastWord = result.lines[0].words.at(-1);
  assert.ok(close(lastWord.xMm + lastWord.widthMm, 10));
  assert.ok(close(result.lines[1].words[0].xMm, 0));
});

test("line height and baseline follow the configured size and leading", () => {
  const result = layoutText({
    text: "a\nb\nc",
    widthMm: 10,
    heightMm: 100,
    style: style({ sizePt: 12, lineHeight: 2 }),
    measure: unitMeasure,
  });

  const fontSizeMm = ptToMm(12);
  const lineHeightMm = fontSizeMm * 2;
  assert.ok(close(result.lineHeightMm, lineHeightMm));
  assert.ok(close(result.lines[0].baselineY, fontSizeMm * 0.8));
  assert.ok(close(result.lines[1].baselineY, lineHeightMm + fontSizeMm * 0.8));
  assert.ok(close(result.lines[2].baselineY, 2 * lineHeightMm + fontSizeMm * 0.8));
  assert.ok(close(result.contentHeightMm, 3 * lineHeightMm));
});

test("overflow keeps only the lines that fit and counts the hidden ones", () => {
  const fontSizeMm = ptToMm(12);
  const lineHeightMm = fontSizeMm * 2;
  const result = layoutText({
    text: "a\nb\nc",
    widthMm: 10,
    heightMm: 2 * lineHeightMm + 0.5,
    style: style({ sizePt: 12, lineHeight: 2 }),
    measure: unitMeasure,
  });

  assert.equal(result.overflow, true);
  assert.equal(result.hiddenLineCount, 1);
  assert.deepEqual(texts(result), ["a", "b"]);
  assert.ok(close(result.contentHeightMm, 2 * lineHeightMm));
  for (const line of result.lines) {
    assert.ok(line.baselineY <= result.heightMm + epsilon);
  }
});

test("a box shorter than one line hides everything", () => {
  const lineHeightMm = ptToMm(10) * 1.2;
  const result = layoutText({
    text: "a\nb",
    widthMm: 10,
    heightMm: lineHeightMm - 0.1,
    style: style(),
    measure: unitMeasure,
  });

  assert.deepEqual(result.lines, []);
  assert.equal(result.overflow, true);
  assert.equal(result.hiddenLineCount, 2);
  assert.equal(result.contentHeightMm, 0);
});

test("newlines create paragraphs and empty paragraphs create empty lines", () => {
  const result = layoutText({
    text: "ab\n\ncd",
    widthMm: 10,
    heightMm: 100,
    style: style(),
    measure: unitMeasure,
  });

  assert.deepEqual(texts(result), ["ab", "", "cd"]);
  assert.deepEqual(result.lines[1].words, []);
  assert.ok(close(result.lines[1].widthMm, 0));
});

test("empty text produces a single empty line", () => {
  const result = layoutText({
    text: "",
    widthMm: 10,
    heightMm: 100,
    style: style(),
    measure: unitMeasure,
  });

  assert.deepEqual(texts(result), [""]);
  assert.equal(result.overflow, false);
});

test("characters without glyph are reported and the word is measured without them", () => {
  const missingEuro = (str) => (str.includes("€") ? null : str.length);

  const result = layoutText({
    text: "ab€cd ef",
    widthMm: 10,
    heightMm: 100,
    style: style(),
    measure: missingEuro,
  });

  assert.deepEqual(result.unsupportedChars, ["€"]);
  assert.deepEqual(texts(result), ["abcd ef"]);
  assert.ok(close(result.lines[0].widthMm, 7));
  assert.deepEqual(
    result.lines[0].words.map((word) => word.text),
    ["abcd", "ef"],
  );
});

test("each unsupported character is reported once", () => {
  const missingEuro = (str) => (str.includes("€") ? null : str.length);
  const result = layoutText({
    text: "a€b\nc€d€",
    widthMm: 10,
    heightMm: 100,
    style: style(),
    measure: missingEuro,
  });

  assert.deepEqual(result.unsupportedChars, ["€"]);
  assert.deepEqual(texts(result), ["ab", "cd"]);
});

test("measure is required only when there is text", () => {
  assert.throws(
    () => layoutText({ text: "abc", widthMm: 10, heightMm: 10, style: style() }),
    TypeError,
  );

  const empty = layoutText({ text: "", widthMm: 10, heightMm: 10, style: style() });
  assert.deepEqual(texts(empty), [""]);

  const blank = layoutText({ text: "   ", widthMm: 10, heightMm: 10, style: style() });
  assert.deepEqual(texts(blank), [""]);
});

test("invalid arguments return a code instead of throwing", () => {
  const base = { text: "ab", widthMm: 10, heightMm: 100, style: style(), measure: unitMeasure };

  assert.deepEqual(layoutText({ ...base, text: 42 }), { ok: false, code: "text.invalidText" });
  assert.deepEqual(layoutText({ ...base, widthMm: 0 }), { ok: false, code: "text.invalidWidth" });
  assert.deepEqual(layoutText({ ...base, heightMm: -1 }), { ok: false, code: "text.invalidHeight" });
  assert.deepEqual(layoutText({ ...base, style: null }), { ok: false, code: "text.invalidStyle" });
  assert.deepEqual(layoutText({ ...base, style: style({ sizePt: 0 }) }), {
    ok: false,
    code: "text.invalidStyle",
  });
  assert.deepEqual(layoutText({ ...base, style: style({ align: "middle" }) }), {
    ok: false,
    code: "text.invalidStyle",
  });
  assert.deepEqual(layoutText({ ...base, style: style({ lineHeight: Number.NaN }) }), {
    ok: false,
    code: "text.invalidStyle",
  });
});

test("the result is deterministic for the same input", () => {
  const args = {
    text: "a palavra maior que a linha continua aqui",
    widthMm: 12,
    heightMm: 20,
    style: style({ align: "justify" }),
    measure: unitMeasure,
  };
  assert.deepEqual(layoutText(args), layoutText(args));
});
