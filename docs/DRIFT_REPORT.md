# Drift Report

Audit of the LMS codebase against `docs/ARCHITECTURE.md`. Scope: every file under `viewer/src/auth/`, `viewer/src/teacher/`, `viewer/src/student/`, `viewer/src/admin/`, `viewer/src/mocktest/` (including `components/` and `sources/`), the three named `viewer/src/lib/` files, `viewer/scripts/*.mjs`, and `supabase/functions/cleanup-anon-users/index.ts`. Migration files were inspected for context but not modified per the task constraint.

---

## 1. Summary

| Bucket | Count |
|---|---|
| Files audited | 56 |
| **Drift** items found | 17 |
| **Minor** items found | 4 |
| **Acceptable variance** items confirmed | 3 |
| Drift items **fixed in place** | 8 |
| Drift items **flagged, not fixed** | 9 |

Build status after fixes: `npx tsc -b` → exit 0.

---

## 2. Fixes applied

All fixes are mechanical, single-file, low-risk. They add the required `role="alert"` to inline error blocks (spec §4f) and convert two `red-*` Tailwind classes to the canonical `rose-*` palette (spec §4c).

| # | File | Line(s) | Change | Rubric clause |
|---|---|---|---|---|
| 1 | `viewer/src/teacher/TeacherConsole.tsx` | ~132–135 | Added `role="alert"` to error `<div>` in classes list | §4f: "errors are inline rose blocks with `role='alert'`" |
| 2 | `viewer/src/teacher/ClassDetailView.tsx` | ~474–478 | Added `role="alert"` to roster error `<p>` | §4f |
| 3 | `viewer/src/teacher/AssignmentsPage.tsx` | ~357–361 | Added `role="alert"` to assignments-list error `<div>` | §4f |
| 4 | `viewer/src/teacher/AssignmentAttemptsView.tsx` | ~93–96 | Added `role="alert"` to attempts error `<p>` | §4f |
| 5 | `viewer/src/student/MyClassesPanel.tsx` | ~128–131 | Added `role="alert"` to fetch-error `<p>` | §4f |
| 6 | `viewer/src/student/AssignmentsPanel.tsx` | ~213–216 | Added `role="alert"` to fetch-error `<p>` | §4f |
| 7 | `viewer/src/mocktest/MockTestApp.tsx` | ~384–392 | Replaced `red-*` with `rose-*` on `loadError` block and added `role="alert"` | §4c palette + §4f |
| 8 | `viewer/src/mocktest/MockTestApp.tsx` | ~471–483 | Replaced `red-*` with `rose-*` on `saveError` block (incl. retry button) and added `role="alert"` | §4c palette + §4f |

No file's behavior changed; only ARIA attribution and palette tokens were touched. `tsc -b` passes cleanly.

---

## 3. Outstanding drift

Each item is something the rubric flags but the fix isn't a clean one-file mechanical diff. Severity is the auditor's judgement of conformance risk, **not** runtime risk.

