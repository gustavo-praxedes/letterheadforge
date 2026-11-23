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
import { shortList } from "../fonts/catalog.js";
import { createColorPicker } from "./color-picker.js";
import {
  addImage,
  addTextBox,
  canAddImage,
  canAddTextBox,
  updateTextContent,
  updateTextStyle,
} from "./objects.js";

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
function numberField({
  id,
  path,
  label,
  value,
  min,
  max,
  step = NUMBER_STEP,
  unit,
  help = null,
  warning = null,
  disabled = false,
  toModel = null,
}) {
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
    toModel,
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

const IMAGE_MISSING_CODE = "watermark.imageMissing";

/**
 * Marca d'água: on/off, kind and the fields of the chosen mode.
 *
 * The two modes do not coexist: text fields are absent in image mode and the
 * image select is absent in text mode, so the panel never shows a control that
 * the model ignores. `fonts` comes from `data/fonts.json` and `images` from the
 * store's image map; without a catalogue the font select still shows the font
 * the watermark already uses.
 */
export function watermarkSection(preset, { fonts = [], images = [] } = {}) {
  const watermark = preset?.watermark ?? {};
  const text = watermark.text ?? {};
  const on = watermark.enabled === true;
  const isImage = watermark.kind === "image";

  const fields = [
    checkboxField({
      id: "watermark.enabled",
      path: "watermark.enabled",
      label: strings.panels.fields.watermarkEnabled,
      value: watermark.enabled,
    }),
    selectField({
      id: "watermark.kind",
      path: "watermark.kind",
      label: strings.panels.fields.watermarkKind,
      value: watermark.kind,
      kind: "watermarkKind",
      group: "watermarkKinds",
      disabled: !on,
    }),
  ];

  if (isImage) {
    const hasImages = Array.isArray(images) && images.length > 0;
    const available = imageOptions(images, watermark.imageId);
    fields.push({
      id: "watermark.imageId",
      type: "select",
      path: "watermark.imageId",
      label: strings.panels.fields.watermarkImage,
      options: available,
      value: watermark.imageId ?? "",
      help: hasImages ? null : strings.panels.help.watermarkImage,
      warning:
        on && !hasImages ? { code: IMAGE_MISSING_CODE, message: warningText(IMAGE_MISSING_CODE) } : null,
      disabled: !on || !hasImages,
      toModel: (value) => (value === "" ? null : value),
    });
  } else {
    fields.push(
      {
        id: "watermark.text",
        type: "textarea",
        path: "watermark.text.content",
        label: strings.panels.fields.watermarkText,
        value: typeof text.content === "string" ? text.content : "",
        help: strings.panels.help.watermarkText,
        disabled: !on,
      },
      {
        id: "watermark.fontId",
        type: "select",
        path: "watermark.text.fontId",
        label: strings.panels.fields.watermarkFont,
        options: fontOptions(text, fonts),
        value: String(text.fontId),
        help: null,
        disabled: !on,
      },
      numberField({
        id: "watermark.sizePt",
        path: "watermark.text.sizePt",
        label: strings.panels.fields.watermarkSize,
        value: text.sizePt,
        min: limits.textSizePt.min,
        max: limits.textSizePt.max,
        step: 1,
        unit: strings.units.point,
        help: fillMessage(strings.panels.help.watermarkSize, {
          min: limits.textSizePt.min,
          max: limits.textSizePt.max,
        }),
        disabled: !on,
      }),
      {
        id: "watermark.weight",
        type: "select",
        path: "watermark.text.weight",
        label: strings.panels.fields.watermarkWeight,
        options: weightOptions(text, fonts),
        value: String(text.weight),
        help: null,
        disabled: !on,
      },
      {
        id: "watermark.italic",
        type: "checkbox",
        path: "watermark.text.italic",
        label: strings.panels.fields.watermarkItalic,
        value: text.italic === true,
        help: null,
        disabled: !on,
      },
      colorField({
        id: "watermark.color",
        path: "watermark.text.color",
        label: strings.panels.fields.watermarkColor,
        value: text.color,
        disabled: !on,
      }),
    );
  }

  fields.push(
    numberField({
      id: "watermark.opacity",
      path: "watermark.opacity",
      label: strings.panels.fields.watermarkOpacity,
      // The model stores a 0–1 fraction; the panel always shows a percentage.
      value: percentOf(watermark.opacity),
      min: limits.opacity.min * 100,
      max: limits.opacity.max * 100,
      step: 1,
      unit: strings.units.percentage,
      help: strings.panels.help.watermarkOpacity,
      disabled: !on,
      toModel: (value) => clamp(value / 100, limits.opacity.min, limits.opacity.max),
    }),
    numberField({
      id: "watermark.rotation",
      path: "watermark.rotation",
      label: strings.panels.fields.watermarkRotation,
      value: watermark.rotation,
      min: limits.rotation.min,
      max: limits.rotation.max,
      unit: strings.units.degree,
      disabled: !on,
    }),
  );

  return fields;
}

/** 0–1 fraction to a 0–100 percentage, rounded to one decimal. */
function percentOf(fraction) {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return 0;
  return Math.round(fraction * 1000) / 10;
}

/** Image options from the store map; a missing current id is kept selectable. */
function imageOptions(images, current) {
  const list = Array.isArray(images) ? images : [];
  const options = list
    .map((entry) => {
      const id = typeof entry === "string" ? entry : entry?.id;
      const name = typeof entry === "string" ? entry : (entry?.name ?? entry?.id);
      if (id === null || id === undefined) return null;
      return { value: String(id), label: String(name) };
    })
    .filter(Boolean);
  if (current !== null && current !== undefined && !options.some((option) => option.value === String(current))) {
    options.unshift({ value: String(current), label: String(current) });
  }
  if (options.length === 0) {
    options.push({ value: "", label: strings.panels.messages.watermarkNoImage });
  }
  return options;
}

/** All descriptors, in display order. */
export function panelFields(preset) {
  return [...pageSection(preset), ...marginsSection(preset), ...rulingSection(preset), ...frameSection(preset)];
}

/* ------------------------------------------------------------------ */
/* Objects: the selected text box, plus the creation actions           */
/* ------------------------------------------------------------------ */

const OBJECT_FIELD_IDS = {
  content: "objects.text.content",
  font: "objects.text.fontId",
  size: "objects.text.sizePt",
  weight: "objects.text.weight",
  italic: "objects.text.italic",
  color: "objects.text.color",
  align: "objects.text.align",
};

function selectedTextObject(preset, selectedId) {
  if (selectedId === null || selectedId === undefined) return null;
  const objects = Array.isArray(preset?.objects) ? preset.objects : [];
  return objects.find((object) => object?.id === selectedId && object.type === "text") ?? null;
}

/** One creation button; the gate comes from the pure module. */
function actionField(id, label, gate) {
  return {
    id,
    type: "action",
    label,
    disabled: gate.ok !== true,
    warning: gate.ok ? null : { code: gate.code, message: warningText(gate.code, gate.params) },
  };
}

function fontOptions(object, fonts) {
  const list = Array.isArray(fonts) && fonts.length > 0 ? fonts : null;
  if (!list) return [{ value: String(object.fontId), label: String(object.fontId) }];
  const options = list.map((font) => ({ value: String(font.id), label: font.family ?? String(font.id) }));
  if (!options.some((option) => option.value === String(object.fontId))) {
    options.unshift({ value: String(object.fontId), label: String(object.fontId) });
  }
  return options;
}

function weightOptions(object, fonts) {
  const font = (Array.isArray(fonts) ? fonts : []).find((entry) => entry.id === object.fontId);
  const weights = Array.isArray(font?.weights) && font.weights.length > 0 ? font.weights : [object.weight];
  const options = weights
    .filter((weight) => typeof weight === "number" && Number.isFinite(weight))
    .map((weight) => ({ value: String(weight), label: strings.objects.enums.weight[weight] ?? String(weight) }));
  if (!options.some((option) => option.value === String(object.weight))) {
    options.unshift({
      value: String(object.weight),
      label: strings.objects.enums.weight[object.weight] ?? String(object.weight),
    });
  }
  return options;
}

function alignOptions() {
  return enums.alignments.map((value) => ({
    value,
    label: strings.panels.enums.alignment[value] ?? value,
  }));
}

/**
 * Descriptors of the objects section: the two creation actions, then the fields
 * of the selected text box. `selectedId` comes from the store (UI state, never
 * from the preset) and `fonts` from `data/fonts.json`; without a catalogue the
 * font select still shows the current font.
 */
export function objectsSection(preset, { selectedId = null, fonts = [] } = {}) {
  const actions = [
    actionField("objects.addText", strings.objects.actions.addText, canAddTextBox(preset)),
    actionField("objects.addImage", strings.objects.actions.addImage, canAddImage(preset)),
  ];

  const object = selectedTextObject(preset, selectedId);
  if (!object) return [...actions, { id: "objects.empty", type: "hint", text: strings.objects.empty }];

  const sizeHelp = fillMessage(strings.objects.help.size, {
    min: limits.textSizePt.min,
    max: limits.textSizePt.max,
  });

  return [
    ...actions,
    {
      id: OBJECT_FIELD_IDS.content,
      type: "textarea",
      label: strings.objects.fields.content,
      value: typeof object.text === "string" ? object.text : "",
      help: strings.objects.help.content,
      disabled: false,
      kind: "content",
    },
    {
      id: OBJECT_FIELD_IDS.font,
      type: "select",
      label: strings.objects.fields.font,
      value: String(object.fontId),
      options: fontOptions(object, fonts),
      help: null,
      disabled: false,
      kind: "style",
      styleKey: "fontId",
    },
    {
      id: OBJECT_FIELD_IDS.size,
      type: "number",
      label: strings.objects.fields.size,
      value: object.sizePt,
      min: limits.textSizePt.min,
      max: limits.textSizePt.max,
      step: 1,
      unit: strings.units.point,
      help: sizeHelp,
      warning: null,
      disabled: false,
      kind: "style",
      styleKey: "sizePt",
      parse: Number,
    },
    {
      id: OBJECT_FIELD_IDS.weight,
      type: "select",
      label: strings.objects.fields.weight,
      value: String(object.weight),
      options: weightOptions(object, fonts),
      help: null,
      disabled: false,
      kind: "style",
      styleKey: "weight",
      parse: Number,
    },
    {
      id: OBJECT_FIELD_IDS.italic,
      type: "checkbox",
      label: strings.objects.fields.italic,
      value: object.italic === true,
      help: null,
      disabled: false,
      kind: "style",
      styleKey: "italic",
    },
    {
      id: OBJECT_FIELD_IDS.color,
      type: "color",
      label: strings.objects.fields.color,
      value: object.color,
      help: null,
      disabled: false,
      kind: "style",
      styleKey: "color",
    },
    {
      id: OBJECT_FIELD_IDS.align,
      type: "select",
      label: strings.objects.fields.align,
      value: object.align,
      options: alignOptions(),
      help: null,
      disabled: false,
      kind: "style",
      styleKey: "align",
    },
  ];
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

function makeTextareaControl(field, id) {
  const area = document.createElement("textarea");
  area.id = id;
  area.className = "field__input field__input--textarea";
  area.rows = 3;
  area.autocomplete = "off";
  area.value = typeof field.value === "string" ? field.value : "";
  return area;
}

/**
 * Colour control: a swatch button that opens the picker popover. Returns a small
 * controller so `buildField` can treat it like the other inputs.
 */
function makeColorControl(field, id, commit) {
  // module-level: the section builders are deep and only the app owns the data

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

  const closePicker = ({ restoreFocus = true } = {}) => {
    if (!picker) return;
    const hadFocusInside = popover.contains(document.activeElement);
    picker.destroy();
    picker = null;
    popover.hidden = true;
    popover.replaceChildren();
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus && hadFocusInside) button.focus();
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
      recents: typeof colorSources.recents === "function" ? colorSources.recents() : [],
      palette: typeof colorSources.palette === "function" ? colorSources.palette() : [],
      onRecent: (list) => {
        if (typeof colorSources.onRecent === "function") colorSources.onRecent(list);
      },
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

  // Only the open picker reacts to outside clicks: stealing focus on every
  // pointerdown in the page used to swallow clicks on checkboxes.
  const onDocumentPointerDown = (event) => {
    if (!picker) return;
    if (host.contains(event.target)) return;
    closePicker({ restoreFocus: false });
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
 * `commit` overrides the default "write the path into the preset" behaviour —
 * the objects section uses it to call the pure update functions instead.
 */
function buildField(field, store, { commit: commitOverride = null } = {}) {
  const id = fieldElementId(field.id);
  const row = document.createElement("div");
  row.className = `field field--${field.type}`;
  row.dataset.field = field.id;

  const commit =
    commitOverride ??
    ((value) => {
      const stored = typeof field.toModel === "function" ? field.toModel(value) : value;
      store.update((draft) => writePath(draft, field.path, stored), {
        tag: field.id,
        label: field.label,
      });
    });

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
  } else if (field.type === "textarea") {
    control = makeTextareaControl(field, id);
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
    // Input and label are siblings: nesting the input inside its own label makes
    // Chromium forward the click twice and the toggle cancels out.
    const toggle = document.createElement("div");
    toggle.className = "field__toggle";
    toggle.style.cursor = "pointer";
    const text = document.createElement("label");
    text.className = "field__label";
    text.htmlFor = id;
    text.textContent = field.label;
    // The whole row toggles, so the target is 44 px tall. The label's native
    // forwarding is cancelled to avoid toggling twice.
    toggle.addEventListener("click", (event) => {
      if (event.target === controlNode || controlNode.disabled) return;
      event.preventDefault();
      controlNode.checked = !controlNode.checked;
      controlNode.dispatchEvent(new Event("change", { bubbles: true }));
    });
    toggle.append(controlNode, text);
    row.append(toggle);
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
  } else if (field.type === "textarea") {
    control.addEventListener("input", () => commit(control.value));
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
    } else if (next.type === "textarea") {
      if (document.activeElement !== control) {
        control.value = typeof next.value === "string" ? next.value : "";
      }
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

  panel.append(summary, body);

  let builders = [];
  let signature = null;

  // A section whose field list depends on the preset (the watermark text and
  // image modes) has to rebuild its controls when the ids change; otherwise a
  // plain re-sync is enough and keeps focus and popovers alive.
  const apply = (next) => {
    const nextSignature = next.map((field) => field.id).join("|");
    if (nextSignature !== signature) {
      signature = nextSignature;
      builders.forEach((builder) => builder.colorControl?.destroy());
      builders = next.map((field) => ({ field, ...buildField(field, store) }));
      body.replaceChildren(...builders.map((builder) => builder.node));
      return;
    }
    builders.forEach((builder, index) => builder.apply(next[index]));
  };

  apply(fields);
  return { panel, apply };
}

/**
 * Font catalogue from `data/fonts.json` (spec 7.1). Fetched once, lazily, and
 * only used to fill the font select: without it the select still shows the
 * font the text box already uses.
 */
let fontCatalogue = null;
let fontCataloguePromise = null;

function loadFontCatalogue() {
  if (fontCatalogue) return Promise.resolve(fontCatalogue);
  if (fontCataloguePromise) return fontCataloguePromise;
  if (typeof fetch !== "function") return Promise.resolve([]);
  fontCataloguePromise = fetch("data/fonts.json")
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      fontCatalogue = shortList(data);
      return fontCatalogue;
    })
    .catch(() => {
      fontCatalogue = [];
      return fontCatalogue;
    });
  return fontCataloguePromise;
}

/**
 * Objects section: creation buttons plus the editor of the selected text box.
 * Fields commit through the pure functions in objects.js, never by writing a
 * dotted path — the objects are a list, not a tree.
 */
function objectsSectionNode(store, options = {}) {
  const panel = document.createElement("details");
  panel.className = "panel";
  panel.dataset.section = "objects";
  panel.open = false;

  const summary = document.createElement("summary");
  summary.className = "panel__summary";
  const title = document.createElement("span");
  title.textContent = strings.panels.sections.objects;
  const chevron = document.createElement("span");
  chevron.className = "panel__chevron";
  chevron.setAttribute("aria-hidden", "true");
  summary.append(title, chevron);

  const body = document.createElement("div");
  body.className = "panel__body panel__body--fields";

  panel.append(summary, body);

  let fonts = [];
  let mounted = [];
  let signature = null;

  const commitFor = (descriptor) => (raw) => {
    const value = typeof descriptor.parse === "function" ? descriptor.parse(raw) : raw;
    const objectId = descriptor.target;
    store.update((draft) => {
      const result =
        descriptor.kind === "content"
          ? updateTextContent(draft, objectId, value)
          : updateTextStyle(draft, objectId, { [descriptor.styleKey]: value });
      if (!result.ok) return;
      Object.assign(draft, result.preset);
    }, { tag: descriptor.id, label: descriptor.label });
  };

  const addObject = (descriptor) => () => {
    // an image without a file is an invisible object: ask for the file instead
    if (descriptor.id === "objects.addImage" && typeof options.onRequestImage === "function") {
      options.onRequestImage();
      return;
    }
    store.update((draft) => {
      const result = descriptor.id === "objects.addImage" ? addImage(draft) : addTextBox(draft);
      if (!result.ok) return;
      Object.assign(draft, result.preset);
    }, { tag: null, label: descriptor.label });
    const objects = store.getPreset().objects ?? [];
    const created = objects[objects.length - 1] ?? null;
    store.select(created ? created.id : null);
  };

  const buildAction = (descriptor) => {
    const button = document.createElement("button");
    button.type = "button";
    button.id = fieldElementId(descriptor.id);
    button.className = "objects__action";
    button.textContent = descriptor.label;
    button.addEventListener("click", addObject(descriptor));

    const apply = (next) => {
      button.disabled = next.disabled === true;
      if (next.warning) {
        button.title = next.warning.message;
        button.setAttribute("aria-description", next.warning.message);
      } else {
        button.removeAttribute("title");
        button.removeAttribute("aria-description");
      }
    };
    apply(descriptor);
    return { node: button, apply };
  };

  const buildHint = (descriptor) => {
    const node = document.createElement("p");
    node.className = "field__help";
    node.textContent = descriptor.text;
    return { node, apply: () => {} };
  };

  const render = () => {
    const preset = store.getPreset();
    const selectedId = store.getSelection();
    const descriptors = objectsSection(preset, { selectedId, fonts });
    const object = selectedTextObject(preset, selectedId);
    const nextSignature = `${selectedId ?? ""}|${object ? object.id : "none"}|${fonts.length}`;

    if (nextSignature === signature) {
      mounted.forEach((entry, index) => entry.apply(descriptors[index]));
      return;
    }
    signature = nextSignature;

    const nodes = [];
    const next = [];
    let group = null;
    for (const descriptor of descriptors) {
      if (descriptor.type === "action") {
        if (!group) {
          group = document.createElement("div");
          group.className = "objects__actions";
          nodes.push(group);
        }
        const entry = buildAction(descriptor);
        group.append(entry.node);
        next.push(entry);
        continue;
      }
      group = null;
      if (descriptor.type === "hint") {
        const entry = buildHint(descriptor);
        nodes.push(entry.node);
        next.push(entry);
        continue;
      }
      const field = { ...descriptor, target: selectedId };
      const built = buildField(field, store, { commit: commitFor(field) });
      nodes.push(built.node);
      next.push({ node: built.node, apply: built.apply });
    }

    mounted = next;
    body.replaceChildren(...nodes);
  };

  render();

  loadFontCatalogue().then((list) => {
    if (!Array.isArray(list) || list.length === 0 || list.length === fonts.length) return;
    fonts = list;
    signature = null;
    render();
  });

  return {
    node: panel,
    render,
    setFonts(next) {
      fonts = Array.isArray(next) ? next : [];
      signature = null;
      render();
    },
  };
}

/**
 * Mount the panels in `host`, keep every control in sync with the store and call
 * `onChange` (preview refresh hook) after each change.
 */
let colorSources = {};

export function renderPanels(host, { store, onChange, onRequestImage = null, colors = null } = {}) {
  colorSources = colors ?? {};
  if (!host) throw new TypeError("renderPanels requires a host element");
  if (!store) throw new TypeError("renderPanels requires a store");

  host.replaceChildren();

  let fonts = [];
  const images = () =>
    typeof store.listImages === "function"
      ? store.listImages().map((id) => {
          const image = typeof store.getImage === "function" ? store.getImage(id) : null;
          return { id, name: typeof image?.name === "string" ? image.name : id };
        })
      : [];

  const sections = [
    { key: "page", label: strings.panels.sections.page, build: (preset) => pageSection(preset), open: true },
    { key: "margins", label: strings.panels.sections.margins, build: (preset) => marginsSection(preset), open: true },
    { key: "ruling", label: strings.panels.sections.ruling, build: (preset) => rulingSection(preset), open: false },
    {
      key: "watermark",
      label: strings.panels.sections.watermark,
      build: (preset) => watermarkSection(preset, { fonts, images: images() }),
      open: false,
    },
    { key: "frame", label: strings.panels.sections.frame, build: (preset) => frameSection(preset), open: false },
  ];

  const mounts = sections.map(({ key, label, build, open }) => {
    const mounted = sectionNode(key, label, build(store.getPreset()), store, open);
    host.append(mounted.panel);
    return { key, build, mounted };
  });

  // Last section of this host: the layers panel is mounted after it by main.js.
  const objects = objectsSectionNode(store, { onRequestImage });
  host.append(objects.node);

  const sync = (preset) => {
    for (const { build, mounted } of mounts) mounted.apply(build(preset));
    objects.render();
  };

  const unsubscribe = store.subscribe((event) => {
    if (event.type === "selection") {
      objects.render();
      return;
    }
    if (event.type === "images") {
      const watermark = mounts.find((mount) => mount.key === "watermark");
      if (watermark) watermark.mounted.apply(watermark.build(store.getPreset()));
      return;
    }
    if (event.type !== "change") return;
    sync(event.preset);
    if (typeof onChange === "function") onChange(event.preset, event);
  });

  // The font catalogue arrives after the panels exist: refresh the watermark
  // font and weight selects once it is there.
  loadFontCatalogue().then((list) => {
    if (!Array.isArray(list) || list.length === 0 || list.length === fonts.length) return;
    fonts = list;
    const watermark = mounts.find((mount) => mount.key === "watermark");
    if (watermark) watermark.mounted.apply(watermark.build(store.getPreset()));
  });

  return { unsubscribe, sync, objects };
}
