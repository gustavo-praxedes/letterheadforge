/**
 * Configuration panels for the sheet, the margins, the ruling and the frame
 * (spec 10.1).
 *
 * Two layers, deliberately separated:
 *  - pure descriptors (`pageSection`, `marginsSection`, `rulingSection`,
 *    `frameSection`): plain data, no DOM, testable in Node. Limits come from
 *    config.js, labels from strings.pt-BR.js and values from the preset.
 *  - DOM renderer (`renderPanels`): builds the sections with createElement,
 *    wires every field to store.update() and re-syncs on store changes.
 *
 * No geometry is computed here: the core owns sizes, clamping of the corner
 * radius, the ruling area and every derived measurement.
 */

import { displayDecimals, enums, limits } from "../config.js";
import { strings, warningText } from "../strings.pt-BR.js";
import { layoutSheet } from "../core/layout.js";
import { rulingArea } from "../core/ruling.js";
import { createColorPicker } from "./color-picker.js";

const NUMBER_STEP = 10 ** -displayDecimals;
const MARGIN_SIDES = ["top", "right", "bottom", "left"];

/** Field ids double as history tags, so typing in one field collapses to one step. */
const FIELD_IDS = {
  size: "page.size",
  orientation: "page.orientation",
  pageColor: "page.color",
  frameEnabled: "frame.enabled",
  frameColor: "frame.color",
  frameStyle: "frame.style",
  frameThickness: "frame.thickness",
  frameDoubleGap: "frame.doubleGap",
  frameCornerRadius: "frame.cornerRadius",
};

function mm() {
  return strings.units.millimetre;
}

function marginPath(side) {
  return `page.margins.${side}`;
}

function marginLabel(side) {
  return strings.panels.fields.margins[side];
}

function marginWarning(value) {
  if (typeof value !== "number" || value <= 0 || value >= limits.marginHomePrint) return null;
  const code = "margin.belowHomePrint";
  return { code, message: warningText(code, { limit: limits.marginHomePrint }) };
}

function selectOptions(kind, group) {
  const labels = strings.panels.enums[kind] ?? {};
  return enums[group].map((value) => ({ value, label: labels[value] ?? value }));
}

/** Number field; every limit comes from config.js. */
function numberField({ id, path, label, value, min, max, step = NUMBER_STEP, unit, help = null, warning = null, disabled = false }) {
  return {
    id,
    type: "number",
    path,
    label,
    min,
    max,
    step,
    unit,
    value,
    help,
    warning,
    disabled,
  };
}

/** Select descriptor; options carry value + localised label. */
function selectField({ id, path, label, value, kind, group, help = null, disabled = false }) {
  return {
    id,
    type: "select",
    path,
    label,
    options: selectOptions(kind, group),
    value,
    help,
    disabled,
  };
}

function checkboxField({ id, path, label, value, help = null }) {
  return { id, type: "checkbox", path, label, value: value === true, help, disabled: false };
}

function colorField({ id, path, label, value, help = null, disabled = false }) {
  return { id, type: "color", path, label, value, help, disabled };
}

/** Folha: size, orientation and background colour. */
export function pageSection(preset) {
  const page = preset?.page ?? {};
  return [
    selectField({
      id: FIELD_IDS.size,
      path: FIELD_IDS.size,
      label: strings.panels.fields.size,
      value: page.size,
      kind: "size",
      group: "pageSizes",
    }),
    selectField({
      id: FIELD_IDS.orientation,
      path: FIELD_IDS.orientation,
      label: strings.panels.fields.orientation,
      value: page.orientation,
      kind: "orientation",
      group: "orientations",
    }),
    colorField({
      id: FIELD_IDS.pageColor,
      path: FIELD_IDS.pageColor,
      label: strings.panels.fields.pageColor,
      value: page.color,
      help: strings.panels.help.pageColor,
    }),
  ];
}

/** Margens: the four independent sides, each with the home-printing warning. */
export function marginsSection(preset) {
  const margins = preset?.page?.margins ?? {};
  return MARGIN_SIDES.map((side) =>
    numberField({
      id: marginPath(side),
      path: marginPath(side),
      label: marginLabel(side),
      value: margins[side],
      min: 0,
      max: limits.marginMax,
      unit: mm(),
      warning: marginWarning(margins[side]),
    }),
  );
}

