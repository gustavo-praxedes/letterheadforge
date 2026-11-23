import { limits } from "../config.js";
import { migratePreset } from "../core/migrate.js";
import { uuid } from "../core/schema.js";
import { validateImage, validatePreset } from "../core/validate.js";

/**
 * IndexedDB persistence layer (spec section 9).
 *
 * The storage factory is injectable so the tests can run against an in-memory
 * fake: `createDb({ indexedDB: () => fakeFactory })`. In the browser the default
 * resolves to `globalThis.indexedDB`.
 *
 * Every public method is async and rejects with an `Error` carrying a technical
 * `code` (never a bare string), so callers can map it to a user-facing message.
 * Anything read back from the database goes through `core/migrate.js` and
 * `core/validate.js` before it is handed out.
 */

const DB_NAME = "letterheadforge";
const DB_VERSION = 1;
const DRAFT_KEY = "current";

/** Store name -> key path. `draft` is a single record with a fixed key. */
const STORE_KEYS = {
  draft: "id",
  templates: "id",
  presets: "id",
  images: "id",
};

const QUOTA_ERRORS = new Set(["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"]);

export class DbError extends Error {
  constructor(code, message, options = {}) {
    super(message ?? code);
    this.name = "DbError";
    this.code = code;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.details !== undefined) this.details = options.details;
  }
}

function toDbError(error, fallbackCode) {
  if (error instanceof DbError) return error;
  if (error && typeof error.code === "string") {
    return new DbError(error.code, error.message, { cause: error, details: error.details });
  }
  const name = error && typeof error.name === "string" ? error.name : "";
  const code = QUOTA_ERRORS.has(name) ? "storage.quota" : fallbackCode;
  return new DbError(code, error && error.message ? error.message : code, { cause: error });
}

function resolveFactory(option) {
  const value = typeof option === "function" ? option() : option;
  return value && typeof value.open === "function" ? value : null;
}

/** Run `fn` once the request settles, resolving with `request.result`. */
function requestToPromise(request) {
  if (!request) return Promise.reject(new DbError("storage.requestFailed", "Missing request"));
  if (typeof request.then === "function" && request.onsuccess === undefined) {
    return Promise.resolve(request);
  }
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onabort = () => reject(request.error ?? new DbError("storage.aborted", "Request aborted"));
  });
}

/** Wait for a transaction to commit so a write is not lost on close. */
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new DbError("storage.aborted", "Transaction aborted"));
  });
}

function hasStore(database, name) {
  const names = database.objectStoreNames;
  if (!names) return false;
  if (typeof names.contains === "function") return names.contains(name);
  return Array.from(names).includes(name);
}

function createStores(database) {
  for (const [name, keyPath] of Object.entries(STORE_KEYS)) {
    if (!hasStore(database, name)) database.createObjectStore(name, { keyPath });
  }
}

function trimmedName(name) {
  return typeof name === "string" ? name.trim() : "";
}

/**
 * Validate and migrate a stored preset, throwing a coded error when it cannot
 * be trusted.
 */
function decodePreset(value, fallbackCode = "preset.invalid") {
  const result = migratePreset(value);
  if (!result.ok) throw new DbError(result.code, result.message, { details: result });
  const check = validatePreset(result.preset);
  if (!check.ok) {
    throw new DbError(fallbackCode, "Stored preset is not valid", { details: check.errors });
  }
  return result.preset;
}

function askPersistentStorage() {
  const storage = globalThis.navigator && globalThis.navigator.storage;
  if (storage && typeof storage.persist === "function") {
    try {
      const asked = storage.persist();
      if (asked && typeof asked.catch === "function") asked.catch(() => {});
    } catch {
      // Requesting persistence is best-effort; a failure is not an error.
    }
  }
}

