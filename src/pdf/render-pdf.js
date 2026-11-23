/**
 * Scene → PDF (spec 8).
 *
 * This renderer draws one primitive at a time and never computes geometry: the
 * Scene already carries millimetres, and `geometry.js` turns them into points.
 * `pdfLib` and `fontkit` are injected so the same code runs in the worker
 * (`self.PDFLib` plus the ESM fontkit) and in the Node tests.
 */
import { baselinePt, hexToPdfColor, mmToPt, pageSizePt, rectPt } from "./geometry.js";
import { fontKey } from "./validate.js";

const STEPS = ["fonts", "scene", "write"];

/**
 * @param {object} options
 * @param {object} options.scene scene in millimetres (mode "sheet")
 * @param {object} [options.preset]
 * @param {Map<string,{bytes:Uint8Array}>} [options.fonts] keyed by fontKey()
 * @param {Map<string,{bytes:Uint8Array,type:string}>} [options.images] keyed by imageId
 * @param {{title?:string,producer?:string,creator?:string,date?:Date}} [options.meta]
 * @param {object} options.pdfLib the vendored pdf-lib namespace
 * @param {object} options.fontkit the vendored fontkit module
 * @param {(step:string,index:number,total:number)=>void} [options.onProgress]
 */
export async function renderPdf({
  scene,
  fonts = new Map(),
  images = new Map(),
  meta = {},
  pdfLib,
  fontkit,
  onProgress = () => {},
} = {}) {
  if (!pdfLib || typeof pdfLib.PDFDocument?.create !== "function") {
    throw new TypeError("renderPdf requires pdf-lib");
  }
  if (!scene || !Array.isArray(scene.primitives)) {
    throw new TypeError("renderPdf requires a scene with primitives");
  }

  const { widthPt, heightPt } = pageSizePt(scene);
  const pdfDoc = await pdfLib.PDFDocument.create();
  if (fontkit) pdfDoc.registerFontkit(fontkit);

  pdfDoc.setTitle(meta.title ?? "LetterheadForge");
  pdfDoc.setProducer(meta.producer ?? "LetterheadForge");
  pdfDoc.setCreator(meta.creator ?? "LetterheadForge");
  pdfDoc.setCreationDate(meta.date instanceof Date ? meta.date : new Date());
  pdfDoc.setModificationDate(meta.date instanceof Date ? meta.date : new Date());

  const page = pdfDoc.addPage([widthPt, heightPt]);
  const ctx = {
    pdfLib,
    pdfDoc,
    page,
    heightPt,
    fontCache: new Map(),
    imageCache: new Map(),
    fonts,
    images,
  };

  onProgress("fonts", 0, STEPS.length);
  await preloadFonts(scene, ctx);

  onProgress("scene", 1, STEPS.length);
  for (const primitive of scene.primitives) {
    await drawPrimitive(primitive, ctx);
  }

  onProgress("write", 2, STEPS.length);
  // updateMetadata:false keeps our Title/Producer — pdf-lib would otherwise
  // stamp its own producer at save time.
  const bytes = await pdfDoc.save({ updateMetadata: false });
  onProgress("done", 3, STEPS.length);
  return bytes;
}

async function preloadFonts(scene, ctx) {
  const keys = new Set();
  collectFontKeys(scene.primitives, keys);
  for (const key of keys) {
    await embedFont(key, ctx);
  }
}

function collectFontKeys(primitives, target) {
  for (const primitive of primitives ?? []) {
    if (!primitive || typeof primitive !== "object") continue;
    if (primitive.kind === "text") target.add(fontKey(primitive));
    collectFontKeys(primitive.children, target);
  }
}

async function embedFont(key, ctx) {
  if (ctx.fontCache.has(key)) return ctx.fontCache.get(key);
  const record = ctx.fonts.get(key);
  if (!record || !(record.bytes?.byteLength > 0)) {
    throw Object.assign(new Error(`font missing: ${key}`), { code: "font.loadFailed", font: key });
  }
  const font = await ctx.pdfDoc.embedFont(record.bytes, { subset: true });
  ctx.fontCache.set(key, font);
  return font;
}

async function embedImage(id, ctx) {
  if (ctx.imageCache.has(id)) return ctx.imageCache.get(id);
  const record = ctx.images.get(id);
  if (!record || !(record.bytes?.byteLength > 0)) {
    throw Object.assign(new Error(`image missing: ${id}`), { code: "image.invalidFile", imageId: id });
  }
  const type = String(record.type ?? "").toLowerCase();
  let embedded;
  if (type.includes("png")) embedded = await ctx.pdfDoc.embedPng(record.bytes);
  else if (type.includes("jpeg") || type.includes("jpg")) embedded = await ctx.pdfDoc.embedJpg(record.bytes);
  else {
    throw Object.assign(new Error(`unsupported image type: ${type}`), { code: "image.invalidFile", imageId: id });
  }
  ctx.imageCache.set(id, embedded);
  return embedded;
}

