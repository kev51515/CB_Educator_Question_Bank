# CLAUDE.md — Project rules for AI assistants working in this repo

This file is read at the start of every Claude Code session. Treat it as a
binding contract: the rules below are what the project owner has explicitly
decided. Don't relitigate them — apply them.

---

## What this project is

A Canvas-style **LMS for SAT prep** built on React 19 + Vite + TypeScript +
Supabase. Operated by a husband-wife team of two SAT teachers. The product's
moat is SAT-specific pedagogy (skill mastery, score predictions, weak-skills
focus) layered on top of a familiar Canvas-aligned classroom workflow.

End-state inspirations:
- **Canvas LMS** for structure (Courses / Modules / Assignments / Discussions
  / Files / People / Calendar / Inbox / Account)
- **Linear / Notion / Cloudflare Dashboard** for interaction quality and polish

---

## Design direction — the bar

The Wave 8B Modules page is the reference standard for UX quality. Read
`viewer/src/teacher/ModulesPage.tsx` whenever in doubt about how something
should feel. Key patterns:

1. **Visible affordances over hidden behaviors.** Every draggable row has a
   6-dot grip icon. Every editable thing reveals a pencil on hover. Every
   clickable status is one click, not a menu.
2. **Inline edit > modal.** Click a title to rename. Esc cancels, Enter
   saves. Save on blur. Only open a full modal when the form has multiple
   non-trivial fields.
3. **One-click status toggles.** Publish ↔ unpublish via a single click on
   the status badge — don't bury it in a kebab menu.
4. **Kebab menus collect tertiary actions.** Edit / Duplicate / Move to… /
   Delete. The primary action stays inline; tertiary actions live in the
   kebab.
5. **Persistent UI state.** Collapse/expand state, filter selections, tab
   choices — persist these to localStorage per (user, surface) so reloads
   don't reset them.
6. **Optimistic UI.** Update locally first, then reconcile against the
   server. If the write fails, show a toast and roll back.
7. **Skeleton loading, not "Loading…" text.** Show the shape of the
   incoming UI while it loads.
8. **Empty states have a CTA.** Never leave a blank page. "No modules yet —
   click + Module to add one" beats silent emptiness.
9. **Toasts for transient feedback.** Use `useToast()` from
   `@/components`, not inline error text, for confirmations + failures.
10. **Mobile-aware.** Tap targets ≥ 40px. Drag interactions must have a
    fallback (Move-to… menu) for touch.

---

## Forbidden patterns ("old-fashioned entry")

DO NOT ship these. If a wave's UI uses one of these, push back and replace
it with the modern equivalent:

| Forbidden | Use instead |
|---|---|
| Plain `<textarea>` for body content (essays, posts, announcements, messages) | `<MarkdownEditor />` from `@/components` |
| `<input type="file">` alone | `<FileDropzone />` from `@/components` — drag-and-drop, multi-file, preview, progress |
| `<input type="datetime-local">` alone | `<SmartDatePicker />` from `@/components` — with relative presets ("Tomorrow", "Friday", "In 1 week") |
| Modal that pops just to confirm something simple | inline confirm or one-click action with toast undo |
| "Loading..." text on a blank page | skeleton screens that mirror the incoming layout |
| Blank empty pages | empty state component with explanation + primary CTA |
| Custom alert/confirm dialogs for transient feedback | `useToast().success/error/info/warning(...)` |
| Tiny grey buttons for delete | red, clearly labelled, with confirm dialog only when the action is destructive AND non-reversible |
| Required fields with no inline validation | live validation as the user types (or onBlur) |
| Long forms with no progress indication | step indicator + autosave per step |
| Pickers that show plain text — "Choose course…" — without typeahead | combobox with type-to-filter |
| Date displays as raw ISO strings | use relative formatter ("in 3 days", "yesterday") |

---

## Component library — what to use

Mounted globally:
- **`ToastProvider`** (in `main.tsx`) → `useToast()` available anywhere

