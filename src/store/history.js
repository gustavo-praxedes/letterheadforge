import { history as historyConfig } from "../config.js";

/**
 * Undo/redo history over immutable snapshots (spec 5.8, contracts §14).
 *
 * States are stored by reference; nothing is cloned. The stacks keep at most
 * `size` snapshots and drop the oldest when the limit is exceeded.
 *
 * `push(state, { tag })` groups a continuous interaction into a single step:
 * when the tag equals the tag of the current top of the stack, the snapshot is
 * replaced instead of appended, so dragging or typing yields one undo step.
 * Any new step clears the redo branch.
 */
export function createHistory(initialState, options = {}) {
  const requested = options && options.size !== undefined ? options.size : historyConfig.size;
  const limit =
    isFiniteNumber(requested) && requested >= 1 ? Math.floor(requested) : historyConfig.size;

  let states = [initialState];
  let tags = [undefined];
  let index = 0;

  function push(state, opts = {}) {
    const tag = opts ? opts.tag : undefined;
    const atTop = index === states.length - 1;

    if (tag !== undefined && atTop && tags[index] === tag) {
      states[index] = state;
      return;
    }

    if (!atTop) {
      states = states.slice(0, index + 1);
      tags = tags.slice(0, index + 1);
    }

    states.push(state);
    tags.push(tag);
    index += 1;

    while (states.length > limit) {
      states.shift();
      tags.shift();
      index -= 1;
    }
  }

  function replace(state) {
    states[index] = state;
  }

  function undo() {
    if (index === 0) return { ok: false, code: "history.empty" };
    index -= 1;
    return { ok: true, state: states[index] };
  }

  function redo() {
    if (index >= states.length - 1) return { ok: false, code: "history.empty" };
    index += 1;
    return { ok: true, state: states[index] };
  }

  function canUndo() {
    return index > 0;
  }

  function canRedo() {
    return index < states.length - 1;
  }

  function current() {
    return states[index];
  }

  function size() {
    return states.length;
  }

  function clear(state) {
    states = [state];
    tags = [undefined];
    index = 0;
  }

  return {
    push,
    replace,
    undo,
    redo,
    canUndo,
    canRedo,
    state: current,
    size,
    clear,
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
