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
    files: ["tests/**/*.js", "scripts/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
];
