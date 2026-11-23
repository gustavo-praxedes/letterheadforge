import { limits } from "../config.js";
import { uuid } from "../core/schema.js";

/**
 * Layer operations (task 04.01.09). Pure functions over the `preset.objects`
 * array: the array order is the paint order, so index 0 is the bottom layer and
 * the last entry is the top layer. Nothing here touches the DOM or the geometry.
 */

const NAME_MAX = limits.presetNameMaxLength;

function cloneObjects(objects) {
  return Array.isArray(objects) ? objects.map((object) => ({ ...object })) : [];
}

function indexOf(objects, id) {
  return objects.findIndex((object) => object.id === id);
}

/**
 * List for the layers panel, top layer first (what people expect to read).
 */
export function layerList(preset) {
  const objects = Array.isArray(preset?.objects) ? preset.objects : [];
  return objects
    .map((object, index) => ({
      id: object.id,
      name: object.name || object.type,
      type: object.type,
      visible: object.visible !== false,
      locked: object.locked === true,
      depth: index,
    }))
    .reverse();
}

export function moveLayer(objects, id, direction) {
  const next = cloneObjects(objects);
  const from = indexOf(next, id);
  if (from < 0) return { ok: false, code: "layers.notFound" };
  const to = direction === "up" ? from + 1 : from - 1;
  if (to < 0 || to >= next.length) return { ok: false, code: "layers.noRoom", objects: next };
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ok: true, objects: next };
}

export function toggleLayer(objects, id, property) {
  const next = cloneObjects(objects);
  const target = next.find((object) => object.id === id);
  if (!target) return { ok: false, code: "layers.notFound" };
  if (property === "visible") target.visible = target.visible === false;
  else if (property === "locked") target.locked = target.locked !== true;
  else return { ok: false, code: "layers.unknownProperty" };
  return { ok: true, objects: next };
}

export function renameLayer(objects, id, name) {
  const next = cloneObjects(objects);
  const target = next.find((object) => object.id === id);
  if (!target) return { ok: false, code: "layers.notFound" };
  const trimmed = String(name ?? "").trim();
  if (trimmed.length === 0) return { ok: false, code: "layers.emptyName" };
  target.name = trimmed.slice(0, NAME_MAX);
  return { ok: true, objects: next };
}

export function duplicateLayer(objects, id) {
  const next = cloneObjects(objects);
  const from = indexOf(next, id);
  if (from < 0) return { ok: false, code: "layers.notFound" };
  const copy = { ...next[from], id: uuid(), name: `${next[from].name} (cópia)` };
  next.splice(from + 1, 0, copy);
  return { ok: true, objects: next, id: copy.id };
}

export function removeLayer(objects, id) {
  const next = cloneObjects(objects);
  const from = indexOf(next, id);
  if (from < 0) return { ok: false, code: "layers.notFound" };
  next.splice(from, 1);
  return { ok: true, objects: next };
}

/**
 * Is the object completely outside the sheet? Uses the layout from the core.
 */
export function isOutOfPage(object, layout) {
  if (!object || !layout?.ok) return false;
  const width = layout.sheet?.w;
  const height = layout.sheet?.h;
  if (typeof width !== "number" || typeof height !== "number") return false;
  return object.x + object.w <= 0 || object.y + object.h <= 0 || object.x >= width || object.y >= height;
}

/**
 * Layer rows with the warning already resolved, ready for the DOM layer.
 */
export function layerRows(preset, layout = null) {
  const objects = Array.isArray(preset?.objects) ? preset.objects : [];
  return layerList(preset).map((row) => {
    const source = objects.find((object) => object.id === row.id);
    return {
      ...row,
      outOfPage: layout ? isOutOfPage(source, layout) : false,
      canMoveUp: row.depth < objects.length - 1,
      canMoveDown: row.depth > 0,
    };
  });
}

/**
 * Where an object sits in the paint order, for the preview and the tests.
 */
export function paintOrder(preset) {
  if (!Array.isArray(preset?.objects)) return [];
  return preset.objects.map((object) => object.id);
}
