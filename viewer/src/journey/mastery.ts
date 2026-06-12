/**
 * mastery
 * =======
 * Pure logic for the Journey view (docs/JOURNEY_VIEW.md): mastery states,
 * mastery points, and course-scoped levels. No React, no I/O.
 *
 * Design decisions locked 2026-06-12:
 *  - "Sealed" (gold) = best EFFECTIVE score >= 80 (teacher overrides count).
 *  - Points are derived, never stored: best-attempt-only means a retake can
 *    only upgrade, and an item awards once — anti-gameable by construction.
 *  - Levels are course-scoped and display-only.
 */

export type MasteryState =
  | "sealed" // submitted, >= 80%
  | "proficient" // submitted, 60–79%
  | "attempted" // submitted, < 60%
  | "done" // submitted, score unavailable (e.g. release-gated full tests)
  | "not_started"
  | "locked";

export const SEAL_THRESHOLD = 80;
export const PROFICIENT_THRESHOLD = 60;

export function masteryState(
  score: number | null,
  submitted: boolean,
  locked: boolean,
): MasteryState {
  if (locked) return "locked";
  if (!submitted) return "not_started";
  if (score === null) return "done"; // submitted, no score available
  if (score >= SEAL_THRESHOLD) return "sealed";
  if (score >= PROFICIENT_THRESHOLD) return "proficient";
  return "attempted";
}

export const MASTERY_LABEL: Record<MasteryState, string> = {
  sealed: "Sealed",
  proficient: "Proficient",
  attempted: "Attempted",
  done: "Submitted",
  not_started: "Not started",
  locked: "Locked",
};

/** Possible mastery points per assignment kind (qbank_set | mocktest). */
export function possiblePoints(kind: string): number {
  return kind === "mocktest" ? 200 : 100;
}

/** Earned points for one item given its possible total and mastery state. */
export function earnedPoints(possible: number, state: MasteryState): number {
  switch (state) {
    case "sealed":
      return possible;
    case "proficient":
      return Math.round(possible * 0.75);
    case "attempted":
    case "done":
      return Math.round(possible * 0.5);
    default:
      return 0;
  }
}

export interface LevelInfo {
  level: number;
  name: string;
  /** Points at which this level started. */
  floor: number;
  /** Points needed for the next level, or null at the cap. */
  nextAt: number | null;
  /** 0–100 progress through the current level (100 at cap). */
  progressPct: number;
}

const LEVEL_FLOORS = [0, 150, 400, 800, 1300, 1900, 2600];
const LEVEL_NAMES = [
  "Novice",
  "Apprentice",
  "Scholar",
  "Honors Scholar",
  "Dean's List",
  "Summa",
  "Valedictorian",
];

export function levelFor(points: number): LevelInfo {
  const pts = Math.max(0, points);
  let idx = 0;
  for (let i = LEVEL_FLOORS.length - 1; i >= 0; i--) {
    if (pts >= LEVEL_FLOORS[i]) {
      idx = i;
      break;
    }
  }
  const floor = LEVEL_FLOORS[idx];
  const nextAt = idx + 1 < LEVEL_FLOORS.length ? LEVEL_FLOORS[idx + 1] : null;
  const progressPct =
    nextAt === null
      ? 100
      : Math.min(100, Math.round(((pts - floor) / (nextAt - floor)) * 100));
  return { level: idx + 1, name: LEVEL_NAMES[idx], floor, nextAt, progressPct };
}
