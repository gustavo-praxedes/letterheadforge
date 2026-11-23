import assert from "node:assert/strict";
import test from "node:test";

import { startExport } from "../../src/pdf/export.js";

/** Minimal Worker stand-in: records messages and drives the callbacks. */
function fakeWorker() {
  const listeners = new Map();
  const worker = {
    posted: [],
    terminated: false,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    postMessage(message) {
      worker.posted.push(message);
    },
    terminate() {
      worker.terminated = true;
    },
    emit(type, data) {
      listeners.get(type)?.({ data });
    },
    fail(message = "boom") {
      listeners.get("error")?.({ message });
    },
  };
  return worker;
}

const scene = { widthMm: 210, heightMm: 297, warnings: [], primitives: [] };
const preset = { name: "Teste", page: { size: "A4", orientation: "portrait", margins: { top: 10, right: 10, bottom: 10, left: 10 } } };

test("a successful export reports progress and yields the file name", async () => {
  const worker = fakeWorker();
  const progress = [];
  let delivered = null;

  const job = startExport({
    scene,
    preset,
    workerFactory: () => worker,
    onProgress: (info) => progress.push(info.step),
    onDone: (bytes, name) => {
      delivered = { size: bytes.byteLength, name };
    },
    dates: { now: () => new Date(2026, 10, 23) },
  });

  // The first message carries the whole job to the worker.
  assert.equal(worker.posted.length, 1);
  assert.equal(worker.posted[0].type, "render");
  assert.equal(worker.posted[0].meta.title, "LetterheadForge — Teste");
  assert.equal(worker.posted[0].meta.producer, "LetterheadForge 0.1.0");

  worker.emit("message", { type: "progress", step: "fonts", index: 1, total: 4 });
  worker.emit("message", { type: "done", bytes: new Uint8Array([1, 2, 3, 4]) });

  const result = await job.promise;
  assert.equal(result.ok, true);
  assert.equal(result.name, "letterheadforge-a4-retrato-20261123.pdf");
  assert.deepEqual(delivered, { size: 4, name: "letterheadforge-a4-retrato-20261123.pdf" });
  assert.deepEqual(progress, ["prepare", "fonts", "done"]);
  assert.equal(worker.terminated, true);
});

test("a blocking validation never starts the worker", async () => {
  const worker = fakeWorker();
  const errors = [];
  const job = startExport({
    scene: { ...scene, warnings: [{ code: "font.missingGlyph", params: {} }] },
    preset,
    workerFactory: () => worker,
    onError: (error) => errors.push(error.code),
  });

  const result = await job.promise;
  assert.equal(result.ok, false);
  assert.equal(result.code, "font.missingGlyph");
  assert.deepEqual(errors, ["font.missingGlyph"]);
  assert.equal(worker.posted.length, 0);
});

test("an invalid page size is rejected before anything else", async () => {
  const job = startExport({
    scene,
    preset: { ...preset, page: { ...preset.page, size: "A3" } },
    workerFactory: () => fakeWorker(),
  });
  const result = await job.promise;
  assert.equal(result.code, "export.invalidSize");
});

test("a worker error is surfaced with its code", async () => {
  const worker = fakeWorker();
  const job = startExport({
    scene,
    preset,
    workerFactory: () => worker,
    onError: () => {},
  });
  worker.emit("message", { type: "error", code: "image.invalidFile", params: { imageId: "x" } });
  const result = await job.promise;
  assert.equal(result.ok, false);
  assert.equal(result.code, "image.invalidFile");
});

test("cancel terminates the worker and never delivers a file", async () => {
  const worker = fakeWorker();
  let delivered = false;
  const errors = [];
  const job = startExport({
    scene,
    preset,
    workerFactory: () => worker,
    onDone: () => {
      delivered = true;
    },
    onError: (error) => errors.push(error.code),
  });

  job.cancel();
  const result = await job.promise;
  assert.equal(result.code, "export.cancelled");
  assert.equal(delivered, false);
  assert.deepEqual(errors, ["export.cancelled"]);
  assert.equal(worker.terminated, true);

  // A message that arrives after the cancel must not resurrect the job.
  worker.emit("message", { type: "done", bytes: new Uint8Array([9]) });
  assert.equal(delivered, false);
});

test("a crashed worker is reported as a failure", async () => {
  const worker = fakeWorker();
  const job = startExport({ scene, preset, workerFactory: () => worker, onError: () => {} });
  worker.fail("Script error");
  const result = await job.promise;
  assert.equal(result.ok, false);
  assert.equal(result.code, "export.failed");
});
