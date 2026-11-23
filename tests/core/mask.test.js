import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  buildBlockMask,
  createMask,
  dilate,
  fillHoles,
  isBlockedMm,
  maskGet,
  objectMaskFromAlpha,
  rasterizeRotatedRect,
} from "../../src/core/mask.js";
import { limits, maskResolution } from "../../src/config.js";

/** Point at local offsets (u, v) from the centre, in the rectangle frame. */
function rotatedPoint(centre, rotationDeg, u, v) {
  const radians = (rotationDeg * Math.PI) / 180;
  return {
    x: centre.x + u * Math.cos(radians) - v * Math.sin(radians),
    y: centre.y + u * Math.sin(radians) + v * Math.cos(radians),
  };
}

function blockRect(mask, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) mask.data[y * mask.width + x] = 1;
  }
}

function countBlocked(mask) {
  let total = 0;
  for (const value of mask.data) if (value) total += 1;
  return total;
}

test("createMask allocates a zeroed mask and rejects invalid sizes", () => {
  const mask = createMask(4, 3);
  assert.deepEqual(Object.keys(mask).sort(), ["data", "height", "width"]);
  assert.equal(mask.width, 4);
  assert.equal(mask.height, 3);
  assert.equal(mask.data.length, 12);
  assert.ok(mask.data instanceof Uint8Array);
  assert.equal(countBlocked(mask), 0);

  const second = createMask(4, 3);
  second.data[0] = 1;
  assert.equal(mask.data[0], 0, "each mask owns its buffer");

  assert.deepEqual(createMask(0, 3), { ok: false, code: "mask.invalidSize" });
  assert.deepEqual(createMask(4, 2.5), { ok: false, code: "mask.invalidSize" });
  assert.throws(() => createMask(), TypeError);
});

test("maskGet returns 0 outside the mask", () => {
  const mask = createMask(3, 3);
  assert.equal(maskGet(mask, 1, 1), 0);
  mask.data[4] = 1;
  assert.equal(maskGet(mask, 1, 1), 1);
  assert.equal(maskGet(mask, -1, 1), 0);
  assert.equal(maskGet(mask, 3, 1), 0);
  assert.equal(maskGet(mask, 1, -1), 0);
  assert.equal(maskGet(mask, 1, 3), 0);
  assert.equal(maskGet(mask, Number.NaN, 1), 0);
  assert.throws(() => maskGet(null, 0, 0), TypeError);
});

test("rasterizeRotatedRect without rotation fills whole pixels inside the rectangle", () => {
  const mask = rasterizeRotatedRect({ x: 10, y: 10, w: 20, h: 10, rotation: 0 }, 40, 40, 4);
  assert.equal(mask.width, 160);
  assert.equal(mask.height, 160);

  // 10 mm * 4 px/mm = pixel 40; 30 mm * 4 px/mm = pixel 120 (exclusive).
  assert.equal(maskGet(mask, 40, 40), 1);
  assert.equal(maskGet(mask, 39, 40), 0, "pixel centre 9.875 mm is left of the edge");
  assert.equal(maskGet(mask, 119, 79), 1);
  assert.equal(maskGet(mask, 120, 79), 0, "pixel centre 30.125 mm is right of the edge");
  assert.equal(maskGet(mask, 40, 80), 0, "pixel centre 20.125 mm is below the edge");
  assert.equal(countBlocked(mask), 80 * 40);
});

test("rasterizeRotatedRect at 90 degrees matches the equivalent axis-aligned rectangle", () => {
  const rotated = rasterizeRotatedRect({ x: 10, y: 10, w: 20, h: 10, rotation: 90 }, 40, 40, 4);
  const aligned = rasterizeRotatedRect({ x: 15, y: 5, w: 10, h: 20, rotation: 0 }, 40, 40, 4);
  assert.deepEqual(rotated.data, aligned.data);
  assert.equal(maskGet(rotated, 80, 20), 1);
  assert.equal(maskGet(rotated, 59, 40), 0, "pixel centre 14.875 mm is left of the box");
  assert.equal(maskGet(rotated, 80, 19), 0, "pixel centre 4.875 mm is above the box");
  assert.equal(countBlocked(rotated), 40 * 80, "10 mm x 20 mm at 4 px/mm");
});

