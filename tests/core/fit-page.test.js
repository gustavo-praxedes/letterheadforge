import assert from "node:assert/strict";
import test from "node:test";

import { fitObjectsToPage, objectsOffPage } from "../../src/core/fit-page.js";

const A4 = { w: 210, h: 297 };
const A5 = { w: 148, h: 210 };

test("an object near the A4 bottom edge stays visible after switching to A5", () => {
  const [fitted] = fitObjectsToPage([{ id: "a", x: 20, y: 250, w: 80, h: 20 }], A4, A5);
  // y 250 of 297 became 250 * (210/297) = 176.8 — inside the 210 mm page
  assert.equal(fitted.y, 176.8);
  assert.equal(fitted.x, 14.1);
  assert.equal(fitted.w, 80);
  assert.equal(fitted.h, 20);
  assert.ok(fitted.y + fitted.h <= A5.h);
});

test("a box wider than the new page is capped, never negative", () => {
  const [fitted] = fitObjectsToPage([{ id: "a", x: 100, y: 10, w: 190, h: 20 }], A4, A5);
  assert.equal(fitted.w, 148);
  assert.equal(fitted.x, 0);
});

test("the same geometry leaves objects untouched", () => {
  const objects = [{ id: "a", x: 200, y: 290, w: 40, h: 20 }];
  assert.equal(fitObjectsToPage(objects, A4, A4), objects);
});

test("growing the page keeps the relative position", () => {
  const [fitted] = fitObjectsToPage([{ id: "a", x: 74, y: 105, w: 20, h: 10 }], A5, A4);
  assert.equal(fitted.x, 105);
  assert.equal(fitted.y, 148.5);
});

test("invalid input is ignored instead of throwing", () => {
  assert.deepEqual(fitObjectsToPage([], A4, A5), []);
  assert.deepEqual(fitObjectsToPage([{ x: 1 }], null, A5), []);
  assert.deepEqual(fitObjectsToPage(null, A4, A5), []);
});

test("objects fully outside the page are reported", () => {
  const off = objectsOffPage(
    [
      { id: "dentro", x: 10, y: 10, w: 20, h: 20 },
      { id: "embaixo", x: 20, y: 250, w: 80, h: 20 },
      { id: "esquerda", x: -90, y: 10, w: 40, h: 20 },
    ],
    A5,
  );
  assert.deepEqual(off.map((object) => object.id), ["embaixo", "esquerda"]);
});
