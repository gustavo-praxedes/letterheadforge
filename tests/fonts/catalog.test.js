import test from "node:test";
import assert from "node:assert/strict";
import { buildFontUrl, categories, filterCatalog, findFont, shortList, subsetOrder } from "../../src/fonts/catalog.js";
import { createFontLoader } from "../../src/fonts/loader.js";

const INTER = {
  id: "inter",
  family: "Inter",
  category: "sans-serif",
  weights: [400, 700],
  styles: ["normal", "italic"],
  subsets: ["latin", "latin-ext"],
  version: "5.3.0",
};

const CAVEAT = {
  id: "caveat",
  family: "Caveat",
  category: "handwriting",
  weights: [400],
  styles: ["normal"],
  subsets: ["latin"],
  version: "5.3.0",
};

const CATALOG = { shortList: ["inter", "caveat"], fonts: [CAVEAT, INTER] };

test("buildFontUrl follows the Fontsource model in WOFF", () => {
  const result = buildFontUrl(INTER, { subset: "latin", weight: 400, style: "normal" });
  assert.equal(result.ok, true);
  assert.equal(
    result.url,
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-400-normal.woff",
  );
  assert.ok(!result.url.includes(".woff2"), "decision D11: WOFF only");
});

test("buildFontUrl refuses unsupported subset, weight and style", () => {
  assert.equal(buildFontUrl(INTER, { subset: "cyrillic" }).code, "fonts.unsupportedSubset");
  assert.equal(buildFontUrl(INTER, { weight: 300 }).code, "fonts.unsupportedWeight");
  assert.equal(buildFontUrl(CAVEAT, { style: "italic" }).code, "fonts.unsupportedStyle");
  assert.equal(buildFontUrl({ id: "x" }).code, "fonts.missingVersion");
  assert.equal(buildFontUrl(null).code, "fonts.invalidEntry");
});

test("short list keeps the curated order", () => {
  const list = shortList(CATALOG);
  assert.deepEqual(list.map((font) => font.id), ["inter", "caveat"]);
  assert.deepEqual(shortList({ shortList: ["missing"], fonts: [] }), []);
  assert.deepEqual(shortList(null), []);
});

test("filterCatalog searches by family and category", () => {
  assert.deepEqual(filterCatalog(CATALOG, { query: "int" }).map((f) => f.id), ["inter"]);
  assert.deepEqual(filterCatalog(CATALOG, { query: "  " }).map((f) => f.id), ["caveat", "inter"]);
  assert.deepEqual(filterCatalog(CATALOG, { category: "handwriting" }).map((f) => f.id), ["caveat"]);
  assert.deepEqual(filterCatalog(CATALOG, { query: "nothing" }), []);
  assert.deepEqual(categories(CATALOG), ["handwriting", "sans-serif"]);
  assert.equal(findFont(CATALOG, "inter").family, "Inter");
  assert.equal(findFont(CATALOG, "nope"), null);
});

test("subset order is latin before latin-ext", () => {
  assert.deepEqual(subsetOrder(INTER), ["latin", "latin-ext"]);
  assert.deepEqual(subsetOrder(CAVEAT), ["latin"]);
  assert.deepEqual(subsetOrder(null), []);
});

function fakeFetch(buffersByUrl, { fail = false } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    if (fail) throw new Error("network down");
    if (!(url in buffersByUrl)) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => buffersByUrl[url] };
  };
  impl.calls = calls;
  return impl;
}

test("the loader caches one fetch per file", async () => {
  const url = buildFontUrl(INTER, { subset: "latin" }).url;
  const fetchImpl = fakeFetch({ [url]: new Uint8Array([1, 2, 3]).buffer });
  const loader = createFontLoader({ fetchImpl });

  const first = await loader.loadBuffer(INTER, { subset: "latin" });
  const second = await loader.loadBuffer(INTER, { subset: "latin" });
  assert.equal(first.ok, true);
  assert.equal(second.cached, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(loader.size(), 1);
});

test("a download failure returns font.loadFailed, never throws", async () => {
  const loader = createFontLoader({ fetchImpl: fakeFetch({}, { fail: true }) });
  const result = await loader.loadBuffer(INTER, { subset: "latin" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "font.loadFailed");
});

test("a 404 also reports font.loadFailed", async () => {
  const loader = createFontLoader({ fetchImpl: fakeFetch({}) });
  const result = await loader.loadBuffer(INTER, { subset: "latin-ext" });
  assert.equal(result.code, "font.loadFailed");
  assert.equal(result.params.status, 404);
});

test("loadSubsets fetches latin then latin-ext", async () => {
  const latin = buildFontUrl(INTER, { subset: "latin" }).url;
  const latinExt = buildFontUrl(INTER, { subset: "latin-ext" }).url;
  const fetchImpl = fakeFetch({
    [latin]: new Uint8Array([1]).buffer,
    [latinExt]: new Uint8Array([2]).buffer,
  });
  const loader = createFontLoader({ fetchImpl });
  const result = await loader.loadSubsets(INTER, { weight: 400 });
  assert.equal(result.ok, true);
  assert.equal(result.parts.length, 2);
  assert.deepEqual(fetchImpl.calls.map((call) => (call.includes("latin-ext") ? "latin-ext" : "latin")), [
    "latin",
    "latin-ext",
  ]);
});
