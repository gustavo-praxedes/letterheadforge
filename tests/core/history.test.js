import test from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "../../src/store/history.js";
import { history as historyConfig } from "../../src/config.js";

test("starts with the initial state and nothing to undo or redo", () => {
  const initial = { value: 0 };
  const history = createHistory(initial);

  assert.equal(history.state(), initial);
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
  assert.equal(history.size(), 1);
  assert.deepEqual(history.undo(), { ok: false, code: "history.empty" });
  assert.deepEqual(history.redo(), { ok: false, code: "history.empty" });
});

test("keeps at most 100 snapshots and drops the oldest", () => {
  assert.equal(historyConfig.size, 100);

  const history = createHistory({ n: 0 });
  for (let i = 1; i <= 150; i += 1) history.push({ n: i });

  assert.equal(history.size(), 100);
  assert.deepEqual(history.state(), { n: 150 });

  let steps = 0;
  while (history.canUndo()) {
    history.undo();
    steps += 1;
  }
  assert.equal(steps, 99);
  assert.deepEqual(history.state(), { n: 51 });
});

test("a custom size also drops the oldest snapshot", () => {
  const history = createHistory("s0", { size: 3 });
  new Array(4).fill(null).forEach((_, i) => history.push(`s${i + 1}`));

  assert.equal(history.size(), 3);
  assert.equal(history.state(), "s4");
  assert.equal(history.undo().state, "s3");
  assert.equal(history.undo().state, "s2");
  assert.equal(history.canUndo(), false);
});

test("the same tag groups a continuous interaction into one step", () => {
  const a = { text: "a" };
  const b = { text: "ab" };
  const c = { text: "abc" };
  const history = createHistory({ text: "" });

  history.push(a, { tag: "typing" });
  history.push(b, { tag: "typing" });
  history.push(c, { tag: "typing" });

  assert.equal(history.size(), 2);
  assert.equal(history.state(), c);
  assert.deepEqual(history.undo().state, { text: "" });
  assert.equal(history.canUndo(), false);
});

test("a different or absent tag adds a new step", () => {
  const history = createHistory("s0");
  history.push("s1", { tag: "drag" });
  history.push("s2", { tag: "resize" });
  history.push("s3");

  assert.equal(history.size(), 4);
  assert.equal(history.undo().state, "s2");
  assert.equal(history.undo().state, "s1");
  assert.equal(history.undo().state, "s0");
});

test("redo walks forward after undo", () => {
  const history = createHistory("s0");
  history.push("s1");
  history.push("s2");

  assert.deepEqual(history.undo(), { ok: true, state: "s1" });
  assert.equal(history.canRedo(), true);
  assert.deepEqual(history.redo(), { ok: true, state: "s2" });
  assert.equal(history.canRedo(), false);
  assert.deepEqual(history.redo(), { ok: false, code: "history.empty" });
});

test("a new action clears the redo branch", () => {
  const history = createHistory("s0");
  history.push("s1");
  history.push("s2");
  history.undo();
  assert.equal(history.canRedo(), true);

  history.push("s3");
  assert.equal(history.canRedo(), false);
  assert.equal(history.state(), "s3");
  assert.equal(history.undo().state, "s1");
});

test("replace swaps the current snapshot without adding a step", () => {
  const history = createHistory("s0");
  history.push("s1");
  const sizeBefore = history.size();

  history.replace("s1b");
  assert.equal(history.state(), "s1b");
  assert.equal(history.size(), sizeBefore);
  assert.equal(history.undo().state, "s0");
});

test("clear resets the history to a single snapshot", () => {
  const history = createHistory("s0");
  history.push("s1");
  history.push("s2");

  history.clear("fresh");
  assert.equal(history.state(), "fresh");
  assert.equal(history.size(), 1);
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
});

test("snapshots are kept by reference, never cloned", () => {
  const first = { nested: { value: 1 } };
  const second = { nested: { value: 2 } };
  const history = createHistory(first);

  history.push(second);
  assert.equal(history.state(), second);
  assert.equal(history.undo().state, first);
  assert.equal(history.redo().state, second);
});

test("grouping is only applied at the top of the stack", () => {
  const history = createHistory("s0");
  history.push("s1", { tag: "drag" });
  history.push("s2", { tag: "drag" });
  history.undo();

  history.push("s1b", { tag: "drag" });
  assert.equal(history.state(), "s1b");
  assert.equal(history.size(), 2);
  assert.equal(history.undo().state, "s0");
});

test("a non-positive size falls back to the configured limit", () => {
  const history = createHistory("s0", { size: 0 });
  for (let i = 1; i <= historyConfig.size + 5; i += 1) history.push(`s${i}`);
  assert.equal(history.size(), historyConfig.size);
});
