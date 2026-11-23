import { schemaVersion } from "../config.js";

export const CURRENT_VERSION = schemaVersion;

/**
 * One entry per version step: MIGRATIONS[1] upgrades a v1 preset to v2.
 * Empty while the current schema is still v1.
 */
const MIGRATIONS = {};

function clonePreset(preset) {
  return JSON.parse(JSON.stringify(preset));
}

/**
 * Migrate a preset to the current schema version without mutating the input.
 */
export function migratePreset(preset) {
  if (preset === null || typeof preset !== "object" || Array.isArray(preset)) {
    return { ok: false, code: "schema.invalidPreset", message: "Preset must be an object" };
  }

  const declared = preset.schemaVersion;
  let fromVersion;

  if (declared === undefined) {
    fromVersion = 1;
  } else if (typeof declared !== "number" || !Number.isInteger(declared) || declared < 1) {
    return { ok: false, code: "schema.invalidVersion", message: "schemaVersion must be a positive integer" };
  } else {
    fromVersion = declared;
  }

  if (fromVersion > CURRENT_VERSION) {
    return {
      ok: false,
      code: "schema.unsupportedVersion",
      message: `Preset version ${fromVersion} is newer than supported version ${CURRENT_VERSION}`,
    };
  }

  let working = clonePreset(preset);
  for (let version = fromVersion; version < CURRENT_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (typeof migrate !== "function") {
      return {
        ok: false,
        code: "schema.unsupportedVersion",
        message: `No migration path from version ${version}`,
      };
    }
    working = migrate(working);
  }
  working.schemaVersion = CURRENT_VERSION;

  return {
    ok: true,
    preset: working,
    fromVersion,
    migrated: fromVersion !== CURRENT_VERSION,
  };
}
