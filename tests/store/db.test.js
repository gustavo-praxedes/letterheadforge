import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb } from "../../src/store/db.js";
import { defaultPreset } from "../../src/core/schema.js";
import { validatePreset } from "../../src/core/validate.js";
import { limits } from "../../src/config.js";
import { createFakeIndexedDB } from "../support/fake-indexeddb.js";

function makeDb() {
  const factory = createFakeIndexedDB();
  return { factory, db: createDb({ indexedDB: () => factory }) };
}

function namedPreset(name) {
  const preset = defaultPreset();
  preset.name = name;
  return preset;
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(typeof error, "object", "the rejection must be an object, not a bare string");
    assert.equal(error.code, code);
    assert.equal(typeof error.message, "string");
    return true;
  });
}

test("a draft makes a round trip with its selection and timestamp", async () => {
  const { db } = makeDb();
  const preset = defaultPreset();
  preset.page.margins.top = 18;

  assert.equal(await db.loadDraft(), null);

  await db.saveDraft({ preset, selectionId: "object-1" });
  const loaded = await db.loadDraft();

  assert.deepEqual(loaded.preset, preset);
  assert.equal(loaded.selectionId, "object-1");
  assert.equal(typeof loaded.savedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(loaded.savedAt)));
});

test("the draft is a single record keyed by 'current'", async () => {
  const { db } = makeDb();
  await db.saveDraft({ preset: namedPreset("Primeiro") });
  await db.saveDraft({ preset: namedPreset("Segundo") });

  const loaded = await db.loadDraft();
  assert.equal(loaded.preset.name, "Segundo");
  assert.equal(loaded.selectionId, null);

  await db.clearDraft();
  assert.equal(await db.loadDraft(), null);
});

test("a stored preset is migrated to the current schema on load", async () => {
  const { db } = makeDb();
  const handle = await db.open();
  const legacy = defaultPreset();
  delete legacy.schemaVersion;

  const transaction = handle.transaction(["draft"], "readwrite");
  await transaction.objectStore("draft").put({ id: "current", preset: legacy, selectionId: null });

  const loaded = await db.loadDraft();
  assert.equal(loaded.preset.schemaVersion, 1);
  assert.equal(loaded.preset.name, legacy.name);
});

test("an unreadable draft is refused with the migration code", async () => {
  const { db } = makeDb();
  const handle = await db.open();
  const broken = defaultPreset();
  broken.schemaVersion = 99;

  const transaction = handle.transaction(["draft"], "readwrite");
  await transaction.objectStore("draft").put({ id: "current", preset: broken });

  await expectCode(db.loadDraft(), "schema.unsupportedVersion");
});

test("a corrupt draft is refused with a preset code", async () => {
  const { db } = makeDb();
  const handle = await db.open();
  const invalid = defaultPreset();
  invalid.page.size = "A3";

  const transaction = handle.transaction(["draft"], "readwrite");
  await transaction.objectStore("draft").put({ id: "current", preset: invalid });

  await expectCode(db.loadDraft(), "preset.invalid");
});

test("a saved preset is listed with its label and can be deleted", async () => {
  const { db } = makeDb();
  const record = await db.savePreset("  Caderno  ", namedPreset("Caderno"));

  assert.equal(record.name, "Caderno");
  assert.equal(typeof record.id, "string");
  assert.equal(typeof record.createdAt, "string");

  const list = await db.listPresets();
  assert.equal(list.length, 1);
  assert.equal(list[0].preset.name, "Caderno");
  assert.equal(list[0].id, record.id);

  assert.equal(await db.deletePreset(record.id), true);
  assert.equal(await db.deletePreset(record.id), false);
  assert.deepEqual(await db.listPresets(), []);
});

test("the preset count is capped at thirty", async () => {
  const { db } = makeDb();
  for (let index = 0; index < limits.presetsMax; index += 1) {
    await db.savePreset(`Modelo ${index}`, namedPreset(`Modelo ${index}`));
  }
  assert.equal((await db.listPresets()).length, limits.presetsMax);

  await expectCode(db.savePreset("Um a mais", namedPreset("Um a mais")), "preset.limitReached");
});

test("preset names must be present, unique and at most sixty characters", async () => {
  const { db } = makeDb();

  await expectCode(db.savePreset("   ", namedPreset("Vazio")), "preset.nameEmpty");
  await expectCode(db.savePreset(undefined, namedPreset("Sem nome")), "preset.nameEmpty");

  const long = "a".repeat(limits.presetNameMaxLength + 1);
  await expectCode(db.savePreset(long, namedPreset(long)), "preset.nameTooLong");

  const exact = "b".repeat(limits.presetNameMaxLength);
  const accepted = await db.savePreset(exact, namedPreset(exact));
  assert.equal(accepted.name.length, limits.presetNameMaxLength);

  await expectCode(db.savePreset(exact, namedPreset(exact)), "preset.nameDuplicate");
  await expectCode(db.savePreset("B".repeat(limits.presetNameMaxLength), namedPreset("x")), "preset.nameDuplicate");
});

