// Root ESLint config for V2 workspaces only (apps/*, packages/*, services/*).
// V1's frontend/ keeps its own independent eslint.config.js — untouched.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["frontend", "backend", "**/dist", "**/node_modules"]),
  {
    files: ["apps/**/*.{js,jsx}", "packages/**/*.{js,jsx}"],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ["services/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
