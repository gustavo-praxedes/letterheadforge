/**
 * Block mask: the region of a cell where ruling must not be drawn (spec 4.5, 4.6).
 *
 * A mask is `{ width, height, data: Uint8Array }` with `0` = free and `1` = blocked.
 * Pixel `(px, py)` covers `[px, px + 1) x [py, py + 1)` and its centre is
 * `(px + 0.5, py + 0.5)`, so a pixel belongs to a shape when its centre falls in it.
 * Public geometry arguments are millimetres in local cell space; the mask itself is
 * indexed in pixels at `resolution` pixels per millimetre (spec 4.5).
 *
 * Invalid input returns `{ ok: false, code }` (contract 0.3). A missing mandatory
 * argument throws `TypeError`, because that is a programming error and not user input.
 * Success values are plain masks without `ok`; callers test `mask.ok === false`.
 *
 * Pure module: no DOM, no network, no runtime dependency.
 */

import { epsilon, limits, maskResolution } from "../config.js";

/** Sentinel used by the distance transform for "no shape in this pixel". */
const FAR = 1e9;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isByteView(data, length) {
  return (
    typeof ArrayBuffer !== "undefined" &&
    ArrayBuffer.isView(data) &&
    data.BYTES_PER_ELEMENT === 1 &&
    data.length === length
  );
}

function isMask(value) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Number.isInteger(value.width) &&
    Number.isInteger(value.height) &&
    value.width > 0 &&
    value.height > 0 &&
    isByteView(value.data, value.width * value.height)
  );
}

function requireMask(mask, caller) {
  if (!isMask(mask)) throw new TypeError(`${caller} requires a mask`);
  return mask;
}

/** Raster dimension of a millimetre length, rounded up with a float tolerance. */
function pixelSize(lengthMm, resolution) {
  return Math.max(1, Math.ceil(lengthMm * resolution - epsilon));
}

/**
 * Normalise a rectangle description.
 * `x` and `y` default to 0, `rotation` defaults to 0; `w` and `h` are required.
 */
function normalizeRect(rect) {
  if (!rect || typeof rect !== "object") return null;
  const x = rect.x === undefined ? 0 : rect.x;
  const y = rect.y === undefined ? 0 : rect.y;
  const rotation = rect.rotation === undefined ? 0 : rect.rotation;
  const { w, h } = rect;
  if (![x, y, w, h, rotation].every(isFiniteNumber)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h, rotation };
}

function invalidCell(cellW, cellH) {
  return !isFiniteNumber(cellW) || !isFiniteNumber(cellH) || cellW <= 0 || cellH <= 0;
}

function invalidResolution(resolution) {
  return !isFiniteNumber(resolution) || resolution <= 0;
}

export function createMask(widthPx, heightPx) {
  if (widthPx === undefined || heightPx === undefined) {
    throw new TypeError("createMask requires width and height in pixels");
  }
  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx < 1 || heightPx < 1) {
    return { ok: false, code: "mask.invalidSize" };
  }
  return { width: widthPx, height: heightPx, data: new Uint8Array(widthPx * heightPx) };
}

export function maskGet(mask, xPx, yPx) {
  requireMask(mask, "maskGet");
  const x = Math.floor(xPx);
  const y = Math.floor(yPx);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return 0;
  return mask.data[y * mask.width + x] === 0 ? 0 : 1;
}

/**
 * Visit every pixel centre inside the rotated rectangle, clipped to the mask.
 * `plot(index, localX, localY)` receives the pixel index and the centre translated to
 * the rectangle frame, where `localX` runs along `w` and `localY` along `h`.
 * The rectangle turns clockwise on screen for positive `rotation`, like the renderer.
 */
