import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../../src/store/state.js";
import { defaultPreset } from "../../src/core/schema.js";

function makeStore() {
  return createStore(defaultPreset());
}

test("subscribers are notified and can unsubscribe", () => {
  const store = makeStore();
  const events = [];
  const off = store.subscribe((event) => events.push(event.type));
  store.update((preset) => {
    preset.name = "Caderno";
  });
  off();
  store.update((preset) => {
    preset.name = "Outro";
  });
  assert.deepEqual(events, ["change"]);
});

test("update mutates a clone and records one history step", () => {
  const store = makeStore();
  const before = store.getPreset();
  assert.equal(store.canUndo(), false);

  store.update((preset) => {
    preset.page.margins.top = 12;
  });

  const after = store.getPreset();
  assert.notEqual(after, before);
  assert.equal(before.page.margins.top, 10, "the previous state must not be mutated");
  assert.equal(after.page.margins.top, 12);
  assert.equal(store.canUndo(), true);
});

test("updates sharing a tag collapse into a single step", () => {
  const store = makeStore();
  for (const value of [11, 13, 17]) {
    store.update((preset) => {
      preset.page.margins.top = value;
    }, { tag: "margin-drag" });
  }
  assert.equal(store.getPreset().page.margins.top, 17);

  store.undo();
  assert.equal(store.getPreset().page.margins.top, 10, "one undo returns to the pre-drag state");
});

test("different tags create separate steps", () => {
  const store = makeStore();
  store.update((preset) => {
    preset.page.margins.top = 12;
  }, { tag: "a" });
  store.update((preset) => {
    preset.page.margins.bottom = 20;
  }, { tag: "b" });

  store.undo();
  assert.equal(store.getPreset().page.margins.bottom, 10);
  assert.equal(store.getPreset().page.margins.top, 12);
});

test("undo and redo walk the history", () => {
  const store = makeStore();
  store.update((preset) => {
    preset.page.size = "A5";
  });
  assert.equal(store.undo().ok, true);
  assert.equal(store.getPreset().page.size, "A4");
  assert.equal(store.canRedo(), true);
  assert.equal(store.redo().ok, true);
  assert.equal(store.getPreset().page.size, "A5");
});

test("undo on an empty history reports a code", () => {
  const store = makeStore();
  assert.deepEqual(store.undo(), { ok: false, code: "history.empty" });
  assert.deepEqual(store.redo(), { ok: false, code: "history.empty" });
});

test("selection is UI state and stays out of the history", () => {
  const store = makeStore();
  store.update((preset) => {
    preset.objects = [{ id: "o1", type: "image", x: 0, y: 0, w: 10, h: 10 }];
  });
  store.select("o1");
  assert.equal(store.getSelection(), "o1");

  store.undo();
  assert.equal(store.getSelection(), "o1", "undo does not clear the selection");
  assert.equal(store.getPreset().objects.length, 0);
});

test("replace and reset push a fresh baseline", () => {
  const store = makeStore();
  const other = defaultPreset();
  other.name = "Importado";
  store.replace(other);
  assert.equal(store.getPreset().name, "Importado");
  assert.equal(store.canUndo(), true);

  store.reset(defaultPreset());
  assert.equal(store.canUndo(), false);
  assert.equal(store.getSelection(), null);
});

test("images live outside the preset state", () => {
  const store = makeStore();
  assert.equal(store.getImage("img1"), null);
  store.setImage("img1", { mime: "image/png", width: 10, height: 10 });
  assert.deepEqual(store.getImage("img1"), { mime: "image/png", width: 10, height: 10 });
  assert.deepEqual(store.listImages(), ["img1"]);
  store.removeImage("img1");
  assert.deepEqual(store.listImages(), []);
});

test("invalid arguments are refused", () => {
  assert.throws(() => createStore(null), TypeError);
  const store = makeStore();
  assert.throws(() => store.update("nope"), TypeError);
  assert.throws(() => store.subscribe("nope"), TypeError);
  assert.throws(() => store.replace(null), TypeError);
});
