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

const store = createStore(defaultPreset());
const measure = createMeasure();
const view = { mode: "page" };

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
    canvas = mountCanvas(stage, { store, measure, onSelect: () => {} });
  } else {
    canvas.refresh();
  }
  const elapsed = performance.now() - started;
  setText("preview-status", `${strings.preview.statusReady} · ${elapsed.toFixed(0)} ms`);
}

function renderHint() {
  setText("preview-hint", strings.preview.hint);
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

function main() {
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
}

main();

export { main, store, view };
