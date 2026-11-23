import test from "node:test";
import assert from "node:assert/strict";
import {
  containsPoint,
  cursorFor,
  dragObject,
  handleAt,
  objectAt,
  resizeObject,
  rotateObject,
  toLocal,
} from "../../src/core/hit-test.js";

const box = { id: "t1", x: 20, y: 40, w: 80, h: 20, rotation: 0, visible: true };

test("toLocal undoes the rotation around the centre", () => {
  const turned = { ...box, rotation: 90 };
  const local = toLocal(turned, { x: 60, y: 50 });
  assert.ok(Math.abs(local.x - 60) < 0.001);
  assert.ok(Math.abs(local.y - 50) < 0.001);

  const centre = toLocal(box, { x: 60, y: 50 });
  assert.equal(centre.x, 60);
  assert.equal(centre.y, 50);
});

test("containsPoint respects the box and the visibility", () => {
  assert.equal(containsPoint(box, { x: 20, y: 40 }), true);
  assert.equal(containsPoint(box, { x: 100, y: 60 }), true);
  assert.equal(containsPoint(box, { x: 101, y: 60 }), false);
  assert.equal(containsPoint({ ...box, visible: false }, { x: 60, y: 50 }), false);
});

test("objectAt returns the topmost object", () => {
  const bottom = { ...box, id: "bottom" };
  const top = { ...box, id: "top", x: 30, y: 45, w: 20, h: 10 };
  assert.equal(objectAt([bottom, top], { x: 35, y: 48 }).id, "top");
  assert.equal(objectAt([bottom, top], { x: 25, y: 45 }).id, "bottom");
  assert.equal(objectAt([bottom, top], { x: 200, y: 200 }), null);
  assert.equal(objectAt(null, { x: 0, y: 0 }), null);
});

test("handleAt finds corners, edges, the rotation hotspot and the body", () => {
  assert.equal(handleAt(box, { x: 20, y: 40 }), "nw");
  assert.equal(handleAt(box, { x: 100, y: 40 }), "ne");
  assert.equal(handleAt(box, { x: 20, y: 60 }), "sw");
  assert.equal(handleAt(box, { x: 100, y: 60 }), "se");
  assert.equal(handleAt(box, { x: 60, y: 40 }), "n");
  assert.equal(handleAt(box, { x: 60, y: 60 }), "s");
  assert.equal(handleAt(box, { x: 20, y: 50 }), "w");
  assert.equal(handleAt(box, { x: 100, y: 50 }), "e");
  assert.equal(handleAt(box, { x: 60, y: 34 }), "rotate");
  assert.equal(handleAt(box, { x: 60, y: 50 }), "move");
  assert.equal(handleAt(box, { x: 500, y: 500 }), null);
});

test("cursorFor maps every handle", () => {
  assert.equal(cursorFor("move"), "move");
  assert.equal(cursorFor("nw"), "nwse-resize");
  assert.equal(cursorFor("ne"), "nesw-resize");
  assert.equal(cursorFor("n"), "ns-resize");
  assert.equal(cursorFor("rotate"), "crosshair");
  assert.equal(cursorFor(null), "default");
});

test("dragObject moves the box and reports the guide when it snaps", () => {
  const targets = { vertical: [15], horizontal: [] };
  const result = dragObject(box, { x: 60, y: 50 }, { x: 56.4, y: 55 }, { targets, snap: true });
  assert.equal(result.x, 15, "the left edge snaps to the 15 mm target");
  assert.equal(result.y, 45);
  assert.deepEqual(result.guides, [{ axis: "x", position: 15 }]);
});

test("dragObject without snap keeps the raw movement", () => {
  const targets = { vertical: [15], horizontal: [] };
  const result = dragObject(box, { x: 60, y: 50 }, { x: 56.4, y: 55 }, { targets, snap: false });
  assert.ok(Math.abs(result.x - 16.4) < 1e-9, `x=${result.x}`);
  assert.deepEqual(result.guides, []);
});

test("resizeObject keeps the opposite edge and respects the minimum", () => {
  const grown = resizeObject(box, "se", { x: 100, y: 60 }, { x: 120, y: 70 }, { snap: false });
  assert.equal(grown.x, 20);
  assert.equal(grown.y, 40);
  assert.equal(grown.w, 100);
  assert.equal(grown.h, 30);

  const small = resizeObject(box, "se", { x: 100, y: 60 }, { x: 21, y: 41 }, { snap: false });
  assert.equal(small.w, 5);
  assert.equal(small.h, 5);
});

test("resizeObject with aspect keeps the ratio", () => {
  const result = resizeObject(box, "se", { x: 100, y: 60 }, { x: 140, y: 61 }, { snap: false, aspect: true });
  assert.ok(Math.abs(result.w / result.h - 4) < 0.001);
});

test("resizeObject ignores move and rotate handles", () => {
  assert.deepEqual(resizeObject(box, "move", { x: 0, y: 0 }, { x: 10, y: 10 }).w, box.w);
  assert.deepEqual(resizeObject(box, "rotate", { x: 0, y: 0 }, { x: 10, y: 10 }).w, box.w);
});

test("rotateObject snaps to the configured step", () => {
  const turned = rotateObject(box, { x: 60, y: 0 }, { snap: true });
  assert.equal(turned.rotation, 0);

  const quarter = rotateObject(box, { x: 200, y: 50 }, { snap: true });
  assert.equal(quarter.rotation, 90);

  const free = rotateObject(box, { x: 200, y: 52 }, { snap: false });
  assert.notEqual(free.rotation, 90);
  assert.ok(free.rotation > -180 && free.rotation <= 180);
});
