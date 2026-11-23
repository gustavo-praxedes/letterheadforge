import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicateLayer,
  isOutOfPage,
  layerList,
  layerRows,
  moveLayer,
  paintOrder,
  removeLayer,
  renameLayer,
  toggleLayer,
} from "../../src/store/layers.js";
import { createImageObject, createTextObject } from "../../src/core/schema.js";
import { layoutSheet } from "../../src/core/layout.js";

const A4 = layoutSheet("A4", "portrait");

function presetWith(objects) {
  return { page: { size: "A4", orientation: "portrait", margins: { top: 10, right: 10, bottom: 10, left: 10 } }, objects };
}

const bottom = createImageObject({ id: "img-1", name: "Logo" });
const middle = createTextObject({ id: "txt-1", name: "Endereço" });
const top = createTextObject({ id: "txt-2", name: "Rodapé" });

test("layerList reads top layer first and keeps depth", () => {
  const rows = layerList(presetWith([bottom, middle, top]));
  assert.deepEqual(rows.map((row) => row.id), ["txt-2", "txt-1", "img-1"]);
  assert.deepEqual(rows.map((row) => row.depth), [2, 1, 0]);
});

test("moveLayer walks the paint order and refuses the edges", () => {
  const up = moveLayer([bottom, middle, top], "img-1", "up");
  assert.equal(up.ok, true);
  assert.deepEqual(up.objects.map((object) => object.id), ["txt-1", "img-1", "txt-2"]);

  const edge = moveLayer([bottom, middle, top], "img-1", "down");
  assert.equal(edge.ok, false);
  assert.equal(edge.code, "layers.noRoom");

  const missing = moveLayer([bottom], "nope", "up");
  assert.equal(missing.code, "layers.notFound");
});

test("moveLayer does not mutate the input array", () => {
  const objects = [bottom, middle];
  moveLayer(objects, "img-1", "up");
  assert.deepEqual(objects.map((object) => object.id), ["img-1", "txt-1"]);
});

test("toggleLayer flips visibility and lock", () => {
  const hidden = toggleLayer([bottom], "img-1", "visible");
  assert.equal(hidden.objects[0].visible, false);
  const shown = toggleLayer(hidden.objects, "img-1", "visible");
  assert.equal(shown.objects[0].visible, true);

  const locked = toggleLayer([bottom], "img-1", "locked");
  assert.equal(locked.objects[0].locked, true);
  assert.equal(toggleLayer([bottom], "img-1", "bogus").code, "layers.unknownProperty");
});

test("renameLayer trims, refuses empty and clamps the length", () => {
  const renamed = renameLayer([bottom], "img-1", "  Marca  ");
  assert.equal(renamed.objects[0].name, "Marca");
  assert.equal(renameLayer([bottom], "img-1", "   ").code, "layers.emptyName");
  const long = renameLayer([bottom], "img-1", "x".repeat(200));
  assert.equal(long.objects[0].name.length, 60);
});

test("duplicateLayer inserts right above with a new id", () => {
  const result = duplicateLayer([bottom, middle], "img-1");
  assert.equal(result.ok, true);
  assert.equal(result.objects.length, 3);
  assert.equal(result.objects[1].id, result.id);
  assert.notEqual(result.id, "img-1");
  assert.match(result.objects[1].name, /\(cópia\)$/);
});

test("removeLayer drops one object and reports a missing id", () => {
  const result = removeLayer([bottom, middle], "img-1");
  assert.deepEqual(result.objects.map((object) => object.id), ["txt-1"]);
  assert.equal(removeLayer([bottom], "nope").code, "layers.notFound");
});

test("isOutOfPage detects only fully outside objects", () => {
  assert.equal(isOutOfPage({ x: -100, y: 10, w: 20, h: 20 }, A4), true);
  assert.equal(isOutOfPage({ x: 210, y: 10, w: 20, h: 20 }, A4), true);
  assert.equal(isOutOfPage({ x: 200, y: 10, w: 20, h: 20 }, A4), false, "partially visible is not outside");
  assert.equal(isOutOfPage({ x: 199, y: 10, w: 20, h: 20 }, A4), false);
  assert.equal(isOutOfPage({ x: 10, y: 10, w: 20, h: 20 }, A4), false);
  assert.equal(isOutOfPage(null, A4), false);
  assert.equal(isOutOfPage({ x: 0, y: 0, w: 1, h: 1 }, { ok: false }), false);
});

test("layerRows adds movement flags and the out-of-page warning", () => {
  const rows = layerRows(presetWith([bottom, { ...middle, x: -80 }, top]), A4);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].canMoveUp, false, "the top layer cannot go higher");
  assert.equal(rows[0].canMoveDown, true);
  assert.equal(rows[2].canMoveDown, false, "the bottom layer cannot go lower");
  assert.equal(rows.find((row) => row.id === "txt-1").outOfPage, true);
});

test("paintOrder mirrors the array order", () => {
  assert.deepEqual(paintOrder(presetWith([bottom, top])), ["img-1", "txt-2"]);
  assert.deepEqual(paintOrder({}), []);
});
