/**
 * Root barrel for @aaf/core. Prefer importing from the specific subpath
 * (`@aaf/core/config`, `@aaf/core/audit`, etc.) — this barrel only re-
 * exports the foundation modules implemented in this Sprint so the package
 * has a sane default entrypoint. Business modules (identity, prompt-engine,
 * product-lock, character-lock, higgsfield, drive, qc, mission, queue,
 * notifications) are stubs owned by Agents 2-7 — see each module's README
 * and the ownership map in this package's top-level README.md.
 */
export * from "./config/index.js";
export * from "./audit/index.js";
export * from "./db/index.js";
export * from "./rbac/index.js";
export * from "./result/index.js";
