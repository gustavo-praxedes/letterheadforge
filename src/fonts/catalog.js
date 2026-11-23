import { fonts as fontConfig } from "../config.js";

/**
 * Pure helpers for the font catalogue (spec 7.1): URL building, short list and
 * search. No network, no DOM — the loader does the fetching.
 */

/**
 * Build the Fontsource/jsDelivr URL for one file (decision D11: WOFF files).
 */
export function buildFontUrl(font, request = {}) {
  if (!font || typeof font.id !== "string") return { ok: false, code: "fonts.invalidEntry" };
  if (!font.version) return { ok: false, code: "fonts.missingVersion" };

  const { subset = "latin", weight = 400, style = "normal" } = request;
  if (Array.isArray(font.subsets) && !font.subsets.includes(subset)) {
    return { ok: false, code: "fonts.unsupportedSubset", params: { subset } };
  }
  if (Array.isArray(font.weights) && font.weights.length > 0 && !font.weights.includes(Number(weight))) {
    return { ok: false, code: "fonts.unsupportedWeight", params: { weight } };
  }
  if (Array.isArray(font.styles) && font.styles.length > 0 && !font.styles.includes(style)) {
    return { ok: false, code: "fonts.unsupportedStyle", params: { style } };
  }

  const url = fontConfig.urlTemplate
    .replace("{base}", fontConfig.cdnBase)
    .replace("{id}", font.id)
    .replace("{version}", String(font.version))
    .replace("{subset}", subset)
    .replace("{weight}", String(weight))
    .replace("{style}", style);

  return { ok: true, url, subset, weight: Number(weight), style };
}

/** Font entries in the curated short list order (spec 7.1, R142). */
export function shortList(catalog) {
  if (!catalog || !Array.isArray(catalog.fonts)) return [];
  const order = Array.isArray(catalog.shortList) ? catalog.shortList : [];
  const byId = new Map(catalog.fonts.map((font) => [font.id, font]));
  return order.map((id) => byId.get(id)).filter(Boolean);
}

export function findFont(catalog, id) {
  if (!catalog || !Array.isArray(catalog.fonts)) return null;
  return catalog.fonts.find((font) => font.id === id) ?? null;
}

/** Filter the catalogue by free text (family or id) and by category. */
export function filterCatalog(catalog, { query = "", category = null } = {}) {
  if (!catalog || !Array.isArray(catalog.fonts)) return [];
  const needle = query.trim().toLowerCase();
  return catalog.fonts.filter((font) => {
    if (category && font.category !== category) return false;
    if (!needle) return true;
    return font.family.toLowerCase().includes(needle) || font.id.includes(needle);
  });
}

/** Subset fallback order (spec 7.1, R90): latin first, then latin-ext. */
export function subsetOrder(font) {
  const available = Array.isArray(font?.subsets) ? font.subsets : [];
  return fontConfig.subsets.filter((subset) => available.includes(subset));
}

export function categories(catalog) {
  if (!catalog || !Array.isArray(catalog.fonts)) return [];
  return [...new Set(catalog.fonts.map((font) => font.category))].sort();
}