/** Moldura: on/off plus colour, style, thickness, double gap and corner radius. */
export function frameSection(preset) {
  const frame = preset?.frame ?? {};
  const off = frame.enabled === false;
  return [
    checkboxField({
      id: FIELD_IDS.frameEnabled,
      path: FIELD_IDS.frameEnabled,
      label: strings.panels.fields.frameEnabled,
      value: frame.enabled,
    }),
    colorField({
      id: FIELD_IDS.frameColor,
      path: FIELD_IDS.frameColor,
      label: strings.panels.fields.frameColor,
      value: frame.color,
      help: strings.panels.help.frameColor,
      disabled: off,
    }),
    selectField({
      id: FIELD_IDS.frameStyle,
      path: FIELD_IDS.frameStyle,
      label: strings.panels.fields.frameStyle,
      value: frame.style,
      kind: "frameStyle",
      group: "frameStyles",
      disabled: off,
    }),
    numberField({
      id: FIELD_IDS.frameThickness,
      path: FIELD_IDS.frameThickness,
      label: strings.panels.fields.frameThickness,
      value: frame.thickness,
      min: limits.frameThickness.min,
      max: limits.frameThickness.max,
      unit: mm(),
      disabled: off,
    }),
    numberField({
      id: FIELD_IDS.frameDoubleGap,
      path: FIELD_IDS.frameDoubleGap,
      label: strings.panels.fields.frameDoubleGap,
      value: frame.doubleGap,
      min: limits.doubleGap.min,
      max: limits.doubleGap.max,
      unit: mm(),
      disabled: off,
    }),
    numberField({
      id: FIELD_IDS.frameCornerRadius,
      path: FIELD_IDS.frameCornerRadius,
      label: strings.panels.fields.frameCornerRadius,
      value: frame.cornerRadius,
      min: 0,
      // the maximum depends on the page size and the margins: the core clamps it.
      max: null,
      unit: mm(),
      help: strings.panels.help.cornerRadius,
      disabled: off,
    }),
  ];
}

const RULING_AREA_CODE = "ruling.areaTooSmall";

function rulingInsetPath(side) {
  return `ruling.insets.${side}`;
}

function rulingAxisPath(axis, part) {
  return `ruling.${axis}.${part}`;
}

/**
 * Small-area warning, decided by the core: this module asks `rulingArea` for the
 * first cell of the sheet layout instead of re-deriving the geometry.
 */
function rulingAreaWarning(preset) {
  const ruling = preset?.ruling;
  if (!ruling || ruling.enabled === false || !ruling.insets) return null;
  const layout = layoutSheet(preset?.page?.size, preset?.page?.orientation);
  if (!layout.ok) return null;
  if (rulingArea({ preset, cell: layout.cells[0] }).ok) return null;
  return { code: RULING_AREA_CODE, message: warningText(RULING_AREA_CODE) };
}

