import { hsvToRgb, parseHex, pushRecent, rgbToHsv, toHex } from "./color.js";
import { strings } from "../strings.pt-BR.js";

/**
 * Colour picker popover (spec 6, task 04.01.08): saturation/value square, hue and
 * alpha sliders, HEX input, recent colours and the eyedropper when available.
 *
 * The maths lives in color.js; this file only builds DOM and emits `onChange`
 * with a `#RRGGBBAA` string on every interaction (tagging is the caller's job).
 */

const RECENT_LIMIT = 8;

export function createColorPicker({ value = "#FFFFFFFF", onChange = () => {}, onClose = () => {}, recents = [], palette = [], onRecent = null } = {}) {
  // recents arrive persisted (spec 6: last 8 colours, kept in the browser)
  const recent = Array.isArray(recents) ? [...recents].slice(0, RECENT_LIMIT) : [];
  const parsed = parseHex(value);
  let alpha = parsed.a === undefined ? 1 : Math.round(parsed.a * 100) / 100;
  let hsv = parsed.ok ? rgbToHsv(parsed) : { h: 0, s: 0, v: 0 };

  const root = document.createElement("div");
  root.className = "color-picker";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", strings.picker.title);

  const preview = document.createElement("div");
  preview.className = "color-picker__preview";
  const previewChip = document.createElement("span");
  previewChip.className = "color-picker__preview-chip";
  // the hex has its own field below: repeating it here wasted vertical space
  preview.append(previewChip);

  const sv = document.createElement("div");
  sv.className = "color-picker__sv";
  sv.setAttribute("role", "slider");
  sv.setAttribute("aria-label", strings.picker.saturation);
  sv.setAttribute("tabindex", "0");
  sv.setAttribute("aria-valuemin", "0");
  sv.setAttribute("aria-valuemax", "100");

  const svHandle = document.createElement("span");
  svHandle.className = "color-picker__handle";
  sv.append(svHandle);

  const hue = document.createElement("input");
  hue.type = "range";
  hue.min = "0";
  hue.max = "360";
  hue.step = "1";
  hue.className = "color-picker__hue";
  hue.setAttribute("aria-label", strings.picker.hue);

  const alphaInput = document.createElement("input");
  alphaInput.type = "range";
  alphaInput.min = "0";
  alphaInput.max = "100";
  alphaInput.step = "1";
  alphaInput.className = "color-picker__alpha";
  alphaInput.setAttribute("aria-label", strings.picker.alpha);

  const hexLabel = document.createElement("label");
  hexLabel.className = "color-picker__hex-field";
  const hexText = document.createElement("span");
  hexText.className = "color-picker__hex-label";
  hexText.textContent = strings.picker.hex;
  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "color-picker__hex";
  hexInput.spellcheck = false;
  hexInput.setAttribute("aria-label", strings.picker.hex);
  hexLabel.append(hexText, hexInput);

  const recentBox = document.createElement("div");
  recentBox.className = "color-picker__recent";
  recentBox.setAttribute("aria-label", strings.picker.recent);

  const paletteBox = document.createElement("div");
  paletteBox.className = "color-picker__palette";
  for (const group of Array.isArray(palette) ? palette : []) {
    const rows = document.createElement("div");
    rows.className = "color-picker__palette-group";
    const title = document.createElement("span");
    title.className = "color-picker__palette-title";
    title.textContent = group.title ?? "";
    const swatches = document.createElement("div");
    swatches.className = "color-picker__swatches";
    renderSwatches(swatches, group.colors ?? [], (hex) => {
      applyHex(hex);
      commitRecent();
    });
    rows.append(title, swatches);
    paletteBox.append(rows);
  }
  paletteBox.hidden = paletteBox.childElementCount === 0;

  const actions = document.createElement("div");
  actions.className = "color-picker__actions";
  const eyedropperButton = document.createElement("button");
  eyedropperButton.type = "button";
  eyedropperButton.className = "button";
  eyedropperButton.textContent = strings.picker.eyedropper;
  eyedropperButton.hidden = typeof EyeDropper !== "function";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "button button--primary";
  closeButton.textContent = strings.picker.close;
  actions.append(eyedropperButton, closeButton);

  root.append(preview, sv, hue, alphaInput, hexLabel, paletteBox, recentBox, actions);

  /** Colour swatches for the palette and for the recent list. */
  function renderSwatches(container, colors, onPick) {
    container.replaceChildren();
    for (const color of colors) {
      if (typeof color !== "string") continue;
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-picker__swatch";
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      swatch.setAttribute("aria-label", color);
      swatch.title = color;
      swatch.addEventListener("click", () => onPick(color));
      container.append(swatch);
    }
  }

  function currentHex() {
    const rgb = hsvToRgb(hsv);
    return alpha >= 0.999 ? toHex(rgb) : toHex({ ...rgb, a: alpha }, { alpha: true });
  }

  function emit({ notify = true } = {}) {
    const hex = currentHex();
    hexInput.value = hex;
    // the chip carries the colour; the hex sits beside it in normal text colour,
    // so white on white can never happen
    previewChip.style.backgroundColor = hex;
    sv.style.setProperty("--picker-hue", `hsl(${hsv.h} 100% 50%)`);
    svHandle.style.left = `${hsv.s * 100}%`;
    svHandle.style.top = `${(1 - hsv.v) * 100}%`;
    hue.value = String(Math.round(hsv.h));
    alphaInput.value = String(Math.round(alpha * 100));
    alphaInput.style.setProperty("--picker-alpha-color", toHex(hsvToRgb(hsv)));
    if (notify) onChange(hex);
  }

  function applyHex(text, { notify = true } = {}) {
    const next = parseHex(text);
    if (!next.ok) return false;
    hsv = rgbToHsv(next);
    alpha = next.a === undefined ? alpha : Math.round(next.a * 100) / 100;
    emit({ notify });
    return true;
  }

  function pickAt(event) {
    const rect = sv.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
    hsv = { ...hsv, s: rect.width === 0 ? 0 : x / rect.width, v: rect.height === 0 ? 1 : 1 - y / rect.height };
    emit();
  }

  let dragging = false;
  sv.addEventListener("pointerdown", (event) => {
    dragging = true;
    sv.setPointerCapture(event.pointerId);
    pickAt(event);
  });
  sv.addEventListener("pointermove", (event) => {
    if (dragging) pickAt(event);
  });
  sv.addEventListener("pointerup", (event) => {
    dragging = false;
    sv.releasePointerCapture(event.pointerId);
    commitRecent();
  });
  sv.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft") hsv = { ...hsv, s: Math.max(0, hsv.s - step) };
    else if (event.key === "ArrowRight") hsv = { ...hsv, s: Math.min(1, hsv.s + step) };
    else if (event.key === "ArrowUp") hsv = { ...hsv, v: Math.min(1, hsv.v + step) };
    else if (event.key === "ArrowDown") hsv = { ...hsv, v: Math.max(0, hsv.v - step) };
    else return;
    event.preventDefault();
    emit();
    commitRecent();
  });

  hue.addEventListener("input", () => {
    hsv = { ...hsv, h: Number(hue.value) };
    emit();
  });
  hue.addEventListener("change", commitRecent);

  alphaInput.addEventListener("input", () => {
    alpha = Number(alphaInput.value) / 100;
    emit();
  });
  alphaInput.addEventListener("change", commitRecent);

  hexInput.addEventListener("change", () => {
    if (!applyHex(hexInput.value)) {
      hexInput.value = currentHex();
      hexInput.setAttribute("aria-invalid", "true");
    } else {
      hexInput.removeAttribute("aria-invalid");
      commitRecent();
    }
  });

  function commitRecent() {
    const hex = currentHex();
    const next = pushRecent(recent, hex.slice(0, 7), { limit: RECENT_LIMIT });
    if (typeof onRecent === "function") onRecent(next);
    recent.length = 0;
    recent.push(...next);
    renderRecent();
  }

  function renderRecent() {
    const nodes = [];
    if (recent.length > 0) {
      const title = document.createElement("span");
      title.className = "color-picker__palette-title";
      title.textContent = strings.picker.recent;
      nodes.push(title);
    }
    recentBox.replaceChildren(
      ...nodes,
      ...recent.map((color) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "color-picker__recent-item";
        swatch.style.background = color;
        swatch.setAttribute("aria-label", color);
        swatch.addEventListener("click", () => {
          applyHex(color);
          commitRecent();
        });
        return swatch;
      }),
    );
  }

  eyedropperButton.addEventListener("click", async () => {
    try {
      const result = await new EyeDropper().open();
      applyHex(result.sRGBHex);
      commitRecent();
    } catch {
      /* the person cancelled the eyedropper: nothing to do */
    }
  });

  closeButton.addEventListener("click", () => onClose());
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  });

  renderRecent();
  emit({ notify: false });

  return {
    node: root,
    setValue(next) {
      applyHex(next, { notify: false });
    },
    getValue: currentHex,
    destroy() {
      root.remove();
    },
  };
}
