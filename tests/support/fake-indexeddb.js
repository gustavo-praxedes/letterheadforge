/**
 * Minimal in-memory IndexedDB used by the store tests.
 *
 * Supports only the surface `src/store/db.js` relies on: `open` with an upgrade
 * callback, `createObjectStore({ keyPath })`, `transaction`, and object stores
 * with `get`, `getAll`, `put`, `delete` and `clear`. Requests are thenable so a
 * test can either `await` them or use `onsuccess`.
 */

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

/** Run a callback on the microtask queue without relying on queueMicrotask. */
const soon = (callback) => {
  Promise.resolve().then(callback);
};

function createRequest() {
  const request = {
    result: undefined,
    error: null,
    readyState: "pending",
    onsuccess: null,
    onerror: null,
    onabort: null,
  };
  let settleResolve;
  let settleReject;
  const promise = new Promise((resolve, reject) => {
    settleResolve = resolve;
    settleReject = reject;
  });

  request.then = (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected);
  request.catch = (onRejected) => promise.catch(onRejected);
  request.finally = (onFinally) => promise.finally(onFinally);

  request.resolve = (value) => {
    if (request.readyState !== "pending") return;
    request.readyState = "done";
    request.result = value;
    if (typeof request.onsuccess === "function") request.onsuccess({ target: request });
    settleResolve(value);
  };

  request.reject = (error) => {
    if (request.readyState !== "pending") return;
    request.readyState = "done";
    request.error = error;
    if (typeof request.onerror === "function") request.onerror({ target: request });
    settleReject(error);
  };

  return request;
}

function namesList(names) {
  return {
    length: names.length,
    contains: (name) => names.includes(name),
    item: (index) => names[index] ?? null,
    [Symbol.iterator]: () => names[Symbol.iterator](),
  };
}

class FakeTransaction {
  constructor(core, storeNames, mode) {
    this._core = core;
    this._names = storeNames;
    this.mode = mode;
    this.error = null;
    this._pending = 0;
    this._done = false;
    this._scheduled = false;
    this._oncomplete = null;
    this._onerror = null;
    this._onabort = null;
    this._stores = new Map();
    this._schedule();
  }

  set oncomplete(handler) {
    this._oncomplete = handler;
    if (this._done && this.error === null && typeof handler === "function") {
      soon(() => handler({ target: this }));
    }
  }

  get oncomplete() {
    return this._oncomplete;
  }

  set onerror(handler) {
    this._onerror = handler;
    if (this.error !== null && typeof handler === "function") {
      soon(() => handler({ target: this }));
    }
  }

  get onerror() {
    return this._onerror;
  }

  set onabort(handler) {
    this._onabort = handler;
  }

  get onabort() {
    return this._onabort;
  }

  objectStore(name) {
    if (!this._names.includes(name)) {
      throw new Error(`NotFoundError: store ${name} is not part of this transaction`);
    }
    if (!this._stores.has(name)) {
      const meta = this._core.stores.get(name);
      this._stores.set(name, new FakeObjectStore(this, name, meta));
    }
    return this._stores.get(name);
  }

  _request(run) {
    this._pending += 1;
    const request = createRequest();
    soon(() => {
      let value;
      try {
        value = run();
      } catch (error) {
        request.reject(error);
        this._fail(error);
        this._pending -= 1;
        return;
      }
      request.resolve(value);
      this._pending -= 1;
      if (this._pending === 0) this._schedule();
    });
    return request;
  }

  _fail(error) {
    if (this._done) return;
    this._done = true;
    this.error = error;
    if (typeof this._onerror === "function") this._onerror({ target: this });
    if (typeof this._onabort === "function") this._onabort({ target: this });
  }

  _schedule() {
    if (this._scheduled || this._done) return;
    this._scheduled = true;
    setTimeout(() => {
      this._scheduled = false;
      this._maybeComplete();
    }, 0);
  }

  _maybeComplete() {
    if (this._done) return;
    if (this._pending > 0) {
      this._schedule();
      return;
    }
    this._done = true;
    if (typeof this._oncomplete === "function") this._oncomplete({ target: this });
  }
}

class FakeObjectStore {
  constructor(transaction, name, meta) {
    this._tx = transaction;
    this._records = meta.records;
    this.name = name;
    this.keyPath = meta.keyPath;
  }

  get mode() {
    return this._tx.mode;
  }

  _read(run) {
    return this._tx._request(run);
  }

  _write(run) {
    if (this._tx.mode === "readonly") {
      throw new Error("ReadOnlyError: the transaction is read-only");
    }
    return this._tx._request(run);
  }

  get(key) {
    return this._read(() => {
      const stored = this._records.get(key);
      return stored === undefined ? undefined : clone(stored);
    });
  }

  getAll() {
    return this._read(() => [...this._records.values()].map((value) => clone(value)));
  }

  count() {
    return this._read(() => this._records.size);
  }

  put(value) {
    return this._write(() => {
      const key = this.keyPath ? value[this.keyPath] : undefined;
      if (key === undefined) throw new Error("DataError: missing key path");
      this._records.set(key, clone(value));
      return key;
    });
  }

  delete(key) {
    return this._write(() => {
      this._records.delete(key);
      return undefined;
    });
  }

  clear() {
    return this._write(() => {
      this._records.clear();
      return undefined;
    });
  }
}

class FakeDatabaseHandle {
  constructor(core) {
    this._core = core;
    this._closed = false;
  }

  get name() {
    return this._core.name;
  }

  get version() {
    return this._core.version;
  }

  get objectStoreNames() {
    return namesList([...this._core.stores.keys()]);
  }

  createObjectStore(name, options = {}) {
    if (this._closed) throw new Error("InvalidStateError: the database is closed");
    if (this._core.stores.has(name)) throw new Error(`ConstraintError: store ${name} already exists`);
    const keyPath = options.keyPath ?? null;
    this._core.stores.set(name, { keyPath, records: new Map() });
    return { name, keyPath };
  }

  transaction(storeNames, mode = "readonly") {
    if (this._closed) throw new Error("InvalidStateError: the database is closed");
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    for (const name of names) {
      if (!this._core.stores.has(name)) throw new Error(`NotFoundError: store ${name} does not exist`);
    }
    return new FakeTransaction(this._core, names, mode);
  }

  close() {
    this._closed = true;
  }
}

/**
 * Build a fake `IDBFactory`. Each call to `open()` returns a fresh handle that
 * shares the same in-memory stores, mirroring what a real IndexedDB does.
 */
export function createFakeIndexedDB() {
  const databases = new Map();

  return {
    open(name, version = 1) {
      const request = createRequest();
      soon(() => {
        let core = databases.get(name);
        const isNew = !core;
        if (!core) {
          core = { name, version: 0, stores: new Map() };
          databases.set(name, core);
        }
        const handle = new FakeDatabaseHandle(core);
        request.result = handle;
        if (isNew || core.version < version) {
          const oldVersion = core.version;
          core.version = isNew ? version : Math.max(core.version, version);
          if (typeof request.onupgradeneeded === "function") {
            request.onupgradeneeded({ target: request, oldVersion, newVersion: core.version });
          }
        }
        soon(() => request.resolve(handle));
      });
      return request;
    },

    deleteDatabase(name) {
      const request = createRequest();
      soon(() => {
        databases.delete(name);
        request.resolve(undefined);
      });
      return request;
    },

    databases() {
      return [...databases.keys()];
    },
  };
}
