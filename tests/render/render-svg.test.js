import test from "node:test";
import assert from "node:assert/strict";
import { primitiveToSvg, sceneToSvg } from "../../src/render/render-svg.js";
import { buildScene } from "../../src/core/scene.js";
import { defaultPreset } from "../../src/core/schema.js";
import { layoutSheet } from "../../src/core/layout.js";
import { ptToMm } from "../../src/core/units.js";

const A4 = layoutSheet("A4", "portrait");

test("the svg keeps millimetre units in the viewBox", () => {
  const scene = buildScene({ preset: defaultPreset(), layout: A4, mode: "page" });
  const markup = sceneToSvg(scene);
  assert.match(markup, /viewBox="0 0 210 297"/);
  assert.ok(!markup.includes('width="210mm"'), "unit attributes must not fight the CSS aspect ratio");
  assert.match(markup, /role="img"/);
  assert.match(markup, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test("rects carry fill and stroke attributes", () => {
  const markup = primitiveToSvg({
    kind: "rect",
    x: 1,
    y: 2,
    w: 3,
    h: 4,
    rx: 0.5,
    fill: "#FFFFFF",
    stroke: "#3A3A3AFF",
    strokeWidth: 0.5,
    dash: [],
    cap: "butt",
  });
  assert.match(markup, /<rect x="1" y="2" width="3" height="4" rx="0.5"/);
  assert.match(markup, /fill="#FFFFFF"/);
  assert.match(markup, /stroke="#3A3A3AFF"/);
  assert.match(markup, /stroke-width="0.5"/);
});

test("dashed lines emit a dash array and cap", () => {
  const markup = primitiveToSvg({
    kind: "line",
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 0,
    stroke: "#C8C8C8FF",
    strokeWidth: 0.25,
    dash: [1, 0.75],
    cap: "butt",
  });
  assert.match(markup, /stroke-dasharray="1 0.75"/);
  assert.match(markup, /stroke-linecap="butt"/);
});

test("dots become circles", () => {
  const markup = primitiveToSvg({ kind: "dot", cx: 5, cy: 6, r: 0.3, fill: "#C8C8C8FF" });
  assert.equal(markup, '<circle cx="5" cy="6" r="0.3" fill="#C8C8C8FF" />');
});

test("text lines become tspans with mm font size", () => {
  const markup = primitiveToSvg({
    kind: "text",
    objectId: "t1",
    x: 20,
    y: 30,
    w: 40,
    h: 10,
    rotation: 0,
    fontId: "inter",
    weight: 400,
    italic: false,
    sizePt: 10,
    color: "#222222",
    align: "left",
    lineHeight: 1.3,
    lines: [
      { text: "Rua Exemplo", widthMm: 20, words: [{ text: "Rua", xMm: 0 }, { text: "Exemplo", xMm: 8 }], baselineY: 3 },
    ],
  });
  assert.match(markup, /<g transform="translate\(20 30\)"/);
  assert.match(markup, /font-family="inter"/);
  assert.match(markup, new RegExp(`font-size="${Number(ptToMm(10).toFixed(4))}"`));
  assert.match(markup, /<tspan x="0">Rua<\/tspan><tspan x="8">Exemplo<\/tspan>/);
  assert.match(markup, /fill="#222222"/);
});

test("user text is escaped", () => {
  const markup = primitiveToSvg({
    kind: "text",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    fontId: "inter",
    sizePt: 10,
    color: "#000000",
    lines: [{ text: '<script>alert("x")</script>', words: [{ text: '<script>alert("x")</script>', xMm: 0 }] }],
  });
  assert.ok(!markup.includes("<script"));
  assert.match(markup, /&lt;script&gt;/);
});

test("clip groups get their own clipPath and keep children order", () => {
  const scene = {
    widthMm: 210,
    heightMm: 297,
    primitives: [
      { kind: "rect", x: 0, y: 0, w: 210, h: 297, fill: "#FFFFFF" },
      {
        kind: "clip",
        x: 0,
        y: 0,
        w: 210,
        h: 297,
        children: [
          { kind: "line", x1: 0, y1: 10, x2: 210, y2: 10, stroke: "#C8C8C8FF", strokeWidth: 0.25, dash: [], cap: "butt" },
        ],
      },
    ],
  };
  const markup = sceneToSvg(scene);
  assert.match(markup, /<clipPath id="clip-1">/);
  assert.match(markup, /clip-path="url\(#clip-1\)"/);
  const rectIndex = markup.indexOf("<rect");
  const lineIndex = markup.indexOf("<line");
  assert.ok(rectIndex > 0 && lineIndex > rectIndex);
});

test("unknown primitives are skipped instead of throwing", () => {
  assert.equal(primitiveToSvg({ kind: "sparkle" }), "");
  assert.equal(primitiveToSvg(null), "");
  assert.throws(() => sceneToSvg({}), TypeError);
});

test("a full A4 scene renders one clip and the frame stroke", () => {
  const scene = buildScene({ preset: defaultPreset(), layout: A4, mode: "page" });
  const markup = sceneToSvg(scene, { label: "Pré-visualização" });
  assert.match(markup, /aria-label="Pré-visualização"/);
  assert.equal((markup.match(/clip-path="url\(#clip-1\)"/g) ?? []).length, 1);
  assert.match(markup, /stroke-width="0.5"/);
});
