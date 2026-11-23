/**
 * Export orchestration on the main thread (spec 8.2).
 *
 * The heavy work happens in `worker.js`; here we prepare the fonts and images,
 * report progress, and turn the returned buffer into a download. The worker
 * factory is injected so the flow can be tested without a browser.
 */
import { validateExport } from "./validate.js";
import { exportFileName } from "./filename.js";

const DEFAULT_MESSAGES = {
  prepare: "Preparando a exportação",
  fonts: "Incorporando as fontes",
  scene: "Desenhando a folha",
  write: "Gerando o arquivo",
  done: "Pronto",
};

/**
 * @param {object} options
 * @param {object} options.scene scene in millimetres, mode "sheet"
 * @param {object} options.preset preset applied to the scene (for the name and metadata)
 * @param {Map<string,{bytes:Uint8Array}>} [options.fonts]
 * @param {Map<string,{bytes:Uint8Array,type:string}>} [options.images]
 * @param {string} [options.version]
 * @param {() => Worker} options.workerFactory
 * @param {(info:{step:string,label:string,progress:number}) => void} [options.onProgress]
 * @param {(bytes:Uint8Array, name:string) => void} [options.onDone]
 * @param {(error:{code:string,params:object}) => void} [options.onError]
 */
export function startExport({
  scene,
  preset,
  fonts = new Map(),
  images = new Map(),
  version = "0.1.0",
  workerFactory,
  onProgress = () => {},
  onDone = () => {},
  onError = () => {},
  dates = null,
  validate = true,
  validatePreset = null,
  limits = null,
} = {}) {
  if (typeof workerFactory !== "function") {
    throw new TypeError("startExport requires a worker factory");
  }

  const named = exportFileName({
    size: preset?.page?.size,
    orientation: preset?.page?.orientation,
    date: dates?.now ? dates.now() : undefined,
  });
  if (!named.ok) {
    onError({ code: named.code, params: {} });
    return { cancel: () => {}, promise: Promise.resolve({ ok: false, code: named.code }) };
  }

  if (validate) {
    const check = validateExport({ preset, scene, fonts, images, validatePreset, limits });
    if (!check.ok) {
      const first = check.errors[0];
      onError({ code: first.code, params: first.params, errors: check.errors });
      return { cancel: () => {}, promise: Promise.resolve({ ok: false, code: first.code, errors: check.errors }) };
    }
  }

  const worker = workerFactory();
  let settled = false;
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const finish = (result) => {
    if (settled) return;
    settled = true;
    worker.terminate?.();
    resolvePromise(result);
  };

  const report = (step, index, total) => {
    onProgress({
      step,
      label: DEFAULT_MESSAGES[step] ?? DEFAULT_MESSAGES.prepare,
      progress: total > 0 ? Math.min(1, index / total) : 0,
      index,
      total,
    });
  };

  worker.addEventListener("message", (event) => {
    // A message already in flight when the user cancels must not resurrect the
    // job — and must never produce a download after "cancel".
    if (settled) return;
    const message = event.data ?? {};
    if (message.type === "progress") {
      report(message.step, message.index ?? 0, message.total ?? 4);
      return;
    }
    if (message.type === "error") {
      onError({ code: message.code ?? "export.failed", params: message.params ?? {} });
      finish({ ok: false, code: message.code ?? "export.failed", params: message.params ?? {} });
      return;
    }
    if (message.type === "done") {
      const bytes = message.bytes instanceof Uint8Array ? message.bytes : new Uint8Array(message.bytes);
      onProgress({ step: "done", label: DEFAULT_MESSAGES.done, progress: 1, total: 1 });
      onDone(bytes, named.name);
      finish({ ok: true, bytes, name: named.name });
    }
  });

  worker.addEventListener("error", (event) => {
    if (settled) return;
    const code = event?.code ?? "export.failed";
    onError({ code, params: { reason: event?.message ?? "worker" } });
    finish({ ok: false, code, params: { reason: event?.message ?? "worker" } });
  });

  report("prepare", 0, 4);
  worker.postMessage({
    type: "render",
    scene,
    preset: { name: preset?.name ?? "" },
    fonts: [...fonts.entries()],
    images: [...images.entries()],
    meta: {
      title: `LetterheadForge — ${preset?.name ?? "preset"}`,
      producer: `LetterheadForge ${version}`,
      creator: "LetterheadForge",
    },
  });

  return {
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      worker.terminate?.();
      onError({ code: "export.cancelled", params: {} });
      resolvePromise({ ok: false, code: "export.cancelled" });
    },
  };
}

/** Browser download of an exported PDF. */
export function downloadPdf(bytes, name, doc = typeof document !== "undefined" ? document : null) {
  if (!doc) throw new TypeError("downloadPdf requires a document");
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  doc.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL dies.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { size: blob.size, name };
}