In `viewer/src/components/`:
- **`MarkdownEditor`** — TipTap-based rich text editor with toolbar; supports `characterLimit` prop with visible count
- **`FileDropzone`** — drag-and-drop file uploader
- **`SmartDatePicker`** — date/time with relative presets
- **`WeakSkillsToggle`** — student-side pill that filters question bank to weak skills
- **`KebabMenu`** — `aria-haspopup="menu"` + roving tabindex + Arrow/Home/End/Esc; viewport-flip
- **`CourseCard`** — shared card primitive (Dashboard + AllClassesView); supports `kebab` prop
- **`Toast`** — `role="status"` for success/info, `role="alert"` for error/warning; supports `options.action = { label, onAction }` for **undo** affordance; auto-extends to 8s when an action is present
- **`Skeleton`** — `aria-busy="true"`, not "Loading…" text
- **`CommandPalette`** — ⌘K; staff wires via `useLmsCommands` (recents at `staff.cmdpalette.recent`); students wire via `useStudentCommands` from `lib/studentCommands` (recents at `student.cmdpalette.recent`)
- **`useFocusTrap`** (`viewer/src/hooks/useFocusTrap.ts`) — wired on **37+** dialogs as of Wave 21. Supports `[data-autofocus]` to override the default first-focus target. Skip on `CommandPalette` (custom trap) and non-modal floating panels.
- **`ScoreArcSparkline`** — pure inline SVG; multi-attempt scaled-score trajectory for student surfaces
- **`NeedsAttentionPanel`** (`viewer/src/dashboard/`) — cross-course triage for staff Dashboard
- (existing) `Highlight`, `BatchOpsBar`, `MobileTabBar`, lots of question-bank components

In `viewer/src/notifications/`:
- **`NotificationBell`** — bell with unread badge + dropdown

When you need a new shared UI primitive, add it to `viewer/src/components/`
and barrel-export it from `viewer/src/components/index.ts`. Do not duplicate
existing primitives.

**Exception — surface-coupled components**: a component that's only meaningful
inside one surface (Dashboard's `NeedsAttentionPanel`, the student-side
`ScoreArcSparkline`, the teacher-side `AssignmentCard`, etc.) lives in that
surface's domain folder (`dashboard/`, `student/`, `teacher/`, `journey/`)
and is imported directly from the consumer. Don't promote it to `components/`
unless a second surface needs it. The barrel is for cross-cutting primitives.

`viewer/src/journey/` is the gamified Journey view (gold seal at effective
score ≥80%, derived mastery points + levels — nothing stored). Spec + all
decision records: `docs/JOURNEY_VIEW.md`. Student = ledger spine
(`JourneySpine`, summit card) with cell popovers + quiet-ledger seal moment;
educator Modules has Journey|List (Journey primary) with Class grid |
Students (heatmap) tabs, triage popovers + Nudge DMs. The student-side
journey is behind `STUDENT_JOURNEY_ENABLED` in `StudentCourseView.tsx`
(temp. off; `localStorage journey.preview=1` previews it).

### Modal contract (every `role="dialog"`)

