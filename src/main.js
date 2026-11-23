import { strings, warningText } from "./strings.pt-BR.js";
import { defaultPreset } from "./core/schema.js";
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

const store = createStore(defaultPreset());
const measure = createMeasure();
const view = { mode: "page" };
let toasts = null;
let db = null;
/** imageId -> object URL, so the renderer can point an <image> at the bytes. */
const imageUrls = new Map();

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
  exportButton.title = strings.header.exportPending;
  exportButton.setAttribute("aria-description", strings.header.exportPending);
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
    canvas = mountCanvas(stage, { store, measure, mode: view.mode, onSelect: () => {}, images: imageUrls });
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
    const templates = await db.loadTemplates();
    if (!templates || templates.length === 0) {
      const response = await fetch("data/templates.json", { cache: "no-cache" });
      if (response.ok) await db.saveTemplates(await response.json());
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

createAutosave({ db, store });
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

async function importImageFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
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

    const check = validateImageFile({ bytes: file.size, width: bitmap.width, height: bitmap.height, widthMm: width, heightMm: height });
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

    imageUrls.set(imageId, URL.createObjectURL(file));
    store.replace(result.preset);
    store.select(result.id);
    if (db) await db.putImage(imageId, file, { bytes: file.size, width: bitmap.width, height: bitmap.height, type: file.type }).catch(() => {});
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
  renderPanels(el("panels"), { store, onChange: () => renderPreview(), onRequestImage: () => requestImage() });
  renderLayers(el("panels"), {
    store,
    getLayout: () => layoutSheet(store.getPreset().page.size, store.getPreset().page.orientation),
    onChanged: () => renderPreview(),
  });
  renderPreview();
  void preloadDefaultFont();
  void restoreSession().then(() => renderPreview());
}

main();

export { main, store, view };