function forEachRectPixel(mask, rect, resolution, plot) {
  const radians = (rect.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  const centreX = rect.x + halfW;
  const centreY = rect.y + halfH;

  const extentX = Math.abs(halfW * cos) + Math.abs(halfH * sin);
  const extentY = Math.abs(halfW * sin) + Math.abs(halfH * cos);
  const firstX = Math.max(0, Math.floor((centreX - extentX) * resolution));
  const lastX = Math.min(mask.width - 1, Math.ceil((centreX + extentX) * resolution));
  const firstY = Math.max(0, Math.floor((centreY - extentY) * resolution));
  const lastY = Math.min(mask.height - 1, Math.ceil((centreY + extentY) * resolution));
  if (firstX > lastX || firstY > lastY) return;

  const limitW = halfW + epsilon;
  const limitH = halfH + epsilon;

  for (let py = firstY; py <= lastY; py += 1) {
    const offsetY = py * mask.width;
    const dy = (py + 0.5) / resolution - centreY;
    for (let px = firstX; px <= lastX; px += 1) {
      const dx = (px + 0.5) / resolution - centreX;
      const localX = dx * cos + dy * sin;
      if (localX < -limitW || localX > limitW) continue;
      const localY = -dx * sin + dy * cos;
      if (localY < -limitH || localY > limitH) continue;
      plot(offsetY + px, localX, localY);
    }
  }
}

function writeSolidRect(mask, rect, resolution) {
  forEachRectPixel(mask, rect, resolution, (index) => {
    mask.data[index] = 1;
  });
}

/**
 * Paint a pre-computed silhouette (image pixel space) into the cell mask under the
 * same rectangle transform, sampling nearest neighbour. Already blocked pixels stay
 * blocked, so several objects accumulate into one mask.
 */
function writeAlphaRect(mask, silhouette, rect, resolution) {
  const srcWidth = silhouette.width;
  const srcHeight = silhouette.height;
  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  forEachRectPixel(mask, rect, resolution, (index, localX, localY) => {
    if (mask.data[index]) return;
    const u = (localX + halfW) / rect.w;
    const v = (localY + halfH) / rect.h;
    const sx = Math.min(srcWidth - 1, Math.max(0, Math.floor(u * srcWidth)));
    const sy = Math.min(srcHeight - 1, Math.max(0, Math.floor(v * srcHeight)));
    if (silhouette.data[sy * srcWidth + sx]) mask.data[index] = 1;
  });
}

export function rasterizeRotatedRect(rect, cellW, cellH, resolution = maskResolution) {
  if (rect === undefined || cellW === undefined || cellH === undefined) {
    throw new TypeError("rasterizeRotatedRect requires a rect, a cell width and a cell height");
  }
  if (invalidCell(cellW, cellH)) return { ok: false, code: "mask.invalidCell" };
  if (invalidResolution(resolution)) return { ok: false, code: "mask.invalidResolution" };
  const normalized = normalizeRect(rect);
  if (!normalized) return { ok: false, code: "mask.invalidRect" };

  const mask = createMask(pixelSize(cellW, resolution), pixelSize(cellH, resolution));
  writeSolidRect(mask, normalized, resolution);
  return mask;
}

/**
 * Alpha buffer (`0..255`, one byte per pixel) to a silhouette mask.
 * A pixel is opaque when its alpha reaches `alphaThreshold` (0.1 = 10 %, spec 4.5).
 */
export function objectMaskFromAlpha(alpha, alphaThreshold = limits.alphaThreshold) {
  if (alpha === undefined) {
    throw new TypeError("objectMaskFromAlpha requires an alpha buffer");
  }
  if (!isFiniteNumber(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 1) {
    return { ok: false, code: "mask.invalidThreshold" };
  }
  const { width, height } = alpha;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    !isByteView(alpha.data, width * height)
  ) {
    return { ok: false, code: "mask.invalidAlpha" };
  }

  const mask = createMask(width, height);
  const source = alpha.data;
  const cutoff = alphaThreshold * 255;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] >= cutoff) mask.data[index] = 1;
  }
  return mask;
}

/**
 * Fill internal holes: flood the free area from the mask border with 4-connectivity
 * and block every free pixel the flood never reaches (spec 4.5, rule R40).
 * The input mask is not modified.
 */
