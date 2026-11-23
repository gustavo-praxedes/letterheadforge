import test from "node:test";
import assert from "node:assert/strict";
import { isTextField, resolveShortcut } from "../../src/ui/shortcuts.js";

const key = (name, modifiers = {}, target = { tagName: "BODY" }) => ({
  key: name,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  target,
  ...modifiers,
});

const input = { tagName: "INPUT", type: "text" };
const textarea = { tagName: "TEXTAREA" };
const select = { tagName: "SELECT" };
const checkbox = { tagName: "INPUT", type: "checkbox" };
const body = { tagName: "BODY" };

test("isTextField knows inputs, textareas, selects and editable nodes", () => {
  assert.equal(isTextField(input), true);
  assert.equal(isTextField(textarea), true);
  assert.equal(isTextField(select), true);
  assert.equal(isTextField({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTextField(checkbox), false);
  assert.equal(isTextField(body), false);
  assert.equal(isTextField(null), false);
});

test("undo and redo accept Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y", () => {
  assert.equal(resolveShortcut(key("z", { ctrlKey: true })).action, "undo");
  assert.equal(resolveShortcut(key("z", { metaKey: true })).action, "undo");
  assert.equal(resolveShortcut(key("z", { ctrlKey: true, shiftKey: true })).action, "redo");
  assert.equal(resolveShortcut(key("y", { ctrlKey: true })).action, "redo");
});

test("undo and save survive while typing, other shortcuts do not", () => {
  assert.equal(resolveShortcut(key("z", { ctrlKey: true }, input)).action, "undo");
  assert.equal(resolveShortcut(key("s", { ctrlKey: true }, textarea)).action, "save");
  assert.equal(resolveShortcut(key("d", { ctrlKey: true }, input)).action, "none");
  assert.equal(resolveShortcut(key("Delete", {}, textarea)).action, "none");
  assert.equal(resolveShortcut(key("ArrowLeft", {}, input)).action, "none");
  assert.equal(resolveShortcut(key("?", {}, input)).action, "none");
});

test("object actions require a selection", () => {
  assert.equal(resolveShortcut(key("d", { ctrlKey: true }), { hasSelection: false }).action, "none");
  assert.equal(resolveShortcut(key("d", { ctrlKey: true }), { hasSelection: true }).action, "duplicate");
  assert.equal(resolveShortcut(key("Delete"), { hasSelection: false }).action, "none");
  assert.equal(resolveShortcut(key("Delete"), { hasSelection: true }).action, "delete");
  assert.equal(resolveShortcut(key("Backspace"), { hasSelection: true }).action, "delete");
});

test("escape and help work without a selection", () => {
  assert.equal(resolveShortcut(key("Escape")).action, "escape");
  assert.equal(resolveShortcut(key("?")).action, "help");
});

test("arrows nudge 1 mm and 10 mm with Shift", () => {
  const right = resolveShortcut(key("ArrowRight"), { hasSelection: true });
  assert.deepEqual([right.action, right.dx, right.dy], ["nudge", 1, 0]);

  const up = resolveShortcut(key("ArrowUp", { shiftKey: true }), { hasSelection: true });
  assert.deepEqual([up.action, up.dx, up.dy], ["nudge", 0, -10]);

  const down = resolveShortcut(key("ArrowDown"), { hasSelection: true });
  assert.deepEqual([down.dx, down.dy], [0, 1]);
});

test("unknown keys and invalid events resolve to none", () => {
  assert.equal(resolveShortcut(key("a")).action, "none");
  assert.equal(resolveShortcut(null).action, "none");
  assert.equal(resolveShortcut({}).action, "none");
});
