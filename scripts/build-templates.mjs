/**
 * Builds `data/templates.json` from `defaultPreset()` so every model is valid by
 * construction (spec 9.2 / R68): caderno pautado, quadriculado, pontilhado,
 * caligrafia e em branco.
 *
 * Run with `npm run manifest:templates`.
 */
import { writeFileSync } from "node:fs";

import { defaultPreset } from "../src/core/schema.js";

const A4 = { size: "A4", orientation: "portrait", color: "#FFFFFF", margins: { top: 15, right: 15, bottom: 15, left: 15 } };
const A5 = { size: "A5", orientation: "portrait", color: "#FFFFFF", margins: { top: 12, right: 12, bottom: 12, left: 12 } };

const noFrame = { enabled: false, color: "#3A3A3AFF", thickness: 0.6, style: "solid", doubleGap: 2, cornerRadius: 4 };
const thinFrame = { enabled: true, color: "#3A3A3AFF", thickness: 0.6, style: "solid", doubleGap: 2, cornerRadius: 4 };

function ruling(overrides) {
  const base = defaultPreset().ruling;
  return {
    ...base,
    enabled: true,
    insets: { top: 8, right: 8, bottom: 8, left: 8 },
    objectDistance: 5,
    ...overrides,
  };
}

const MODELS = [
  {
    id: "template-caderno-pautado",
    name: "Caderno pautado",
    page: A4,
    frame: thinFrame,
    ruling: ruling({
      type: "lines",
      color: "#C8C8C8FF",
      thickness: 0.25,
      style: "solid",
      x: { mode: "spacing", spacing: 4, count: 20 },
      y: { mode: "spacing", spacing: 8, count: 32 },
    }),
  },
  {
    id: "template-quadriculado",
    name: "Quadriculado",
    page: A4,
    frame: noFrame,
    ruling: ruling({
      type: "grid",
      color: "#CFD4D8FF",
      thickness: 0.18,
      style: "solid",
      x: { mode: "spacing", spacing: 5, count: 40 },
      y: { mode: "spacing", spacing: 5, count: 55 },
    }),
  },
  {
    id: "template-pontilhado",
    name: "Pontilhado",
    page: A4,
    frame: noFrame,
    ruling: ruling({
      type: "dots",
      color: "#B6BBC2FF",
      thickness: 0.2,
      dotRadius: 0.35,
      style: "solid",
      x: { mode: "spacing", spacing: 5, count: 40 },
      y: { mode: "spacing", spacing: 5, count: 55 },
    }),
  },
  {
    id: "template-caligrafia",
    name: "Caligrafia",
    page: A5,
    frame: thinFrame,
    // P9: caligrafia is a horizontal ruling with its own spacing, no dedicated type
    ruling: ruling({
      type: "lines",
      color: "#8CAFA7FF",
      thickness: 0.3,
      style: "solid",
      x: { mode: "spacing", spacing: 4, count: 20 },
      y: { mode: "spacing", spacing: 12, count: 16 },
    }),
  },
  {
    id: "template-em-branco",
    name: "Em branco",
    page: A4,
    frame: noFrame,
    ruling: { ...defaultPreset().ruling, enabled: false },
  },
];

const records = MODELS.map((model) => {
  const base = defaultPreset();
  const preset = {
    ...base,
    schemaVersion: 1,
    id: model.id,
    name: model.name,
    page: { ...model.page },
    frame: { ...model.frame },
    ruling: { ...model.ruling },
    watermark: { ...base.watermark, enabled: false },
    objects: [],
  };
  return { id: model.id, name: model.name, preset };
});

writeFileSync(new URL("../data/templates.json", import.meta.url), `${JSON.stringify(records, null, 2)}\n`, "utf8");
console.log(`data/templates.json: ${records.length} modelos (${records.map((record) => record.name).join(", ")})`);
