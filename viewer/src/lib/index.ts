/**
 * Lib barrel.
 *
 * Pure helpers (no React, no hooks). Anything stateless and reusable lives
 * here so it's testable in isolation and easy to share across components.
 *
 * Usage:
 *   import { applyFilters, fetchJson, baseForSet } from "@/lib";
 */
export * from "./facets";
export * from "./fetch";
export * from "./filterAdapter";
export * from "./filterRegistry";
export * from "./filters";
export * from "./sets";