| # | Where | Drift | Severity | Remediation note |
|---|---|---|---|---|
| 1 | `viewer/src/mocktest/components/AnswerReview.tsx` (lines 132, 134, 157), `SkillBreakdownCard.tsx` (line 13), `TestPhaseHeader.tsx` (line 40) | Uses `red-*` palette where the spec mandates `rose-*` for destructive / error tones | Low | Mechanical rename across ~5 files; safe but touches multiple files so logged here rather than rolled into this pass. |
| 2 | `viewer/src/mocktest/components/SubmitConfirmDialog.tsx`, `TestPhaseFooter.tsx`, `TestQuestionNav.tsx`, `SkillBreakdownCard.tsx`, `TestPhaseHeader.tsx`, plus `auth/AccountUpgradeBanner.tsx`, `teacher/ClassDetailView.tsx`, `admin/AllUsersView.tsx` | Uses `amber-*` palette which is not in the documented set (indigo/violet/emerald/rose/slate) | Low | `amber` is used semantically for "warning / flagged / unverified". Either (a) add `amber` to the documented palette as the spec's "warning" tone, or (b) re-skin to `slate`/`emerald`. The current colour ratio across files implies (a) is closer to reality. **This is a spec gap, not just code drift.** |
| 3 | `viewer/src/auth/AccountSettings.tsx` line 134 | Surfaces a raw Supabase auth error (`error.message`) for the change-email sub-flow at the UI boundary | Medium | Add a `mapEmailError` (à la `mapRedeemError` in `session.ts`) for common cases (`email_exists`, `email_not_confirmed`). Per §4f raw Supabase strings should not reach users. |
| 4 | `viewer/src/auth/session.ts` lines 159, 184, 263, 277, 287, 301, 313 | Several methods (`signInWithPassword`, `signUp`, `requestPasswordReset`, `updatePassword`, `updateDisplayName`) return `error.message` straight from supabase-js without mapping | Medium | Either map at this layer or document that the UI layer is the boundary (and ensure every consumer maps). `AuthScreen.tsx` and `PasswordResetScreen.tsx` only `cleanError()` — they don't substitute friendly copy. |
| 5 | `viewer/src/admin/AdminInviteCodesPage.tsx` lines 189, 199, 209 | RPC error messages from `mint_teacher_invite` / `revoke_teacher_invite` rendered raw. Spec catalogues the stable codes (`invalid_code_length`, `invalid_code_format`, `code_already_exists`, etc.) but no `mapInviteError` exists. | Medium | Build a small mapper mirroring `mapRedeemError` in `session.ts`; surface friendly copy. |
| 6 | `viewer/src/admin/AllUsersView.tsx` lines 113, 160, 185 | Same pattern — `set_user_role` / `admin_delete_user` raw errors. Spec lists `cannot_demote_self`, `cannot_delete_self`, `admin_already_exists`. | Medium | Same fix: per-page friendly mapper. |
| 7 | `viewer/src/teacher/ClassDetailView.tsx` (`onRegenerate`, `onDeleteClass`, `onToggleArchive`, `onRemoveStudent`); `viewer/src/student/MyClassesPanel.tsx` (`onLeave`); `viewer/src/teacher/AssignmentsPage.tsx` (`onToggleArchive`, `onDelete`) | Raw Supabase error message surfaced for in-line action failures | Low | Per `getErrorMessage(err, fallback)` pattern already in these files, replace `setActionError(updError.message)` with a curated mapper. Multiple call-sites — not a clean single-file fix. |
| 8 | `viewer/src/auth/AccountUpgradeBanner.tsx` palette | Banner uses `amber-*` exclusively — outside documented palette | Low | See item 2; depends on spec decision. |
| 9 | `viewer/src/admin/AllUsersView.tsx` line 236 | `actionError` rendered in an `amber-*` block as a soft "warning". Other surfaces use `rose-*` for errors. | Low | Decide whether action-busy errors should differ from fetch errors. If yes, document; if no, re-skin to rose. |

### Items considered and **deliberately not flagged**

- The cross-folder import `student/useStudentAssignments.ts` → `teacher/useAssignments.ts` for `AssignmentSourceId` / `AssignmentDifficultyMix` types is **explicitly tolerated** in spec §2 with a candidate-for-promotion note.
- `lib/profile.ts` returns `{ profile, loading, error, refresh }` (not `{ data, ... }`); spec §4b lists this exact hook as canonical, so the named-field shape is acceptable variance for hooks where the domain noun is clearer than `data`. Same for `useTeacherClasses` (`classes`), `useClassRoster` (`roster`), `useAssignments` (`assignments`), `useAssignmentAttempts` (`attempts`), `useStudentClasses` (`classes`), `useStudentAssignments` (`assignments`).
- `lib/attemptReview.ts#fetchAttemptReview` returns `{ data, error }` with a raw Supabase error string — this is the **library boundary**, and the two consumers (`StudentAttemptReview`, `TeacherAttemptDetailView`) render the error inside their own error surface (`"Couldn't load this attempt"`). The raw string only appears as fallback text inside a friendly frame, which matches the spirit of §4f.

