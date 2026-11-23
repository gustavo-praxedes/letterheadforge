import { enums, epsilon } from "../config.js";
import { ptToMm } from "./units.js";

/**
 * Text layout for a text box or a text watermark (spec 5.3, contracts §11).
 *
 * `measure(str, style)` returns the width in millimetres of `str` in `style`
 * and is injected by the caller (fontkit in production, fixtures in tests).
 * A `null` return means the font has no glyph for at least one character of
 * the string: those characters are listed in `unsupportedChars` and the word is
 * measured again without them. `NaN` from a metric is treated as zero width.
 *
 * The layout is deterministic and depends only on the arguments:
 *  - `\n` starts a new paragraph; an empty paragraph produces an empty line;
 *  - words break at whitespace, a word wider than the box breaks by character;
 *  - `align: "justify"` stretches every line of a paragraph except its last,
 *    which is rendered left aligned and flagged `justified: false`;
 *  - `lineHeightMm` = `ptToMm(sizePt) * style.lineHeight`;
 *  - `baselineY` = line top + `ptToMm(sizePt) * 0.8` (decision D4);
 *  - `contentHeightMm` covers only the visible lines; `hiddenLineCount` counts
 *    the lines dropped for lack of height;
 *  - `widthMm` of a line and of a word is the natural (unstretched) width.
 */

const BASELINE_RATIO = 0.8;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function invalid(code) {
  return { ok: false, code };
}

