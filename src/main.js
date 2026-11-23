import { strings } from "./strings.pt-BR.js";
import { defaultPreset } from "./core/schema.js";
import { layoutSheet } from "./core/layout.js";
import { buildScene } from "./core/scene.js";
import { mountScene } from "./render/render-svg.js";
import { createStore } from "./store/state.js";
import { renderPanels } from "./ui/panels.js";
import { renderLayers } from "./ui/layers.js";

const store = createStore(defaultPreset());
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
  const scene = buildScene({ preset, layout, mode: view.mode });
  mountScene(stage, scene, { label: strings.preview.ariaLabel });
  const elapsed = performance.now() - started;
  setText("preview-status", `${strings.preview.statusReady} · ${elapsed.toFixed(0)} ms`);
}

function renderHint() {
  setText("preview-hint", strings.preview.hint);
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
}

main();

export { main, store, view };