---

## 4. Acceptable variances confirmed

Per spec §9 ("Open questions / patterns not yet picked"):

| Variance | Where | Spec clause |
|---|---|---|
| Cross-domain type re-export (student → teacher) for `Assignment*` | `student/useStudentAssignments.ts` | §9 bullet 6 |
| Ad-hoc per-modal form state with manual validation | All modal files | §9 bullet 1 |
| Per-component date formatters | `useAssignments.ts`, `AssignmentsPage.tsx`, `ClassDetailView.tsx`, `attemptReview.ts`, `MyClassesPanel.tsx`, `AssignmentsPanel.tsx`, `AssignmentAttemptsView.tsx`, `AdminInviteCodesPage.tsx`, `AllClassesView.tsx`, `AllUsersView.tsx`, `AdminClassDetail.tsx` | §9 bullet 5 |

---

## 5. Spec gaps

Things the auditor needed to know to grade a file but the spec did not say (the spec author should consider adding):

1. **Warning palette**: `amber-*` is used as the de facto warning tone (anonymous-account banner, action-failed notices on the admin users page, the timer-warning state in `TestPhaseHeader.tsx`, the flagged-question state in `TestPhaseFooter.tsx` and `TestQuestionNav.tsx`). The documented palette (indigo/violet/emerald/rose/slate) has no warning slot. Either canonicalise amber, or pick another slate-50/slate-200 surface for warnings.
2. **`red-*` vs `rose-*` in the mocktest module**: the mocktest screens use `red-*` for "critical" tones (e.g. `TestPhaseHeader` timer-critical), while the rest of the app uses `rose-*`. The spec mandates rose but doesn't say whether mocktest is exempt. The mocktest module predates the LMS work and may have been intentionally left at red — this should be confirmed.
3. **Error-mapping boundary**: §4f says "raw error codes never reach the user", but doesn't define **where** the mapping should happen (RPC wrapper in `session.ts`? Per-component `friendlyError`?). The two existing mappers (`mapRedeemError` in `session.ts`, `friendlyError` in `JoinClassModal.tsx`) live at different layers. A canonical answer would let the auditor flag drift consistently.
4. **Hook return-shape exception list**: spec §4b says hooks return `{ data, loading, error, refresh }` but the canonical examples all rename `data` to a domain noun (`profile`, `classes`, `roster`, `assignments`, `attempts`). The spec lists these as canonical, so the rule is effectively "data-or-domain-noun-singleton". Worth saying explicitly so a future hook author doesn't think they have to pick `data`.
5. **Modal close behaviour**: spec §4c describes the modal structure but is silent on `Escape` listener placement. Most modals install a global `keydown` in their own `useEffect`; `StudentBadge`, `ClassDetailView`'s kebab menu, and others duplicate that scaffold. Could be canonicalised as a tiny `useEscape(onClose)` hook in `lib/`.
6. **`useState` of-prop-on-prop-change pattern**: `ClassDetailView.tsx` and `AccountSettings.tsx` both seed local state from a prop, then sync via `useEffect`. Spec doesn't bless or forbid this; it's a common React footgun and worth a recommendation.
7. **Hash-routing for `#account`**: spec §4e mentions `#account` opens settings, but `AccountSettings.tsx` reimplements `hashchange` listening locally via `useHashOpen`. Worth documenting whether that's the intended pattern or whether a shared helper should live in `lib/`.

---

## 6. Recommended audit cadence

Re-run this audit (a) **monthly** as a sanity check, and (b) **on demand** whenever a migration adds a new RPC or a new top-level role surface. Each pass should take ~30 minutes for an LLM agent with the spec and the file list. The auditor role should rotate between human and agent so the human eye catches structural drift the rubric doesn't yet codify (component sizing, prop drilling, etc.) while the agent enforces the mechanical checks consistently. Track outstanding-drift count over time — a rising number signals the spec needs an update, not just the code.
