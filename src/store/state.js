import { history as historyConfig } from "../config.js";
import { createHistory } from "./history.js";

/**
 * Single source of truth for the editor: the preset, the selection and the image
 * blob map. Pure (no DOM), so it is testable in Node.
 *
 * Every mutation goes through `update`, which clones the preset, applies the
 * mutator and pushes one history step. Consecutive updates sharing the same
 * `tag` collapse into a single step (continuous interactions: drag, typing).
 * The selection is UI state and never enters the history.
 */
export function createStore(initialPreset, options = {}) {
  if (!initialPreset || typeof initialPreset !== "object") {
    throw new TypeError("createStore requires an initial preset");
  }

  let preset = initialPreset;
  let selectedId = null;
  const images = new Map(options.images ?? []);
  const listeners = new Set();
  const history = createHistory(preset, { size: options.historySize ?? historyConfig.size });

  function emit(event) {
    for (const listener of listeners) listener(event);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("subscribe requires a function");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getPreset() {
    return preset;
  }

  function getSelection() {
    return selectedId;
  }

  function getImage(imageId) {
    return images.get(imageId) ?? null;
  }

  function listImages() {
    return [...images.keys()];
  }

  function setImage(imageId, image) {
    images.set(imageId, image);
    emit({ type: "images" });
  }

  function removeImage(imageId) {
    images.delete(imageId);
    emit({ type: "images" });
  }

  /**
   * Apply a mutator to a clone of the preset and record one history step.
   */
  function update(mutator, { tag = null, label = null } = {}) {
    if (typeof mutator !== "function") throw new TypeError("update requires a mutator function");
    const draft = structuredClone(preset);
    mutator(draft);
    preset = draft;
    history.push(preset, { tag: tag ?? undefined });
    emit({ type: "change", preset, label, tag });
    return preset;
  }

  function replace(nextPreset, { label = null } = {}) {
    if (!nextPreset || typeof nextPreset !== "object") throw new TypeError("replace requires a preset");
    preset = nextPreset;
    history.push(preset);
    emit({ type: "change", preset, label, tag: null });
    return preset;
  }

  function select(objectId) {
    const next = objectId ?? null;
    if (next === selectedId) return;
    selectedId = next;
    emit({ type: "selection", selectedId });
  }

  function undo() {
    const result = history.undo();
    if (!result.ok) return result;
    preset = result.state;
    emit({ type: "change", preset, label: null, tag: null, reason: "undo" });
    return result;
  }

  function redo() {
    const result = history.redo();
    if (!result.ok) return result;
    preset = result.state;
    emit({ type: "change", preset, label: null, tag: null, reason: "redo" });
    return result;
  }

  function reset(nextPreset) {
    preset = nextPreset;
    selectedId = null;
    history.clear(nextPreset);
    emit({ type: "change", preset, label: null, tag: null, reason: "reset" });
  }

  return {
    subscribe,
    getPreset,
    getSelection,
    getImage,
    listImages,
    setImage,
    removeImage,
    update,
    replace,
    select,
    undo,
    redo,
    reset,
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    historySize: () => history.size(),
  };
}