test("an invalid preset is not saved", async () => {
  const { db } = makeDb();
  const invalid = defaultPreset();
  invalid.objects = "not an array";
  await expectCode(db.savePreset("Quebrado", invalid), "preset.invalid");
  assert.deepEqual(await db.listPresets(), []);
});

test("images make a round trip with their metadata", async () => {
  const { db } = makeDb();
  const blob = { size: 2048, kind: "blob" };
  const meta = { bytes: 2048, width: 800, height: 600, type: "image/png" };

  assert.equal(await db.getImage("img-1"), null);

  const stored = await db.putImage("img-1", blob, meta);
  assert.equal(stored.bytes, 2048);

  const loaded = await db.getImage("img-1");
  assert.deepEqual(loaded.blob, blob);
  assert.equal(loaded.width, 800);
  assert.equal(loaded.height, 600);
  assert.equal(loaded.type, "image/png");

  assert.equal(await db.deleteImage("img-1"), true);
  assert.equal(await db.getImage("img-1"), null);
});

test("image metadata is validated before it is stored", async () => {
  const { db } = makeDb();
  const blob = { size: 1 };
  const tooLarge = { bytes: limits.image.maxBytes + 1, width: 10, height: 10, type: "image/png" };
  await expectCode(db.putImage("img-1", blob, tooLarge), "image.tooLarge");

  const hugeSide = { bytes: 10, width: limits.image.maxSidePx + 1, height: 10, type: "image/png" };
  await expectCode(db.putImage("img-2", blob, hugeSide), "image.dimensions");

  await expectCode(db.putImage("img-3", blob, { bytes: 10, width: 10, height: 10, type: "image/gif" }), "invalid.imageMime");
  await expectCode(db.putImage("", blob, { bytes: 10, width: 10, height: 10, type: "image/png" }), "image.invalid");
});

test("templates are stored and read back", async () => {
  const { db } = makeDb();
  const templates = JSON.parse(readFileSync(new URL("../../data/templates.json", import.meta.url), "utf8"));

  assert.deepEqual(await db.loadTemplates(), []);
  await db.saveTemplates(templates);

  const stored = await db.loadTemplates();
  assert.equal(stored.length, templates.length);
  assert.deepEqual(stored.map((entry) => entry.id), templates.map((entry) => entry.id));
});

test("data/templates.json holds three complete and valid presets", () => {
  const templates = JSON.parse(readFileSync(new URL("../../data/templates.json", import.meta.url), "utf8"));

  assert.ok(Array.isArray(templates));
  assert.equal(templates.length, 3);

  const sizes = templates.map((entry) => entry.preset.page.size).sort();
  assert.deepEqual(sizes, ["A4", "A5", "A6"]);

  assert.equal(templates[0].preset.frame.enabled, true);
  assert.equal(templates[0].preset.ruling.enabled, true);
  assert.equal(templates[1].preset.frame.enabled, false);
  assert.equal(templates[1].preset.ruling.enabled, true);
  assert.equal(templates[2].preset.ruling.enabled, false);

  for (const entry of templates) {
    assert.equal(typeof entry.id, "string");
    assert.equal(typeof entry.name, "string");
    const result = validatePreset(entry.preset);
    assert.equal(result.ok, true, `${entry.id}: ${JSON.stringify(result.errors)}`);
  }
});

test("opening is idempotent and close allows a fresh open", async () => {
  const { db } = makeDb();
  const first = await db.open();
  const second = await db.open();
  assert.equal(first, second);
  assert.equal(first.objectStoreNames.contains("draft"), true);
  assert.equal(first.objectStoreNames.contains("presets"), true);
  assert.equal(first.objectStoreNames.contains("images"), true);
  assert.equal(first.objectStoreNames.contains("templates"), true);

  const preset = defaultPreset();
  await db.saveDraft({ preset });
  db.close();
  const reopened = await db.open();
  assert.notEqual(reopened, first);
  assert.deepEqual((await db.loadDraft()).preset, preset);
});

test("a missing IndexedDB rejects with a code", async () => {
  const db = createDb({ indexedDB: () => undefined });
  await expectCode(db.open(), "storage.unavailable");
  await expectCode(db.loadDraft(), "storage.unavailable");
});

test("storage failures are wrapped into a code", async () => {
  const factory = {
    open() {
      const request = {};
      Promise.resolve().then(() => {
        request.error = Object.assign(new Error("boom"), { name: "QuotaExceededError" });
        if (typeof request.onerror === "function") request.onerror({ target: request });
      });
      return request;
    },
  };
  const db = createDb({ indexedDB: () => factory });
  await expectCode(db.open(), "storage.quota");
});