export function layoutText(options = {}) {
  const { text, widthMm, heightMm, style } = options;
  let { measure } = options;

  if (typeof text !== "string") return invalid("text.invalidText");
  if (!isFiniteNumber(widthMm) || widthMm <= 0) return invalid("text.invalidWidth");
  if (!isFiniteNumber(heightMm) || heightMm <= 0) return invalid("text.invalidHeight");
  if (!style || typeof style !== "object") return invalid("text.invalidStyle");

  const { sizePt, lineHeight, align = "left" } = style;
  if (!isFiniteNumber(sizePt) || sizePt <= 0) return invalid("text.invalidStyle");
  if (!isFiniteNumber(lineHeight) || lineHeight <= 0) return invalid("text.invalidStyle");
  if (!enums.alignments.includes(align)) return invalid("text.invalidStyle");

  const hasText = text.trim() !== "";
  if (typeof measure !== "function") {
    if (hasText) {
      throw new TypeError("layoutText requires a measure function for non-empty text");
    }
    measure = () => 0;
  }

  const fontSizeMm = ptToMm(sizePt);
  const lineHeightMm = fontSizeMm * lineHeight;
  const baselineOffsetMm = fontSizeMm * BASELINE_RATIO;

  const unsupportedChars = [];
  const unsupportedSet = new Set();

  /** Width in mm, or null when the metric reports a missing glyph. */
  function rawMeasure(str) {
    const value = measure(str, style);
    if (value === null) return null;
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  /** Strip characters the font cannot render, recording them once. */
  function cleanWord(word) {
    const directWidth = rawMeasure(word);
    if (directWidth !== null) return { text: word, widthMm: directWidth };

    let kept = "";
    for (const char of Array.from(word)) {
      const charWidth = rawMeasure(char);
      if (charWidth === null) {
        if (!unsupportedSet.has(char)) {
          unsupportedSet.add(char);
          unsupportedChars.push(char);
        }
      } else {
        kept += char;
      }
    }
    const keptWidth = kept === "" ? 0 : rawMeasure(kept) ?? 0;
    return { text: kept, widthMm: keptWidth };
  }

  /** Split a word that is wider than the box into character chunks. */
  function chunkWord(word, maxWidth) {
    const chars = Array.from(word);
    const chunks = [];
    let current = "";
    let currentWidth = 0;

    for (const char of chars) {
      const candidate = current + char;
      const candidateWidth = rawMeasure(candidate) ?? 0;
      if (current !== "" && candidateWidth > maxWidth + epsilon) {
        chunks.push({ text: current, widthMm: currentWidth });
        current = char;
        currentWidth = rawMeasure(char) ?? 0;
      } else {
        current = candidate;
        currentWidth = candidateWidth;
      }
    }
    if (current !== "") chunks.push({ text: current, widthMm: currentWidth });
    return chunks;
  }

  const spaceWidthMm = rawMeasure(" ") ?? 0;

  // Token = { text, widthMm, spaceBefore }. spaceBefore marks a real word break
  // so a justified line can stretch exactly its gaps.
  const rawLines = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/[ \t]+/).filter((word) => word !== "");
    let line = [];
    let lineWidth = 0;
    let producedInParagraph = 0;

    const flush = () => {
      rawLines.push({ tokens: line, widthMm: lineWidth, paragraphEnd: false });
      producedInParagraph += 1;
      line = [];
      lineWidth = 0;
    };

    for (const rawWord of words) {
      const word = cleanWord(rawWord);
      if (word.text === "") continue;

      let pending = { text: word.text, widthMm: word.widthMm, spaceBefore: true };
      while (pending !== null) {
        const gap = pending.spaceBefore && line.length > 0 ? spaceWidthMm : 0;
        if (lineWidth + gap + pending.widthMm <= widthMm + epsilon) {
          line.push({
            text: pending.text,
            widthMm: pending.widthMm,
            spaceBefore: pending.spaceBefore && line.length > 0,
          });
          lineWidth += gap + pending.widthMm;
          break;
        }

        if (line.length === 0) {
          // The piece does not fit even on an empty line: break by character.
          const chunks = chunkWord(pending.text, widthMm);
          if (chunks.length === 0) {
            break;
          }
          const [first, ...rest] = chunks;
          line.push({ text: first.text, widthMm: first.widthMm, spaceBefore: false });
          lineWidth = first.widthMm;
          flush();
          pending =
            rest.length === 0
              ? null
              : {
                  text: rest.map((chunk) => chunk.text).join(""),
                  widthMm: rest.reduce((total, chunk) => total + chunk.widthMm, 0),
                  spaceBefore: false,
                };
        } else {
          // Word does not fit the current line: close it and retry.
          flush();
        }
      }
    }

    if (line.length > 0) flush();
    else if (producedInParagraph === 0) flush();
    if (producedInParagraph > 0) rawLines[rawLines.length - 1].paragraphEnd = true;
  }

  const lines = rawLines.map((raw) => {
    const gapCount = raw.tokens.filter((token) => token.spaceBefore).length;
    const justified = align === "justify" && !raw.paragraphEnd && raw.tokens.length > 1;
    const extraPerGap =
      justified && gapCount > 0 ? Math.max(0, (widthMm - raw.widthMm) / gapCount) : 0;

    let x = 0;
    if (!justified) {
      if (align === "center") x = Math.max(0, (widthMm - raw.widthMm) / 2);
      else if (align === "right") x = Math.max(0, widthMm - raw.widthMm);
    }

    const lineWords = [];
    for (const token of raw.tokens) {
      if (token.spaceBefore && lineWords.length > 0) {
        x += spaceWidthMm + extraPerGap;
      }
      lineWords.push({ text: token.text, xMm: x, widthMm: token.widthMm });
      x += token.widthMm;
    }

    const textContent = raw.tokens
      .map((token) => (token.spaceBefore ? ` ${token.text}` : token.text))
      .join("");

    return {
      text: textContent,
      widthMm: raw.widthMm,
      words: lineWords,
      justified,
    };
  });

  const fitCount = Math.max(0, Math.floor((heightMm + epsilon) / lineHeightMm));
  const visibleCount = Math.min(lines.length, fitCount);
  const hiddenLineCount = lines.length - visibleCount;

  const visibleLines = lines.slice(0, visibleCount).map((line, index) => ({
    text: line.text,
    widthMm: line.widthMm,
    words: line.words,
    baselineY: index * lineHeightMm + baselineOffsetMm,
    justified: line.justified,
  }));

  return {
    lines: visibleLines,
    lineHeightMm,
    contentHeightMm: visibleCount * lineHeightMm,
    overflow: hiddenLineCount > 0,
    hiddenLineCount,
    unsupportedChars,
    widthMm,
    heightMm,
  };
}
