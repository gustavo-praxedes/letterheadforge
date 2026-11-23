import { ptToMm } from "../core/units.js";

/**
 * Scene → SVG. The preview and the PDF consume the same Scene (spec 8.1), so
 * this renderer draws one primitive at a time and never computes geometry.
 *
 * `sceneToSvg` is a pure string builder (testable in Node, no DOM); all text and
 * attribute values are escaped, so no user content can inject markup.
 */

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

function num(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return Number(value.toFixed(4)).toString();
}

function strokeAttrs(primitive) {
  const parts = [];
  if (primitive.stroke) {
    parts.push(`stroke="${escapeAttr(primitive.stroke)}"`);
    parts.push(`stroke-width="${num(primitive.strokeWidth ?? 0)}"`);
    if (Array.isArray(primitive.dash) && primitive.dash.length > 0) {
      parts.push(`stroke-dasharray="${escapeAttr(primitive.dash.map(num).join(" "))}"`);
    }
    if (primitive.dashOffset) parts.push(`stroke-dashoffset="${num(primitive.dashOffset)}"`);
    if (primitive.cap) parts.push(`stroke-linecap="${escapeAttr(primitive.cap)}"`);
    parts.push('stroke-linejoin="round"');
  } else {
    parts.push('stroke="none"');
  }
  return parts.join(" ");
}

function rotationTransform(primitive) {
  if (!primitive.rotation) return "";
  const cx = primitive.x + primitive.w / 2;
  const cy = primitive.y + primitive.h / 2;
  return ` transform="rotate(${num(primitive.rotation)} ${num(cx)} ${num(cy)})"`;
}

function renderRect(primitive) {
  const fill = primitive.fill ? `fill="${escapeAttr(primitive.fill)}"` : 'fill="none"';
  return `<rect x="${num(primitive.x)}" y="${num(primitive.y)}" width="${num(primitive.w)}" height="${num(
    primitive.h,
  )}"${primitive.rx ? ` rx="${num(primitive.rx)}"` : ""} ${fill} ${strokeAttrs(primitive)} />`;
}

function renderLine(primitive) {
  return `<line x1="${num(primitive.x1)}" y1="${num(primitive.y1)}" x2="${num(primitive.x2)}" y2="${num(
    primitive.y2,
  )}" ${strokeAttrs(primitive)} />`;
}

function renderDot(primitive) {
  return `<circle cx="${num(primitive.cx)}" cy="${num(primitive.cy)}" r="${num(primitive.r)}" fill="${escapeAttr(
    primitive.fill ?? "#000000",
  )}" />`;
}

function renderImage(primitive, images) {
  const href = images?.get(primitive.imageId) ?? "";
  if (!href) return "";
  const opacity = primitive.opacity === undefined ? "" : ` opacity="${num(primitive.opacity)}"`;
  return `<image href="${escapeAttr(href)}" x="${num(primitive.x)}" y="${num(primitive.y)}" width="${num(
    primitive.w,
  )}" height="${num(primitive.h)}" preserveAspectRatio="none"${opacity}${rotationTransform(primitive)} />`;
}

function renderText(primitive) {
  if (!Array.isArray(primitive.lines) || primitive.lines.length === 0) return "";
  const fontSizeMm = ptToMm(primitive.sizePt ?? 10);
  const opacity = primitive.opacity === undefined ? "" : ` opacity="${num(primitive.opacity)}"`;
  const transform = ` transform="translate(${num(primitive.x)} ${num(primitive.y)})${
    primitive.rotation ? ` rotate(${num(primitive.rotation)} ${num(primitive.w / 2)} ${num(primitive.h / 2)})` : ""
  }"`;
  const lines = primitive.lines
    .map((line) => {
      const baseline = num(line.baselineY ?? 0);
      const words = (line.words ?? [{ text: line.text, xMm: 0 }])
        .map((word) => `<tspan x="${num(word.xMm ?? 0)}">${escapeText(word.text)}</tspan>`)
        .join("");
      return `<text x="0" y="${baseline}" font-size="${num(fontSizeMm)}"${
        primitive.color ? ` fill="${escapeAttr(primitive.color)}"` : ""
      }>${words}</text>`;
    })
    .join("");
  const family = ` font-family="${escapeAttr(primitive.fontId ?? "sans-serif")}"`;
  const weight = primitive.weight ? ` font-weight="${num(primitive.weight)}"` : "";
  const italic = primitive.italic ? ' font-style="italic"' : "";
  return `<g${transform}${family}${weight}${italic}${opacity}>${lines}</g>`;
}

/**
 * Render one primitive to SVG markup. Unknown primitive kinds are skipped, never thrown.
 */
export function primitiveToSvg(primitive, options = {}, clipCounter = { value: 0 }) {
  if (!primitive || typeof primitive !== "object") return "";
  switch (primitive.kind) {
    case "rect":
      return renderRect(primitive);
    case "line":
      return renderLine(primitive);
    case "dot":
      return renderDot(primitive);
    case "image":
      return renderImage(primitive, options.images);
    case "text":
      return renderText(primitive);
    case "clip":
      clipCounter.value += 1;
      return renderClip(primitive, options, clipCounter);
    default:
      return "";
  }
}

function renderClip(primitive, options, clipCounter) {
  const id = `clip-${clipCounter.value}`;
  const defs = `<defs><clipPath id="${id}"><rect x="${num(primitive.x)}" y="${num(primitive.y)}" width="${num(
    primitive.w,
  )}" height="${num(primitive.h)}" /></clipPath></defs>`;
  const children = (primitive.children ?? []).map((child) => primitiveToSvg(child, options, clipCounter)).join("");
  return `${defs}<g clip-path="url(#${id})">${children}</g>`;
}

/**
 * Build the full SVG markup for a scene. Widths and heights stay in millimetres:
 * the viewBox does the scaling.
 */
export function sceneToSvg(scene, options = {}) {
  if (!scene || !Array.isArray(scene.primitives)) {
    throw new TypeError("sceneToSvg requires a scene with primitives");
  }
  const width = num(scene.widthMm);
  const height = num(scene.heightMm);
  const clipCounter = { value: 0 };
  const body = scene.primitives.map((primitive) => primitiveToSvg(primitive, options, clipCounter)).join("");
  const label = options.label ? ` aria-label="${escapeAttr(options.label)}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"${label} preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

/**
 * Browser mount: parse the markup and replace the container contents.
 * Uses DOMParser (never innerHTML) so user text stays inert.
 */
export function mountScene(container, scene, options = {}) {
  if (!container) throw new TypeError("mountScene requires a container element");
  const markup = sceneToSvg(scene, options);
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = parsed.documentElement;
  if (!svg || svg.nodeName === "parsererror") {
    throw new Error("render-svg: invalid SVG output");
  }
  container.replaceChildren(document.importNode(svg, true));
  return container.firstElementChild;
}
