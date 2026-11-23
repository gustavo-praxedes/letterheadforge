import { strings } from "./strings.pt-BR.js";
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

const store = createStore(defaultPreset());
const measure = createMeasure();
const view = { mode: "page" };
let toasts = null;

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
    canvas = mountCanvas(stage, { store, measure, mode: view.mode, onSelect: () => {} });
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
  let db;
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
    const templates = await db.loadTemplates();
    if (!templates || templates.length === 0) {
      const response = await fetch("data/templates.json", { cache: "no-cache" });
      if (response.ok) await db.saveTemplates(await response.json());
    }
  } catch {
    toasts?.warning(strings.header.storageUnavailable);
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
    onSave: () => toasts.info(strings.header.exportPending),
  });
  renderHeader();
  renderPreviewToolbar();
  renderHint();
  renderPanels(el("panels"), { store, onChange: () => renderPreview() });
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
