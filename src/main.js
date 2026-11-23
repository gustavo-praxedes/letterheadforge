import { strings } from "./strings.pt-BR.js";
import { defaultPreset } from "./core/schema.js";
import { layoutSheet } from "./core/layout.js";
import { buildScene } from "./core/scene.js";
import { mountScene } from "./render/render-svg.js";

const state = {
  preset: defaultPreset(),
  mode: "page",
};

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

function renderPanels() {
  const host = el("panels");
  host.setAttribute("aria-label", strings.panels.ariaLabel);
  const sections = Object.entries(strings.panels.sections);
  const nodes = sections.map(([key, label], index) => {
    const panel = document.createElement("details");
    panel.className = "panel";
    panel.dataset.section = key;
    if (index === 0) panel.open = true;

    const summary = document.createElement("summary");
    summary.className = "panel__summary";
    const title = document.createElement("span");
    title.textContent = label;
    const chevron = document.createElement("span");
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    summary.append(title, chevron);

    const body = document.createElement("div");
    body.className = "panel__body";
    body.textContent = strings.panels.placeholder;

    panel.append(summary, body);
    return panel;
  });
  host.replaceChildren(...nodes);
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
    button.setAttribute("aria-pressed", String(state.mode === mode));
    button.addEventListener("click", () => {
      state.mode = mode;
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
  const layout = layoutSheet(state.preset.page.size, state.preset.page.orientation);
  if (!layout.ok) {
    setText("preview-status", strings.warnings.catalog["invalid.contentArea"]);
    stage.replaceChildren();
    return;
  }
  const started = performance.now();
  const scene = buildScene({ preset: state.preset, layout, mode: state.mode });
  mountScene(stage, scene, { label: strings.preview.ariaLabel });
  const elapsed = performance.now() - started;
  setText("preview-status", `${strings.preview.statusReady} · ${elapsed.toFixed(0)} ms`);
}

function renderHint() {
  setText("preview-hint", strings.preview.hint);
}

function main() {
  renderHeader();
  renderPanels();
  renderPreviewToolbar();
  renderHint();
  renderPreview();
}

main();

export { main, state };
