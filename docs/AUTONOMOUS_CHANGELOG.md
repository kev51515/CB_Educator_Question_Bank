# Autonomous improvement log — 2026-06-09

Self-directed improvement cycles. Each entry: what + why + how verified.
Constraint this session: a parallel session was editing `fulltest/` review
surfaces (ResultView/ClassComparison/ReviewHeatmap/skills), so all work here
stays out of `fulltest/` and `mocktest/` to avoid collisions.

---

## Cycle 1 — `useNow` shared time-tick hook (live due-state updates + memo stability)

**Why:** `const now = Date.now()` was recomputed every render across ~14
surfaces. Two problems: (1) any `useMemo` keyed on `now` re-ran on every
unrelated re-render (the anchor changed each time), and (2) time-based UI —
"Due soon" → "Past due", relative "x min ago" — froze at first render and never
updated while a student left the page open. `PortfolioSubmissionForm` had
already hand-rolled a one-off `nowTick`, confirming the need for a shared hook.

**What:**
- Added `useNow(intervalMs = 60_000)` to the `@/hooks` barrel — a single-
  responsibility hook returning a timestamp that refreshes on a coarse interval
  (clears the interval on unmount; re-binds if the interval changes).
- Wired it into `student/AssignmentsPanel.tsx` (replaced the per-render
  `Date.now()`). Now the To-do/Past-due/Completed grouping and the filter counts
  re-evaluate on each minute tick, so a due date crossing surfaces live; the
  memos recompute on the tick rather than every render.

**Assumption:** 60s granularity is fine for due-state/relative-time UIs (no
second-level precision needed); keeps re-renders cheap.

**Verify:** `tsc -b` green; `eslint` clean on both changed files (the lone
warning is pre-existing in `useMediaQuery`). Other `Date.now()`-in-render
surfaces can adopt `useNow` incrementally — not swept this cycle to keep the
change tight.