test("rasterizeRotatedRect at 30 degrees rotates around the centre", () => {
  const rect = { x: 30, y: 40, w: 40, h: 20, rotation: 30 };
  const centre = { x: 50, y: 50 };
  const mask = rasterizeRotatedRect(rect, 100, 100, 4);
  const straight = rasterizeRotatedRect({ ...rect, rotation: 0 }, 100, 100, 4);

  const inside = rotatedPoint(centre, 30, 19, 9);
  const outside = rotatedPoint(centre, 30, 0, 11.2);

  assert.equal(isBlockedMm(mask, inside.x, inside.y, 4), true, "inside the rotated corner");
  assert.equal(isBlockedMm(straight, inside.x, inside.y, 4), false, "outside the unrotated box");
  assert.equal(isBlockedMm(mask, outside.x, outside.y, 4), false, "past the rotated long edge");
  assert.equal(isBlockedMm(straight, outside.x, outside.y, 4), true, "inside the unrotated box");

  const area = countBlocked(mask) / (4 * 4);
  assert.ok(Math.abs(area - rect.w * rect.h) <= rect.w * rect.h * 0.05, `area ${area} mm2`);
});

test("objectMaskFromAlpha blocks pixels at the 10 % threshold", () => {
  const alpha = { width: 4, height: 1, data: Uint8Array.from([0, 25, 26, 255]) };
  const mask = objectMaskFromAlpha(alpha, 0.1);
  assert.deepEqual(Array.from(mask.data), [0, 0, 1, 1]);
  assert.equal(mask.width, 4);
  assert.equal(mask.height, 1);

  const defaultThreshold = objectMaskFromAlpha(alpha);
  assert.deepEqual(Array.from(defaultThreshold.data), [0, 0, 1, 1]);
  assert.equal(limits.alphaThreshold, 0.1);

  assert.deepEqual(
    objectMaskFromAlpha({ width: 2, height: 2, data: new Uint8Array(3) }),
    { ok: false, code: "mask.invalidAlpha" },
  );
  assert.deepEqual(objectMaskFromAlpha(alpha, 1.5), {
    ok: false,
    code: "mask.invalidThreshold",
  });
  assert.throws(() => objectMaskFromAlpha(), TypeError);
});

test("fillHoles blocks the inner hole of a 64 x 64 ring and keeps the input intact", () => {
  const size = 64;
  const ring = createMask(size, size);
  for (let y = 8; y < 56; y += 1) {
    for (let x = 8; x < 56; x += 1) {
      const inner = x >= 24 && x < 40 && y >= 24 && y < 40;
      if (!inner) ring.data[y * size + x] = 1;
    }
  }
  assert.equal(maskGet(ring, 32, 32), 0, "hole is free before filling");

  const filled = fillHoles(ring);
  assert.equal(maskGet(filled, 32, 32), 1, "hole is blocked after filling");
  assert.equal(maskGet(filled, 0, 0), 0, "the outside stays free");
  assert.equal(maskGet(filled, 63, 63), 0);
  assert.equal(maskGet(ring, 32, 32), 0, "input mask is not mutated");
  assert.ok(countBlocked(filled) > countBlocked(ring));

  const empty = createMask(8, 8);
  assert.equal(countBlocked(fillHoles(empty)), 0, "an empty mask has no hole");
  const solid = createMask(8, 8);
  solid.data.fill(1);
  assert.equal(countBlocked(fillHoles(solid)), 64);
});

test("dilate grows exactly the euclidean radius, including diagonal steps", () => {
  const mask = createMask(25, 25);
  mask.data[12 * 25 + 12] = 1;

  const small = dilate(mask, 3);
  assert.equal(maskGet(small, 12, 15), 1, "3 px down");
  assert.equal(maskGet(small, 15, 12), 1, "3 px right");
  assert.equal(maskGet(small, 9, 12), 1);
  assert.equal(maskGet(small, 12, 9), 1);
  assert.equal(maskGet(small, 13, 15), 0, "sqrt(10) = 3.16 px away");
  assert.equal(maskGet(small, 16, 12), 0, "4 px away");

  const large = dilate(mask, 5);
  assert.equal(maskGet(large, 15, 16), 1, "3-4-5 diagonal is exactly 5 px");
  assert.equal(maskGet(large, 9, 8), 1, "3-4-5 diagonal on the other side");
  assert.equal(maskGet(large, 17, 12), 1, "5 px right");
  assert.equal(maskGet(large, 16, 16), 0, "sqrt(32) = 5.66 px away");
  assert.equal(maskGet(large, 18, 12), 0, "6 px away");

  const untouched = dilate(mask, 0);
  assert.deepEqual(untouched.data, mask.data);
  assert.notEqual(untouched, mask);
});

