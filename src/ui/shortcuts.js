import { keyboard } from "../config.js";
import { duplicateLayer, removeLayer } from "../store/layers.js";

/**
 * Keyboard shortcuts (spec 5.8).
 *
 * `resolveShortcut` is pure: it takes a plain object shaped like a KeyboardEvent
 * and returns the action to run. The DOM wiring lives in `installShortcuts`.
 */

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "number", "password"]);

export function isTextField(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName ?? "").toUpperCase();
  if (target.isContentEditable === true) return true;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = String(target.type ?? "text").toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

/** Ctrl+Z / Ctrl+Shift+Z / Ctrl+S survive while typing; everything else does not. */
function survivesTextField(action) {
  return action === "undo" || action === "redo" || action === "save";
}

const ARROWS = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

export function resolveShortcut(event, { hasSelection = false } = {}) {
  if (!event || typeof event.key !== "string") return { action: "none" };
  const mod = event.ctrlKey === true || event.metaKey === true;
  const key = event.key;
  const lower = key.toLowerCase();

  let result = { action: "none" };

  if (mod && lower === "z") result = { action: event.shiftKey === true ? "redo" : "undo" };
  else if (mod && lower === "y") result = { action: "redo" };
  else if (mod && lower === "d") result = { action: "duplicate" };
  else if (mod && lower === "s") result = { action: "save" };
  else if (key === "Delete" || key === "Backspace") result = { action: "delete" };
  else if (key === "Escape") result = { action: "escape" };
  else if (key === "?") result = { action: "help" };
  else if (ARROWS[key]) {
    const step = event.shiftKey === true ? keyboard.nudgeShiftMm : keyboard.nudgeMm;
    result = { action: "nudge", dx: ARROWS[key].dx * step, dy: ARROWS[key].dy * step };
  }

  if (result.action === "none") return result;
  if (isTextField(event.target) && !survivesTextField(result.action)) return { action: "none" };
  if ((result.action === "delete" || result.action === "nudge" || result.action === "duplicate") && !hasSelection) {
    return { action: "none" };
  }
  return result;
}

export function installShortcuts(window_, { store, onSave = () => {}, onHelp = () => {}, onNudge = null } = {}) {
  if (!window_ || !store) throw new TypeError("installShortcuts requires a window and a store");

  const handler = (event) => {
    const selection = store.getSelection();
    const resolved = resolveShortcut(event, { hasSelection: Boolean(selection) });
    if (resolved.action === "none") return;

    const preset = store.getPreset();
    const selected = (preset.objects ?? []).find((object) => object.id === selection);

    switch (resolved.action) {
      case "undo":
        event.preventDefault();
        store.undo();
        break;
      case "redo":
        event.preventDefault();
        store.redo();
        break;
      case "save":
        event.preventDefault();
        onSave(preset);
        break;
      case "duplicate":
        event.preventDefault();
        store.update((draft) => {
          if (!Array.isArray(draft.objects)) return;
          const result = duplicateLayer(draft.objects, selection);
          if (result.ok) draft.objects = result.objects;
        }, { tag: null, label: "Duplicar objeto" });
        break;
      case "delete":
        event.preventDefault();
        store.update((draft) => {
          if (!Array.isArray(draft.objects)) return;
          const result = removeLayer(draft.objects, selection);
          if (result.ok) draft.objects = result.objects;
        }, { tag: null, label: "Excluir objeto" });
        store.select(null);
        break;
      case "escape":
        store.select(null);
        break;
      case "help":
        event.preventDefault();
        onHelp();
        break;
      case "nudge": {
        if (!selected || selected.locked) break;
        event.preventDefault();
        if (typeof onNudge === "function") {
          onNudge(resolved, selected);
          break;
        }
        store.update((draft) => {
          const object = (draft.objects ?? []).find((item) => item.id === selection);
          if (!object) return;
          object.x += resolved.dx;
          object.y += resolved.dy;
        }, { tag: `nudge:${selection}`, label: "Mover objeto" });
        break;
      }
      default:
        break;
    }
  };

  window_.addEventListener("keydown", handler);
  return () => window_.removeEventListener("keydown", handler);
}
