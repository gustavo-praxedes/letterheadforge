import { enums, schemaVersion } from "../config.js";

export const SCHEMA_VERSION = schemaVersion;

let fallbackCounter = 0;

/**
 * UUID v4 generator. Uses the platform crypto when available and falls back to a
 * deterministic, monotonic identifier in bare Node contexts.
 */
export function uuid() {
  const platformCrypto = globalThis.crypto;
  if (platformCrypto && typeof platformCrypto.randomUUID === "function") {
    return platformCrypto.randomUUID();
  }
  fallbackCounter += 1;
  const tail = String(fallbackCounter).padStart(12, "0");
  return `00000000-0000-4000-8000-${tail}`;
}

/**
 * Initial configuration from spec section 2.1, except `id`, which is generated.
 */
export function defaultPreset() {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uuid(),
    name: "Meu papel timbrado",
    page: {
      size: "A4",
      orientation: "portrait",
      color: "#FFFFFF",
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
    },
    frame: {
      enabled: true,
      color: "#3A3A3AFF",
      thickness: 0.5,
      style: "solid",
      doubleGap: 1.0,
      cornerRadius: 5,
    },
    ruling: {
      enabled: true,
      type: "lines",
      color: "#C8C8C8FF",
      thickness: 0.25,
      style: "solid",
      dotRadius: 0.3,
      insets: { top: 5, right: 5, bottom: 5, left: 5 },
      objectDistance: 5,
      x: { mode: "spacing", spacing: 8, count: 20 },
      y: { mode: "spacing", spacing: 8, count: 30 },
    },
    watermark: {
      enabled: false,
      kind: "text",
      text: {
        content: "",
        fontId: "inter",
        weight: 400,
        italic: false,
        sizePt: 48,
        color: "#000000",
        align: "center",
        lineHeight: 1.2,
      },
      imageId: null,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      opacity: 0.15,
    },
    objects: [],
  };
}

/**
 * Build a preset from the defaults with optional overrides.
 * Nested sections (`page`, `frame`, `ruling`, `watermark`) are merged one level deep.
 */
export function createPreset(overrides = {}) {
  const base = defaultPreset();
  const merged = { ...base, ...overrides };
  for (const section of ["page", "frame", "ruling", "watermark"]) {
    if (overrides[section] && typeof overrides[section] === "object") {
      merged[section] = { ...base[section], ...overrides[section] };
    }
  }
  return merged;
}

export function createImageObject(props = {}) {
  return {
    id: uuid(),
    type: "image",
    name: "Imagem",
    x: 20,
    y: 20,
    w: 60,
    h: 40,
    rotation: 0,
    visible: true,
    locked: false,
    imageId: null,
    opacity: 1,
    aspectLocked: true,
    ...props,
  };
}

export function createTextObject(props = {}) {
  return {
    id: uuid(),
    type: "text",
    name: "Texto",
    x: 20,
    y: 250,
    w: 80,
    h: 20,
    rotation: 0,
    visible: true,
    locked: false,
    text: "",
    fontId: "inter",
    weight: 400,
    italic: false,
    sizePt: 10,
    color: "#222222",
    align: "left",
    lineHeight: 1.3,
    background: "#FFFFFF00",
    border: { color: "#000000FF", thickness: 0 },
    padding: 2,
    ...props,
  };
}

/**
 * Create an object of the given type. Unknown types are a programming error.
 */
export function createObject(type, props = {}) {
  if (type === "image") return createImageObject(props);
  if (type === "text") return createTextObject(props);
  throw new TypeError(`Unknown object type: ${String(type)}`);
}

/** Shallow structural check, without validating any limit. */
export function isPresetShape(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (typeof value.schemaVersion !== "number") return false;
  const page = value.page;
  if (page === null || typeof page !== "object" || Array.isArray(page)) return false;
  if (typeof page.size !== "string" || !enums.pageSizes.includes(page.size)) return false;
  if (typeof page.orientation !== "string" || !enums.orientations.includes(page.orientation)) return false;
  if (value.objects !== undefined && !Array.isArray(value.objects)) return false;
  return true;
}
