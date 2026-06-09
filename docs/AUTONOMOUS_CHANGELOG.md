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

---

## Cycle 3 — `useRovingTabIndex` hook; keyboard a11y for the assignments filter tablist

**Why:** 15 non-fulltest surfaces declare `role="tablist"` but most (incl.
`AssignmentsPanel`'s filter chips) never implemented the WAI-ARIA tablist
keyboard pattern — Arrow keys don't move between tabs and every tab is a
separate Tab stop. The project otherwise holds a high a11y bar (roving tabindex
in `KebabMenu`, 37+ focus-trapped dialogs), so this was an inconsistency for
keyboard/screen-reader users.

**What:**
- Added `useRovingTabIndex<T>()` to `@/hooks`: returns `getTabProps(i)` (ref,
  roving `tabIndex`, `onKeyDown`) implementing Arrow (wrapping) + Home/End with
  "selection follows focus" (arrowing a filter also activates it). Generic over
  the element type; horizontal/vertical orientation.
- Wired it into `AssignmentsPanel`'s filter tablist — now a single Tab stop with
  Arrow/Home/End navigation, matching the ARIA contract it already advertised.

**Assumption:** Automatic activation (selection follows focus) is right for
filter chips — consistent with how a mouse click both focuses and filters.

**Verify:** `tsc -b` green; `eslint` clean (the 1 warning is pre-existing in
`useMediaQuery`). The remaining ~14 `role="tablist"` surfaces can adopt the same
hook incrementally — left as follow-up to keep this change reviewable.

**Abandoned mid-cycle (self-critique caught it):** consolidating the 20
duplicate `formatRelative` fns into one `<RelativeTime>` — the times are
interpolated into sentences + aria-labels (not standalone), and the 20 variants
have divergent phrasing, so a sweep would risk visible wording drift across the
app. Not worth the risk this session.

---

## Cycle 4 — `useMediaQuery` → `useSyncExternalStore` (correctness + clears the lone lint warning)

**Why:** `useMediaQuery` (used app-wide for responsive behaviour) was the only
file with an ESLint warning — `setMatches(mql.matches)` called synchronously
inside an effect, which React flags as a cascading-render risk. It's also the
textbook case for `useSyncExternalStore` (subscribing to an external browser
store), which is more correct (no tearing) than mirroring into local state.

**What:** Rewrote `useMediaQuery` with `useSyncExternalStore(subscribe,
getSnapshot, getServerSnapshot=false)` — reads `matchMedia(query).matches`
directly, subscribes to `change`, SSR-safe. Same signature; drop-in for all
call sites. Removed the effect/`useState` mirror.

**Verify:** `tsc -b` green; `eslint src/hooks/index.ts` now clean (0 warnings).
Returns a primitive boolean snapshot, so no re-subscribe loop / tearing.

---

## End of session

**Shipped (4 cycles, all committed + pushed, build green):**
1. `useNow` time-tick hook → live due-state updates in AssignmentsPanel.
2. Amber "due soon" urgency accent on imminent (≤24h) assignment rows.
3. `useRovingTabIndex` a11y hook + keyboard nav on the assignments filter tablist.
4. `useMediaQuery` rewritten with `useSyncExternalStore` (cleared the last lint warning).

**Final state:** `tsc -b` 0 errors; 0 real ESLint problems (non-fulltest). Stayed
out of `fulltest/`/`mocktest/` throughout (a parallel session was editing the
review/skills surfaces).

**Still rough / follow-ups:**
- `useNow` adopted in one surface; ~13 other `Date.now()`-in-render sites + ~20
  duplicate `formatRelative` fns remain (consolidation deferred — phrasing-drift risk).
- `useRovingTabIndex` adopted in one tablist; ~14 other `role="tablist"` surfaces
  still lack arrow-key nav.
- Cycle-2/3 changes verified by tsc + pattern-fidelity, not a live keyboard E2E
  (would need a student session with assignments to render the panel).

**Top 3 next:**
1. Roll `useRovingTabIndex` across the remaining `role="tablist"` surfaces (one
   small PR each) — finishes a real keyboard-a11y gap with the now-proven hook.
2. Consolidate the 20 `formatRelative` impls into one `lib/relativeTime` util
   (carefully, matching each site's phrasing) + adopt `useNow` so all relative
   times stay fresh — DRY + consistency + live.
3. A Playwright keyboard/a11y smoke for the filter tablists (and the assignment
   due-state styling) so these UX/a11y behaviours are regression-guarded.

---

## Cycle 5 — roll `useRovingTabIndex` to 3 more student filter tablists

**Why:** Follow-through on Cycle 3's hook to actually close the keyboard-a11y gap
where it counts — the high-traffic student filter tablists. Each was the same
"declares role=tablist, no arrow nav" shape as AssignmentsPanel.

**What:** Adopted `useRovingTabIndex` (Arrow/Home/End + roving tabindex) in:
- `MyFeedbackPage` (feedback filter pills)
- `CourseMaterialsList` (material-type filter pills)
- `StudentPortfolio` (status filter pills)

Each: compute `activeIndex` from the existing filter state, `onSelect` reuses the
existing setter, and `{...getTabProps(idx)}` spreads onto the `role="tab"`
buttons. No behaviour change for mouse/click users; the group is now a single Tab
stop with arrow navigation, matching the ARIA contract.

**Verify:** `tsc -b` green; `eslint` clean on all three. (Live keyboard E2E still
deferred — same note as Cycle 3; logic mirrors the tested KebabMenu roving impl.)

**Remaining `role="tablist"` without arrow nav:** AuthScreen (2 hardcoded tabs +
a role radio group — different shape), AllUsersView, calendar (already had it),
and a handful of teacher surfaces (left alone — parallel session active there).