async function drawPrimitive(primitive, ctx) {
  if (!primitive || typeof primitive !== "object") return;
  switch (primitive.kind) {
    case "rect":
      drawRect(primitive, ctx);
      break;
    case "line":
      drawLine(primitive, ctx);
      break;
    case "dot":
      drawDot(primitive, ctx);
      break;
    case "image":
      await drawImage(primitive, ctx);
      break;
    case "text":
      await drawText(primitive, ctx);
      break;
    case "clip":
      await drawClip(primitive, ctx);
      break;
    default:
      break;
  }
}

function colorOf(hex, pdfLib) {
  const { r, g, b } = hexToPdfColor(hex);
  // pdf-lib applies `color` to the fill or the stroke depending on the drawing
  // call, so one RGB value is enough for both.
  return pdfLib.rgb(r, g, b);
}

function alphaOf(hex) {
  return hexToPdfColor(hex).a;
}

function drawRect(primitive, ctx) {
  const { pdfLib, page, heightPt } = ctx;
  const box = rectPt(primitive, heightPt);
  const strokeWidth = primitive.stroke ? Math.max(0.01, mmToPt(primitive.strokeWidth ?? 0.2)) : 0;
  const hasFill = Boolean(primitive.fill);
  const hasStroke = Boolean(primitive.stroke) && strokeWidth > 0;

  if (!(primitive.rx > 0)) {
    page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      ...(hasFill ? { color: colorOf(primitive.fill, pdfLib), opacity: alphaOf(primitive.fill) } : {}),
      ...(hasStroke
        ? {
            borderColor: colorOf(primitive.stroke, pdfLib),
            borderWidth: strokeWidth,
            borderOpacity: alphaOf(primitive.stroke),
          }
        : {}),
    });
    return;
  }

  // Rounded corners: `drawRectangle` cannot round, so the path is written by hand.
  const radius = Math.min(mmToPt(primitive.rx), box.width / 2, box.height / 2);
  const path = roundedRectPath(box, radius, pdfLib);
  if (hasFill) {
    page.pushOperators(
      pdfLib.pushGraphicsState(),
      pdfLib.setFillingRgbColor(...channels(primitive.fill)),
      ...path,
      pdfLib.fill(),
      pdfLib.popGraphicsState(),
    );
  }
  if (hasStroke) {
    page.pushOperators(
      pdfLib.pushGraphicsState(),
      pdfLib.setStrokingRgbColor(...channels(primitive.stroke)),
      pdfLib.setLineWidth(strokeWidth),
      ...path,
      pdfLib.stroke(),
      pdfLib.popGraphicsState(),
    );
  }
}

function channels(hex) {
  const { r, g, b } = hexToPdfColor(hex);
  return [r, g, b];
}

/** Path operators for a rectangle with rounded corners, in PDF points. */
function roundedRectPath({ x, y, width, height }, radius, pdfLib) {
  const k = radius * 0.5522847498; // circle approximation constant
  const right = x + width;
  const top = y + height;
  return [
    pdfLib.moveTo(x + radius, y),
    pdfLib.lineTo(right - radius, y),
    pdfLib.appendBezierCurve(right - radius + k, y, right, y + radius - k, right, y + radius),
    pdfLib.lineTo(right, top - radius),
    pdfLib.appendBezierCurve(right, top - radius + k, right - radius + k, top, right - radius, top),
    pdfLib.lineTo(x + radius, top),
    pdfLib.appendBezierCurve(x + radius - k, top, x, top - radius + k, x, top - radius),
    pdfLib.lineTo(x, y + radius),
    pdfLib.appendBezierCurve(x, y + radius - k, x + radius - k, y, x + radius, y),
    pdfLib.closePath(),
  ];
}

