/**
 * Draft autosave (spec 9.2, R128).
 *
 * Listens to the store and debounces bursts of change events into a single
 * write. Selection and image events are ignored, and a change that produces the
 * same serialized preset as the last successful write is skipped.
 */

const DEFAULT_DELAY_MS = 800;

export function createAutosave({ db, store, delayMs = DEFAULT_DELAY_MS } = {}) {
  if (!db || typeof db.saveDraft !== "function") {
    throw new TypeError("createAutosave requires a db with saveDraft()");
  }
  if (!store || typeof store.subscribe !== "function" || typeof store.getPreset !== "function") {
    throw new TypeError("createAutosave requires a store");
  }
  if (typeof delayMs !== "number" || !Number.isFinite(delayMs) || delayMs < 0) {
    throw new TypeError("delayMs must be a non-negative number");
  }

  let timer = null;
  let lastSaved = null;
  let writing = null;
  let stopped = false;

  function snapshot() {
    const preset = store.getPreset();
    const selectionId = typeof store.getSelection === "function" ? store.getSelection() ?? null : null;
    return { preset, selectionId };
  }

  function currentVersion() {
    return JSON.stringify(store.getPreset());
  }

  async function write() {
    const { preset, selectionId } = snapshot();
    const version = JSON.stringify(preset);
    if (version === lastSaved) return null;
    const record = await db.saveDraft({ preset, selectionId });
    lastSaved = version;
    return record;
  }

  function clearTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    if (stopped) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      flush().catch(() => {});
    }, delayMs);
  }

  function flush() {
    clearTimer();
    const next = writing ? writing.then(write, write) : write();
    writing = next.catch(() => {});
    return next;
  }

  const unsubscribe = store.subscribe((event) => {
    if (stopped) return;
    if (!event || event.type !== "change") return;
    if (currentVersion() === lastSaved) return;
    schedule();
  });

  function stop() {
    stopped = true;
    clearTimer();
    unsubscribe();
  }

  return { flush, stop };
}
