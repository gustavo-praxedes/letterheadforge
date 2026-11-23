/**
 * PDF worker (spec 8.1, R143).
 *
 * Runs the whole export off the main thread: fonts are embedded, images are
 * embedded (WebP is converted first, since pdf-lib cannot read it — P4), the
 * scene is drawn and the bytes go back in one transferable buffer.
 *
 * Cancelling is `worker.terminate()` on the main thread; nothing else is needed.
 */
import "../../vendor/pdf-lib/pdf-lib.min.js";
import "../../vendor/fontkit/fontkit.umd.min.js";

import { renderPdf } from "./render-pdf.js";

self.addEventListener("message", async (event) => {
  const data = event.data ?? {};
  if (data.type !== "render") return;

  try {
    const pdfLib = resolveGlobal("PDFLib");
    const fontkit = resolveGlobal("fontkit");

    post({ type: "progress", step: "fonts", index: 0, total: 4 });

    const fonts = new Map(data.fonts ?? []);
    const images = new Map();
    for (const [id, record] of data.images ?? []) {
      const converted = await convertToSupported(record);
      if (!converted.ok) {
        post({ type: "error", code: "image.invalidFile", params: { imageId: id } });
        return;
      }
      images.set(id, converted.record);
    }

    const bytes = await renderPdf({
      scene: data.scene,
      preset: data.preset,
      fonts,
      images,
      meta: data.meta ?? {},
      pdfLib,
      fontkit,
      onProgress: (step, index, total) => post({ type: "progress", step, index, total }),
    });

    post({ type: "done", bytes }, [bytes.buffer]);
  } catch (error) {
    post({
      type: "error",
      code: error?.code ?? "export.failed",
      params: { reason: error?.message ?? String(error) },
    });
  }
});

function post(message, transfer = []) {
  self.postMessage(message, transfer);
}

/** The vendored UMD builds attach to the worker global as `PDFLib`/`fontkit`. */
function resolveGlobal(name) {
  const value = self[name] ?? globalThis[name];
  if (!value) throw Object.assign(new Error(`${name} unavailable`), { code: "export.failed" });
  return value;
}

/**
 * pdf-lib embeds PNG and JPEG only. WebP is decoded here and re-encoded as PNG
 * (lossless, spec §5.2) so the exported image keeps every pixel.
 */
async function convertToSupported(record) {
  const type = String(record?.type ?? "").toLowerCase();
  if (type.includes("png") || type.includes("jpeg") || type.includes("jpg")) {
    return { ok: true, record };
  }
  if (!type.includes("webp")) return { ok: false };

  try {
    const bitmap = await createImageBitmap(new Blob([record.bytes], { type: record.type }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    bitmap.close?.();
    return { ok: true, record: { bytes, type: "image/png" } };
  } catch {
    return { ok: false };
  }
}