function drawLine(primitive, ctx) {
  const { pdfLib, page, heightPt } = ctx;
  const dash = Array.isArray(primitive.dash) ? primitive.dash.filter((value) => Number.isFinite(value) && value >= 0) : [];
  const thickness = Math.max(0.01, mmToPt(primitive.strokeWidth ?? 0.2));
  const hasDash = dash.length > 0 && dash.some((value) => value > 0);

  // pdf-lib draws dashes in the units of `setDashPattern`, which are points.
  if (hasDash) {
    page.pushOperators(
      pdfLib.pushGraphicsState(),
      pdfLib.setStrokingRgbColor(...channels(primitive.stroke ?? "#000000")),
      pdfLib.setLineWidth(thickness),
      pdfLib.setDashPattern(dash.map((value) => mmToPt(value)), mmToPt(primitive.dashOffset ?? 0)),
      pdfLib.moveTo(mmToPt(primitive.x1), baselinePt(primitive.y1, heightPt)),
      pdfLib.lineTo(mmToPt(primitive.x2), baselinePt(primitive.y2, heightPt)),
      pdfLib.stroke(),
      pdfLib.popGraphicsState(),
    );
    return;
  }

  page.drawLine({
    start: { x: mmToPt(primitive.x1), y: baselinePt(primitive.y1, heightPt) },
    end: { x: mmToPt(primitive.x2), y: baselinePt(primitive.y2, heightPt) },
    thickness,
    color: colorOf(primitive.stroke ?? "#000000", pdfLib),
    opacity: alphaOf(primitive.stroke ?? "#000000"),
  });
}

function drawDot(primitive, ctx) {
  const { pdfLib, page, heightPt } = ctx;
  const radius = mmToPt(primitive.r ?? 0);
  if (!(radius > 0)) return;
  page.drawCircle({
    x: mmToPt(primitive.cx),
    y: baselinePt(primitive.cy, heightPt),
    size: radius,
    color: colorOf(primitive.fill ?? "#000000", pdfLib),
    opacity: alphaOf(primitive.fill ?? "#000000"),
  });
}

async function drawImage(primitive, ctx) {
  const { pdfLib, page, heightPt } = ctx;
  const image = await embedImage(primitive.imageId, ctx);
  const box = rectPt(primitive, heightPt);
  const rotation = Number(primitive.rotation ?? 0);
  const options = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    opacity: primitive.opacity === undefined ? 1 : primitive.opacity,
  };
  if (!rotation) {
    page.drawImage(image, options);
    return;
  }
  // Rotate about the centre of the box, the same pivot the SVG renderer uses.
  const centre = { x: mmToPt(primitive.x + primitive.w / 2), y: heightPt - mmToPt(primitive.y + primitive.h / 2) };
  const pivot = rotatePoint({ x: box.x, y: box.y }, centre, rotation);
  page.drawImage(image, { ...options, x: pivot.x, y: pivot.y, rotate: pdfLib.degrees(rotation) });
}

async function drawText(primitive, ctx) {
  const { pdfLib, page, heightPt } = ctx;
  const font = await embedFont(fontKey(primitive), ctx);
  const size = primitive.sizePt ?? 10;
  const colour = primitive.color ?? "#000000";
  const rotation = Number(primitive.rotation ?? 0);
  const centre = { x: mmToPt(primitive.x + primitive.w / 2), y: heightPt - mmToPt(primitive.y + primitive.h / 2) };

  for (const line of primitive.lines ?? []) {
    if (!line || !Array.isArray(line.words) || line.words.length === 0) continue;
    const words = line.words;
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      if (!word || word.text === "") continue;
      // Each word is placed at its measured position, so the gap between words is
      // geometry, not a glyph. A trailing space (invisible, no ink) keeps the text
      // layer readable: without it a copy yields "2027,com".
      const chunk = index === words.length - 1 ? String(word.text) : `${word.text} `;
      const local = {
        x: mmToPt(primitive.x + (word.xMm ?? 0)),
        y: heightPt - mmToPt(primitive.y + (line.baselineY ?? 0)),
      };
      const start = rotation ? rotatePoint(local, centre, rotation) : local;
      page.drawText(chunk, {
        x: start.x,
        y: start.y,
        size,
        font,
        color: colorOf(colour, pdfLib),
        opacity: primitive.opacity === undefined ? 1 : primitive.opacity,
        ...(rotation ? { rotate: pdfLib.degrees(rotation) } : {}),
      });
    }
  }
}

async function drawClip(primitive, ctx) {
  const { pdfLib, page, heightPt } = ctx;
  const box = rectPt(primitive, heightPt);
  page.pushOperators(
    pdfLib.pushGraphicsState(),
    pdfLib.moveTo(box.x, box.y),
    pdfLib.lineTo(box.x + box.width, box.y),
    pdfLib.lineTo(box.x + box.width, box.y + box.height),
    pdfLib.lineTo(box.x, box.y + box.height),
    pdfLib.closePath(),
    pdfLib.clip(),
    pdfLib.endPath(),
  );
  for (const child of primitive.children ?? []) {
    await drawPrimitive(child, ctx);
  }
  page.pushOperators(pdfLib.popGraphicsState());
}

/** Rotate `point` around `centre` by `angle` degrees (Y up). */
export function rotatePoint(point, centre, angle) {
  const radians = ((Number(angle) || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}
