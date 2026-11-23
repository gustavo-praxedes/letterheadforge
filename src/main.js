import { strings, warningText } from "./strings.pt-BR.js";
import { defaultPreset } from "./core/schema.js";
import { validatePreset } from "./core/validate.js";
import { layoutSheet } from "./core/layout.js";
import { createStore } from "./store/state.js";
import { renderPanels } from "./ui/panels.js";
import { renderLayers } from "./ui/layers.js";
import { mountCanvas } from "./ui/canvas.js";
import { createMeasure } from "./fonts/measure.js";
import { fontLoader } from "./fonts/loader.js";
import { findFont } from "./fonts/catalog.js";
import { installShortcuts } from "./ui/shortcuts.js";
import { createToasts } from "./ui/toasts.js";
import { createDb } from "./store/db.js";
import { createAutosave } from "./store/autosave.js";
import { addImage, fitImageInPage, validateImageFile } from "./ui/objects.js";
import { limits } from "./config.js";
import { buildScene } from "./core/scene.js";
import { downloadPdf, startExport } from "./pdf/export.js";
import { fontKey } from "./pdf/validate.js";

const store = createStore(defaultPreset());
const measure = createMeasure();
const view = { mode: "page" };
let toasts = null;
let db = null;
/** Running export job (spec 8.2): kept so the cancel button can terminate it. */
let exportJob = null;
let fontCatalog = null;
/** imageId -> object URL, so the renderer can point an <image> at the bytes. */
const imageUrls = new Map();
/** Palette (data/palette.json) and the last colours, kept in IndexedDB settings. */
let palette = [];
let recentColors = [];

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

function setText(id, text) {
  el(id).textContent = text;
}

function renderHeader() {
  setText("app-title", strings.app.name);
  setText("app-tagline", strings.app.tagline);
  const presetButton = el("preset-menu");
  presetButton.textContent = strings.header.presets;
  const exportButton = el("export-pdf");
  exportButton.textContent = strings.header.exportPdf;
  exportButton.title = strings.header.exportPdf;
  const cancelButton = el("export-cancel");
  cancelButton.textContent = strings.header.exportCancel;
  cancelButton.addEventListener("click", () => {
    exportJob?.cancel();
  });
  document.title = `${strings.app.name} — ${strings.app.tagline}`;
}

