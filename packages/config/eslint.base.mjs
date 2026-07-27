// Shared ESLint flat-config base for all AI Asset Factory workspaces.
// Per Engineering Constitution Article III.4, import-boundary violations
// between @aaf/core modules must be treated as build-breaking, not warnings.
// Each app/package extends this and adds its own framework-specific rules
// (e.g. apps/web layers Next.js's config on top).
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ["dist/**", ".next/**", "node_modules/**", "*.config.*"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/src/*/internal/*"],
              message:
                "Reach into another module's internals is forbidden (Engineering Constitution Article III.4). Import from the module's public index.ts instead.",
            },
          ],
        },
      ],
    },
  },
];