/** Pauta: on/off plus type, trace and the two independent axes with their insets. */
export function rulingSection(preset) {
  const ruling = preset?.ruling ?? {};
  const off = ruling.enabled === false;
  const dots = ruling.type === "dots";
  const lines = ruling.type === "lines";
  const areaWarning = rulingAreaWarning(preset);
  const insets = ruling.insets ?? {};

  const axisFields = (axis) => {
    const data = ruling[axis] ?? {};
    const axisOff = off || (axis === "x" && lines);
    return [
      selectField({
        id: rulingAxisPath(axis, "mode"),
        path: rulingAxisPath(axis, "mode"),
        label: strings.panels.fields.rulingAxis[axis].mode,
        value: data.mode,
        kind: "rulingMode",
        group: "rulingModes",
        disabled: axisOff,
      }),
      numberField({
        id: rulingAxisPath(axis, "spacing"),
        path: rulingAxisPath(axis, "spacing"),
        label: strings.panels.fields.rulingAxis[axis].spacing,
        value: data.spacing,
        min: limits.spacing.min,
        max: limits.spacing.max,
        unit: mm(),
        disabled: axisOff || data.mode !== "spacing",
      }),
      numberField({
        id: rulingAxisPath(axis, "count"),
        path: rulingAxisPath(axis, "count"),
        label: strings.panels.fields.rulingAxis[axis].count,
        value: data.count,
        min: limits.count.min,
        max: limits.count.max,
        step: 1,
        unit: null,
        disabled: axisOff || data.mode !== "count",
      }),
    ];
  };

  return [
    checkboxField({
      id: "ruling.enabled",
      path: "ruling.enabled",
      label: strings.panels.fields.rulingEnabled,
      value: ruling.enabled,
    }),
    selectField({
      id: "ruling.type",
      path: "ruling.type",
      label: strings.panels.fields.rulingType,
      value: ruling.type,
      kind: "rulingType",
      group: "rulingTypes",
      help: strings.panels.help.rulingType,
      disabled: off,
    }),
    selectField({
      id: "ruling.style",
      path: "ruling.style",
      label: strings.panels.fields.rulingStyle,
      value: ruling.style,
      kind: "rulingStyle",
      group: "rulingStyles",
      help: strings.panels.help.rulingStyle,
      disabled: off || dots,
    }),
    colorField({
      id: "ruling.color",
      path: "ruling.color",
      label: strings.panels.fields.rulingColor,
      value: ruling.color,
      disabled: off,
    }),
    numberField({
      id: "ruling.thickness",
      path: "ruling.thickness",
      label: strings.panels.fields.rulingThickness,
      value: ruling.thickness,
      min: limits.rulingThickness.min,
      max: limits.rulingThickness.max,
      unit: mm(),
      disabled: off,
    }),
    numberField({
      id: "ruling.dotRadius",
      path: "ruling.dotRadius",
      label: strings.panels.fields.rulingDotRadius,
      value: ruling.dotRadius,
      min: limits.dotRadius.min,
      max: limits.dotRadius.max,
      unit: mm(),
      disabled: off || !dots,
    }),
    ...axisFields("y"),
    ...axisFields("x"),
    ...MARGIN_SIDES.map((side) =>
      numberField({
        id: rulingInsetPath(side),
        path: rulingInsetPath(side),
        label: strings.panels.fields.rulingInsets[side],
        value: insets[side],
        min: limits.insets.min,
        max: limits.insets.max,
        unit: mm(),
        help: side === "top" ? strings.panels.help.rulingInsets : null,
        warning: areaWarning,
        disabled: off,
      }),
    ),
  ];
}

/** All descriptors, in display order. */
export function panelFields(preset) {
  return [...pageSection(preset), ...marginsSection(preset), ...rulingSection(preset), ...frameSection(preset)];
}

/* ------------------------------------------------------------------ */
/* DOM renderer                                                        */
/* ------------------------------------------------------------------ */

function fieldElementId(path) {
  return `panel-field-${path.replace(/[^a-z0-9]+/gi, "-")}`;
}


function writePath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let node = object;
  for (const key of keys) {
    if (node[key] === null || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  node[last] = value;
}

/** pt-BR display: dot becomes comma, no locale rounding surprises. */
function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

/** Accepts both separators; returns NaN when the text is not a number. */
function parseNumber(text) {
  const normalised = text.trim().replace(/\s+/g, "").replace(",", ".");
  if (normalised === "") return NaN;
  return Number(normalised);
}

function fillMessage(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params[key] === undefined ? match : String(params[key]),
  );
}

function clamp(value, min, max) {
  let next = value;
  if (typeof min === "number" && next < min) next = min;
  if (typeof max === "number" && next > max) next = max;
  return next;
}

function makeWarningNode(id) {
  const warning = document.createElement("p");
  warning.className = "field__warning";
  warning.id = `${id}-warning`;
  warning.setAttribute("role", "alert");
  warning.hidden = true;
  return warning;
}

function makeHelpNode(id, text) {
  if (!text) return null;
  const help = document.createElement("p");
  help.className = "field__help";
  help.id = `${id}-help`;
  help.textContent = text;
  return help;
}

function makeNumberControl(field, id) {
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.id = id;
  input.className = "field__input field__input--number";
  input.value = formatNumber(field.value);
  if (typeof field.min === "number") input.setAttribute("min", String(field.min));
  if (typeof field.max === "number") input.setAttribute("max", String(field.max));
  input.setAttribute("step", String(field.step));
  return input;
}

function makeSelectControl(field, id) {
  const select = document.createElement("select");
  select.id = id;
  select.className = "field__input field__select";
  for (const option of field.options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    if (option.value === field.value) node.selected = true;
    select.append(node);
  }
  return select;
}

