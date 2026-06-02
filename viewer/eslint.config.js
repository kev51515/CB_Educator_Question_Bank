import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "playwright-report", "test-results"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // We intentionally co-locate hooks/helpers alongside components in the
      // `@/components` barrel. Fast-refresh degrades for these files (full
      // reload instead of HMR), but that's an acceptable trade for the
      // single-import-surface ergonomics.
      "react-refresh/only-export-components": "off",
      // Allow unused-with-leading-underscore as the standard escape hatch.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // React Compiler's recommended rules — many of these flag intentional
      // synchronization patterns (matchMedia, focus management, prefetch).
      // Downgrade to warning so they surface but don't block CI.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Test files: relaxed rules for ergonomics
    files: ["e2e/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // --- Design-system enforcement -------------------------------------------
  // Surface drift from the documented token system (DESIGN.md):
  //   (a) inline hex color literals in components
  //   (b) arbitrary Tailwind color brackets (e.g. bg-[#123456])
  //   (c) arbitrary z-index brackets (e.g. z-[40])
  // Existing violations are exempted file-by-file below; new code should use
  // tokens from lib/designSystem.ts / lib/designTokens.ts.
  {
    files: ["src/components/**/*.tsx", "src/lib/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            "Inline hex color detected. Use a design token (lib/designSystem.ts) or Tailwind class instead. If this is HTML export code (PdfExport, QuestionSnapshot), add an eslint-disable-next-line with a comment explaining why.",
        },
        {
          selector:
            "Literal[value=/(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|accent|caret|placeholder)-\\[#[0-9a-fA-F]/]",
          message:
            "Arbitrary Tailwind color bracket detected (e.g., bg-[#123456]). Use a defined token color from the ink/accent/identity palette instead.",
        },
        {
          selector: "Literal[value=/\\bz-\\[\\d+\\]/]",
          message:
            "Arbitrary z-index detected. Prefer Z constants from lib/designSystem.ts (Z.modal, Z.fullscreen, Z.toast, etc.).",
        },
      ],
    },
  },
  {
    // Files where inline hex / arbitrary color brackets are acceptable:
    //   - HTML export code generates standalone documents without Tailwind
    //   - TagSystem stores user tag palette as hex
    //   - designSystem/designTokens define the tokens themselves
    files: [
      "src/components/PdfExport.tsx",
      "src/components/QuestionSnapshot.tsx",
      "src/components/TagSystem.tsx",
      "src/lib/designSystem.ts",
      "src/lib/designTokens.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);
