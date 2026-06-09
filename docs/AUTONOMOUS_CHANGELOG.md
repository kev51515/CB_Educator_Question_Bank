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

---

## Cycle 2 — "Due soon" urgency accent on student assignment rows

**Why:** A To-do assignment due in 3 hours looked identical to one due next week
— both neutral slate. Only past-due rows had a colour (rose). Students had no
at-a-glance signal of what to do *now*, which is exactly when an LMS should help
prioritise. Pairs with Cycle 1: the panel now ticks, so a row turns amber live
as it crosses into the 24h window.

**What:**
- `assignmentsPanelHelpers.ts`: added `isDueImminent(a, now)` (due within 24h,
  unsubmitted) + a `DUE_IMMINENT_MS` constant — a tighter band than the existing
  7-day `isDueSoon` filter.
- `AssignmentRow.tsx`: new optional `dueSoon` prop. A To-do row that's imminent
  gets an amber ring/bg and amber-medium due text (`urgent = tone==='todo' &&
  dueSoon`). Past-due still wins (rose); completed unaffected.
- `AssignmentsPanel.tsx`: passes `dueSoon={isDueImminent(a, now)}` to both the
  grouped To-do list and the flat sorted list.

**Assumption:** 24h is the right "act now" threshold (vs. the 7-day soft filter).

**Verify:** `tsc -b` green; `eslint` clean on all three files. Styling-only change
(class swap) gated on existing, tested predicates.