function makeCheckboxControl(field, id) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.className = "field__checkbox";
  input.checked = field.value === true;
  return input;
}

/**
 * Colour control: a swatch button that opens the picker popover. Returns a small
 * controller so `buildField` can treat it like the other inputs.
 */
function makeColorControl(field, id, commit) {
  const host = document.createElement("div");
  host.className = "field__color-host";

  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.className = "field__color-button";

  const chip = document.createElement("span");
  chip.className = "field__color-chip";
  const hexText = document.createElement("span");
  hexText.className = "field__color-hex";
  button.append(chip, hexText);

  const popover = document.createElement("div");
  popover.className = "field__color-popover";
  popover.hidden = true;

  host.append(button, popover);

  let current = typeof field.value === "string" ? field.value.toUpperCase() : "#000000FF";
  let picker = null;
  let applying = false;

  const paint = () => {
    chip.style.background = current;
    hexText.textContent = current.slice(0, 7);
    button.setAttribute("aria-label", `${strings.picker.open}: ${current.slice(0, 7)}`);
  };

  const closePicker = () => {
    if (picker) picker.destroy();
    picker = null;
    popover.hidden = true;
    popover.replaceChildren();
    button.setAttribute("aria-expanded", "false");
    button.focus();
  };

  const openPicker = () => {
    popover.replaceChildren();
    picker = createColorPicker({
      value: current,
      onChange: (hex) => {
        if (applying) return;
        current = hex.toUpperCase();
        paint();
        commit(current);
      },
      onClose: closePicker,
    });
    popover.append(picker.node);
    popover.hidden = false;
    button.setAttribute("aria-expanded", "true");
  };

  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    if (popover.hidden) openPicker();
    else closePicker();
  });

  const onDocumentPointerDown = (event) => {
    if (!host.contains(event.target)) closePicker();
  };
  document.addEventListener("pointerdown", onDocumentPointerDown);

  paint();

  return {
    node: host,
    focusTarget: button,
    setValue(next) {
      current = typeof next === "string" ? next.toUpperCase() : "#000000FF";
      paint();
      if (picker) {
        applying = true;
        picker.setValue(current);
        applying = false;
      }
    },
    getValue: () => current,
    setDisabled(disabled) {
      button.disabled = disabled === true;
      if (disabled) closePicker();
    },
    destroy() {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    },
  };
}

/**
 * One field: label, control, optional unit, help and a live warning.
 * Returns the node plus an `apply(descriptor)` used on store changes.
 */
