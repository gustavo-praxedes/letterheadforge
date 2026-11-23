import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { createAutosave } from "../../src/store/autosave.js";
import { createStore } from "../../src/store/state.js";
import { defaultPreset } from "../../src/core/schema.js";

function makeFakeDb() {
  const saves = [];
  return {
    saves,
    saveDraft(payload) {
      saves.push(payload);
      return Promise.resolve(payload);
    },
  };
}

function makeSetup(delayMs = 20) {
  const db = makeFakeDb();
  const store = createStore(defaultPreset());
  const autosave = createAutosave({ db, store, delayMs });
  return { db, store, autosave };
}

function setMargin(store, value) {
  store.update((preset) => {
    preset.page.margins.top = value;
  });
}

test("a burst of changes produces a single write", async () => {
  const { db, store, autosave } = makeSetup();

  setMargin(store, 11);
  setMargin(store, 12);
  setMargin(store, 13);
  assert.equal(db.saves.length, 0, "nothing is written before the delay elapses");

  await sleep(60);
  assert.equal(db.saves.length, 1);
  assert.equal(db.saves[0].preset.page.margins.top, 13);

  autosave.stop();
});

test("flush writes immediately and returns the write", async () => {
  const { db, store, autosave } = makeSetup(5000);

  setMargin(store, 20);
  assert.equal(db.saves.length, 0);

  await autosave.flush();
  assert.equal(db.saves.length, 1);
  assert.equal(db.saves[0].preset.page.margins.top, 20);

  await sleep(20);
  assert.equal(db.saves.length, 1, "the pending timer must not write again");
  autosave.stop();
});

test("the selection is persisted but never triggers a write", async () => {
  const { db, store, autosave } = makeSetup();

  store.select("object-1");
  await sleep(40);
  assert.equal(db.saves.length, 0);

  setMargin(store, 15);
  await autosave.flush();
  assert.equal(db.saves.length, 1);
  assert.equal(db.saves[0].selectionId, "object-1");

  autosave.stop();
});

test("an unchanged preset is not written twice", async () => {
  const { db, store, autosave } = makeSetup();

  await autosave.flush();
  assert.equal(db.saves.length, 1);

  store.update(() => {});
  await autosave.flush();
  assert.equal(db.saves.length, 1, "an equal serialized preset is skipped");

  autosave.stop();
});

test("stop cancels the pending write and further saves", async () => {
  const { db, store, autosave } = makeSetup();

  setMargin(store, 21);
  autosave.stop();
  await sleep(50);
  assert.equal(db.saves.length, 0);

  setMargin(store, 22);
  await sleep(50);
  assert.equal(db.saves.length, 0);
});

test("a change during a write is written afterwards, once", async () => {
  const { db, store, autosave } = makeSetup(10);

  setMargin(store, 30);
  const first = autosave.flush();
  setMargin(store, 31);
  await first;
  await autosave.flush();

  assert.equal(db.saves.length, 2);
  assert.equal(db.saves[0].preset.page.margins.top, 30);
  assert.equal(db.saves[1].preset.page.margins.top, 31);

  autosave.stop();
});

test("invalid arguments are refused", () => {
  assert.throws(() => createAutosave({}), TypeError);
  assert.throws(() => createAutosave({ db: {} }), TypeError);
  assert.throws(
    () => createAutosave({ db: { saveDraft() {} }, store: createStore(defaultPreset()), delayMs: -1 }),
    TypeError,
  );
});
