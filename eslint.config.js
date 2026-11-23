import js from "@eslint/js";

export default [
  {
    ignores: [
      "node_modules/**",
      "temp/**",
      "vendor/**",
      "coverage/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        crypto: "readonly",
        URL: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
      "no-console": "warn",
    },
  },
  {
    files: ["src/main.js", "src/render/**/*.js", "src/ui/**/*.js", "src/pdf/**/*.js", "src/fonts/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        DOMParser: "readonly",
        DOMPoint: "readonly",
        matchMedia: "readonly",
        Event: "readonly",
        getComputedStyle: "readonly",
        createImageBitmap: "readonly",
        ResizeObserver: "readonly",
        FontFace: "readonly",
        Image: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        indexedDB: "readonly",
        navigator: "readonly",
        Worker: "readonly",
        Blob: "readonly",
        URL: "readonly",
        EyeDropper: "readonly",
        crypto: "readonly",
      },
    },
  },
  {
    // The PDF worker runs in a worker scope: no `document`, but `self` and the
    // canvas APIs it uses to re-encode WebP.
    files: ["src/pdf/worker.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        OffscreenCanvas: "readonly",
        createImageBitmap: "readonly",
        Blob: "readonly",
        performance: "readonly",
      },
    },
  },
  {
    // The Playwright scripts carry `page.evaluate` callbacks that run in the
    // browser, so they legitimately reference DOM globals.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        MutationObserver: "readonly",
      },
    },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
];
