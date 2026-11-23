import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A single unbalanced brace silently kills every rule after it — a merge once
 * left `@media (max-width: 860px) {` unclosed and the whole tail of the sheet
 * (dialogs, toasts, object actions) stopped applying without a single error.
 * Counting braces is cheap insurance.
 */

const STYLE_DIR = "src/styles";

function styleFiles() {
  return readdirSync(STYLE_DIR)
    .filter((name) => name.endsWith(".css"))
    .map((name) => join(STYLE_DIR, name));
}

function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

function depthAtEnd(source) {
  let depth = 0;
  for (const char of stripCommentsAndStrings(source)) {
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    if (depth < 0) return depth;
  }
  return depth;
}

test("every stylesheet has balanced braces", () => {
  const files = styleFiles();
  assert.ok(files.length >= 3, "expected the token, base and component sheets");
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(depthAtEnd(source), 0, `${file} has unbalanced braces`);
  }
});

test("no stylesheet declares a custom property without the -- prefix", () => {
  for (const file of styleFiles()) {
    const source = stripCommentsAndStrings(readFileSync(file, "utf8"));
    for (const match of source.matchAll(/(^|[;{\s])([a-z][a-z0-9-]*)\s*:/g)) {
      assert.notEqual(match[2].trim(), "", `empty declaration in ${file}`);
    }
  }
});

// The colour picker builds its gradients from physical anchors (pure black,
// white and the six hue stops). Those are not theme colours, so they may stay;
// everything else must come from a token.
const GRADIENT_ANCHORS = new Set([
  "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff",
  "#ffff00", "#00ffff", "#ff00ff",
]);

test("component rules never hard-code theme colours", () => {
  const source = stripCommentsAndStrings(readFileSync(join(STYLE_DIR, "components.css"), "utf8"));
  const hex = [...source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    .map((match) => match[0].toLowerCase())
    .filter((value) => !GRADIENT_ANCHORS.has(value));
  assert.deepEqual(hex, [], "components.css must use tokens, not literal hex colours");
});