export function createDb({ indexedDB: factoryOption } = {}) {
  const factory = factoryOption ?? (() => globalThis.indexedDB);
  let database = null;
  let opening = null;
  let persistRequested = false;

  async function open() {
    if (database) return database;
    if (opening) return opening;

    opening = (async () => {
      const target = resolveFactory(factory);
      if (!target) throw new DbError("storage.unavailable", "IndexedDB is not available");

      let request;
      try {
        request = target.open(DB_NAME, DB_VERSION);
      } catch (cause) {
        throw toDbError(cause, "storage.openFailed");
      }

      request.onupgradeneeded = () => {
        createStores(request.result);
      };

      const handle = await requestToPromise(request);
      database = handle;
      return database;
    })();

    try {
      return await opening;
    } catch (error) {
      throw toDbError(error, "storage.openFailed");
    } finally {
      opening = null;
    }
  }

  async function withTransaction(name, mode, run) {
    const handle = await open();
    if (!handle) throw new DbError("storage.unavailable", "IndexedDB is not available");
    const fallbackCode = mode === "readwrite" ? "storage.writeFailed" : "storage.readFailed";
    let transaction;
    try {
      transaction = handle.transaction([name], mode);
    } catch (cause) {
      throw toDbError(cause, fallbackCode);
    }
    const store = transaction.objectStore(name);
    let result;
    try {
      result = await run(store);
    } catch (error) {
      throw toDbError(error, fallbackCode);
    }
    if (mode === "readwrite") {
      await transactionDone(transaction).catch((error) => {
        throw toDbError(error, fallbackCode);
      });
    }
    return result;
  }

  function withStore(name, mode, run) {
    return withTransaction(name, mode, (store) => requestToPromise(run(store)));
  }

  async function loadDraft() {
    const record = await withStore("draft", "readonly", (store) => store.get(DRAFT_KEY));
    if (!record) return null;
    return {
      preset: decodePreset(record.preset),
      selectionId: record.selectionId ?? null,
      savedAt: record.savedAt ?? null,
    };
  }

  async function saveDraft({ preset, selectionId = null } = {}) {
    const normalized = decodePreset(preset);
    const record = {
      id: DRAFT_KEY,
      preset: normalized,
      selectionId: selectionId ?? null,
      savedAt: new Date().toISOString(),
    };
    if (!persistRequested) {
      persistRequested = true;
      askPersistentStorage();
    }
    await withStore("draft", "readwrite", (store) => store.put(record));
    return record;
  }

  async function listPresets() {
    const records = await withStore("presets", "readonly", (store) => store.getAll());
    return (Array.isArray(records) ? records : []).map((record) => ({
      id: record.id,
      name: record.name,
      createdAt: record.createdAt ?? null,
      preset: decodePreset(record.preset),
    }));
  }

  async function savePreset(name, preset) {
    const label = trimmedName(name);
    if (label === "") {
      throw new DbError("preset.nameEmpty", "Preset name is required");
    }
    if (label.length > limits.presetNameMaxLength) {
      throw new DbError("preset.nameTooLong", "Preset name is too long", {
        details: { maxLength: limits.presetNameMaxLength },
      });
    }

    const existing = await listPresets();
    const comparison = label.toLocaleLowerCase();
    if (existing.some((record) => record.name.toLocaleLowerCase() === comparison)) {
      throw new DbError("preset.nameDuplicate", "Preset name already exists", { details: { name: label } });
    }
    if (existing.length >= limits.presetsMax) {
      throw new DbError("preset.limitReached", "Preset limit reached", {
        details: { max: limits.presetsMax },
      });
    }

    const copy = JSON.parse(JSON.stringify(preset ?? {}));
    copy.name = label;
    copy.id = uuid();
    const normalized = decodePreset(copy);
    const record = {
      id: normalized.id,
      name: label,
      preset: normalized,
      createdAt: new Date().toISOString(),
    };
    await withStore("presets", "readwrite", (store) => store.put(record));
    return record;
  }

  async function deletePreset(id) {
    if (typeof id !== "string" || id === "") {
      throw new DbError("preset.invalidId", "Preset id is required");
    }
    const existed = await withStore("presets", "readonly", (store) => store.get(id));
    if (existed === undefined) return false;
    await withStore("presets", "readwrite", (store) => store.delete(id));
    return true;
  }

  async function loadTemplates() {
    const records = await withStore("templates", "readonly", (store) => store.getAll());
    return (Array.isArray(records) ? records : []).map((record) => ({
      id: record.id,
      name: record.name,
      preset: decodePreset(record.preset, "template.invalid"),
    }));
  }

  async function saveTemplates(templates) {
    if (!Array.isArray(templates)) {
      throw new DbError("template.invalid", "Templates must be an array");
    }
    const records = templates.map((entry) => {
      if (!entry || typeof entry.id !== "string" || entry.id === "") {
        throw new DbError("template.invalid", "Template record needs an id");
      }
      const preset = decodePreset(entry.preset, "template.invalid");
      return { id: entry.id, name: entry.name ?? preset.name, preset };
    });
    await withTransaction("templates", "readwrite", async (store) => {
      await requestToPromise(store.clear());
      for (const record of records) {
        await requestToPromise(store.put(record));
      }
    });
    return records;
  }

  async function putImage(id, blob, meta) {
    if (typeof id !== "string" || id === "") {
      throw new DbError("image.invalid", "Image id is required");
    }
    if (!blob) throw new DbError("image.invalid", "Image blob is required");

    const info = meta ?? {};
    const check = validateImage({
      bytes: info.bytes,
      width: info.width,
      height: info.height,
      mime: info.type,
    });
    if (!check.ok) {
      const first = check.errors[0];
      throw new DbError(first.code, "Image metadata is not valid", { details: check.errors });
    }

    const record = {
      id,
      blob,
      bytes: info.bytes ?? 0,
      width: info.width ?? 0,
      height: info.height ?? 0,
      type: info.type ?? null,
    };
    await withStore("images", "readwrite", (store) => store.put(record));
    return record;
  }

  async function getImage(id) {
    if (typeof id !== "string" || id === "") {
      throw new DbError("image.invalid", "Image id is required");
    }
    const record = await withStore("images", "readonly", (store) => store.get(id));
    return record ?? null;
  }

  async function deleteImage(id) {
    if (typeof id !== "string" || id === "") {
      throw new DbError("image.invalid", "Image id is required");
    }
    const existed = await withStore("images", "readonly", (store) => store.get(id));
    if (existed === undefined) return false;
    await withStore("images", "readwrite", (store) => store.delete(id));
    return true;
  }

  function close() {
    if (database && typeof database.close === "function") database.close();
    database = null;
    opening = null;
  }

  return {
    open,
    loadDraft,
    saveDraft,
    clearDraft: () => withStore("draft", "readwrite", (store) => store.delete(DRAFT_KEY)),
    listPresets,
    savePreset,
    deletePreset,
    loadTemplates,
    saveTemplates,
    putImage,
    getImage,
    deleteImage,
    close,
  };
}
