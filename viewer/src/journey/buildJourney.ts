/**
 * buildJourney
 * ============
 * Maps a course's published modules + items into Journey units/cells
 * (docs/JOURNEY_VIEW.md). Pure — callers supply lookups for assignment
 * metadata and full-test submission state, so the same builder serves the
 * student view (own scores) and the educator view (class aggregates).
 */
import {
  type MasteryState,
  earnedPoints,
  masteryState,
  possiblePoints,
} from "./mastery";

/** Minimal item shape both the student and teacher module rows satisfy. */
export interface JourneyItemInput {
  id: string;
  position: number;
  item_type:
    | "assignment"
    | "header"
    | "link"
    | "page"
    | "file"
    | "note"
    | "divider"
    | "video"
    | "goal"
    | "countdown"
    | "live_session"
    | "survey"
    | "vocab"
    | "skill_drill";
  item_ref_id: string | null;
  title: string;
  url: string | null;
  published: boolean;
}

export interface JourneyModuleInput {
  id: string;
  name: string;
  published: boolean;
  opens_at: string | null;
  items: JourneyItemInput[];
}

/** Per-assignment lookup result (student: own best; teacher: class avg). */
export interface JourneyAssignmentInfo {
  kind: string; // 'mocktest' | 'qbank_set'
  dueAt: string | null;
  /** Best (or class-average) effective score 0–100, null if unscored. */
  score: number | null;
  submitted: boolean;
  /** Student-side detail for the cell popover. */
  questionCount?: number | null;
  timeLimitMinutes?: number | null;
  /** id of the best attempt — powers the popover's "Review attempt". */
  attemptId?: string | null;
  /** Teacher aggregate detail — absent on the student side. */
  aggregate?: { submitted: number; total: number; sealed: number };
}

export type JourneyCellKind = "set" | "test" | "fulltest" | "resource";

export interface JourneyCell {
  id: string;
  title: string;
  kind: JourneyCellKind;
  state: MasteryState;
  score: number | null;
  earned: number;
  possible: number;
  /** The single "up next" cell across the course. */
  current: boolean;
  refId: string | null;
  url: string | null;
  dueAt: string | null;
  /** Slug for full-test link cells. */
  testSlug: string | null;
  aggregate?: { submitted: number; total: number; sealed: number };
  /** The raw lookup result, for popover detail. */
  info?: JourneyAssignmentInfo;
}

export interface JourneyUnit {
  id: string;
  name: string;
  locked: boolean;
  opensAt: string | null;
  cells: JourneyCell[];
  earned: number;
  possible: number;
  /** Submitted-or-better count among trackable (non-resource) cells. */
  doneCount: number;
  trackableCount: number;
  upNext: boolean;
}

export interface Journey {
  units: JourneyUnit[];
  earned: number;
  possible: number;
}

function isModuleLocked(opensAt: string | null): boolean {
  if (!opensAt) return false;
  return new Date(opensAt).getTime() > Date.now();
}

/** Extract the slug from a stored `/test/<slug>` (optionally `?m=…`) url. */
export function fullTestSlug(url: string | null): string | null {
  if (!url || !url.startsWith("/test/")) return null;
  const slug = url.replace(/^\/test\//, "").split("/")[0].split("?")[0];
  return slug || null;
}

export function buildJourney(
  modules: JourneyModuleInput[],
  lookups: {
    assignment: (refId: string) => JourneyAssignmentInfo | undefined;
    /** Whether the viewer has a submitted run for this full-test slug. */
    fullTestDone?: (slug: string) => boolean;
  },
): Journey {
  const units: JourneyUnit[] = [];

  for (const m of modules) {
    if (!m.published) continue;
    const locked = isModuleLocked(m.opens_at);
    const cells: JourneyCell[] = [];

    for (const it of [...m.items].sort((a, b) => a.position - b.position)) {
      // Headers, dividers, and notes are structural/instructional — never
      // journey cells (0225).
      if (
        !it.published ||
        it.item_type === "header" ||
        it.item_type === "divider" ||
        it.item_type === "note" ||
        it.item_type === "goal" ||
        it.item_type === "countdown" ||
        it.item_type === "live_session" ||
        it.item_type === "survey" ||
        it.item_type === "vocab" ||
        // skill_drill is practice, but it has no item_ref_id (the set is
        // resolved per-student at runtime) so it can't be a scored journey cell
        // in v1 — keep it out of the ledger.
        it.item_type === "skill_drill"
      )
        continue;

      if (it.item_type === "assignment" && it.item_ref_id) {
        const info = lookups.assignment(it.item_ref_id);
        const state = masteryState(
          info?.score ?? null,
          info?.submitted ?? false,
          locked,
        );
        const possible = possiblePoints(info?.kind ?? "qbank_set");
        cells.push({
          id: it.id,
          title: it.title,
          kind: info?.kind === "mocktest" ? "test" : "set",
          state,
          score: info?.score ?? null,
          earned: earnedPoints(possible, state),
          possible,
          current: false,
          refId: it.item_ref_id,
          url: null,
          dueAt: info?.dueAt ?? null,
          testSlug: null,
          aggregate: info?.aggregate,
          info,
        });
        continue;
      }

      const slug = it.item_type === "link" ? fullTestSlug(it.url) : null;
      if (slug) {
        // Full-length tests are done/not-done only: scores are release-gated
        // (0075), so no seal tier and no points in v1 (docs/JOURNEY_VIEW.md).
        const done = lookups.fullTestDone?.(slug) ?? false;
        cells.push({
          id: it.id,
          title: it.title,
          kind: "fulltest",
          state: locked ? "locked" : done ? "done" : "not_started",
          score: null,
          earned: 0,
          possible: 0,
          current: false,
          refId: null,
          url: it.url,
          dueAt: null,
          testSlug: slug,
        });
        continue;
      }

      // Links / pages / files — stateless side-trail resources.
      cells.push({
        id: it.id,
        title: it.title,
        kind: "resource",
        state: locked ? "locked" : "not_started",
        score: null,
        earned: 0,
        possible: 0,
        current: false,
        refId: null,
        url: it.url,
        dueAt: null,
        testSlug: null,
      });
    }

    const trackable = cells.filter((c) => c.kind !== "resource");
    units.push({
      id: m.id,
      name: m.name,
      locked,
      opensAt: m.opens_at,
      cells,
      earned: cells.reduce((n, c) => n + c.earned, 0),
      possible: cells.reduce((n, c) => n + c.possible, 0),
      doneCount: trackable.filter(
        (c) => c.state !== "not_started" && c.state !== "locked",
      ).length,
      trackableCount: trackable.length,
      upNext: false,
    });
  }

  // "Up next" = the first untouched trackable cell in an unlocked unit.
  outer: for (const u of units) {
    if (u.locked) continue;
    for (const c of u.cells) {
      if (c.kind !== "resource" && c.state === "not_started") {
        c.current = true;
        u.upNext = true;
        break outer;
      }
    }
  }

  return {
    units,
    earned: units.reduce((n, u) => n + u.earned, 0),
    possible: units.reduce((n, u) => n + u.possible, 0),
  };
}
