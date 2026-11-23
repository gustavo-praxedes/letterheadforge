import test from "node:test";
import assert from "node:assert/strict";
import { buildScene } from "../../src/core/scene.js";
import { layoutSheet } from "../../src/core/layout.js";
import { defaultPreset } from "../../src/core/schema.js";
import { cutMark } from "../../src/config.js";

function measure(str, style) {
  return str.length * 0.5 * (style?.sizePt ?? 10) * 0.3528;
}

const A4 = layoutSheet("A4", "portrait");
const A5 = layoutSheet("A5", "portrait");

test("the sheet background is the first primitive and fills the A4", () => {
  const scene = buildScene({ preset: defaultPreset(), layout: A4, mode: "page", measure });
  assert.equal(scene.widthMm, 210);
  assert.equal(scene.heightMm, 297);
  const [background] = scene.primitives;
  assert.equal(background.kind, "rect");
  assert.deepEqual([background.x, background.y, background.w, background.h], [0, 0, 210, 297]);
  assert.equal(background.fill, "#FFFFFF");
  assert.equal(scene.background, "#FFFFFF");
});

test("frame is drawn above the objects and inside the cell clip", () => {
  const preset = defaultPreset();
  preset.objects = [
    {
      id: "t1",
      type: "text",
      x: 20,
      y: 250,
      w: 80,
      h: 20,
      rotation: 0,
      visible: true,
      text: "Rua Exemplo, 100",
      fontId: "inter",
      weight: 400,
      italic: false,
      sizePt: 10,
      color: "#222222",
      align: "left",
      lineHeight: 1.3,
      padding: 2,
    },
  ];
  const scene = buildScene({ preset, layout: A4, mode: "page", measure });
  const clip = scene.primitives.at(-1);
  assert.equal(clip.kind, "clip");
  const kinds = clip.children.map((child) => child.kind);
  assert.ok(kinds.includes("text"));
  const lastRect = clip.children.filter((child) => child.kind === "rect").at(-1);
  assert.equal(lastRect.strokeWidth, preset.frame.thickness);
  assert.equal(clip.children.at(-1), lastRect, "frame must be the last child");
});

test("a double frame produces two rects", () => {
  const preset = defaultPreset();
  preset.frame.style = "double";
  const scene = buildScene({ preset, layout: A4, mode: "page", measure });
  const clip = scene.primitives.at(-1);
  const rects = clip.children.filter((child) => child.kind === "rect");
  assert.equal(rects.length, 2);
  assert.ok(rects[0].w > rects[1].w);
});

test("A5 sheet mode clips two cells and adds cut marks", () => {
  const scene = buildScene({ preset: defaultPreset(), layout: A5, mode: "sheet", measure });
  const clips = scene.primitives.filter((primitive) => primitive.kind === "clip");
  assert.equal(clips.length, 2);
  assert.deepEqual(clips.map((clip) => [clip.x, clip.w]), [
    [0.5, 148],
    [148.5, 148],
  ]);
  const marks = scene.primitives.filter(
    (primitive) => primitive.kind === "line" && primitive.strokeWidth === cutMark.thickness,
  );
  assert.equal(marks.length, 2);
  for (const mark of marks) {
    assert.ok(mark.y1 === 0 || mark.y2 === 210);
  }
});

test("page mode has no cut marks and a single cell", () => {
  const scene = buildScene({ preset: defaultPreset(), layout: A5, mode: "page", measure });
  assert.equal(scene.widthMm, 148);
  assert.equal(scene.heightMm, 210);
  const clips = scene.primitives.filter((primitive) => primitive.kind === "clip");
  assert.equal(clips.length, 1);
  const marks = scene.primitives.filter(
    (primitive) => primitive.kind === "line" && primitive.strokeWidth === cutMark.thickness,
  );
  assert.equal(marks.length, 0);
});

test("ruling segments are translated into the cell of the sheet", () => {
  const scene = buildScene({ preset: defaultPreset(), layout: A5, mode: "sheet", measure });
  const secondClip = scene.primitives.filter((primitive) => primitive.kind === "clip")[1];
  const line = secondClip.children.find((child) => child.kind === "line");
  assert.ok(line.x1 > 148 && line.x2 < 297);
});

test("text overflow is reported as a warning", () => {
  const preset = defaultPreset();
  preset.objects = [
    {
      id: "t2",
      type: "text",
      x: 20,
      y: 20,
      w: 40,
      h: 6,
      rotation: 0,
      visible: true,
      text: "linha um linha dois linha tres linha quatro",
      fontId: "inter",
      weight: 400,
      italic: false,
      sizePt: 12,
      color: "#222222",
      align: "left",
      lineHeight: 1.5,
      padding: 0,
    },
  ];
  const scene = buildScene({ preset, layout: A4, mode: "page", measure });
  assert.ok(scene.warnings.some((warning) => warning.code === "text.overflow"));
});

test("hidden objects are not drawn", () => {
  const preset = defaultPreset();
  preset.objects = [
    {
      id: "t3",
      type: "text",
      x: 20,
      y: 20,
      w: 40,
      h: 20,
      rotation: 0,
      visible: false,
      text: "oculto",
      fontId: "inter",
      weight: 400,
      italic: false,
      sizePt: 10,
      color: "#222222",
      align: "left",
      lineHeight: 1.2,
      padding: 0,
    },
  ];
  const scene = buildScene({ preset, layout: A4, mode: "page", measure });
  const clip = scene.primitives.at(-1);
  assert.equal(clip.children.filter((child) => child.kind === "text").length, 0);
});

test("buildScene refuses missing layout or measure for text", () => {
  assert.throws(() => buildScene({ preset: defaultPreset(), layout: null }), TypeError);
  const preset = defaultPreset();
  preset.objects = [
    {
      id: "t4",
      type: "text",
      x: 10,
      y: 10,
      w: 30,
      h: 10,
      rotation: 0,
      visible: true,
      text: "sem métrica",
      fontId: "inter",
      weight: 400,
      italic: false,
      sizePt: 10,
      color: "#222222",
      align: "left",
      lineHeight: 1.2,
      padding: 0,
    },
  ];
  assert.throws(() => buildScene({ preset, layout: A4, mode: "page" }), TypeError);
});
