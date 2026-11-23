import { buildFontUrl, subsetOrder } from "./catalog.js";

/**
 * Font loading (spec 7.1): one fetch per file, cached in memory, registered with
 * FontFace for the preview. The same buffer feeds fontkit in the PDF stage.
 *
 * `fetchImpl` and `fontFaceFactory` are injected so the loader stays testable.
 */

export function createFontLoader({ fetchImpl = (...args) => fetch(...args), fontFaceFactory = null } = {}) {
  const cache = new Map();

  async function loadBuffer(font, request = {}) {
    const target = buildFontUrl(font, request);
    if (!target.ok) return target;
    if (cache.has(target.url)) return { ok: true, url: target.url, buffer: cache.get(target.url), cached: true };

    let response;
    try {
      response = await fetchImpl(target.url);
    } catch (error) {
      return { ok: false, code: "font.loadFailed", params: { url: target.url, reason: error.message } };
    }
    if (!response || !response.ok) {
      return { ok: false, code: "font.loadFailed", params: { url: target.url, status: response?.status ?? 0 } };
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { ok: false, code: "font.loadFailed", params: { url: target.url, reason: "empty" } };
    }
    cache.set(target.url, buffer);
    return { ok: true, url: target.url, buffer, cached: false };
  }

  async function loadFace(font, request = {}) {
    const buffer = await loadBuffer(font, request);
    if (!buffer.ok) return buffer;
    if (typeof fontFaceFactory !== "function") return buffer;

    // family = fontId so render-svg and the PDF can reference "inter" directly;
    // weight/style travel as descriptors of the same family.
    const family = font.id;
    const face = fontFaceFactory(family, buffer.buffer, {
      style: request.style ?? "normal",
      weight: String(request.weight ?? 400),
    });
    try {
      await face.load();
      if (typeof document !== "undefined" && document.fonts) document.fonts.add(face);
    } catch (error) {
      return { ok: false, code: "font.loadFailed", params: { url: buffer.url, reason: error.message } };
    }
    return { ...buffer, face, cssFamily: family };
  }

  /**
   * Load the subsets of a font in the documented order (latin, then latin-ext).
   */
  async function loadSubsets(font, request = {}) {
    const results = [];
    for (const subset of subsetOrder(font)) {
      results.push(await loadBuffer(font, { ...request, subset }));
    }
    const failed = results.find((result) => !result.ok);
    if (failed) return failed;
    return { ok: true, parts: results };
  }

  function clear() {
    cache.clear();
  }

  return { loadBuffer, loadFace, loadSubsets, clear, size: () => cache.size };
}

export const fontLoader = createFontLoader({
  fontFaceFactory:
    typeof FontFace === "function"
      ? (family, source, descriptors) => new FontFace(family, source, descriptors)
      : null,
});
