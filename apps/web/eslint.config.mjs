import base from "@aaf/config/eslint.base.mjs";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    ignores: [".next/**"],
  },
];