test("dilate of a square grows every side without square-kernel corners", () => {
  const mask = createMask(30, 30);
  blockRect(mask, 5, 5, 14, 14);

  const grown = dilate(mask, 4);
  assert.equal(maskGet(grown, 1, 10), 1, "left edge grew 4 px");
  assert.equal(maskGet(grown, 18, 10), 1, "right edge grew 4 px");
  assert.equal(maskGet(grown, 10, 1), 1, "top edge grew 4 px");
  assert.equal(maskGet(grown, 10, 18), 1, "bottom edge grew 4 px");
  assert.equal(maskGet(grown, 0, 10), 0, "5 px to the left is outside");
  assert.equal(maskGet(grown, 19, 10), 0);
  assert.equal(maskGet(grown, 1, 1), 0, "corner is sqrt(32) = 5.66 px away");
  assert.equal(maskGet(grown, 2, 2), 0, "corner is sqrt(18) = 4.24 px away");
  assert.equal(maskGet(grown, 3, 3), 1, "corner is sqrt(8) = 2.83 px away");
});

test("buildBlockMask blocks visible text, images without alpha and locked objects", () => {
  const cell = { x: 0, y: 0, w: 40, h: 40 };
  const objects = [
    { id: "text", type: "text", x: 5, y: 5, w: 10, h: 10, rotation: 0, visible: true },
    { id: "hidden", type: "text", x: 25, y: 25, w: 10, h: 10, rotation: 0, visible: false },
    {
      id: "locked",
      type: "text",
      x: 25,
      y: 5,
      w: 10,
      h: 10,
      rotation: 0,
      visible: true,
      locked: true,
    },
    { id: "plain", type: "image", imageId: "missing", x: 5, y: 25, w: 10, h: 10, rotation: 0 },
  ];
  const mask = buildBlockMask({ objects, cell, resolution: 4 });

  assert.equal(mask.width, 160);
  assert.equal(mask.height, 160);
  assert.equal(isBlockedMm(mask, 10, 10, 4), true, "text box blocks");
  assert.equal(isBlockedMm(mask, 30, 30, 4), false, "hidden object does not block");
  assert.equal(isBlockedMm(mask, 30, 10, 4), true, "locked object still blocks");
  assert.equal(isBlockedMm(mask, 10, 30, 4), true, "image without alpha blocks its rectangle");
  assert.equal(isBlockedMm(mask, 20, 20, 4), false, "untouched area stays free");
  assert.equal(maskResolution, 4);
});

test("buildBlockMask clips objects that hang over the cell edge", () => {
  const cell = { x: 0, y: 0, w: 40, h: 40 };
  const objects = [{ type: "text", x: -10, y: -10, w: 20, h: 20, rotation: 0 }];
  const mask = buildBlockMask({ objects, cell, resolution: 4 });

  assert.equal(mask.width, 160);
  assert.equal(mask.height, 160);
  assert.equal(countBlocked(mask), 40 * 40, "only the visible quarter is blocked");
  assert.equal(maskGet(mask, 0, 0), 1);
  assert.equal(maskGet(mask, 39, 39), 1);
  assert.equal(maskGet(mask, 40, 40), 0);

  const outside = buildBlockMask({
    objects: [{ type: "text", x: -30, y: -30, w: 10, h: 10, rotation: 0 }],
    cell,
    resolution: 4,
  });
  assert.equal(countBlocked(outside), 0, "fully outside yields an empty mask");
});

test("buildBlockMask fills the inner hole of an image silhouette", () => {
  const size = 20;
  const ring = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const border = x < 3 || x > 16 || y < 3 || y > 16;
      ring[y * size + x] = border ? 255 : 0;
    }
  }
  const alphaMasks = new Map([["ring", { width: size, height: size, data: ring }]]);
  const objects = [
    { type: "image", imageId: "ring", x: 10, y: 10, w: 20, h: 20, rotation: 0, visible: true },
  ];
  const mask = buildBlockMask({ objects, alphaMasks, cell: { w: 40, h: 40 }, resolution: 4 });

  assert.equal(isBlockedMm(mask, 20, 20, 4), true, "hole is filled");
  assert.equal(isBlockedMm(mask, 11, 20, 4), true, "ring body blocks");
  assert.equal(isBlockedMm(mask, 5, 5, 4), false, "outside the image stays free");

  const raw = objectMaskFromAlpha(alphaMasks.get("ring"));
  assert.equal(isBlockedMm(raw, 10, 10, 1), false, "the source silhouette keeps its hole");
});

