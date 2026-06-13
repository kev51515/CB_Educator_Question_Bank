/**
 * modulesPagePersistence
 * ======================
 * Pure localStorage helpers + UI-filter types for the Modules page — no React,
 * no JSX. Extracted verbatim from ModulesPage (modularization step 2): collapse
 * state, the inline-"add item" type + its last-used memory, and the Practice
 * Test / Question Bank library filter persistence.
 */

// ---- module collapse/expand state -----------------------------------------

export const collapseKey = (userId: string | null, courseId: string | null): string =>
  `mod-collapse:${userId ?? "anon"}:${courseId ?? "none"}`;

export function readCollapseState(key: string): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

export function writeCollapseState(
  key: string,
  state: Record<string, boolean>,
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

// ---- inline "add item" type + filters -------------------------------------

export type InlineAddType =
  | "assignment"
  | "practice_test"
  | "question_set"
  | "full_test"
  | "page"
  | "video"
  | "file"
  | "header"
  | "note"
  | "divider"
  | "link";

// Add-picker sub-tab groups (docs/PLAN_MODULE_ITEM_TYPES.md). The picker shows
// only groups that have ≥1 available type, so groups appear as their types ship.
export type InlineAddGroup = "learn" | "assess" | "engage" | "structure";

export const INLINE_ADD_GROUP_LABEL: Record<InlineAddGroup, string> = {
  learn: "Learn",
  assess: "Assess",
  engage: "Engage",
  structure: "Structure",
};

/** Which group each type lives in. */
export const INLINE_ADD_GROUP_OF: Record<InlineAddType, InlineAddGroup> = {
  page: "learn",
  video: "learn",
  file: "learn",
  assignment: "assess",
  practice_test: "assess",
  question_set: "assess",
  full_test: "assess",
  header: "structure",
  note: "structure",
  divider: "structure",
  link: "structure",
};

// Practice Test source filter (UI-only, used to narrow the teacher's
// cross-course mocktest library). The Practice Test branch no longer
// configures a source at assign-time — it's a property of the chosen
// template, surfaced as a filter pill + per-row chip.
export type PracticeTestSourceFilter = "all" | "cb" | "sat" | "mixed";

// Defaults aligned with AssignmentFormModal / AddSetToCourseModal so behaviour
// matches what teachers see in those longer-form surfaces.
/**
 * Compute a sensible default time limit from the catalog entry's question
 * count: ~45 sec/question with safety margin, rounded up to the nearest 5
 * minutes, with a 10-minute floor. Mirrors `AddSetToCourseModal`.
 *
 * Why compute instead of asking the teacher? Per the project's workflow
 * audit (May 2026), assign-time forms should only vary (which thing, due
 * date, display title). Time limit is intrinsic to the catalog entry and
 * belongs to its definition. catalog.json doesn't carry it today.
 */
export function computeDefaultQbankTimeLimit(questionCount: number): number {
  if (!Number.isFinite(questionCount) || questionCount <= 0) return 10;
  const raw = questionCount * 0.75;
  const rounded = Math.ceil(raw / 5) * 5;
  return Math.max(10, rounded);
}

// localStorage keys.
const LAST_ADD_TYPE_KEY = (userId: string | null, classId: string | null): string =>
  `lms.lastAddType:${userId ?? "anon"}:${classId ?? "none"}`;
const QBANK_LAST_FILTER_KEY = "qbank.lastFilter";
const PT_LIBRARY_LAST_FILTER_KEY = "lms.ptLibraryLastFilter";

export type QbankSectionFilter = "all" | "math" | "reading-and-writing";
export type QbankDifficultyFilter = "all" | "easy" | "medium" | "hard";

export interface QbankLastFilter {
  section: QbankSectionFilter;
  difficulty: QbankDifficultyFilter;
}

export function readQbankLastFilter(): QbankLastFilter {
  try {
    const raw = window.localStorage.getItem(QBANK_LAST_FILTER_KEY);
    if (!raw) return { section: "all", difficulty: "all" };
    const parsed = JSON.parse(raw) as Partial<QbankLastFilter>;
    const section: QbankSectionFilter =
      parsed.section === "math" || parsed.section === "reading-and-writing"
        ? parsed.section
        : "all";
    const difficulty: QbankDifficultyFilter =
      parsed.difficulty === "easy" ||
      parsed.difficulty === "medium" ||
      parsed.difficulty === "hard"
        ? parsed.difficulty
        : "all";
    return { section, difficulty };
  } catch {
    return { section: "all", difficulty: "all" };
  }
}

export function writeQbankLastFilter(filter: QbankLastFilter): void {
  try {
    window.localStorage.setItem(QBANK_LAST_FILTER_KEY, JSON.stringify(filter));
  } catch {
    // ignore (private mode etc.)
  }
}

export function readLastAddType(userId: string | null, classId: string | null): InlineAddType | null {
  try {
    const raw = window.localStorage.getItem(LAST_ADD_TYPE_KEY(userId, classId));
    if (raw === "assignment" || raw === "practice_test" || raw === "question_set" || raw === "header" || raw === "link") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLastAddType(userId: string | null, classId: string | null, type: InlineAddType): void {
  try {
    window.localStorage.setItem(LAST_ADD_TYPE_KEY(userId, classId), type);
  } catch {
    // ignore
  }
}

export interface PtLibraryLastFilter {
  source: PracticeTestSourceFilter;
  courseId: string | "all";
}

export function readPtLibraryLastFilter(): PtLibraryLastFilter {
  try {
    const raw = window.localStorage.getItem(PT_LIBRARY_LAST_FILTER_KEY);
    if (!raw) return { source: "all", courseId: "all" };
    const parsed = JSON.parse(raw) as Partial<PtLibraryLastFilter>;
    const source: PracticeTestSourceFilter =
      parsed.source === "cb" || parsed.source === "sat" || parsed.source === "mixed"
        ? parsed.source
        : "all";
    const courseId: string | "all" =
      typeof parsed.courseId === "string" && parsed.courseId.length > 0
        ? parsed.courseId
        : "all";
    return { source, courseId };
  } catch {
    return { source: "all", courseId: "all" };
  }
}

export function writePtLibraryLastFilter(filter: PtLibraryLastFilter): void {
  try {
    window.localStorage.setItem(PT_LIBRARY_LAST_FILTER_KEY, JSON.stringify(filter));
  } catch {
    // ignore
  }
}
