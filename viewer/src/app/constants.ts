/**
 * App constants
 * =============
 * Pure module-level tuning constants lifted verbatim out of `App.tsx`. No
 * imports, no side effects — safe to share. Behavior is identical; this file
 * exists only to keep the shell component focused on state/render wiring.
 */

/** Font-size step offsets from baseline (16px stem). 0 = default. */
export const FONT_STEP_PX = 1;
export const FONT_MIN = -2;
export const FONT_MAX = 3;

/** How many items to prefetch on either side of the selected question. */
export const PREFETCH_RANGE = 1;
/** Maximum questions kept in memory (≈1 MB worst case). */
export const CACHE_MAX = 200;