function buildField(field, store) {
  const id = fieldElementId(field.id);
  const row = document.createElement("div");
  row.className = `field field--${field.type}`;
  row.dataset.field = field.id;

  const commit = (value) => {
    store.update((draft) => writePath(draft, field.path, value), {
      tag: field.id,
      label: field.label,
    });
  };

  let control;
  let controlNode;
  let colorControl = null;

  if (field.type === "number") {
    control = makeNumberControl(field, id);
    controlNode = control;
  } else if (field.type === "select") {
    control = makeSelectControl(field, id);
    controlNode = control;
  } else if (field.type === "checkbox") {
    control = makeCheckboxControl(field, id);
    controlNode = control;
  } else {
    control = makeColorControl(field, id, commit);
    colorControl = control;
    controlNode = control.node;
  }

  const warning = makeWarningNode(id);
  const help = makeHelpNode(id, field.help);

  const describedBy = [help?.id, warning.id].filter(Boolean).join(" ");
  controlNode.setAttribute("aria-describedby", describedBy);
  if (colorControl) colorControl.setDisabled(field.disabled);
  else controlNode.disabled = field.disabled === true;

  if (field.type === "checkbox") {
    const label = document.createElement("label");
    label.className = "field__toggle";
    label.htmlFor = id;
    const text = document.createElement("span");
    text.className = "field__label";
    text.textContent = field.label;
    label.append(controlNode, text);
    row.append(label);
  } else {
    const head = document.createElement("div");
    head.className = "field__head";
    const label = document.createElement("label");
    label.className = "field__label";
    label.htmlFor = id;
    label.textContent = field.label;
    head.append(label);
    if (field.unit) {
      const unit = document.createElement("span");
      unit.className = "field__unit";
      unit.textContent = field.unit;
      head.append(unit);
    }
    row.append(head, controlNode);
  }

  if (help) row.append(help);
  row.append(warning);

  const showWarning = (message) => {
    if (message) {
      warning.textContent = message;
      warning.hidden = false;
    } else {
      warning.textContent = "";
      warning.hidden = true;
    }
  };

  // A clamp warning is local to the focused field: the store sync must not
  // erase it before the person reads it.
  let pendingWarning = null;
  let presetWarning = field.warning?.message ?? null;
  let lastValidValue = field.value;

  if (field.type === "number") {
    control.addEventListener("input", () => {
      const parsed = parseNumber(control.value);
      if (Number.isNaN(parsed)) {
        pendingWarning = strings.panels.messages.invalid;
        showWarning(pendingWarning);
        return;
      }
      const next = clamp(parsed, field.min, field.max);
      const clamped = next !== parsed;
      lastValidValue = next;
      pendingWarning = clamped
        ? fillMessage(strings.panels.messages.clamped, { value: formatNumber(next), unit: field.unit ?? "" })
        : null;
      showWarning(pendingWarning);
      if (clamped) control.value = formatNumber(next);
      commit(next);
    });
    control.addEventListener("blur", () => {
      control.value = formatNumber(lastValidValue);
      pendingWarning = null;
      showWarning(presetWarning);
    });
    control.addEventListener("keydown", (event) => {
      if (event.key === "Enter") control.blur();
    });
  } else if (field.type === "select") {
    control.addEventListener("change", () => commit(control.value));
  } else if (field.type === "checkbox") {
    control.addEventListener("change", () => commit(control.checked));
  }

  const apply = (next) => {
    if (colorControl) colorControl.setDisabled(next.disabled);
    else control.disabled = next.disabled === true;

    if (next.type === "number") {
      lastValidValue = next.value;
      if (document.activeElement !== control) control.value = formatNumber(next.value);
    } else if (next.type === "select") {
      control.value = next.value;
    } else if (next.type === "checkbox") {
      control.checked = next.value === true;
    } else {
      colorControl.setValue(next.value);
    }

    presetWarning = next.warning?.message ?? null;
    const focused = document.activeElement === (colorControl ? colorControl.focusTarget : control);
    showWarning(focused && pendingWarning ? pendingWarning : presetWarning);
  };

  return { node: row, apply, colorControl };
}

function sectionNode(key, label, fields, store, open) {
  const panel = document.createElement("details");
  panel.className = "panel";
  panel.dataset.section = key;
  panel.open = open;

  const summary = document.createElement("summary");
  summary.className = "panel__summary";
  const title = document.createElement("span");
  title.textContent = label;
  const chevron = document.createElement("span");
  chevron.className = "panel__chevron";
  chevron.setAttribute("aria-hidden", "true");
  summary.append(title, chevron);

  const body = document.createElement("div");
  body.className = "panel__body panel__body--fields";
  const builders = fields.map((field) => ({ field, ...buildField(field, store) }));
  body.append(...builders.map((builder) => builder.node));

  panel.append(summary, body);
  return { panel, builders };
}

/**
 * Mount the three panels in `host`, keep every control in sync with the store
 * and call `onChange` (preview refresh hook) after each change.
 */
export function renderPanels(host, { store, onChange } = {}) {
  if (!host) throw new TypeError("renderPanels requires a host element");
  if (!store) throw new TypeError("renderPanels requires a store");

  host.replaceChildren();

  const sections = [
    { key: "page", label: strings.panels.sections.page, build: pageSection, open: true },
    { key: "margins", label: strings.panels.sections.margins, build: marginsSection, open: true },
    { key: "ruling", label: strings.panels.sections.ruling, build: rulingSection, open: false },
    { key: "frame", label: strings.panels.sections.frame, build: frameSection, open: false },
  ];

  const mounts = sections.map(({ key, label, build, open }) => {
    const mounted = sectionNode(key, label, build(store.getPreset()), store, open);
    host.append(mounted.panel);
    return { key, build, builders: mounted.builders };
  });

  const sync = (preset) => {
    for (const { build, builders } of mounts) {
      const next = build(preset);
      builders.forEach((builder, index) => builder.apply(next[index]));
    }
  };

  const unsubscribe = store.subscribe((event) => {
    if (event.type !== "change") return;
    sync(event.preset);
    if (typeof onChange === "function") onChange(event.preset, event);
  });

  return { unsubscribe, sync };
}