test("buildBlockMask dilates the union by objectDistance in millimetres", () => {
  const cell = { w: 40, h: 40 };
  const objects = [{ type: "text", x: 15, y: 15, w: 10, h: 10, rotation: 0 }];

  const plain = buildBlockMask({ objects, cell, resolution: 4 });
  assert.equal(isBlockedMm(plain, 13.75, 20, 4), false);

  const spaced = buildBlockMask({ objects, cell, resolution: 4, objectDistance: 2 });
  assert.equal(isBlockedMm(spaced, 13.75, 20, 4), true, "2 mm = 8 px to the left");
  assert.equal(isBlockedMm(spaced, 12.75, 20, 4), false, "3 mm is beyond the dilation");
  assert.equal(isBlockedMm(spaced, 20, 26.75, 4), true, "below the box");
});

test("buildBlockMask and dilate report invalid input instead of throwing", () => {
  const cell = { w: 10, h: 10 };
  assert.deepEqual(buildBlockMask({ objects: "nope", cell }), {
    ok: false,
    code: "mask.invalidObjects",
  });
  assert.deepEqual(buildBlockMask({ objects: [], cell: { w: 0, h: 10 } }), {
    ok: false,
    code: "mask.invalidCell",
  });
  assert.deepEqual(buildBlockMask({ objects: [], cell, resolution: 0 }), {
    ok: false,
    code: "mask.invalidResolution",
  });
  assert.deepEqual(buildBlockMask({ objects: [], cell, objectDistance: -1 }), {
    ok: false,
    code: "mask.invalidDistance",
  });
  assert.deepEqual(
    buildBlockMask({ objects: [{ type: "text", x: 0, y: 0, w: 0, h: 10 }], cell }),
    { ok: false, code: "mask.invalidObject" },
  );
  assert.deepEqual(buildBlockMask({ objects: [null], cell }), {
    ok: false,
    code: "mask.invalidObject",
  });
  assert.equal(buildBlockMask({ objects: [], cell }).ok, undefined, "an empty cell is valid");
  assert.throws(() => buildBlockMask(), TypeError);

  assert.deepEqual(dilate(createMask(4, 4), -1), { ok: false, code: "mask.invalidRadius" });
  assert.deepEqual(rasterizeRotatedRect({ x: 0, y: 0, w: 0, h: 10 }, 10, 10, 4), {
    ok: false,
    code: "mask.invalidRect",
  });
  assert.deepEqual(rasterizeRotatedRect({ x: 0, y: 0, w: 2, h: 2 }, 10, 10, 0), {
    ok: false,
    code: "mask.invalidResolution",
  });
  assert.throws(() => rasterizeRotatedRect({ w: 1, h: 1 }), TypeError);
});

test("buildBlockMask covers an A4 cell below 200 ms", (t) => {
  const cell = { x: 0, y: 0, w: 210, h: 297 };
  const alphaWidth = 200;
  const alphaHeight = 150;
  const alpha = new Uint8Array(alphaWidth * alphaHeight);
  for (let y = 0; y < alphaHeight; y += 1) {
    for (let x = 0; x < alphaWidth; x += 1) {
      const nx = (x - alphaWidth / 2) / (alphaWidth / 2);
      const ny = (y - alphaHeight / 2) / (alphaHeight / 2);
      alpha[y * alphaWidth + x] = nx * nx + ny * ny <= 1 ? 255 : 0;
    }
  }
  const alphaMasks = new Map([["photo", { width: alphaWidth, height: alphaHeight, data: alpha }]]);
  const objects = [
    { type: "text", x: 20, y: 30, w: 60, h: 40, rotation: 15 },
    { type: "image", imageId: "photo", x: 100, y: 120, w: 80, h: 60, rotation: -30 },
    { type: "text", x: 40, y: 200, w: 50, h: 50, rotation: 0 },
  ];

  const started = performance.now();
  const mask = buildBlockMask({ objects, alphaMasks, cell, resolution: 4, objectDistance: 5 });
  const elapsed = performance.now() - started;

  assert.equal(mask.width, 840);
  assert.equal(mask.height, 1188);
  assert.equal(mask.ok, undefined);
  assert.ok(countBlocked(mask) > 0);
  t.diagnostic(`A4 mask (840x1188) built in ${elapsed.toFixed(1)} ms`);
  assert.ok(elapsed < 200, `mask build took ${elapsed.toFixed(1)} ms`);
});
