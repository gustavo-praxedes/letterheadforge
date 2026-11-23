import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_VERSION, migratePreset } from "../../src/core/migrate.js";
import { defaultPreset } from "../../src/core/schema.js";

test("current version matches the schema version", () => {
  assert.equal(CURRENT_VERSION, 1);
});

test("a current preset migrates without changes and without mutation", () => {
  const preset = defaultPreset();
  const snapshot = JSON.parse(JSON.stringify(preset));
  const result = migratePreset(preset);
  assert.equal(result.ok, true);
  assert.equal(result.fromVersion, 1);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.preset, snapshot);
  assert.notEqual(result.preset, preset);
});

test("a preset without schemaVersion is treated as version 1", () => {
  const preset = defaultPreset();
  delete preset.schemaVersion;
  const result = migratePreset(preset);
  assert.equal(result.ok, true);
  assert.equal(result.fromVersion, 1);
  assert.equal(result.preset.schemaVersion, CURRENT_VERSION);
  assert.equal(preset.schemaVersion, undefined);
});

test("a newer version is refused", () => {
  const preset = defaultPreset();
  preset.schemaVersion = CURRENT_VERSION + 1;
  const result = migratePreset(preset);
  assert.equal(result.ok, false);
  assert.equal(result.code, "schema.unsupportedVersion");
});

test("an invalid version is refused", () => {
  for (const value of [0, -1, 1.5, "1", null]) {
    const preset = defaultPreset();
    preset.schemaVersion = value;
    const result = migratePreset(preset);
    assert.equal(result.ok, false, String(value));
    assert.equal(result.code, "schema.invalidVersion", String(value));
  }
});

test("non-object input is refused", () => {
  for (const value of [null, undefined, [], "preset", 7]) {
    const result = migratePreset(value);
    assert.equal(result.ok, false);
    assert.equal(result.code, "schema.invalidPreset");
  }
});