export function fillHoles(mask) {
  requireMask(mask, "fillHoles");
  const { width, height } = mask;
  const size = width * height;
  const out = createMask(width, height);
  out.data.set(mask.data);

  const reachable = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    const index = y * width + x;
    if (reachable[index] || out.data[index]) return;
    reachable[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  for (let index = 0; index < size; index += 1) {
    if (!out.data[index] && !reachable[index]) out.data[index] = 1;
  }
  return out;
}

/**
 * Exact one-dimensional squared distance transform
 * (Felzenszwalb & Huttenlocher, "Distance Transforms of Sampled Functions", 2012).
 * `f` holds the input samples, `d` receives `min_q (q - x)^2 + f(q)`.
 * `v` and `z` are caller-provided scratch buffers, so the pass allocates nothing.
 */
function distanceTransform1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;

  for (let q = 1; q < n; q += 1) {
    const qq = q * q;
    let s = (f[q] + qq - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k -= 1;
      s = (f[q] + qq - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    const distance = q - v[k];
    d[q] = distance * distance + f[v[k]];
  }
}

/**
 * Euclidean dilation by `radiusPx` in pixels, exact in every direction.
 * Blocked pixels get distance 0, free pixels a large sentinel; the two passes of the
 * distance transform give the distance to the nearest blocked pixel, and a pixel is
 * blocked when that distance is at most the radius. No square kernel, no iteration.
 */
export function dilate(mask, radiusPx) {
  requireMask(mask, "dilate");
  if (!isFiniteNumber(radiusPx) || radiusPx < 0) {
    return { ok: false, code: "mask.invalidRadius" };
  }
  const { width, height, data } = mask;

  if (radiusPx === 0) {
    const copy = createMask(width, height);
    copy.data.set(data);
    return copy;
  }

  const grid = new Float64Array(width * height);
  for (let index = 0; index < data.length; index += 1) {
    grid[index] = data[index] ? 0 : FAR;
  }

  const longest = Math.max(width, height);
  const samples = new Float64Array(longest);
  const transformed = new Float64Array(longest);
  const sites = new Int32Array(longest);
  const bounds = new Float64Array(longest + 1);

  for (let y = 0; y < height; y += 1) {
    const offset = y * width;
    for (let x = 0; x < width; x += 1) samples[x] = grid[offset + x];
    distanceTransform1d(samples, width, transformed, sites, bounds);
    for (let x = 0; x < width; x += 1) grid[offset + x] = transformed[x];
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) samples[y] = grid[y * width + x];
    distanceTransform1d(samples, height, transformed, sites, bounds);
    for (let y = 0; y < height; y += 1) grid[y * width + x] = transformed[y];
  }

  const limit = radiusPx * radiusPx + epsilon;
  const out = createMask(width, height);
  for (let index = 0; index < grid.length; index += 1) {
    out.data[index] = grid[index] <= limit ? 1 : 0;
  }
  return out;
}

export function isBlockedMm(mask, xMm, yMm, resolution = maskResolution) {
  requireMask(mask, "isBlockedMm");
  if (invalidResolution(resolution)) {
    throw new TypeError("isBlockedMm requires a positive resolution");
  }
  if (!isFiniteNumber(xMm) || !isFiniteNumber(yMm)) return false;
  const xPx = Math.floor(xMm * resolution);
  const yPx = Math.floor(yMm * resolution);
  return maskGet(mask, xPx, yPx) === 1;
}

function lookupAlpha(alphaMasks, imageId) {
  if (!alphaMasks || imageId === undefined || imageId === null) return null;
  if (typeof alphaMasks.get === "function") return alphaMasks.get(imageId) ?? null;
  if (typeof alphaMasks === "object") return alphaMasks[imageId] ?? null;
  return null;
}

/**
 * Union of every visible object silhouette for one cell, filled and dilated.
 *
 * - Hidden objects do not block; locked objects do (spec 4.5, rules R146/R147).
 * - A text box blocks its whole rotated rectangle; an image blocks its alpha
 *   silhouette when `alphaMasks` has one and its rectangle otherwise (rule R46).
 * - Internal holes are filled on the image silhouette itself, before the union, so a
 *   pocket enclosed between two different objects is not swallowed.
 * - A single dilation of the union by `objectDistance` millimetres follows, exactly
 *   `objectDistance * resolution` pixels (decision D3).
 *
 * Objects and the cell are in local cell coordinates; `cell.x` and `cell.y` only
 * locate the cell on the sheet and do not affect the mask.
 */
export function buildBlockMask(input) {
  if (input === undefined || input === null) {
    throw new TypeError("buildBlockMask requires an input object");
  }
  const {
    objects,
    alphaMasks = new Map(),
    cell,
    resolution = maskResolution,
    objectDistance = 0,
  } = input;

  if (!Array.isArray(objects)) return { ok: false, code: "mask.invalidObjects" };
  if (!cell || typeof cell !== "object") return { ok: false, code: "mask.invalidCell" };
  if (invalidCell(cell.w, cell.h)) return { ok: false, code: "mask.invalidCell" };
  if (invalidResolution(resolution)) return { ok: false, code: "mask.invalidResolution" };
  if (!isFiniteNumber(objectDistance) || objectDistance < 0) {
    return { ok: false, code: "mask.invalidDistance" };
  }

  const mask = createMask(
    pixelSize(cell.w, resolution),
    pixelSize(cell.h, resolution),
  );

  for (const object of objects) {
    if (!object || typeof object !== "object") return { ok: false, code: "mask.invalidObject" };
    if (object.visible === false) continue;
    const rect = normalizeRect(object);
    if (!rect) return { ok: false, code: "mask.invalidObject" };

    if (object.type === "image") {
      const alpha = lookupAlpha(alphaMasks, object.imageId);
      if (alpha) {
        const silhouette = objectMaskFromAlpha(alpha);
        if (silhouette.ok === false) return silhouette;
        writeAlphaRect(mask, fillHoles(silhouette), rect, resolution);
        continue;
      }
    }
    writeSolidRect(mask, rect, resolution);
  }

  if (objectDistance === 0) return mask;
  return dilate(mask, objectDistance * resolution);
}