- `aria-modal="true"` + `aria-labelledby`
- Wire `useFocusTrap` (don't roll your own)
- Top-right `×` close button, ≥40px tap target, `aria-label="Close"`
- Esc closes, restores focus to the opener
- Backdrop click closes (with `e.stopPropagation` on the panel)

---

## Vocabulary canon

The DB `kind` enum stays unchanged. UI labels must always be:

| `assignments.kind` | UI label (everywhere) | Where used |
|---|---|---|
| `'mocktest'` | **"Practice Test"** | `/question-bank` tab, Modules add-item chip, AssignmentDetailPage badge, student runner. NEVER "Mock Test". |
| `'qbank_set'` | **"Question Set"** | `/question-bank` tab, Modules add-item chip, AssignmentDetailPage badge, student runner. NEVER "Practice Set". |

The `MockTestApp` / `mocktest/*` file paths and internal `kind='mocktest'`
DB value stay — those are implementation. User-facing strings only follow
the canon above.

The legacy `/mock-test` route (free-practice mode, not assignment-scoped)
is the one exception that may still appear as "Mock Test" in a CommandPalette
entry for free practice — flag in PR review if extending.

### Question Set identity — `qbank_set_uid` (single source of truth)

A `'qbank_set'` assignment is linked to a static question-set export by a
`qbank_set_uid` string. That uid is **computed once** from a catalog entry
when the teacher assigns the set (writer) and **resolved back** to a catalog
entry when the student runner loads it (reader). Both sides MUST use the same
encoder. There is exactly one: **`viewer/src/lib/qbankSetUid.ts`**
(`qbankSetUid()` / `qbankSetUidMatches()`).

- Canonical form: `skill::reading-and-writing::medium::command-of-evidence::2`
  (lowercased `axis::section::difficulty::topic::setId`, spaces→`-`).
- **Never re-implement this encoder inline.** It used to exist as two copies —
  the teacher writer joined with `::`, the student resolver with `-` — and
  they drifted, so *every* Question Set silently failed to resolve (students
  saw a broken/empty set). `teacher/useQuestionBankCatalog.ts:catalogEntryUid`
  and `student/QBankAssignmentRunner.tsx` both delegate to the lib now.
- The catalog round-trip is guarded by `npm run check:qbank-uid`
  (`viewer/scripts/check-qbank-uid.mjs`) — run it after regenerating
  `public/exports/catalog.json`. It must read 0 failures.
- Note: Command of Evidence sets legitimately include **quantitative**
  (graph/data) questions. Those are correct Reading/Writing content even
  though they look math-y — don't "fix" them as miscategorized.

---

## Canvas-aligned navigation

**Role-prefixed URLs (as of the routing rework):** every authenticated surface
carries a `/educator` or `/student` prefix so the signed-in role is obvious in
the address bar. The one exception is the full-screen test runner `/test/:slug`
— role-agnostic, and its URL is stored in `module_items`. Old top-level paths
(`/dashboard`, `/courses`, …) fall through each role tree's catch-all to the
role home, so stale links degrade gracefully rather than 404.

**Educator (teacher + admin):**

| URL | Surface |
|---|---|
| `/educator/dashboard` | staff Dashboard with course cards |
| `/educator/courses` | courses list (Active / Archived / Templates filter) |
| `/educator/courses/:id/modules` | (default landing for a course) Canvas-style Modules with drag-to-reorder, kebab actions, lock-until, student completion ticks |
| `/educator/courses/:id/assignments` | assignments list |
| `/educator/courses/:id/people` | roster + bulk CSV import (+ `/people/:studentId` profile) |
| `/educator/courses/:id/discussions` | per-course forum |
| `/educator/courses/:id/announcements` | teacher posts |
| `/educator/courses/:id/materials` | file/link library |
| `/educator/courses/:id/grades` | gradebook |
| `/educator/courses/:id/portfolio` | college-app portfolio (template + items + submissions + feedback) |
| `/educator/courses/:id/settings` | rename / archive / regen code / delete |
| `/educator/question-bank` | question bank + Full-Test catalog tab |
| `/educator/tests/:slug` | **per-test overview** — info, cohort stats, per-student data + Preview / Assign to course / Monitor / release (teachers land here from a test's Modules link; students get the runner). `/educator/tests/:slug/review` = answer key. |
| `/educator/inbox` | DMs |
| `/educator/calendar` | month + list view of due dates |
| `/educator/account/settings` | profile + password + data export |
| `/educator/account/admin/*` | staff power-tools (stats, users, invites, audit) |

**Student:**

| URL | Surface |
|---|---|
| `/student` (and `/student/:code`) | student home / area selector; `:code` is the teacher-assigned login code, display-only |
| `/student/courses/:short` | student per-course view |
| `/student/assignment/:id/take` · `…/review/:attemptId` | assignment runner + review |
| `/student/my-feedback` | feedback history |
| `/student/inbox` · `/student/account/settings` | DMs · profile |
| `/student/practice` · `/student/mock-test` | locked under controlled access — redirect home |

**Shared:** `/test/:slug` (full-test runner takeover) · `/signin` · `/quick-start`.

Use the route constants/builders in `viewer/src/lib/routes.ts`. Don't hardcode
paths. Educator-owned routes use the `ROUTES.*` constants directly; the shared
account/inbox render under each role's prefix (educator uses `ROUTES.ACCOUNT` /
`ROUTES.INBOX`; student uses `ROUTES.STUDENT_ACCOUNT` / `ROUTES.STUDENT_INBOX`
+ the `student*Path()` builders). `AccountRoutes` takes a `basePath` prop;
`InboxPage` derives its base from `profile.role`.

---

## Backend rules

The smoke suite (`viewer/scripts/smoke-all.mjs` runs all 5 sub-suites:
`smoke-e2e.mjs`, `smoke-features.mjs`, `smoke-modules.mjs`,
`smoke-qbank.mjs`, `smoke-cascade.mjs`) caught most of the real bugs we
introduced this year. Run all before declaring any backend change done.
`smoke-cascade.mjs` specifically guards the security/cascade contract
from migration 0050 (privilege guard, audit-on-delete, idempotency).

**Content QC — run after seeding ANY test.** `npm run check:content`
(`viewer/scripts/check-test-content.mjs`) scans every `test_questions` row for
the defects the OCR→seed pipeline introduces: a literal "blank" word beside the
`___` gap, a mid-sentence gap whose choices carry a stray trailing period, a word
duplicated before the gap AND in the choices ("seafloor seafloor"), `[a]`-style
bracket artifacts, truncation / unbalanced quotes, missing gaps, and dropped
open/close quotes on a choice. It exits non-zero on any flag. It must read 0
before a seeded test is considered done (existing six are clean as of 0152).

**Seeding a full test from a PDF — read `docs/TEST_SEEDING_PIPELINE.md` first.**
That is the canonical, end-to-end process (render → OCR/vision transcription →
rich JSON → `build-cbog.mjs` → seed → QC gates) with the fidelity safeguards that
are now mandatory. The 2026-06-13 audit proved OCR/vision transcription silently
corrupts content — dropped colons/apostrophes on convention questions (where
punctuation IS the answer), word substitutions, dropped italics, and an
answer-flipping data-table digit. `check:content` alone does NOT catch these.
Tooling lives in **`scripts/test-pipeline/`**:
- **Text-layer PDFs** (College Board "digital" / CB OG): `audit-choices.py` +
  `audit-passages.py` diff the transcription vs `pdftotext`; `fix-content.py`
  auto-fixes ≥3/4-match choices + restores italics from `pdftohtml -xml` font
  data. `audit-choices` must read **0 punctuation diffs**.
- **Scanned image PDFs** (the DSAT exports — no text layer): a **vision-QA pass
  is mandatory** (render every page, read vs DB); no cheap text oracle exists.
  Verify numeric tables + convention-question punctuation by eye.
- **Both**: `audit-db.py <slug> <pdf...>` diffs the LIVE DB against the PDF.
The JSON format accepts rich run-objects (`[{t,i,u,b,sup,sub}]`) so formatting
survives; `passageRender.tsx` renders `<i>/<u>/<b>/<sup>/<sub>` + `$…$` KaTeX.

Migration rules:
- **Every trigger function that INSERTs into another table must be
  `SECURITY DEFINER` with `SET search_path = public, auth`.** RLS will block
  the insert otherwise — silently if the trigger doesn't check.
- **Never inline `EXISTS (SELECT 1 FROM profiles ...)` in INSERT/UPDATE WITH
  CHECK.** Use a SECURITY DEFINER helper. The classic recursion bug bit us
  twice — `0008` and `0013`.
- **RPCs raise stable string error codes** the client switches on
  (`invalid_join_code`, `not_authorized`, `rate_limited`, etc.).
- **PostgREST batch inserts pass NULL for missing keys.** A NOT NULL column
  with a DEFAULT will reject the row. Either drop NOT NULL or always supply.
- **Migrations are forward-only.** No rollbacks. Test against the smoke
  suite before pushing.

**Migration ledger: `docs/MIGRATIONS.md`** — one row per migration with a
one-line summary, plus the versioning/collision gotchas. Keep it in sync in the
same commit as any new migration. (`docs/ARCHITECTURE.md` §3e has the older
narrative ledger.) **Remote DB state (verified 2026-06-03): migrations
0001–0091 are ALL live** (Local=Remote for every file; full smoke suite green;
end-to-end student clickthrough 41/41 + edge harness 10/10).
Note: a number collision (two `0086_*` files) silently skipped the second until
it was renumbered to `0090` — always check `supabase migration list` shows
Local==Remote after a push. History note: 0057–0060 were authored by a parallel
session and had never been pushed; **0057 originally failed** with `42P16`
because it inserted `effective_score` mid-list in a `CREATE OR REPLACE VIEW`
(which can only APPEND columns) — fixed by moving the column to the end, then
0057–0060 pushed cleanly. Lesson: a `CREATE OR REPLACE VIEW` must keep every
existing column in place and only add new ones last (else DROP+CREATE).
0048 = full-test bundle,
0049 = Nov-2023 DSAT seed, 0050 = security audit + cascade observability
(B1+B2 fixes from the May-2026 audit), 0051 = full-test hardening,
0052/0053 = content data fixes, 0054 = announcement publish_at (broadcast
+ scheduled publish), 0055 = grid numeric grading, 0056 = grading
persistence (M6 columns + RLS + audit + `assignment_attempts_effective`
view), 0057 = `assignment_best_attempts` picks by effective_score
(closes M127 round-trip), 0058 = scheduled-announcement notification
fan-out via pg_cron, 0059 = grade-complete notification trigger, 0060 =
M33 follow-up: `test_attempts.user_id` FK swapped `auth.users` →
`profiles(id)` via DROP + ADD NOT VALID + VALIDATE pattern. **0061 (applied) =
`start_test` also returns `answered` (count of recorded answers) so the
full-test intro reads "Resume" — not "Begin test" — when a student returns
mid-Module-1; the client gates the label on `current_module > 1 || answered > 0`.**

**Wave 21C (autonomous run, 2026-06-02) added 0062–0064 — not yet verified
against Remote, but local smoke node-check is clean:**
0062 = teacher private notes (`teacher_student_notes` table; RLS author-only;
admin audit-only; body intentionally excluded from `audit_events.details`
even from admin readers, for privacy);
0063 = `import_portfolio_items(source, target, item_ids[])` RPC for portfolio
template reuse (recursive CTE deep-clone; auth requires teacher of both
courses; audit logs op + counts + ids but NOT item bodies);
0064 = optional 4th arg `p_target_parent_id` on `import_portfolio_items` so
imports can land as a subtree of an existing item rather than always at root
(backward-compat via `DEFAULT NULL`; old 3-arg overload dropped to avoid
PostgREST signature ambiguity).

**Wave 21H (2026-06-03) — 0069 (one migration, closes Task #177):**
0069 = `fanout_announcement_now(p_announcement_id uuid)` per-row RPC for the
teacher-facing "Publish now & send notifications immediately" option (Round 23
follow-up to Round 22 publish-now). Same INSERT-into-notifications + UPDATE
notifications_fanout_at logic as the 0058 cron worker, but scoped to a single
row + gated on `is_teacher_of_course`. Stable error codes: `not_authenticated`
/ `not_authorized` / `not_found`. Returns 1 if fanned out, 0 if already-done /
draft / not-yet-due. `FOR UPDATE` on the row serializes against the cron
worker — a race lost to cron returns 0 silently. SECURITY DEFINER + `SET
search_path = public, auth` per CLAUDE.md rule. `GRANT EXECUTE TO
authenticated`.

**Wave 21I (2026-06-03) — cross-codebase edge-case + race audit batch
(commit 879056e):**
Four parallel agents audited DB races (0050–0085), full-test runner edges
(`viewer/src/fulltest/`), auth + permissions, and React-app-wide async/state.
17 actionable findings; this batch ships 7 highest-leverage fixes + 1 hotfix.

Server-side: **0090** = course-scope on `release_test_results`,
`allow_test_retake`, `reset_test_attempt`; `allow_test_retake` gains
idempotency (refuse if a grant already exists newer than the student's latest
submission — new error code `retake_already_granted`). **0091** = hotfix to
0090's `release_test_results`: original used `SELECT … LIMIT 1` to find one
course owning the test, which mispicked when a slug links from multiple
courses; switched to EXISTS pattern matching the other two RPCs. **Lesson:
when a JOIN can produce >1 row, `LIMIT 1` for an authorisation pick is a
soundness bug, not a perf optimisation — always use EXISTS for scope checks.**

Client-side hardening:
- `viewer/src/components/Toast.tsx` — memoize `value` + per-variant `useCallback`.
  Stops ~59 dep arrays across the app from invalidating on every toast.
- `viewer/src/student/AssignmentRunner.tsx` — `isAlive()` cancellation guard
  threaded through `bootstrap` → `startNewAttempt`; the
  `start_assignment_attempt` RPC is now skipped if the effect has been
  cancelled, so rapid assignment navigation no longer burns extra attempts
  against `max_attempts`.
- `viewer/src/fulltest/FullTestApp.tsx` + `api.ts` — four runner fixes:
  F1 `visibilitychange` + `pageshow` re-sync `seconds_remaining` from server
  when tab returns visible after >5s hidden (sleep/wake no longer silently
  auto-submits). F2 drop localStorage merge when server has strictly more
  answered questions than local (closes cross-device clobber). F3 on
  `module_out_of_order` / `run_already_submitted` after retry attempt 0,
  synthesize success (network blip on the original submit no longer locks
  the student out staring at a "could not submit" toast). F4 flush
  `saveDraftRef.current()` before `doSubmitModule()` on time-up so the
  last 2.5s of annotation/highlight/note edits aren't dropped.

Verification: two harnesses live in `viewer/scripts/`:
`clickthrough-practice-test.mjs` (41 happy-path checks) walks the full DSAT
Nov-2023 as a fresh disposable student, including the new course-scope setup
required by 0090 (course + module_items link to `/test/<slug>` +
enrolment). `clickthrough-practice-test-edges.mjs` (10 negative checks) hits
`module_out_of_order`, `run_already_submitted`, `run_not_found`.
Both green post-batch.

**Wave 21J (2026-06-03) — deferred-finding sweep (commit 6a138dd):**
Client-only follow-up that closed the 8 lower-priority items the 21I batch
deferred. No new migrations. 4 file-disjoint lanes (PrivateNotesSection +
DiscussionTopicView; useNotifications + useTopicPosts + useNeedsAttention;
AssignmentDetailPage; CourseSettings + ModulesPage). Established two
patterns now recurring across the codebase:
- **`aliveRef` local-flag** for any async `setState`-after-await (8 places
  now use it: AssignmentRunner from 21I + the seven hooks/components in
  this wave). Per CLAUDE.md, NOT promoted to a shared `useMounted()`
  helper — the inline flag pattern stays.
- **`refreshRef` for realtime channel handlers** so the subscribe effect
  depends only on stable values and the channel isn't torn down +
  recreated on every callback identity flip. Applied across
  `useNotifications`, `useTopicPosts`, `useNeedsAttention`.
Also: `CourseSettings` archive/template toggles now wrapped in
`useTransition` with `disabled={isPending}`; `ModulesPage` InlineRename
rewritten to match `AssignmentCard.tsx:104-119` (close only on success).
See `docs/SESSION_RECAP.md` Wave 21J for the per-file diff summary.

### Audit trail (post-Wave-20)

Migration 0050 added an observational `BEFORE DELETE` trigger on `profiles`
that snapshots dependent-row counts (8 tables) into
`audit_events.details.dependent_counts` before any cascade fires.
Combined with the B1 fix in the same migration (`admin_delete_user` now
gated on `is_admin`, not `is_staff`), every profile delete leaves a
forensic trail and only an actual admin can trigger it. Don't bypass
this — if you need a bulk-cleanup path, write a new RPC that also writes
to `audit_events`.

Migration 0056 added `audit_assignment_grade` — an `AFTER UPDATE` trigger
that writes a row to `audit_events` whenever a teacher edits
`feedback_text`, `score_override`, `graded_at`, or `grader_id`. Same
contract: don't bypass.

Migration 0059 added `trg_notify_on_grade` — fires a notification (kind
`'assignment_grade'`) to the student when graded_at goes null →
non-null, when feedback_text goes null → non-null, or when score_override
changes. Anti-spam: null→non-null guards mean autosave edits to existing
feedback don't double-fire.

### Effective-score view + best-attempts pick

Migration 0056 introduced `public.assignment_attempts_effective` —
identical columns to `assignment_attempts` plus a derived
`effective_score = COALESCE(score_override, score_percent)`. New
gradebook + score-hero surfaces SELECT this for display so a teacher's
override actually surfaces to students and to roll-up metrics.

Migration 0057 updated `assignment_best_attempts` (the view from 0020
that picks the highest attempt per (assignment, student)) to order by
`COALESCE(score_override, score_percent) DESC NULLS LAST` instead of
`score_percent` alone. It also exposes a new `effective_score` column so
callers can drop their second round-trip. Without 0057, an attempt
whose teacher-applied override would have been the highest could be
silently ignored when the auto-score of a different attempt was higher.

### Short codes

Course, assignment, and discussion_topic all have a 6-character stable slug (`short_code` column) added in migrations 0038–0040. When building URLs, **always prefer `short_code` over id**:
- `/courses/AB12CD` instead of `/courses/550e8400-e29b-41d4-a716-446655440000`
- `/courses/AB12CD/assignments/H7K9MN` instead of `/courses/.../assignments/<uuid>`

The slug alphabet is A-Z and 2-9 (excludes O/0/I/1/L confusables). Unique constraint + format CHECK + BEFORE INSERT trigger auto-generate on insert. UUID routing still works (backward-compatible) but should not be used in new surfaces.

---

## Working style

- **Brainstorm + plan before dispatching subagents.** The user pays for
  thought, not for thrashing.
- **Use subagents for parallel-safe work.** Dispatch in clear lanes —
  zero-file-overlap between agents is the only safe way.
- **Tight prompts.** The big agent stalls we hit were caused by sprawling
  pre-flight reading or 600-word reports. Inline what they need. Cap reports
  at ~300 words.
- **Run smoke after any backend change.** Use the existing scripts; don't
  invent ad-hoc tests.
- **Don't break the build between dispatches.** Run `npx tsc -b` between
  waves. The build has been clean for the last 200+ commits — keep it that
  way.
- **Document drift.** When a wave catches a real bug, note it in the
  migration's header comment so future readers don't repeat it.

---

## What to read first in a new session

1. This file (CLAUDE.md)
2. `docs/SESSION_RECAP.md` — what shipped recently
3. `docs/ARCHITECTURE.md` — the spec
4. `docs/DESIGN_PRINCIPLES.md` — the UX bar (this is the standard the user
   has explicitly asked us to hold)
5. `docs/LMS_ROADMAP.md` — what's next
6. `docs/STACKS.md` — the canonical tech stack + hosting. **Read before any
   deploy/infra/ops work — the host is Cloudflare Pages, not Vercel.**

Then look at one example of each kind of surface you'll touch:
- Modules page (`viewer/src/teacher/ModulesPage.tsx`) for the UX bar
- AssignmentRunner (`viewer/src/student/AssignmentRunner.tsx`) for an RPC-driven flow
- Migration 0020 for a clean "add columns + RPC + view" pattern

---

## Operating mode

The user is hands-off most sessions. They expect you to:
- Push forward when there's no decision to make
- Stop and ask via `AskUserQuestion` when there is one
- Self-critique recursively — most of the real bugs caught this year came
  from a self-critique step
- Surface costs honestly (token spend, time spent, scope expansion)

If you're about to do something irreversible (database rename, schema drop,
secret rotation, force push), confirm first.
