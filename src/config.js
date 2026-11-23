/**
 * Central configuration: every rule number, limit and default lives here.
 * Spec references: 2.1, 2.2, 3.2, 3.4, 4.4, 4.5, 4.6, 5.3, 5.6, 5.8, 7.1, 8.3.
 */

export const paperSizes = {
  A4: { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } },
  A5: { portrait: { w: 148, h: 210 }, landscape: { w: 210, h: 148 } },
  A6: { portrait: { w: 105, h: 148 }, landscape: { w: 148, h: 105 } },
};

export const limits = {
  marginMax: 50,
  marginHomePrint: 5,
  minContentSize: 30,
  minRulingArea: 5,
  minSegment: 15,
  minEffectivePpi: 150,
  maskResolution: 4,
  alphaThreshold: 0.1,
  sampleStepMm: 0.25,
  textBoxCount: 10,
  presetNameMaxLength: 60,
  presetsMax: 30,
  frameThickness: { min: 0.1, max: 5 },
  doubleGap: { min: 0.2, max: 10 },
  rulingThickness: { min: 0.05, max: 2 },
  dotRadius: { min: 0.1, max: 3 },
  insets: { min: 0, max: 50 },
  objectDistance: { min: 0, max: 50 },
  spacing: { min: 0.5, max: 100 },
  count: { min: 2, max: 200 },
  textSizePt: { min: 4, max: 200 },
  lineHeight: { min: 0.8, max: 3 },
  rotation: { min: -180, max: 180 },
  opacity: { min: 0, max: 1 },
  padding: { min: 0, max: 20 },
  borderThickness: { min: 0, max: 5 },
  image: { maxBytes: 26214400, maxSidePx: 3508, maxCount: 3, totalBytes: 78643200 },
};

export const epsilon = 1e-6;
export const displayDecimals = 1;
export const maskResolution = limits.maskResolution;
export const autosaveMs = 1000;
export const history = { size: 100 };
export const strokeScale = 1;
export const strokePatterns = {
  solid: [],
  dashed: [4, 3],
  dotted: [0, 3],
  dashdot: [6, 3, 0, 3],
};
export const cutMark = { length: 3, thickness: 0.25 };
export const snap = { toleranceMm: 2 };
export const rotationSnapStepDeg = 15;
export const keyboard = { nudgeMm: 1, nudgeShiftMm: 10 };
export const units = { mmPerInch: 25.4, ptPerInch: 72 };
export const fonts = {
  cdnBase: "https://cdn.jsdelivr.net/fontsource/fonts",
  urlTemplate: "{base}/{id}@{version}/{subset}-{weight}-{style}.woff",
  subsets: ["latin", "latin-ext"],
};
export const enums = {
  pageSizes: ["A4", "A5", "A6"],
  orientations: ["portrait", "landscape"],
  frameStyles: ["solid", "dashed", "dotted", "dashdot", "double"],
  rulingTypes: ["lines", "grid", "dots"],
  rulingStyles: ["solid", "dashed", "dotted", "dashdot"],
  rulingModes: ["spacing", "count"],
  alignments: ["left", "center", "right", "justify"],
  watermarkKinds: ["text", "image"],
  objectTypes: ["image", "text"],
};
export const schemaVersion = 1;
