import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import svelte from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import globals from "globals";
import svelteConfig from "./svelte.config.mjs";

const sharedPlugins = {
  "@typescript-eslint": typescriptEslint,
};

const sharedRules = {
  "@typescript-eslint/naming-convention": [
    "warn",
    { selector: "import", format: ["camelCase", "PascalCase"] },
  ],
  curly: "warn",
  eqeqeq: "warn",
  "no-throw-literal": "warn",
  semi: "warn",
};

export default [
  // TypeScript files — including Svelte 5 runes-mode `.svelte.ts` / `.svelte.js`
  // (parsed with the standard TS parser; Svelte runes are just function calls
  // outside templates, no special parsing needed).
  {
    files: ["**/*.ts", "**/*.svelte.ts", "**/*.svelte.js"],
    plugins: sharedPlugins,
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: sharedRules,
  },

  // Svelte recommended flat preset (a11y, best practices)
  ...svelte.configs["flat/recommended"],

  // Svelte file config — parse <script lang="ts"> with the TS parser
  {
    files: ["**/*.svelte"],
    plugins: sharedPlugins,
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".svelte"],
        svelteConfig,
      },
      globals: { ...globals.browser },
    },
    rules: {
      ...sharedRules,
      // `new Date()` inside `$derived` is intentional: we want "now" each time
      // the derivation runs, not a reactive wrapper.
      "svelte/prefer-svelte-reactivity": "off",
    },
  },
];
