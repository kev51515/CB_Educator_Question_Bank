/**
 * satScore.ts — Digital SAT raw → scaled score estimation.
 * ============================================================================
 * The Digital SAT reports each section on a 200–800 scale (10-point
 * increments); the composite is their sum, 400–1600. The raw→scaled mapping is
 * a per-form lookup table and the real exam is *adaptive* (your Module-2
 * difficulty depends on Module-1 performance), so a single exact table doesn't
 * exist for a fixed, non-adaptive practice form like ours.
 *
 * This module therefore produces an **estimate**: a monotonic curve built from
 * anchor points representative of released Digital SAT conversions, linearly
 * interpolated between anchors and clamped/rounded to the official band. It is
 * deliberately labelled "estimated" everywhere it surfaces. Reading & Writing
 * is scored out of 54 raw; Math out of 44.
 *
 * Pure + dependency-free so any surface (student result, teacher review) can
 * compute the same number from the already-persisted section raw scores.
 */

export type SatSection = "reading-writing" | "math";

// Anchor points: [rawCorrect, scaledScore]. Monotonic increasing. Reading &
// Writing tops out at 54 raw; Math at 44. Values approximate representative
// Digital SAT curves (generous at the top, compressed near the floor; Math
// loses more per miss than R&W). Interpolated + rounded to the nearest 10.
const RW_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 200], [4, 280], [8, 340], [12, 400], [16, 440], [20, 480],
  [24, 520], [28, 550], [32, 590], [36, 620], [40, 660], [44, 700],
  [46, 720], [48, 740], [50, 760], [52, 780], [54, 800],
];
const MATH_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 200], [3, 290], [6, 360], [9, 420], [12, 470], [15, 510],
  [18, 550], [21, 580], [24, 610], [27, 640], [30, 670], [33, 700],
  [36, 730], [38, 750], [40, 770], [42, 780], [43, 790], [44, 800],
];

export const SECTION_MAX_RAW: Record<SatSection, number> = {
  "reading-writing": 54,
  math: 44,
};

function clampRound10(y: number): number {
  return Math.max(200, Math.min(800, Math.round(y / 10) * 10));
}

function interpolate(
  anchors: ReadonlyArray<readonly [number, number]>,
  raw: number,
): number {
  const maxRaw = anchors[anchors.length - 1][0];
  const r = Math.max(0, Math.min(maxRaw, raw));
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (r <= x1) {
      const t = x1 === x0 ? 0 : (r - x0) / (x1 - x0);
      return clampRound10(y0 + t * (y1 - y0));
    }
  }
  return clampRound10(anchors[anchors.length - 1][1]);
}

/** Estimated 200–800 scaled score for one section from its raw correct count. */
export function sectionScaled(section: SatSection, rawCorrect: number): number {
  return interpolate(section === "math" ? MATH_ANCHORS : RW_ANCHORS, rawCorrect);
}

export interface ScaledReport {
  /** Reading & Writing scaled (200–800), or null if that section is absent. */
  rw: number | null;
  /** Math scaled (200–800), or null if that section is absent. */
  math: number | null;
  /** Composite 400–1600 (sum of the two sections), or null if either absent. */
  total: number | null;
}

type SectionScores = Record<string, { correct: number; total: number }> | null | undefined;

/**
 * Build an estimated scaled report from the run's section_scores
 * (`{ "reading-writing": {correct,total}, math: {correct,total} }`).
 */
export function scaledFromSectionScores(scores: SectionScores): ScaledReport {
  const rwRaw = scores?.["reading-writing"]?.correct;
  const mathRaw = scores?.["math"]?.correct;
  const rw = typeof rwRaw === "number" ? sectionScaled("reading-writing", rwRaw) : null;
  const math = typeof mathRaw === "number" ? sectionScaled("math", mathRaw) : null;
  const total = rw !== null && math !== null ? rw + math : null;
  return { rw, math, total };
}