function renderPreviewToolbar() {
  const host = el("preview-mode");
  host.setAttribute("aria-label", strings.preview.ariaLabel);
  const buttons = [
    { mode: "page", label: strings.preview.modes.page },
    { mode: "sheet", label: strings.preview.modes.sheet },
  ].map(({ mode, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.dataset.mode = mode;
    button.textContent = label;
    button.setAttribute("aria-pressed", String(view.mode === mode));
    button.addEventListener("click", () => {
      view.mode = mode;
      renderPreviewToolbar();
      renderPreview();
    });
    return button;
  });
  host.replaceChildren(...buttons);
}

let canvas = null;

/**
 * Warnings raised by the core used to die inside buildScene: the user never saw
 * "texto cortado" or "sem marca de corte". They now show under the preview.
 */
function renderWarnings(list) {
  const host = document.getElementById("preview-warnings");
  if (!host) return;
  const seen = new Set();
  const items = [];
  for (const warning of list ?? []) {
    const key = `${warning.code}|${JSON.stringify(warning.params ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = warningText(warning.code, warning.params ?? {});
    if (!text) continue;
    const item = document.createElement("li");
    item.className = "preview__warning";
    item.dataset.code = warning.code;
    item.textContent = text;
    items.push(item);
  }
  host.replaceChildren(...items);
  host.toggleAttribute("data-empty", items.length === 0);
}

function renderPreview() {
  const stage = el("preview-stage");
  stage.setAttribute("aria-label", strings.preview.ariaLabel);
  const preset = store.getPreset();
  const layout = layoutSheet(preset.page.size, preset.page.orientation);
  if (!layout.ok) {
    setText("preview-status", strings.warnings.catalog["invalid.contentArea"]);
    stage.replaceChildren();
    return;
  }
  const started = performance.now();
  if (!canvas) {
    canvas = mountCanvas(stage, {
      store,
      measure,
      mode: view.mode,
      onSelect: () => {},
      images: imageUrls,
      onWarnings: (list) => renderWarnings(list),
    });
  } else {
    canvas.setMode(view.mode);
    canvas.refresh();
  }
  const elapsed = performance.now() - started;
  setText("preview-status", `${strings.preview.statusReady} · ${elapsed.toFixed(0)} ms`);
}

function renderHint() {
  setText("preview-hint", strings.preview.hint);
}

/**
 * Export (spec 8.2): validates, loads the fonts the scene actually uses, reads
 * the image bytes from IndexedDB and hands everything to the PDF worker.
 */
async function runExport() {
  if (exportJob) return;
  const button = el("export-pdf");
  const cancel = el("export-cancel");
  const preset = store.getPreset();
  const layout = layoutSheet(preset.page.size, preset.page.orientation);
  if (!layout.ok) {
    toasts?.error(warningText("invalid.contentArea"));
    return;
  }

  const scene = buildScene({ preset, layout, mode: "sheet", measure, alphaMasks: new Map() });
  const fonts = await loadSceneFonts(scene);
  if (!fonts) return; // a falta de fonte já foi avisada

  const images = await loadSceneImages(scene);
  const setBusy = (busy, label = "") => {
    button.disabled = busy;
    button.textContent = busy ? label : strings.header.exportPdf;
    button.setAttribute("aria-busy", busy ? "true" : "false");
    cancel.hidden = !busy;
  };

  exportJob = startExport({
    scene,
    preset,
    fonts,
    images,
    version: "0.1.0",
    validatePreset,
    limits,
    workerFactory: () => new Worker(new URL("./pdf/worker.js", import.meta.url), { type: "module" }),
    onProgress: ({ label, index, total }) => {
      const percent = total > 0 ? Math.round((index / total) * 100) : 0;
      setBusy(true, `${label} ${percent}%`);
    },
    onDone: (bytes, name) => {
      const written = downloadPdf(bytes, name);
      toasts?.success(strings.header.exported.replace("{size}", String(Math.max(1, Math.round(written.size / 1024)))));
      setBusy(false);
      exportJob = null;
    },
    onError: (error) => {
      setBusy(false);
      exportJob = null;
      if (error.code === "export.cancelled") {
        toasts?.warning(strings.header.exportCancelled);
        return;
      }
      toasts?.error(warningText(error.code, error.params));
    },
  });
  await exportJob.promise;
}

/** Fonts referenced by the scene, loaded as raw buffers for the PDF worker. */
async function loadSceneFonts(scene) {
  const keys = new Set();
  const walk = (primitives) => {
    for (const primitive of primitives ?? []) {
      if (primitive?.kind === "text") keys.add(fontKey(primitive));
      walk(primitive?.children);
    }
  };
  walk(scene.primitives);
  if (keys.size === 0) return new Map();

  const catalog = await loadCatalog();
  const fonts = new Map();
  for (const key of keys) {
    const [fontId, weightText, style] = key.split(":");
    const font = catalog ? findFont(catalog, fontId) : null;
    if (!font) {
      toasts?.error(warningText("font.loadFailed"));
      return null;
    }
    const loaded = await fontLoader.loadBuffer(font, {
      subset: "latin",
      weight: Number(weightText) || 400,
      italic: style === "italic",
    });
    if (!loaded.ok) {
      toasts?.error(warningText(loaded.code ?? "font.loadFailed", loaded.params));
      return null;
    }
    fonts.set(key, { bytes: loaded.buffer });
  }
  return fonts;
}

async function loadCatalog() {
  if (fontCatalog) return fontCatalog;
  try {
    const response = await fetch("data/fonts.json", { cache: "no-cache" });
    if (!response.ok) return null;
    fontCatalog = await response.json();
    return fontCatalog;
  } catch {
    return null;
  }
}

/** Image bytes for the scene, straight from IndexedDB (R47: no recompression). */
async function loadSceneImages(scene) {
  const ids = new Set();
  const walk = (primitives) => {
    for (const primitive of primitives ?? []) {
      if (primitive?.kind === "image" && primitive.imageId) ids.add(primitive.imageId);
      walk(primitive?.children);
    }
  };
  walk(scene.primitives);
  const images = new Map();
  if (!db) return images;
  for (const id of ids) {
    const record = await db.getImage(id).catch(() => null);
    // The store keeps a Blob; the PDF needs the bytes themselves. `record.bytes`
    // is the size in bytes, not the payload.
    if (!record?.blob) continue;
    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    images.set(id, { bytes, type: record.type ?? record.blob.type ?? "image/png" });
  }
  return images;
}

async function restoreColors() {
  try {
    const response = await fetch("data/palette.json", { cache: "no-cache" });
    if (response.ok) {
      const data = await response.json();
      palette = Array.isArray(data.groups) ? data.groups : [];
    }
  } catch {
    palette = [];
  }
  if (!db) return;
  const saved = await db.getSetting("recentColors").catch(() => null);
  if (Array.isArray(saved)) recentColors = saved.slice(0, 8);
}

function rememberRecent(list) {
  recentColors = Array.isArray(list) ? list.slice(0, 8) : [];
  if (db) void db.setSetting("recentColors", recentColors).catch(() => {});
}

async function restoreSession() {
  try {
    db = createDb();
    await db.open();
  } catch {
    toasts?.warning(strings.header.storageUnavailable);
    return null;
  }

  try {
    const draft = await db.loadDraft();
    if (draft?.preset) {
      store.replace(draft.preset);
      if (draft.selectionId) store.select(draft.selectionId);
    }
    await restoreImageUrls();
    await restoreColors();
    // Templates are read-only (spec 9.2): re-seed whenever the shipped set
    // changes, not only when the store happens to be empty.
    const installed = await db.loadTemplates();
    const response = await fetch("data/templates.json", { cache: "no-cache" });
    if (response.ok) {
      const shipped = await response.json();
      const installedIds = (installed ?? []).map((record) => record.id).sort().join(",");
      const shippedIds = (shipped ?? []).map((record) => record.id).sort().join(",");
      if (installedIds !== shippedIds) await db.saveTemplates(shipped);
    }
  } catch {
    toasts?.warning(strings.header.storageUnavailable);
  }

  /** Bytes live in IndexedDB; the renderer needs object URLs again after a reload. */
async function restoreImageUrls() {
  if (!db) return;
  const preset = store.getPreset();
  const ids = new Set();
  for (const object of preset.objects ?? []) {
    if (object.type === "image" && object.imageId) ids.add(object.imageId);
  }
  if (preset.watermark?.kind === "image" && preset.watermark.imageId) ids.add(preset.watermark.imageId);
  for (const id of ids) {
    if (imageUrls.has(id)) continue;
    const record = await db.getImage(id).catch(() => null);
    if (record?.blob) imageUrls.set(id, URL.createObjectURL(record.blob));
  }
}

createAutosave({
    db,
    store,
    onError: (error) => {
      if (error?.code === "storage.quota") toasts?.error(warningText("storage.quota"));
      else toasts?.warning(strings.header.storageUnavailable);
    },
  });
  return db;
}

async function preloadDefaultFont() {
  try {
    const response = await fetch("data/fonts.json", { cache: "no-cache" });
    if (!response.ok) return;
    const catalog = await response.json();
    const font = findFont(catalog, store.getPreset().objects?.[0]?.fontId ?? "inter");
    if (!font) return;
    for (const weight of [400, 700]) {
      await fontLoader.loadFace(font, { subset: "latin", weight });
    }
    measure.clear();
    if (canvas) canvas.refresh();
  } catch {
    // no network or no manifest: the preview falls back to a system font
  }
}

/**
 * Image import (spec 5.2). The object is only created after the file passes the
 * limits — an image object without bytes would be an invisible ghost.
 */
function requestImage() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  document.body.append(input);
  input.addEventListener("change", async () => {
    const file = input.files?.[0] ?? null;
    input.remove();
    if (!file) return;
    await importImageFile(file);
  });
  input.click();
}

/**
 * "image.dimensions" is an error *with an action* in the spec: offer to resample
 * instead of just refusing the file.
 */
function askResample(width, height) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog dialog--confirm";

    const title = document.createElement("h2");
    title.className = "dialog__title";
    title.textContent = strings.images.resample.title;

    const body = document.createElement("p");
    body.className = "dialog__hint";
    body.textContent = strings.images.resample.message
      .replace("{width}", String(width))
      .replace("{height}", String(height))
      .replace("{max}", String(limits.image.maxSidePx));

    const actions = document.createElement("div");
    actions.className = "dialog__actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button";
    cancel.textContent = strings.images.resample.cancel;
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "button button--primary";
    confirm.textContent = strings.images.resample.confirm;

    const finish = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => finish(false));
    confirm.addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", () => finish(false));

    actions.append(cancel, confirm);
    dialog.append(title, body, actions);
    document.body.append(dialog);
    dialog.showModal();
    confirm.focus();
  });
}

/** Redraws the image inside `maxSide` and returns a PNG blob. */
async function downscaleImage(bitmap, maxSide) {
  const scale = maxSide / Math.max(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvasElement = document.createElement("canvas");
  canvasElement.width = width;
  canvasElement.height = height;
  const context = canvasElement.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvasElement.toBlob((blob) => resolve(blob), "image/png"));
}

async function importImageFile(file) {
  try {
    let source = file;
    let bitmap = await createImageBitmap(file);
    let precheck = validateImageFile({ bytes: file.size, width: bitmap.width, height: bitmap.height });
    if (!precheck.ok && precheck.code === "image.dimensions") {
      const accepted = await askResample(bitmap.width, bitmap.height);
      bitmap.close?.();
      if (!accepted) return;
      const reduced = await downscaleImage(await createImageBitmap(file), limits.image.maxSidePx);
      if (!reduced) {
        toasts?.error(warningText("image.dimensions", { maxSidePx: limits.image.maxSidePx }));
        return;
      }
      source = reduced;
      bitmap = await createImageBitmap(reduced);
      precheck = validateImageFile({ bytes: reduced.size, width: bitmap.width, height: bitmap.height });
      if (!precheck.ok) {
        toasts?.warning(warningText(precheck.code, precheck.params));
        bitmap.close?.();
        return;
      }
    } else if (!precheck.ok) {
      toasts?.warning(warningText(precheck.code, precheck.params));
      bitmap.close?.();
      return;
    }
    const preset = store.getPreset();
    const content = layoutSheet(preset.page.size, preset.page.orientation);
    const cell = content.ok ? content.cells[0] : { w: 210, h: 297 };
    const box = fitImageInPage({
      pageWidthMm: cell.w,
      pageHeightMm: cell.h,
      margins: preset.page.margins,
      pixelWidth: bitmap.width,
      pixelHeight: bitmap.height,
    });
    if (!box.ok) {
      toasts?.warning(warningText(box.code));
      bitmap.close?.();
      return;
    }
    const width = box.w;
    const height = box.h;

    const check = validateImageFile({ bytes: source.size, width: bitmap.width, height: bitmap.height, widthMm: width, heightMm: height });
    if (!check.ok) {
      toasts?.warning(warningText(check.code, check.params));
      bitmap.close?.();
      return;
    }

    const imageId = `img-${crypto.randomUUID()}`;
    const base = store.getPreset();
    const result = addImage(base, { imageId, w: box.w, h: box.h, x: box.x, y: box.y });
    if (!result.ok) {
      toasts?.warning(warningText(result.code));
      return;
    }

    imageUrls.set(imageId, URL.createObjectURL(source));
    store.replace(result.preset);
    store.select(result.id);
    if (db) await db.putImage(imageId, source, { bytes: source.size, width: bitmap.width, height: bitmap.height, type: source.type }).catch(() => {});
    canvas?.refresh();
    toasts?.success(strings.objects.imported.replace("{name}", file.name));
  } catch {
    toasts?.warning(warningText("image.invalidFile"));
  }
}

/** Ctrl+S: saves the current preset in IndexedDB under the next free name. */
async function savePresetShortcut() {
  if (!db) {
    toasts?.warning(strings.header.storageUnavailable);
    return;
  }
  try {
    const existing = await db.listPresets();
    if (existing.length >= limits.presetsMax) {
      toasts?.warning(warningText("preset.limit"));
      return;
    }
    const names = new Set(existing.map((record) => record.name.toLocaleLowerCase()));
    let index = existing.length + 1;
    while (names.has(`preset ${index}`)) index += 1;
    await db.savePreset(`Preset ${index}`, store.getPreset());
    toasts?.success(strings.header.presetSaved.replace("{name}", `Preset ${index}`));
  } catch (error) {
    toasts?.warning(warningText(error?.code ?? "preset.invalid"));
  }
}

function buildHelpDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "dialog dialog--shortcuts";
  dialog.id = "shortcuts-dialog";

  const title = document.createElement("h2");
  title.className = "dialog__title";
  title.textContent = strings.shortcuts.title;

  const hint = document.createElement("p");
  hint.className = "dialog__hint";
  hint.textContent = strings.shortcuts.hint;

  const body = document.createElement("div");
  body.className = "dialog__groups";
  for (const group of strings.shortcuts.groups) {
    const section = document.createElement("section");
    section.className = "dialog__group";
    const heading = document.createElement("h3");
    heading.className = "dialog__group-title";
    heading.textContent = group.title;
    const list = document.createElement("dl");
    list.className = "dialog__list";
    for (const row of group.rows) {
      const key = document.createElement("dt");
      key.className = "dialog__key";
      key.textContent = row.keys;
      const label = document.createElement("dd");
      label.className = "dialog__label";
      label.textContent = row.label;
      list.append(key, label);
    }
    section.append(heading, list);
    body.append(section);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "button dialog__close";
  close.textContent = strings.shortcuts.close;
  close.addEventListener("click", () => dialog.close());

  dialog.append(title, hint, body, close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

function main() {
  toasts = createToasts(document.body);
  const help = buildHelpDialog();
  installShortcuts(window, {
    store,
    onHelp: () => help.showModal(),
    onSave: () => void savePresetShortcut(),
  });
  renderHeader();
  renderPreviewToolbar();
  renderHint();
  renderPanels(el("panels"), {
    store,
    onChange: () => renderPreview(),
    onRequestImage: () => requestImage(),
    colors: {
      recents: () => recentColors,
      palette: () => palette,
      onRecent: (list) => rememberRecent(list),
    },
  });
  renderLayers(el("panels"), {
    store,
    getLayout: () => layoutSheet(store.getPreset().page.size, store.getPreset().page.orientation),
    onChanged: () => renderPreview(),
  });
  el("export-pdf").addEventListener("click", () => void runExport());
  renderPreview();
  void preloadDefaultFont();
  void restoreSession().then(() => renderPreview());
}

main();

export { main, store, view };
