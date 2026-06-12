# Session Recap

## Journey view — Khan-style mastery grid (2026-06-12) — SHIPPED

Gamified Journey rendering of course modules. Decision record + full spec:
[`JOURNEY_VIEW.md`](./JOURNEY_VIEW.md); explored 3 directions in
`design-explorations/journey/` (Ivy expedition map / Duolingo path / Khan grid) —
**Khan grid chosen**; the other two judged over-designed as mocked, revisit only
with a fresh design pass.

- **Mechanics:** gold "Sealed" tier at best effective score ≥80% (overrides count);
  Proficient 60–79; Attempted <60 ("retake to upgrade" — best-attempt-only means
  retakes only upgrade); mastery points (Question Set 100 / Practice Test 200,
  ×100%/75%/50% by tier) + course-scoped levels (Novice→Valedictorian). All
  **derived client-side** from `assignment_best_attempts` — zero migration, nothing
  stored. Full-test link cells are done/not-done only (scores release-gated, 0075).
- **Student** (`StudentCourseView`): Journey is the **default** for class courses,
  with a Journey|List segmented toggle persisted at `student.courseView:<courseId>`.
  HUD (points + level bar) + legend + grid; cells navigate like the list rows.
- **Educator** (`ModulesPage`): "Journey" header pill (persisted
  `staff.modulesView:<courseId>`) swaps the editor for a read-only class-aggregate
  grid — cell color = class-avg state, tooltip `n/N submitted · k sealed · avg %`;
  test cells open the per-test overview. Editing pills hide while active.
- **Code:** new `viewer/src/journey/` domain folder (mastery.ts, buildJourney.ts,
  JourneyGrid, JourneyHud, TeacherJourneyPanel) + `.journey-seal` recipe in
  index.css (global — gold is the mechanic, not theming).
- **Verified:** `_shot-journey.mjs` harness (disposable teacher+student, 3-module
  course incl. locked week + up-next + full-test link) — student journey, List
  regression, educator aggregate all screenshot-verified; tsc + vite build clean.

## Pickleball coaching — two course types, full coaching suite (2026-06-11) — DEPLOYED

New **pickleball coaching** vertical layered onto the LMS as two `course_type` values
(`pickleball_player`, `pickleball_coach`), the same pattern as `counseling`. Migrations
**`0174`–`0186`** live on prod + merged to `main` (Cloudflare). Canonical doc:
[`PICKLEBALL.md`](./PICKLEBALL.md); vision [`PICKLEBALL_REQUIREMENTS_v3.md`](./PICKLEBALL_REQUIREMENTS_v3.md).

- **Player track:** profiles (DUPR/goal/…), lessons (markdown plan/recap + recap video by
  link **and** upload), programs, **assessments** (immutable 10-skill snapshots + level-up
  vs program band), **drills + homework**, **briefing card + injury check-in**, **events &
  clinics** (capacity, server-side skill-gate, race-safe FIFO waitlist), community chat.
- **Coach track:** profiles, certifications, **development plan with auto-completing steps**
  (hours/shadow/cert threshold → auto-done + notify via DB triggers), hours log + totals,
  **shadow logs** (mentor sign-off), **admin evaluations**, programs-taught, chat.
- **Domain layer:** `profiles.domain` (academic/counseling/coaching) drives per-vertical
  **vocabulary** (Teacher/Counselor/**Coach**; Student/Advisee/**Player**) + **accent color**
  (indigo/emerald/orange) + a switcher. Presentation/routing only — `role` + RLS untouched.
- **DB:** 19 `pickleball_*` tables, 42 `pk_*` RPCs (SECURITY DEFINER + RLS educator-full /
  subject-own), realtime chat publication, storage buckets `pickleball-videos`/`-certs`.
- **Verified:** structural smoke on prod (constraints, the hours→devstep auto-complete
  trigger, hours-totals view, injury notification fan-out) — all green, rolled back.
- **Built via subagent workflows** in an isolated git worktree (`feat/pickleball-coaching`)
  to avoid disturbing the parallel session's shared tree. `main` raced `0146`→`0189` during
  the build; final clean block `0174`–`0186`; prod push gated on a 13/13 `db push --dry-run`
  (it matches by numeric prefix, so a same-numbered parallel migration would silently skip).
- **Follow-ups:** `smoke-pickleball.mjs` (auth/RLS/RPC end-to-end — in progress); lock the
  `pickleball-certs` bucket to private + signed URLs; minor per-increment QA notes (see PICKLEBALL.md).

## CB OG #1–#10 — 10 College Board practice tests imported, with figures (2026-06-11) — DEPLOYED

Imported the ten official College Board **linear** Digital SAT practice tests as
**"CB OG #1"–"CB OG #10"** (slugs `cb-og-1`…`cb-og-10`, ordinals 7–16). Migrations
`0164`–`0173` (one per test) + `0189` (figures). All live on prod + `main`.

**Verified end-to-end** (`.work/cb-og/verify-take.mjs <slug>`): a disposable
staff user takes the full test through the real RPC flow (`start_test` →
`get_test_module` ×4 → `submit_test_module` ×4 → `get_test_result`) submitting
the official key. **CB OG #3 = 120/120** (RW 66/66, Math 54/54), grids graded
incl. multi-answer, no answer-key leak — proving the seeded `correct_answer`
matches the key and the structure is intact. (start_test's 0141 enrollment gate
only blocks non-staff, so a staff taker needs no course setup.)

- **Format:** linear = **120 questions** each (66 RW: 33/module ×2; 54 Math:
  27/module ×2 — more than the 98-Q adaptive tests). Verified on prod: 120 rows
  per test (106 mcq + 14 grid), **0 missing answers**.
- **Pipeline** (`.work/cb-og/`, memory `cb-og-import-pipeline`): `pdftoppm`
  page renders → **4 parallel transcription subagents per test** (one per
  module) read the page images (two-column layout) → JSON → `build-cbog.mjs`
  emits an idempotent seed migration. **Official answer keys** parsed from
  `pdf/Key/SAT_Practice_Test_N_Answer_Key.pdf` (the key is authoritative for
  question type — letter ⇒ mcq, number ⇒ grid — auto-correcting agent
  misclassifications). Grid-ins use `accepted` arrays incl. multi-answer
  (e.g. `["29/3","9.666","9.667"]`).
- **Figures (95):** graphs / geometry / charts cropped from the source PDFs via
  `pdftoppm -r 200 -x -y -W -H` region-crop (one agent per test; they locate the
  figure by question number and re-trim until clean). Saved under
  `data/tests/cb-og-N/figures/mM-qN.png` (served via the `viewer/public/data`
  symlink, deployed by Cloudflare Pages). `0189` sets `test_questions.figure` +
  `passage_alt` + clean `passage`. Tables stay as inline text. The runner already
  renders `figure` (`QuestionPane` `<img>`).
- **Math reference sheet:** new `ReferenceSheet.tsx` (standard SAT formula card,
  non-modal floating panel) + a **Reference** button next to the Calculator in
  the runner (test mode + staff preview, math modules) and next to "Explain" in
  review mode.

## Test occurrences — per-module deployment finalized + verified (2026-06-10) — DEPLOYED

The "assign a test per module" model is complete and verified end-to-end. An
occurrence = a Modules link with `{module range (?m=first-last), available-from
date, title}`, each its own run + report, scoped per course.

- **0161** `window_dates_only` — the link's range is the sole deployment truth;
  `test_module_windows` now carries only the open DATE (unifies the two old
  mechanisms; #3).
- **0162** `set_module_open_date` — one "Available from" date per occurrence,
  set from the Add/Edit-modules modal. Retired the per-module `TestScheduleEditor`.
- **Module-item edit functions** — each item's ellipsis has Rename (now opens the
  field directly via `InlineRename` `autoEdit`) + Edit modules (rewrites `?m=`).
- **Fixes:** student subset link 404 (`?m=` was URL-encoded into the slug in
  `ModuleItemRowView`); single-module subset misleading scaled score (suppressed
  for incomplete sections in `satScore`); runner intro now scopes to the run's
  range; course-card kebab clipped by `overflow-hidden`.
- **Verified:** new `viewer/scripts/verify-subset-deployment.mjs` drives BOTH
  occurrences against the REAL Class B + `dsat-june-2026-asia` via a disposable
  enrolled student (9/9: M1=27 RW only, M2 independent run, re-open returns the
  right report). smoke-subset-runs 8/8, windows 18/18, clickthrough 42/0.
  Data: Class B's "Module 1" link was a legacy plain link (full test) → forced
  to `?m=1-1`.


## Branch `feat/line-integration` (2026-06-10) — LINE Official Account binding + notifications — DEPLOYED

Bind a LINE account (students, teachers, guardians) so the LMS pushes reminders,
grades, and announcements to LINE. Built + deployed to prod this session.

- **Backend** (migrations `0153` line tables + trigger + RPCs, `0154` guardian
  enum, `0155` guardian provisioning, `0159` line-dispatch cron, `0160`
  cron-token fix). LINE is a second delivery channel: a trigger on
  `notifications` INSERT mirrors every notification to a `line_outbox` queue
  (recipient + their linked guardians, per-kind opt-out), drained every minute
  by the `line-dispatch` edge function.
- **Binding** is the chat-initiated LINE Account Link **nonce** flow (no LINE
  Login channel needed): add the OA → type "link" → bot DMs
  `${LINE_LINK_BASE_URL}/line/link?linkToken=…` → `/line/link` mints a nonce →
  LINE accountLink dialog → `line-webhook` finalizes (HMAC-verified).
- **Guardians** = coded-login profiles (`role='guardian'`) attached to a student
  via `guardian_students`; created from the teacher's StudentProfilePage
  (`GuardiansSection`). They sign in like students and bind their own LINE.
- **Frontend**: `viewer/src/line/` (`LineLinkPage`, `LineConnectCard` in Account
  Settings, `useLineLink`) + `GuardiansSection`.
- **Edge functions** deploy Docker-less: `--no-verify-jwt --use-api` (no-verify-jwt
  is required so the cron's Bearer token / the webhook's signature reach the
  function's own guard). Secrets: `LINE_CHANNEL_ACCESS_TOKEN`,
  `LINE_CHANNEL_SECRET`, `LINE_LINK_BASE_URL`, `CRON_TOKEN`.
- **Four bugs caught in live testing + fixed:** (1) cron-token GUC couldn't be
  set by the managed role → cron 403'd → token moved to a `private.cron_secrets`
  table (0160; also fixed long-broken email reminders); (2) a bare
  `LINE_LINK_BASE_URL` (`pication.app`, no scheme) rendered as un-tappable plain
  text → `line-webhook` now forces `https://`; (3) the `linkToken` was dropped
  when LINE's session-less in-app browser hit AuthGate's sign-in redirect →
  token stashed at boot + resumed after login (`line/linkResume.ts` + AuthGate);
  (4) `create_line_link_nonce` couldn't find `gen_random_bytes` (pgcrypto lives
  in `extensions`) → search_path fixed (0163, applied via psql).
- **Messaging is Flex cards** (`buildWelcomeFlex` / `buildLinkFlex` /
  `buildSuccessFlex` in line-webhook): a branded welcome card on follow, a
  Connect card on "link", a success card on completion — bilingual zh/en,
  tasteful emojis, indigo brand button.
- **OA**: basic id `@344jlwxn`; app origin `https://pication.app`;
  `VITE_LINE_OA_URL=https://line.me/R/ti/p/@344jlwxn` set in Cloudflare Pages.

## Branch `feat/test-access-policy` (2026-06-10) — test-overview per-course views + data isolation

Follow-ups on the metered-test work, all on `feat/test-access-policy`:

- **Per-course filter on the test-overview** (`0149` + TestOverviewPage). A test
  assigned to multiple courses showed all students aggregated. `test_roster_status`
  now returns `course_id`/`course_name` (one row per student-course); the page has a
  course-filter pill row (persisted per-slug), and stats / score distribution /
  roster / submitted-released counts all derive from the filtered rows. Release-all
  is scoped to the visible course so releasing Course A never reveals Course B.
- **Deep-link** (tree.tsx + TestOverviewPage). Opening a full-test from a course's
  Modules page lands on the overview pre-filtered to that course
  (`/educator/tests/<slug>?course=<id>`; `?course=` wins over localStorage).
- **Cross-course data isolation** (`0150`). `get_test_question_times` pacing cohort
  is now scoped to the run's course (`test_runs.course_id`, 0143) with the prior
  <3-peers fallback-to-all removed — students and teacher-review never see
  cross-course timings.
- **Sortable students table** (RosterRow + TestOverviewPage). The roster card list is
  now a sortable table (Student / Status / Timing / Score / Actions; default
  submitted-desc; not-taken rows pin to the bottom). All per-row actions + proctor
  controls preserved.
- **In progress:** keep the student in fullscreen while the end-of-test submit
  window is shown (proctoring lockout currently triggers on the fullscreen drop).

## Branch `feat/test-access-policy` (2026-06-10) — partial/scheduled module deployment + reconciliation

Teacher-controlled metering: deploy a full test's modules over days and/or as a
permanent subset (e.g. R&W only). Migrations **0143–0146** (test_module_windows,
window-admin RPCs, two start_test hotfixes) applied to Remote; the one-run
invariant (`test_runs_one_active`) is untouched so a student can never "take the
same test twice".

- **Phase 1 (backend).** `test_module_windows(course,test,position,deployed,opens_at)`;
  `test_runs` gains `course_id` + `scheduled_first/last_position` snapshots;
  `start_test`/`get_test_module`/`submit_test_module` gate on the window, re-anchor
  the per-module timer on a multi-day resume, finalize at the deployed range.
  Teacher RPCs `set/get_test_module_windows` + `finalize_metered_run`.
- **Phase 2 (teacher UI).** `TestScheduleEditor` in `AssignTestModal`; module
  selection also in the Modules-page inline **Add Full-Test** flow.
- **Phase 3 (student UI).** New `locked` phase in `FullTestApp`: "this section opens
  <when>" instead of a generic error.
- **Verified on cloud:** smoke-test-windows 18/18, smoke-locked-module 10/10,
  smoke-test-access 9/9, clickthrough 42/0, edges 10/10, tsc + vite build clean.
- **Reconciliation.** Merged `main` in; the parallel session's
  `0143_test_question_times.sql` was **renumbered 0143 → 0147** (cloud already had
  0143–0146); `0148` carried over. Code auto-merged; three docs hand-merged.

## 2026-06-10 (deploy cut) — test-access gate, retake policy, underline, mobile UX

Merged to `main` (cherry-picked from `feat/test-access-policy`; the parallel
branch's `0143–0146` module-windows + Phase 2 UI were intentionally EXCLUDED from
this cut). Host is **Cloudflare Pages** (NOT Vercel) — it auto-builds the
`viewer/` Vite SPA on every push to `main`, so this code deploys automatically.

- **Test access + retakes — migration 0141 (already LIVE on remote;** the
  parallel session applied it with their chain — `tests.retake_policy` exists).
  Enrollment gate on `start_test` (non-staff must be enrolled in a course linking
  the test, else `not_enrolled`; gates take + resume; staff exempt) — a
  removed/deleted-course student can no longer take/continue, but their own
  released result stays viewable. Per-test `tests.retake_policy`
  (`one_attempt` | `unlimited` practice) + staff toggle. Smoke `smoke:test-access`.
- **Underline rendering + data (live).** `passageRender` renders `<u>…</u>`
  offset-safely; `seed-underline-spans.mjs` (anchor-based, exact-by-construction)
  wraps the 14 prose spans (nov-2023 1-11 figure-baked, excluded). Data applied
  to remote after the renderer's CF Pages build went live (the seed is idempotent;
  re-run safe). Briefly reverted mid-deploy during a host mixup, then re-applied.
- **Mobile UX pass (25 student files).** 16px inputs (no iOS auto-zoom), ≥44px
  tap targets, narrow-screen stacking across first page/auth, chrome, full-test
  runner, assignment runner, course/counseling/inbox/account — mobile-first,
  desktop unchanged.
- **Courses card** text is selectable/copyable (role=button div, not a native
  `<button>`); click still navigates.

## Latest (2026-06-10) — login-code claim fix, highlighter on answer choices, per-question pacing

Three shipments to `main` (DB live on prod via psql; SPA build green on CI).
Built in isolated worktrees off `main` to stay clear of a parallel session
live-editing `fulltest/`.

- **Auth — bare login codes reach seat-claim (`0142`, commit `5afcf67`).** A
  managed student's bare 6-char `login_code` (e.g. `KMCZQR`) was misread by
  `QuickStartScreen`'s shape heuristic as a *course* code → it never reached
  `claim_student_seat`, so first login dead-ended ("Couldn't load your
  profile"). New `peek_join_code(code) → 'seat'|'course'|'none'` classifies a
  typed code server-side (callable pre-auth; returns only the classification,
  never row data). QuickStart now debounce-resolves a bare code and routes a
  personal code to the claim flow (email+password). The dash-less personal-code
  format is kept on purpose. Verified end-to-end on a disposable seat.

- **Full-test highlighter now works on answer choices (commit `c8dd290`).** Was
  passage + stem only. `AnnotField` extended with `choice:A`..`choice:D`
  (`captureSelectionHighlight` accepts them); each choice is now a
  `role="button"` `<div>` (native button text can't be selected) with a
  drag-vs-click guard so highlighting a choice doesn't toggle the answer, plus
  full keyboard support; the highlight-remove click `stopPropagation`s.

- **Per-question pacing vs class in student review (`0143`, commits `c8dd290`
  + `439f6f8`).** Per-question time lives as `dwell` events in
  `test_run_events` (the `time_ms` column is unused) — `get_test_question_times`
  sums dwell seconds, maps `(module, question#) → question_id`, and averages
  over course peers (falls back to all when <3; viewer excluded). UI in
  `ResultView` (student-only once results released): a `PacingPanel` overview
  (colour-coded per-question time-bar strip + totals) and an inline `PacePill`
  on each review card. **Partial-test safe:** per-question pills compare only
  students who did that question; panel totals sum over the shared "you both
  did" set, never apples-to-oranges across different question counts.

Operational: per request, wiped all student users + test data and rebuilt
Class A's 9-student roster (the 2 college-counseling students were kept), and
populated **Class B** with the 10 '27-SAT-B names.

- **Dash-less login codes — `admin_create_student` fixed (`0148`).** The
  "non-guessable login codes" wave only re-keyed existing rows; the generator
  still emitted `<short_code>-NN`, so every *new* student regressed to a dash
  code. Rewrote the generator to mint a bare 6-distinct-letter code (A–Z minus
  I/O/L, e.g. `KMCZQR`) — no dash, no course prefix; `peek_join_code` (0142)
  already routes these. Re-minted Class B's 10 seats to bare codes. Also swept
  the docs (ARCHITECTURE/SCHEMA/CONTROLLED_TESTS + QuickStart comments) that
  still showed the old `<COURSE>-NN` examples.

**Migration ledger note:** `supabase_migrations.schema_migrations` is recorded
through `0140`; `0141` (parallel session) / `0142` / `0143` ran live via direct
`psql` but aren't registered. All three are idempotent `CREATE OR REPLACE`, so a
later `supabase db push` re-applies them cleanly. **Frontend deploys to Cloudflare Pages** — the built `viewer/dist` artifact
deploys to Cloudflare Pages; the CI build job is green, so the SPA is
deploy-ready.

## 2026-06-09 — autonomous polish pass: reusable hooks, student UX, keyboard a11y

A self-directed improvement run in the student / shared-hooks / admin layer
(deliberately clear of the `fulltest/` + teacher-skills surfaces a parallel
session was editing). 7 changes shipped + verified, 1 attempted-and-reverted.
Full per-cycle rationale in `docs/AUTONOMOUS_CHANGELOG.md`.

- **`useNow(intervalMs=60s)` hook** (`@/hooks`) — a shared timestamp that ticks
  on a coarse interval. `const now = Date.now()` was recomputed every render
  (invalidating `now`-keyed `useMemo`s) and froze time-based UI. Wired into
  `AssignmentsPanel` so "Due soon → Past due" grouping + filter counts refresh
  live while the page sits open.
- **Amber "due soon" urgency accent** — `isDueImminent` (≤24h, unsubmitted) +
  an amber ring/bg/text on imminent To-do assignment rows (past-due rose still
  wins). Surfaces live via the `useNow` tick.
- **`useRovingTabIndex<T>()` hook** (`@/hooks`) — WAI-ARIA tablist keyboard
  support (Arrow/Home/End + roving tabindex, selection-follows-focus). Adopted
  on **6 filter tablists**: `AssignmentsPanel`, `MyFeedbackPage`,
  `CourseMaterialsList`, `StudentPortfolio`, `AllUsersView`, and
  `AdminInviteCodesPage` — the last a real **bug fix** (it had roving `tabIndex`
  but no arrow handler, so inactive filters were fully keyboard-unreachable).
  Verified **live** via Playwright (`viewer/scripts/_verify-roving.mjs`, 4/4:
  one active tab, ArrowRight activates + moves focus, Home → first).
- **`useMediaQuery` → `useSyncExternalStore`** — was the codebase's only ESLint
  warning (setState-in-effect / cascading-render risk); rewritten with the
  canonical external-store pattern. Same signature; drop-in for all consumers.
- **Reverted (verify caught a regression):** roving on the AuthScreen sign-in /
  create-account tabs conflicted with its intentional focus-the-field-on-switch
  effect (made the inactive tab unreachable) — reverted with zero diff. Lesson:
  roving "selection-follows-focus" only fits filter chips with no focus
  side-effect on select.

Left `main` green for all of the above (the only working-tree tsc errors were a
parallel session's unstaged `fulltest/` WIP). Every commit path-scoped; no
force pushes.

## 2026-06-09 — SAT skill domains: heatmap, student + teacher profiles, class comparison

Built an end-to-end per-domain skill system on top of the full tests, all
sharing one module so the four surfaces stay in lockstep.

- **Data.** `test_questions.domain` (empty since the full-test bundle) now
  classified for **all 456 questions** into the 8 official College Board domains
  (subagents + a rule-based correction pass over the formulaic R&W stems;
  distribution matches the blueprint). Also: per-choice `rationale` generated for
  all **423 MCQ** earlier in the session (Review Mode "Explain").
- **Shared module** `viewer/src/fulltest/skills.ts` — band palette (emerald≥70 /
  amber≥40 / rose), legend gradient, canonical domain order, section labels,
  `pctOf`, `sectionForDomain`. ReviewHeatmap, ClassComparison, ResultView, and
  the teacher StudentTestReportPanel all import it (removed triplicated consts).
- **Teacher Review heatmap** (`ReviewHeatmap.tsx`): By-question / By-skill toggle
  (persisted), triage bar, distractor "most chose" hint, "most missed" chips.
- **Student skill profile** (`ResultView.tsx` → SkillProfileCard): per-domain
  mastery + "Focus area" on the released result. Needs **migration 0121** —
  `get_test_result` now returns each question's `domain` (staff-only via RLS, so
  it must flow through that SECURITY DEFINER RPC).
- **Teacher per-student** (`StudentTestReportPanel.tsx`): upgraded the dormant
  top-4 weakest list into a full per-section breakdown + Focus callout.
- **Cross-class comparison** (`ClassComparison.tsx`): table of per-domain %
  per class, weakest-row rings (≥10pt) + gap badges (≥15pt), CSV export. Reuses
  `list_test_review_courses` + `get_test_answer_breakdown` (no new RPC).
- Hardened via a code-review pass (immutability, a11y `<caption>`/sr-only,
  stable tie-breaks, dropped a misleading answer-attempt fraction).

Verified each surface live (disposable teacher/student + synthetic released
runs); clickthrough-practice-test 42/42 + edges 10/10 after 0121. Note: a
concurrent uncommitted edit to `FullTestCatalog.tsx` keeps the full `tsc -b`
red — all skill-system files are clean.

## (2026-06-08) — full-test passage: set-apart card + real tables

The reader rendered passages as one flat `whitespace-pre-wrap` paragraph, so
embedded pipe-delimited tables looked like raw text and literary excerpts didn't
stand out. New `viewer/src/fulltest/passageRender.tsx` block-parses the passage
into prose + table blocks and `QuestionPane`'s `Stimulus` wraps it in a subtle
"source card" (left accent rule + faint tint). Shared by runner/review/preview,
so all 6 tests are fixed at once.
- **Tables.** Two encodings handled: multi-line (≥2 consecutive `|` rows) and
  single-line (`table: x | y; 0 | 8; …`, `;`-joined rows). Header row inferred
  when row 0 is non-numeric; columns right-aligned when their body cells are
  numeric; zebra striping; a stray `table:` marker line is dropped. Validated
  against all 456 passages — **21 tables across the 6 tests, 0 false
  positives / ragged-column anomalies**.
- **Offset-safe highlighting.** Highlights store absolute char offsets into raw
  passage text and `annotations.offsetWithin` summed `textContent` — so
  rendering tables (which drop the `|`/newline separators) would corrupt
  offsets. Fixed the model: each prose block carries `data-annot-offset` (its
  absolute start); `offsetWithin` resolves via the nearest block ancestor (base
  + local). Tables carry `data-annot-skip` + `user-select:none` → selections in
  them return -1 (non-highlightable). Prose offsets still map 1:1; the stem
  (no blocks) falls back to the old whole-field walk. `tsc -b` green.
- **Math typesetting — shipped (KaTeX).** `f(x)=(1/9)(x−6)²+3` now renders as
  real math. `renderText` (stem + passage prose) and a new `RichInline` (choices)
  are segment-aware: `$…$` LaTeX → KaTeX in a `data-annot-skip` span, plain text →
  the offset-preserving marks. Key fix vs. the borrowed `mocktest/RichText`
  heuristic: that `looksLikeMath` *rejected* single-variable spans (`$x$`,
  `$f(x)$`), so we replaced it with `isMath` — accept any `$…$` UNLESS it's prose
  trapped by a stray currency `$` (two consecutive 3+ letter words ⇒ reject, then
  re-pair the real delimiter). Verified: "$583"/"$230" currency stays literal.
  Data: bare Unicode math in **110 math questions** (the 3 tests with Math
  sections) converted to `$…$` LaTeX by 3 parallel agents, then mechanically gated
  before apply — every `$…$` KaTeX-valid, every number preserved (super/subscript
  + `{,}`-thousands normalized), no invented prose words. Final DB sweep: **669
  math spans, 0 KaTeX errors**. Originals backed up to `.work/.../math-backup.json`.
- **"Browser force-refreshes when I return" is not an app bug** — the SW is
  disabled in DEV (`registerSW` bails on `import.meta.env.DEV`) and nothing in
  the app calls `location.reload` on focus/visibility (only the ErrorBoundary).
  It's Vite HMR doing a full reload after the bundle changed while the tab was
  backgrounded — dev-only.

## 2026-06-08 — remove emojis app-wide (line-SVG icons / text)

Project rule established: **no emojis in the codebase** (unprofessional —
recorded in agent memory `no-emojis-in-codebase`). Swept every UI emoji
pictograph and replaced it with an inline line-SVG icon (stroke=currentColor,
24-viewBox) or plain text, in two commits (`d03e26e` proctor/review surfaces;
`e671c7d` 22 more files via 4 parallel agents):
- StatusPill alert/warn/paused pills drop their flag/arrow/pause emoji (the
  coloured dot conveys state); Message buttons use a chat SVG; ProctorChat
  presets are plain text; monitor uses "N marked" + a clock SVG.
- components (FileDropzone, MarkdownEditor, Question flags/snapshot, print
  list), teacher (Material/Portfolio type icons, QuickCreate cards, Course
  settings, Modules lock), student (portfolio/feedback/materials), dashboard
  (NeedsAttention), mocktest (break/submit/flag/timer/books/refresh), fulltest
  (ProctorTimeline) all de-emoji'd.
- Kept genuine non-emoji glyphs (⌘, ✓/✕ marks, kbd arrows, comment arrows).
  Scan for UI emoji returns zero; `tsc -b` + `vite build` green. (One file —
  `student/ModuleItemRowView.tsx` — left untouched as it has uncommitted edits;
  it still has one `↗` glyph to clean later.)

## 2026-06-08 — Modules: item Indent/Outdent control + clean line-icons

Analysis of Canvas's Modules (DnD + indent) vs ours found we already had both:
drag reorder (mouse + keyboard Alt+↑/↓ with SR announcements) and the
`module_items.indent` column (0–5, since 0011) already rendered as left-padding
in `tree.tsx`. The gaps were an item-level indent *control* and dated emoji
icons (commit `4ad2ff7`):
- Added **Indent / Outdent** to the module-item kebab (clamped 0–5, disabled at
  the ends; persists via a direct `module_items.indent` update — RLS, no
  migration; the row already renders the indent).
- Replaced the emoji item-type icons with crisp slate **line-SVG icons**
  (`ItemTypeIcon`) for a tidier, Canvas-style row.

## 2026-06-08 — loaded the real DSAT-Nov-2023 cohort + roster polish

Backfilled a real class's mock-test answers and stood up the two summer cohorts.
Data-only against the remote DB (no migration); plus one roster UI change.

- **Loaded 18 students' real answers** from an Excel export
  (`DSAT Nov 2023 Mock Test`) into the `dsat-nov-2023` full test as **released**
  `test_runs` + 1,764 `test_run_answers`. The export gives the chosen option as
  *text*, not a letter, with no shared IDs — mapped by **question position**
  within each module and resolved text→letter against `test_questions.choices`.
  Validated alignment by confirming every chosen text resolves AND the export's
  earned-points matches our answer key on **all 1,764 cells** (0 mismatches).
  Two openpyxl gotchas handled: strip HTML tags *before* `html.unescape`, and
  Excel coercing the fraction `1/8` into a date. Pipeline saved in memory
  `backfill-cohort-results-from-excel`.
- **Created two courses** — `'27 SAT A (Summer '26)` (9 students, 8 with
  results) and `'27 SAT B (Summer '26)` (10, all with results) — enrolled all
  via the `admin_create_student` contract (service-role replica), and linked the
  test into each course's Modules (a "Practice Tests" `module_item` link to
  `/test/dsat-nov-2023`) so the staff Review "who chose what per option"
  breakdown works.
- **Erased the 8 junk test courses** (dummy "SAT", clickthrough/MVT/Seat-E2E
  harness courses) and 5 orphan `test_runs` left by old disposable takers — note
  `test_runs` are user-scoped, so deleting courses does NOT remove them; clean
  them by user-not-in-roster or they skew the per-test overview.
- **Non-guessable login codes.** Replaced sequential `<short_code>-NN` seat codes
  with random **6 distinct uppercase letters** (A–Z minus I/O/L). Because a
  student's code IS their auth email (`resolveLoginEmail` → `<code>@students.local`),
  re-keyed `auth.users.email` (GoTrue admin API) + `profiles.{email,login_code}`
  + `course_memberships.roster_code` in lockstep; verified sign-in end-to-end.
  **Starter password = the student's own code** (easy first login), to be changed
  in Account Settings.
- **Roster UI (`ClassRoster.tsx`).** Email now shows as a column for **every**
  student (managed/unclaimed rows previously hid it behind a "Code not used yet"
  badge — now show `…@students.local` + a "Managed · not activated yet" tag). The
  three row actions (View profile / Reset password / Remove) are collected under
  the shared `KebabMenu` ellipsis — "Remove from course" rendered destructive.
  `tsc -b` green.

## 2026-06-08 — manual "Stack" layout toggle (Review + Preview)

The passage/question split is container-query automatic; added a user override
so an educator can FORCE the single-column stacked layout even when there's room
to split (e.g. to focus on the passage, or on a projector).
- `QuestionPane` gained a `forceStacked?: boolean` prop. When set, it drops the
  `@container` context + `@[48rem]:` split utilities entirely → always single
  column. The header's `@[48rem]:` classes then collapse to their base (number
  above choices hidden; review header hidden) — exactly the stacked behaviour.
- A **"Stack" toggle** (aria-pressed, indigo when active) sits in the nav strip
  of both `TestReviewPage` and `TestPreviewRunner`; state is per-session.
- Forced-stack renders a **single wide column** (number → passage → divider →
  question) spanning **~95% of the width** (`mx-auto w-[95%]`), centred — this
  mode is meant for PROJECTING to a class, so size/visibility beats reading
  line-length. (Started at `max-w-2xl`; widened to 95% per the projector use.)
- **Verified live in the running app** via `viewer/scripts/verify-stack-toggle.mjs`
  (`npm run verify:stack`): a Playwright harness that injects a disposable
  admin session, opens the DSAT review page, and asserts the passage/question
  geometry — split (question right of passage) → click Stack → stacked
  (question below, same centred column) → toggle off → split. **4/4 green**;
  screenshots to /tmp. `tsc -b` + `vite build` green.

## 2026-06-08 — code review + design polish of the fulltest review/proctor UI

Two-lane review (correctness + design subagents) of the session's work, then
applied the high-value fixes:
- **Bug — dual realtime subscription.** `TestMonitorModal` (rendered inside
  `TestOverviewPage` when the monitor's open) was opening its OWN
  `proctor_messages` channel + unread-dot Set in addition to the page's, so
  dots desynced (phantom unread). Lifted the subscription + `newMsgRuns` to the
  page; the modal now takes `newMsgRuns` + `onSeenRun` props → exactly one
  subscription.
- **Design — skeletons not "Loading…".** Replaced the bare "Loading review…" /
  "Loading preview…" / "Loading results…" text (the project's one forbidden
  pattern) with `Skeleton` placeholders that mirror the question layout +
  sidebar (`aria-busy`).
- **Legibility.** Breakdown student-name lists bumped `text-slate-400` →
  `text-slate-500 dark:text-slate-400`.
- **A11y.** Double-send ref-guard in `ProctorChat.doSend`; `aria-label` on the
  ModuleTabs strip; `aria-label`/`aria-expanded`/`aria-controls` on the Review
  sidebar collapse/expand toggles (+ `id`/`aria-label` on the `<aside>`).
- Deferred (noted, lower-leverage): unifying the top-bar badges through
  `StatusPill`, bumping the dense desktop nav-strip tap targets to ≥40px, and
  full `role="tablist"` semantics on ModuleTabs. `tsc -b` + `vite build` green.

## 2026-06-08 — QuestionPane: container-query split + passage number + layout-shift-free highlight

- **Passage/question split is now CONTAINER-query driven** (added the
  first-party `@tailwindcss/container-queries` plugin). The Reading-&-Writing
  two-column layout reacts to the *available width* of the pane, not the
  viewport — so on the Review page (where the class sidebar narrows the area)
  it stacks the question + choices BELOW the passage when there isn't room, and
  splits into two columns when there is. Fixes the ugly full-width-passage /
  stranded-question layout. Threshold: container ≥ 48rem.
- **Question number atop the passage** (left pane) — always shown so the
  passage is labelled in both layouts. In the two-column split the question
  column shows the number again; when **stacked**, the in-column number is
  dropped (the passage-top badge is the single in-body number, and the nav
  strip's "Question N of M" also identifies it). In review (no mark/strike
  controls) the otherwise-empty question header is hidden entirely when stacked.
  Driven by `@[48rem]:` container variants + the `disabled` flag; QHeader gained
  `numberClassName`/`containerClassName` props for this.
- **Highlight is now layout-shift-free.** The `<mark>` had `px-px` (1px each
  side) which widened the highlighted run → reflowed/re-wrapped text on every
  add/remove. Dropped the padding, kept background-only highlighting + added
  `box-decoration-clone` for tidy multi-line rounding (paint-only). (Audited by
  a subagent: confirmed `px-px` was the sole text-reflow cause; bg/rounding/
  height are not.)
- **No more "Clear (n)" toolbar pop-in:** the highlight Clear button is now
  always mounted (invisible + non-interactive when count 0) in both the runner
  toolbar and the Review nav strip, so the first highlight doesn't shift the
  toolbar. `tsc -b` + `vite build` green; built CSS confirmed to contain the
  container-query rules. NOTE: the dev server must be restarted to pick up the
  new Tailwind plugin.

## 2026-06-08 — Review Mode polish: rename, class inheritance, sidebar empty state (no migrations)

Follow-ups on the teacher Review surface from clicking through it live:
- **Renamed "Answer key" → "Review Mode"** everywhere it links to
  `/educator/tests/:slug/review` (TestOverviewPage button, FullTestCatalog
  card, and the in-page badge).
- **Class is inherited.** The chosen class is now persisted per test
  (`fulltest:review:class:<slug>` in localStorage) and restored on reopen;
  the first-time default still falls to the class that actually sat the test
  (taken DESC), then any linked class. (The role-agnostic `/test/<slug>` link
  carries no course, so navigation-time course context isn't available —
  sticky memory + data-aware default is the inheritance mechanism.)
- **Left "Class results" bar fixed.** Previously, when the selected class had
  no submitters it rendered a wall of empty Q1–Qn rows with "—". Now it shows
  a real empty state ("No responses yet … Another class has — pick it from the
  Class menu") and only renders the per-question breakdown + section overview
  when there's data. The sidebar header now names the class (`<name> · N
  submitted`) so the results are anchored to a class. `tsc -b` + `vite build`
  green.

## 2026-06-08 — staff sidebar: collapsible at tablet+ & discoverable (no migrations)

**The `StaffShell` left rail (the global educator nav, shown on every educator
page incl. `/educator/courses`) was only collapsible at `lg+` via a buried
bottom chevron / ⌘B.** Extended + surfaced it:
- Collapse now works at **`md+`** (768px) — the rail toggles 176px ↔ 64px
  icon-only. Below `md` it stays a fixed icon+label column (unchanged).
- Added a **discoverable toggle in the top chrome**: `Breadcrumbs` gained an
  optional `leadingAction` slot, and `StaffShell` passes a panel/hamburger
  button there (visible `md+`), next to the back button. ⌘B and the rail's
  bottom chevron still work; all three share the per-user persisted state.
- Label/width visibility flipped `lg:*` → `md:*`; rail padding moved into the
  dynamic class to avoid a same-breakpoint Tailwind `md:px-*` conflict.
- Layout impact: the rail is a flex sibling of `<main class="flex-1 min-w-0">`,
  so width changes auto-reflow content; `--app-chrome-top` (3rem) and the fixed
  NotificationBell are unaffected; the courses card grid is viewport-keyed so
  columns don't change (cards just widen). Change is global to all educator
  surfaces by design. `tsc -b` + `vite build` green.

## 2026-06-08 — refactor: share the staff Preview/Review scaffolding (no migrations)

**Removed the duplication introduced by the Preview + Review surfaces** by
extracting three shared pieces in `viewer/src/fulltest/`:
- **`testContent.ts`** — the staff `tests → test_modules → test_questions`
  SELECT, its row→model mapping, the `TestContent*` types, and
  `answerKeyText` / `correctValue` helpers. One home for the query + contract.
- **`useTestNavigation.ts`** — the (module, question) cursor: prev/next that
  wraps across modules, jump-to, nav-popover flag, and ←/→ keys.
- **`ModuleTabs.tsx`** — the shared module-tab strip.

`TestPreviewRunner` and `TestReviewPage` now consume these instead of each
carrying their own copy (~100 lines of duplication gone; a schema change now
touches one file). Behaviour-preserving; `tsc -b` + `vite build` green.

Also extracted the live-monitor **roster row** into
`test-overview/RosterRow.tsx` (exported as `RosterRowView` to avoid clashing
with the `RosterRow` type) — a pure presentational component taking the row +
live info + callbacks. `TestOverviewPage` dropped from ~1040 → **852 lines**;
`fmtAwaySecs` moved into `test-overview/helpers`. Behaviour-preserving;
`tsc -b` + `vite build` green.

## 2026-06-08 — proctor ⇄ student messaging on a paused test (migrations 0113–0114)

**Two-way, fully-recorded communication for a paused live test.** When the
proctor pauses a student, the student now sees a clear "Paused by your teacher"
screen with a chat (preset chips + free text); the proctor can pause with a
reason and reply from the live monitor. `tsc -b` green; applied to Remote;
`smoke-proctor-chat` 14/14 + full smoke all-green.

- **Why this shape:** the paused screen is the only place a student sees the
  channel — timer frozen, no test content visible — so it has ~no cheating
  surface. Student messaging is **server-enforced to the paused window only**.
- **0113 `proctor_messages`** — append-only table (sender student|staff, kind
  text|preset|pause, body) with RLS read for the run's owner + any staff, **no
  write policy** (DEFINER RPCs only → `sender` can't be forged; permanent log),
  added to the realtime publication. `student_send_proctor_message` (own run,
  paused only → `not_paused`) and `proctor_send_message`.
- **0114** tightened `proctor_send_message` to **admin-only**, matching the
  0104 model (all proctor *actions* are admin-only; staff keep *read*).
- **Client:**
  - `ProctorChat.tsx` — `useProctorChat` (RLS-direct read + realtime per run)
    + a shared thread/preset/composer used by both sides. Presets: student
    "👍 Okay / 🙋 Question / 🚻 Restroom / ⚠️ Technical issue / ✅ Ready"; staff
    "One moment / On my way / Come see me / …".
  - **Student paused overlay** (`FullTestApp`) embeds the chat with a quick-reply
    + composer.
  - **Proctor** (`TestOverviewPage`): a 💬 Message button per in-progress row
    (live unread dot via a realtime subscription to `proctor_messages` inserts)
    opens `ProctorChatModal` — pause-with-reason / resume + the thread. The
    pause reason is delivered as a `kind='pause'` message.
- **Test:** `viewer/scripts/smoke-proctor-chat.mjs` (`npm run smoke:proctor-chat`)
  — disposable, self-cleaning: asserts paused-gating, admin-only send, non-admin
  staff read access, RLS isolation (an unrelated student sees nothing), the
  3-message record + sender order, and that resume re-closes the student's
  window. **14/14.**
- Wired on **both** live-monitor surfaces: `TestOverviewPage` rows and
  `TestMonitorModal` rows (a 💬 button per in-progress student, live unread dot
  via a realtime subscription, opening the shared `ProctorChatModal`). The
  monitor modal renders the chat modal as a fragment sibling so a chat-backdrop
  click doesn't bubble up and close the monitor.

## 2026-06-08 — teacher "Review" surface: answer key + per-class results + highlighting (migration 0112)

**Rebuilt the full-test "Review" (answer key) page into a preview-style,
one-question-at-a-time review surface for going over a test WITH a class.**
`tsc -b` green; migration applied to Remote; full smoke all-green (215).

- **The ask:** answer-key view should look like the new Preview but with the
  correct answer marked; when students have taken it, show how many + which
  students chose each option; highlighting for class review; a collapsible left
  bar; good on tablets and desktops.
- **Migration 0112** — two staff-gated `SECURITY DEFINER` read RPCs (no schema/
  data change): `list_test_review_courses(slug)` (classes the caller teaches
  that link the test + submitter counts) and `get_test_answer_breakdown(slug,
  course_id)` (one row per question×student for each student's latest submitted
  run — `chosen`, `is_correct`, name). Needed because `test_run_answers` RLS is
  owner-read only. Mirrors the 0078 roster CTE; gated `is_staff` +
  (`is_admin` OR `is_teacher_of_course`).
- **`TestReviewPage` rewritten** (same export → no route change) into a
  full-screen review runner:
  - Correct answer marked on every question (new additive `correctAnswer` prop
    on the shared `QuestionPane` — emerald ✓ on the MCQ key / grid answer chip;
    runner unaffected).
  - **Class picker** (per-course) in the top bar; defaults to the class with
    the most submitters.
  - **Collapsible left "Class results" sidebar**: per-question option breakdown
    (bar + count + the student names who picked each, key marked) and a section
    overview list with %-correct per question (color-graded). Collapses to give
    the question full width on tablets; reopen via a "☰ Results" button.
  - **Highlighting** for live review, saved per teacher (localStorage via the
    runner's `useRunnerAnnotations`), with Highlight/Clear in the nav strip.
  - Same module tabs + question navigator (prev/next, jump grid, ←/→ keys) as
    Preview. Degrades to a clean answer-key walkthrough when no class data.
- New client API: `listReviewCourses` / `getAnswerBreakdown` in `fulltest/api.ts`.
- **Integration test:** `viewer/scripts/smoke-review.mjs` (`npm run smoke:review`)
  — disposable, self-cleaning: provisions a teacher + 2 students + a course
  linking the test, drives two real deterministic submissions (A picks 'A'
  everywhere, B picks 'B'), then asserts `list_test_review_courses` (taken=2)
  and `get_test_answer_breakdown` (per-option chosen + names + `is_correct`)
  plus three authorization rejections (student not staff; non-owner teacher).
  **14/14 green.** Full smoke suite still all-green.

## 2026-06-08 — educator "Preview test" → free-roam previewer (no migrations)

**Staff "Preview test" no longer drops the educator into the proctored,
linear student runner — it opens a free-roam previewer where they can jump
across every module and question at will.** UI-only; `tsc -b` green.

- **Why:** an educator previewing a test should have freedom, not be forced
  through timed modules in order (the live runner blocks loading a module
  *ahead* of `current_module`, and previewing created a real `test_runs` row).
- **New `viewer/src/fulltest/TestPreviewRunner.tsx`** — a pure client-side
  browser:
  - Content via a direct staff SELECT on `tests → test_modules →
    test_questions` (0048 RLS `is_staff`, same path as TestReviewPage) — **no
    server run, no timer, no proctoring, no grading**, so previewing can't
    pollute rosters/metrics.
  - **Top-bar navigation:** module tabs (with per-module question counts) + a
    question navigator strip (Question N of M, prev/next, and a jump grid of
    every question). ←/→ keys move between questions.
  - Renders through the real `QuestionPane` (`fullHeight`) so the educator sees
    exactly what a student sees; answer selection is local + ephemeral.
  - Bonus **"Show answer key"** toggle (staff can read the key already) +
    "Exit preview" back to the test overview.
- **`FullTestApp` is now a thin dispatcher** — its body moved into
  `FullTestRunner` (unchanged); `FullTestApp` returns `<TestPreviewRunner />`
  when opened on `/educator/tests/:slug/run` (detected from the path, computed
  once via `useRef` so a later URL rewrite can't flip it), else the real
  runner. No routing changes — the existing preview route already mounts
  `FullTestApp`, so the parallel session's in-flight route-tree edits were left
  untouched.

## 2026-06-07 — live test-monitor roster polish + release/hide clarity (3 commits, no migrations)

**Reworked the teacher-facing test-monitoring roster into one calm, scannable
visual language across all three surfaces that render it, and made the
"Release / Hide" control self-explanatory.** UI-only; build verified
(`tsc -b`) and pushed each commit.

- **The problem (user-flagged):** the STUDENTS roster on the per-test overview
  read as a wall of competing outlined controls — status chips (gray "Hidden",
  blue "In progress") looked like buttons, and the live-control trio
  (Pause/End/Reset) each carried a different colored border, so every row was a
  christmas tree. Separately, "Release"/"Hide" never said *release what, to
  whom*.

- **New shared primitives** — `viewer/src/fulltest/test-overview/StatusPill.tsx`
  (barrel-exported from `@/fulltest/test-overview`):
  - **`StatusPill`** — one pill family (tinted fill + leading colored dot,
    optional live `pulse`) so color alone carries state: idle / live / paused /
    released / hidden / alert / warn. Replaces every outlined status/signal
    chip.
  - **`RowAction`** — one ghost button (no ring, hover-tint) so actions sit
    visually below row content; semantic tone (warn/danger) survives in text
    color only.
  - **`ActionGroup`** — segmented container collecting a live-control trio into
    a single control instead of N floating bordered buttons.

- **Surfaces updated (commits `c7d0523`, `78ba6cf`, `70a0295`):**
  1. **`TestOverviewPage`** roster (`/educator/tests/:slug`) — the flagged
     screen. Right-aligned `[status][signals][actions]` cluster, live-pulse
     on in-progress, Pause·End·Reset in one `ActionGroup`, subtle row hover,
     dropped the redundant "Not started" subtitle.
  2. **`StudentTestRunsPanel`** (student profile → "Full-length tests") — same
     primitives; Released/Hidden + "Retake allowed" → `StatusPill`; Review /
     release / allow-retake → `RowAction`.
  3. **`TestMonitorModal`** (live proctoring) — idle / needs-review / left-tab /
     integrity / paused / submitted / not-started → `StatusPill`;
     Pause/Resume + "+5 min" → `ActionGroup`. Live telemetry (module/Q chip,
     answered count, timer, started-at) left as informational text — it's data,
     not status.

- **Release/hide clarity** — students see nothing after finishing a test until
  the teacher releases; that's now explicit: header explainer ("*Releasing*
  lets a student open their score and answer review. Until you do, they only
  see that they finished."), audience-explicit labels ("Release to student" /
  "Hide results" / "Release all results"), and tooltips on every release/hide
  control (per-row and bulk).

## 2026-06-05 — grid-in grading: repeating-decimal acceptance (migration 0111)

**Hardened the grid (student-produced response) grader for repeating-decimal
answers — `_grade_answer` now follows the College Board SPR rule.**

- **The gap:** for a repeating answer like `2/3`, the SAT accepts any
  rounded/truncated decimal that fills the grid (`.6666`, `.6667`, `0.667`).
  The 0055 grader only accepted a literal `accepted[]` form or a value within
  `1e-9` of the key, so `.6667` (off by 3.3e-5) was marked **wrong** unless
  every truncation was hand-enumerated in the seed data. Surfaced by a
  26-case grid-grading battery run directly against `_grade_answer`. The user's
  example (`2.7` vs `2.70`) already worked — that's exact numeric equivalence;
  the repeating case was the real defect.
- **Not affecting the live test:** all 12 grid answers in DSAT-Nov-2023 are
  *terminating* (`343, 17, 8, 45, 4.75, 26, 192.1, -23, 4700, 2025, 45/8,
  1/8`), so the gap was latent — but the grader is general and future tests
  will hit it.
- **0111 fix:** added an approximation branch to `_grade_answer`, gated so it
  can't over-accept — (1) key non-terminating in grid space
  (`round(kv,4)<>round(kv,10)`, so terminating `0.125` still rejects `0.1249`);
  (2) a DECIMAL entry with enough places to fill the grid
  (`places >= greatest(1, 4 - <int digits>)`, so `0.67`/`0.7` for `2/3` are
  rejected); (3) value equals key TRUNCATED or ROUNDED to those places.
  `CREATE OR REPLACE`, same signature → `submit_test_module` picks it up;
  preserves the 0106 `search_path=''` pin.
- **Applied to Remote** via `supabase db push` (also recorded **0110**, which
  had been applied data-only and was untracked — `migration list` is now
  Local==Remote through 0111). Verified: extended 28-case battery all-green,
  `smoke-grading` 12/12.
- **Regression guard:** new `grid-grading-check.mjs` (`npm run grid:check`) —
  29 (key, entry, expected) cases run against the live `_grade_answer` via
  psql, exits non-zero on any mismatch. Run it after any change to grid
  grading. **Lesson recorded in the migration ledger:** a numeric-equality
  grader is wrong for SPR — repeating answers need round/truncate-to-grid
  matching, not an epsilon.

## 2026-06-05 — verification harnesses: 2-student clickthrough + adversarial edge-hardening (commit 752dd74)

**Two new one-off verification harnesses for the invite → claim → take-test
pipeline (no migrations; disposable accounts, self-cleaning). Both run green
against the live Remote.**

- **`clickthrough-two-students.mjs`** (`npm run clickthrough`) — full
  real-world path for 2 students: teacher invites seats via
  `admin_create_student` → each claims its seat (anon → `claim_student_seat`)
  → each takes `dsat-nov-2023` end-to-end (all 98 Q across 4 modules). One
  student answers from the real key (**scored a clean 98/98** — confirms the
  seeded DSAT-Nov-2023 answer key is internally consistent and grading is
  exact), the other answers naively (21/98), proving the scoring engine
  discriminates. Then results gating + admin release + student read-back.
  **34 checks, all green.**

- **`clickthrough-edge-hardening.mjs`** (`npm run harden`) — **27 adversarial
  checks across 7 groups**, all green:
  - **A. Cross-tenant** — a 2nd student is rejected (`not_authorized`) from
    `get_test_module` / `submit_test_module` / `save_test_progress` on a
    foreign run, and can't read a foreign released result.
  - **B. Invite/claim abuse** — bad code → `seat_not_found`, bad email →
    `invalid_email`, weak pw → `weak_password`; a 2nd claim of an
    already-claimed seat → `pending` (no silent takeover; original login
    stays valid).
  - **C. Proctor authz (0104)** — a non-admin teacher is rejected from
    `release_test_results` / `allow_test_retake` / `reset_test_attempt`.
  - **D. Retake idempotency (0090)** — a 2nd un-consumed grant →
    `retake_already_granted`.
  - **E. Input validation** — bad slug → `test_not_found`; garbage question
    ids + invalid answer values (`"Z"`, `"abc"`) are tolerated/ignored (only
    the 27 real answers stored, run still advances).
  - **F. Concurrency** — two parallel submits of the same module serialize via
    `FOR UPDATE` (one advance, 27 answers not 54, loser gets
    `module_out_of_order`); two parallel `start_test` mint exactly one run.
  - **G. RLS direct-table bypass** — bypassing the RPCs and hitting tables
    directly via PostgREST, the attacker reads **0 rows** of victim
    `test_runs` / `test_run_answers`, can't read victim `profiles.email`
    (PII), and **can't read `test_questions.correct_answer`** (the answer key
    is not student-exposable). This is the deepest check: it confirms the
    guarantees hold at the RLS layer, not just behind the RPCs.

- **Deliberately kept out of `smoke-all`** — a dozen rapid sign-ins per run
  would risk the GoTrue per-IP sign-in rate limit and make `npm run smoke`
  flaky. Same rationale as `loadtest` / `restore-drill`: standalone,
  self-cleaning npm scripts. New scripts: `npm run clickthrough`,
  `npm run clickthrough:edges`, `npm run harden`. Documented in
  `viewer/scripts/README.md`.

- **Result: no defects found** — the invite/claim/take-test pipeline is
  well-hardened, including the two highest-risk concerns (cross-student data
  access and answer-key exposure), both locked at the RLS layer. Run
  `npm run harden` after any change to the test-runner RPCs, RLS policies, or
  the claim/invite flow.

## 2026-06-05 — test-runner proctoring: complete timeline + duration tracking + fullscreen lockdown (0108–0109)

**Forgery-proof proctor timeline + duration tracking + strict lockdown (migrations 0108–0109, commit 2168c1e):**
- **0108 `proctor_timeline`** — new `test_run_events` timeline table: one
  forgery-proof row per signal (`away` / `focus_loss` / `fullscreen_exit` /
  `copy` / `paste` / `blocked` / `devtools`), each with duration + module +
  question. RPC-only writes, owner-read RLS. Denormalized
  `away_total_seconds` / `focus_loss_*` rollups onto `test_runs`.
- A single best-effort logger `test_log_proctor_event` (never throws) fronts
  every event write. `get_test_run_timeline` reads it for owner OR teacher (new
  `is_teacher_of_test` helper). Per-test `tests.proctoring_level` (off / soft /
  strict) + `set_test_proctoring_level`; `test_live_progress` gains
  `flagged` / `flag_reasons`; `start_test` returns `proctoring_level`.
- **0109 hotfix** — 0108's `start_test` rebuild was diffed against the **0082**
  body and silently DROPPED the `results_released` key added by 0083; caught
  live within minutes by `clickthrough-practice-test.mjs` and restored.
  **Lesson: rebuild a CREATE-OR-REPLACE fn against the LATEST prior definition,
  not whichever one you happen to remember** (`start_test` was touched by
  0048 / 0061 / 0066 / 0081 / 0082 / 0083).
- **Client:** tab-away is now duration-tracked (not just a count); blur/focus
  second-monitor detection is de-duped against away. Strict mode enforces
  fullscreen + copy/paste blocking behind a blocking overlay, **failing open on
  iPhone** (no fullscreen API). New `ProctorTimeline` component (time-scaled
  track + tooltips + chips + skeleton/empty state) renders in the live monitor
  (flagged runs sorted to top) and in post-test review.
- **Tiers:** soft (all devices) / strict (laptop + iPad) / lockdown = SEB
  (Phase 3, **design-only** for now). See `docs/PROCTORING.md` for the deep-dive.
- **Verified Remote:** migration list Local==Remote through 0109; clickthrough
  42/42, edge 10/10, full smoke all-green. Applied to the live DB then verified
  — the 0109 regression was caught post-apply by the clickthrough harness.

## 2026-06-05 — launch-prep: login fixes, single-proctor lock, backups, bundle split, modularization, breadcrumb nav

**Supabase advisor cleanup + perf + launch de-risking (migrations 0105–0107):**
- **0105 `security_invoker_views`** — flipped the 3 CRITICAL "Security Definer
  View" advisor warnings (`module_tree`, `portfolio_item_tree`,
  `student_skill_stats`) to `security_invoker = on`. The two tree views were
  `GRANT`ed to `authenticated` with no per-user filter → a direct `/rest/v1`
  read leaked every course's rows cross-tenant. Now RLS-scoped per caller. Safe:
  the tree views have no consumers; skill-stats is read only inside the
  `my_skill_mastery()` definer RPC (still runs as owner there).
- **0106 `function_search_path`** — pinned `search_path = ''` on the 7 remaining
  "Function Search Path Mutable" functions (all already fully-qualify their refs,
  so behavior-preserving). 0 mutable public functions remain.
- **0107 `hot_fk_indexes`** — surgical indexes on the live-test/modules hot-path
  FKs (`test_runs.test_id`, `test_run_answers.question_id`,
  `module_item_completion.module_item_id`, `course_modules.parent_module_id`,
  `portfolio_items.parent_item_id`). Skipped the ~17 authorship FKs (needless
  write overhead).
- **Intentionally NOT fixed:** 3 RLS-enabled-no-policy internal tables
  (deliberate lockdown — adding policies would *open* them) + `pg_net` in public
  (relocating a platform-managed extension the 0058 cron needs is too risky
  pre-launch). Documented in PRODUCTION_RUNBOOK §5b.
- **Telemetry blind-spot closed:** `FullTestApp.doSubmitModule` now emits
  `test_submit_failed` (PostHog) + `captureError` (Sentry) when a section submit
  fails after all retries — the one failure that silently loses graded work.
  Added global `unhandledrejection`/`error` handlers in `main.tsx` (async
  rejections were previously invisible to Sentry). Alert recipe in §7b.
- **New launch scripts:** `npm run loadtest` (concurrent test-load harness,
  self-cleaning) + `npm run restore-drill` (backup-restore verifier with a
  fail-closed prod-write guard).
- **Load-test finding (de-risking):** 25 concurrent full DSAT flows → 25/25 pass,
  p95 3.7s, all answers round-trip — the DB engine scales. Ceiling at n=40 is
  **GoTrue auth rate-limiting on sign-in** (a same-IP classroom risk), NOT the
  DB. → raise Auth rate limits before a class sits (PRODUCTION_RUNBOOK §5b#4/§7b).

**Navigation — global breadcrumb bar across every educator surface:**
- A single sticky breadcrumb bar mounts ONCE in `StaffShell`'s `<main>` (above the
  `<Outlet/>`), so every `/educator/*` page + subpage gets a consistent trail + an
  "up one level" back control with zero per-page wiring. The trail is derived
  synchronously from the URL by `lib/breadcrumbs.ts` (pure, table-driven), so the
  static portion never flickers and the bar is a constant 48px on every route (no
  layout shift). Dynamic segments (course / assignment / test / student / topic /
  thread / attempt) resolve to real entity names — pages register them via
  `useBreadcrumbLabel(urlValue, name)` (`components/Breadcrumbs.tsx`), falling back
  to a generic word ("Course") until the owning page loads. Removed the now-redundant
  inline back-links (ClassLayout "← Back to courses", TestOverview "← All tests").
- **`--app-chrome-top` CSS var** (3rem in the staff shell, 0px elsewhere) publishes
  the bar height so page chrome offsets beneath it: sticky headers use
  `top-[var(--app-chrome-top,0px)]` (QuestionBank / AssignmentDetail / CourseGradebook
  / TestReview) and the full-height Inbox two-pane uses
  `h-[calc(100vh-var(--app-chrome-top,0px))]`. Shell-agnostic — reduces to the
  originals on the student shell.
- **Educator content now left-aligns flush with the bar.** Page containers were
  centered (`mx-auto max-w-Nxl`), so their left edge sat right of the flush-left bar
  (looked messy). Dropped `mx-auto` + normalized the gutter to `px-4 sm:px-6 lg:px-8`
  across all educator surfaces (ClassLayout + course tabs, AllClassesView, Dashboard,
  QuestionBank, Account, Calendar, Tests overview/review/admin, StudentProfile);
  `max-w-Nxl` stays as a right-edge cap. New convention documented in
  DESIGN_PRINCIPLES §8j.

**Student course access (the just-joined path):**
- **Fixed "Couldn't open this course" after claiming a seat.** `claim_student_seat`
  returns the course UUID and the app deep-links to `/student/courses/<uuid>`, but
  `StudentCourseView` looked the course up ONLY by `short_code` (uppercased) — a UUID
  never matches → hard "not found", even for a genuinely-enrolled seat (its
  `course_memberships` row grants the `courses` RLS read). Fix: detect the UUID shape
  and look up by `id` (Postgres parses uuid input case-insensitively, so the
  uppercased value still matches); `short_code` links are unaffected.
- **Bounded retry on the initial course load** (post-join resilience). Rather than pad
  the happy path with a fixed "joining…" delay, the existing skeleton now covers up to
  3 quick re-attempts (350ms backoff): a transient network/auth blip self-heals, a
  genuine no-access still surfaces within ~1s. No race needs masking — the seat claim
  awaits sign-in before navigating and rebinds an already-enrolled seat (membership +
  course pre-exist the claim, so RLS passes the instant the query runs).

**Auth / login (the student deployment path):**
- **Fixed the quick-start seat-claim bounce.** A managed-seat student (e.g. "BBB")
  entering their per-seat code on `/quick-start` was bounced back to `/quick-start`.
  Root cause: `signInAnonymously()` (minted so the claim RPC carries auth) makes
  AuthGate leave PublicRoutes and **unmount QuickStartScreen mid-flow**; `submitSeat`
  then bailed on `!aliveRef` AFTER `claim_student_seat` succeeded but BEFORE signing
  in as the seat, and the `finally`'s blind `signOut()` dropped the shared session
  (anon + seat share ONE supabase session) → stranded on `/quick-start` with the seat
  already claimed. Fix: complete the claim + seat sign-in regardless of unmount
  (`aliveRef` guards only `setState`); sign out only if the session is still anonymous
  (`getUser().is_anonymous`). Guarded by a NEW real-browser test
  `e2e/quick-start-seat.spec.ts`.
- **Claimed seat → straight into the invited course** (better UX). `claim_student_seat`
  (0098) returns `course_id`; QuickStartScreen hands it off via `sessionStorage` and
  AreaSelector redirects to `/student/courses/<id>` on landing.
- **`/quick-start` now offers explicit Student + Educator sign-in cards** (each
  preselects the role via `?role`), alongside the featured quick code entry.

**Proctoring — single designated proctor (migration 0104):**
- All 7 proctor MUTATION RPCs (`release_test_results[_for_teacher]`, `allow_test_retake`,
  `reset_test_attempt`, `proctor_add_time` / `proctor_force_submit` / `proctor_set_pause`)
  now gate on `is_admin` instead of `is_staff` — only the first auth line changed per
  function (mechanically diff-verified; course-scope blocks kept, harmless). Non-admin
  staff stay READ-ONLY (the live monitor / roster RPCs are unchanged); the UI hides the
  action controls for non-admins. Verified: `clickthrough-practice-test` 42/42 (admin
  proctor works; non-admin teacher → `not_authorized`) + full smoke all-green.

**Test runner:**
- **Type-to-confirm before submitting a section** — students must type "submit" to end
  a section (modules are one-way). Reusable `confirmPhrase` prop on `ConfirmDialog`.
- Manual section-submit now flushes the 2.5s draft (highlights/notes/marks) first.

**Backups (don't-lose-data):**
- `npm run backup:live` — **5-minute snapshots** of live `test_runs` + `test_run_answers`
  to a private `db-backups` bucket while a test is in session (service-key + REST, no
  `pg_dump`; cheap no-op when no test is live). On top of Supabase Pro's managed daily
  backups + PITR.
- `npm run backup:db` — full schema+data backup → bucket. **Dump-tool fix:** the hang was
  `which pg_dump` resolving to PG15 (refuses the PG17 server) + `supabase db dump`
  stalling over the pooler; resolved by calling native **pg_dump 17.5** (Homebrew libpq)
  directly against the session pooler.

**Performance — bundle code-splitting:** first-paint/login JS cut **716 → ~247 KB gzip**
via lazy role trees (`StaffRoutesTree` / `StudentRoutesTree` behind Suspense), lazy TipTap
MarkdownEditor (~103 KB on demand), deferred Sentry/PostHog (after first paint), and
react/supabase vendor chunks (cached across deploys). Guarded by real-auth E2E
(`role-routing`, `practice-test-runner`) under `playwright.role.config.ts` (no auth
bypass — `npm run test:e2e:roles`).

**Maintainability — modularization + `@`-alias convention:** repo-wide `@/` alias for
cross-folder imports (535 across 199 files) + split the largest files into barreled
folders toward ~500 LOC (ModulesPage 3806→1330, QuestionBankPage 1397→222, AdminAuditPage
1794→933, CalendarPage, DiscussionTopicView, CourseDiscussions/Announcements, …).

Migrations: **0104** (proctor admin-only). New E2E specs: `role-routing`,
`practice-test-runner`, `quick-start-seat` (real-auth, no bypass).

---

## (2026-06-03) — student seat claiming, code-usage tracking, claim-aware logins

- **Claim a pre-created seat** (migrations 0095/0096). A per-student login code
  (`Y8M3KP-01`) typed into Quick Start now **claims the existing managed seat**
  instead of minting a duplicate profile. (The bug it fixes: Quick Start scrubbed
  the `-01`, matched the 6-char course code, and created a new anonymous profile —
  e.g. a stray "Ca" — leaving the real seat unclaimed.) First claim swaps the
  synthetic `…@students.local` email → the student's real email, sets their chosen
  password, and **keeps the teacher-owned name + all work** (same profile id). The
  name field is hidden for seat codes (teacher owns it — 0093). An already-claimed
  seat files a teacher-approval request (`seat_claim_requests`); **approve =
  credential recovery** on the same seat, **deny = drop**. Teacher gets a
  `seat_claim_request` notification + an Approve/Deny panel on the Roster. Verified
  9/9 against remote (`viewer/scripts/clickthrough-claim-seat.mjs`); 0096 fixed a
  plpgsql `status`-ambiguity that clickthrough caught before it shipped.
- **Class-code usage tracking** (migration 0097). New append-only
  `code_redemptions` log that **survives student removal** (`student_id ON DELETE
  SET NULL` + name/email snapshots). `join_course_by_code` +
  `quick_start_with_code` append a row on first join (FOUND-gated past `ON CONFLICT
  DO NOTHING` so idempotent re-calls don't inflate). Roster **"Code activity"**
  panel: `used N× · M students · last <when>` + a join-vs-quick-start detail list
  (who/when/email, marks removed students). Verified 13/13 against remote.
- **Per-seat activation + claim-aware login surfaces.** Roster shows
  **"Activated" / "Code not used yet"** per managed seat (from
  `profiles.claimed_at`). Because a claimed seat now logs in by email, the
  code-based tooling is made claim-aware: the roster code chip renders
  struck-through ("retired"), Print logins/QR/CSV mark claimed seats as "signs in
  with own email", bulk **"reset all & print" skips** them (can't clobber a
  self-set password or print a dead code), and the Reset-password modal shows the
  email identity instead of the dead code/QR.
- **Cleanup + an accepted risk.** Removed the stray duplicate "Ca"; confirmed no
  seed/demo accounts exist on remote (why `smoke-modules`/`smoke-qbank` stay red —
  they sign in as `demo-teacher@example.com`). The seat-claim **code-enumeration
  hijack** (first-claim is open, and the `claim_seat` rate limit is defeated by a
  fresh anonymous session per attempt) was reviewed and **accepted as a known
  risk** rather than gated behind the teacher-set temp password.

---

## (2026-06-03) — controlled-test polish, mobile audit, role-prefixed URLs

- **Role-prefixed URLs.** Every authenticated surface now carries a `/educator`
  or `/student` prefix so the role is legible in the address bar (the runner
  `/test/:slug` stays shared). Implemented mostly by changing the `ROUTES.*`
  constant *values* (consumers + builders update automatically); shared
  account/inbox render under each role's prefix (`AccountRoutes` takes a
  `basePath`; `InboxPage`/`NotificationBell` derive from `profile.role`).
  Old paths redirect to the role home. Verified in-browser for both roles.
- **Per-test overview** (`/educator/tests/:slug`, migration 0089
  `assign_test_to_course`). Teachers opening a test's Modules link land on a
  dashboard — test info + timed-module structure, cohort stats (assigned /
  submitted / in-progress, average + range, score distribution), and
  per-student data with Review / per-row + bulk release / stuck-attempt reset.
  QA actions: Preview test, Answer key, Assign to course, Monitor live.
  Students still get the runner (branch at `StaffTestGate`).
- **Migration collision fix (0086 → 0090).** A duplicate `0086_*` filename had
  silently skipped the second migration; renumbered so the course-scope
  hardening of `release_test_results`/`allow_test_retake`/`reset_test_attempt`
  actually applied. Added **`docs/MIGRATIONS.md`** as the authoritative ledger.
- **Mobile/tablet runner audit.** Fixed a preview-remount regression (the role
  branch was bouncing staff preview back to the intro on every "Begin"),
  switched the phone R&W layout to a single natural scroll (Bluebook two-pane
  preserved at md+), and eliminated horizontal overflow on staff pages at phone
  widths (`min-w-0` on cards/grids; All-Classes toolbar wraps). See
  `docs/MOBILE_AUDIT.md`.
- **Frictionless onboarding — no confirmation emails.** The production project
  now runs with **email confirmation OFF** (`mailer_autoconfirm`) and
  **anonymous sign-ins ON** — both verified live against the remote (anonymous
  via a throwaway `signInAnonymously()` probe that was deleted afterward), and
  `config.toml` set to match. Students get in with a teacher-dispensed
  per-student code/QR or a class-code Quick Start; no inbox required. The login
  screen (`AuthScreen`) promotes the buried "Quick start" footer link into a
  prominent **"Join with a class code"** card (shown on both Sign in and Create
  account) and clarifies the per-student code/QR copy. See `docs/SMTP_SETUP.md`
  for the deliberate confirmation-off rationale and the re-enable trigger.

---

## Summary

This session took the CB Educator Question Bank from a basic class/assignment skeleton to a Canvas-aligned LMS with 32 migrations applied, anonymous auth wired, email delivery via Resend, and four scheduled edge functions running on pg_cron. Both smoke suites land at 100% green — `smoke-e2e.mjs` (14 scenarios) and `smoke-features.mjs` (63 scenarios) — for a total of 77 passing end-to-end checks against the live cloud project. The smoke pass also caught and corrected six real schema/trigger bugs along the way.

## Migrations shipped

| # | Name | Purpose |
|---|------|---------|
| 0001 | init | Foundation: identity, class structure, RLS, helper functions. |
| 0002 | join_class_rpc | RPC for students to join a class by code. |
| 0003 | quick_start_rpc | One-call provisioning RPC for teacher demo flow. |
| 0004 | assignments | Assignment entity, due dates, attempts, scoring. |
| 0005 | teacher_invites | Invite tokens so teachers can onboard peers. |
| 0006 | admin_rpcs | Admin-only RPCs for staff operations. |
| 0007 | teacher_workflows | Teacher-side flows: roster, publish, gradebook seed. |
| 0008 | fix_classes_insert_recursion | Break an RLS recursion loop on classes INSERT. |
| 0009 | is_staff | Single `is_staff` privilege column replacing scattered checks. |
| 0010 | cross_staff_writes | Allow staff to write across each others' courses. |
| 0011 | modules | Canvas-style modules with ordered items. |
| 0012 | rename_courses | Rename `classes` → `courses` end to end. |
| 0013 | refix_courses_insert_recursion | Reapply the 0008 fix under the new `courses` name. |
| 0014 | attempt_snapshot | Freeze question/choice snapshot on each attempt for trust. |
| 0015 | announcements | Course announcement feed with author + audience scoping. |
| 0016 | materials | Course materials (links, files, text) keyed to modules. |
| 0017 | portfolio | Per-course student portfolio with 8 item types and feedback. |
| 0018 | course_clone | RPC to deep-clone a course into a new term. |
| 0019 | smoke_fixes | Three bug fixes surfaced by `smoke-features.mjs`. |
| 0020 | multi_attempts | Configurable per-assignment attempt limits with best-score policy. |
| 0021 | rate_limit | Generic rate-limit table + check RPC. |
| 0022 | audit_log | Append-only audit log with staff-only read RPC. |
| 0023 | gdpr_dedup | GDPR data-export RPC and user-deduplication helper. |
| 0024 | mastery_predictions | Per-skill mastery scoring + score-prediction RPC. |
| 0025 | discussions | Threaded course discussion boards with replies. |
| 0026 | inbox | Direct-message inbox between course members. |
| 0027 | audit_more | Extend audit coverage to more sensitive RPCs. |
| 0028 | helper_cleanup | Consolidate duplicate helper functions. |
| 0029 | notifications | Notification ledger + in-app feed RPC. |
| 0030 | fix_thread_bump | Fix message-insert trigger that miscounted thread replies. |
| 0031 | cron_schedules | Register pg_cron schedules for the four edge functions. |
| 0032 | anon_profile_trigger | Auto-create profile row for anonymous sign-ins. |

## Features by wave

**Wave 1 — Canvas restructure (0011–0013)**
- Modules entity with ordered items as the new course landing surface.
- Database rename `classes` → `courses` to match Canvas vocabulary.
- RLS recursion refix carried forward under the new name.

**Wave 2 — Snapshot + Announcements + Materials (0014–0016)**
- Attempt snapshot freezes question text and choices at submission time.
- Course announcement feed with author identity and audience scoping.
- Materials attached to modules (link/file/text) for student reference.

**Wave 3 — Portfolio + Clone (0017–0019)**
- Per-course student portfolio supporting 8 item types with inline teacher feedback.
- Deep course-clone RPC for rolling a course into a new term.
- Smoke-driven fixes for the first round of regressions.

**Wave 4 — Gradebook + Calendar + Bulk + Reminders + Multi-attempts (0020)**
- Per-assignment configurable attempt limits with best-score policy.
- Due-date reminder pipeline backing the `assignment-due-reminders` function.

**Wave 5 — Rate limit + Audit + GDPR + Mastery + Predictions (0021–0024)**
- Generic rate-limit table and `check_rate_limit` RPC.
- Append-only audit log with staff-only read RPC.
- GDPR export RPC and account dedup helper.
- Per-skill mastery scoring and score-prediction RPC.

**Wave 6 — Discussions + Inbox + Audit gaps (0025–0027)**
- Threaded course discussions with replies and read tracking.
- Direct-message inbox between course members.
- Extended audit coverage to remaining sensitive RPCs.

**Wave 7 — Audit cleanup + Notifications + Weak skills + Smoke extension (0028–0032)**
- Consolidated duplicate helper functions.
- Notification ledger and in-app feed RPC.
- Thread-bump trigger fix and pg_cron schedule registration.
- Anonymous sign-in profile auto-create trigger.

## Real bugs the smoke caught

| Bug | Introduced in | How smoke caught it | Fixed in |
|-----|---------------|---------------------|----------|
| Materials insert blocked by RLS on staff-owned course | 0016 | `smoke-features.mjs` materials scenario got 403 on staff insert | 0019 |
| Portfolio item type whitelist missing two of eight types | 0017 | Smoke portfolio scenario rejected `reflection` and `link` items | 0019 |
| Course-clone left orphaned module rows | 0018 | Smoke clone scenario found cloned modules pointing at original course id | 0019 |
| Audit log RLS allowed students to read their own rows | 0022 | Smoke audit scenario expected 0 rows for non-staff caller, got N | 0027 |
| Duplicate helper functions caused ambiguous overload | 0023/0024 | Smoke mastery RPC failed with "function is not unique" | 0028 |
| Message-insert trigger double-counted thread replies | 0025 | Smoke discussion scenario saw reply_count = 2 after one reply | 0030 |
| Anonymous sign-in users had no profile row, breaking RLS | (cloud config) | First post-anon-enable smoke run failed on profile-required RPC | 0032 |

## Cloud configuration applied via Management API

- Anonymous sign-ins enabled on the auth config.
- Resend SMTP wired: host `smtp.resend.com`, sender `onboarding@resend.dev`.
- Site URL set to `http://localhost:5173`; redirect allow list covers ports 5173, 5174, and 3000.

## Edge functions

| Function | Schedule | Cron |
|----------|----------|------|
| assignment-due-reminders | Hourly | `0 * * * *` |
| cleanup-anon-users | Daily 03:00 UTC | `0 3 * * *` |
| prune-reminder-log | Weekly Sunday 02:00 UTC | `0 2 * * 0` |
| prune-rate-limit-attempts | Weekly Sunday 02:30 UTC | `30 2 * * 0` |

All four are deployed and registered through pg_cron in migration 0031.

## Smoke coverage

- **smoke-e2e.mjs** — 14 scenarios covering the core auth → course → assignment loop: signup, profile creation, course create, join-by-code, assignment publish, attempt submit, grade visibility, teacher gradebook read.
- **smoke-features.mjs** — 63 scenarios covering modules, announcements, materials, portfolio, course clone, plus the RPC surface for rate-limit, mastery, prediction, GDPR export, audit-log reads, discussions (thread + reply + read), and inbox (send + read + thread bump).

## What still needs your hands

- Rotate the database password, service-role key, and Resend API key before going public.
- Push to `main` (or run `npx wrangler pages deploy viewer/dist --project-name=<project>`) to deploy the viewer app to Cloudflare Pages.
- Sign up for Sentry and PostHog and drop the DSN and project key into env.
- Point a custom domain at the Cloudflare Pages deployment.
- Verify a Resend sender domain — currently sending from `onboarding@resend.dev`, which is fine for smoke but not for real students.

## Architectural decisions made this session

- Course default landing is the Modules view, matching Canvas.
- Teachers are admins gated by a single `is_staff` flag — one privilege boundary instead of scattered role checks.
- Database vocabulary moved from `classes` to `courses` to align with the rest of the LMS surface.
- React Router added for deep-linking into modules, assignments, and portfolio items.
- Portfolio is per-course (not per-student-global) with 8 item types and inline feedback so teachers can grade in place.

## Test command

```
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
  node viewer/scripts/smoke-e2e.mjs && \
  node viewer/scripts/smoke-features.mjs
```

---

## Later waves: backend wiring audit + polish sweep

After the migration ledger landed at **37** and smoke at **14 + 91 = 105**, two follow-up rounds tightened the rough edges:

### Wiring audit (read-only, then targeted fixes)

Confirmed every backend artifact has a live client caller — **0 orphaned RPCs** across all 62 public functions; every table has a reader/writer; every edge function is invoked by pg_cron or the client. Then closed the live gaps surfaced by the audit:

- Added Supabase realtime channels to `useDiscussions`, `useTopicPosts`, `useThreads`, `useThreadMessages` — peer activity now streams without manual reload.
- Wired `WeakSkillsToggle` into `App.tsx` — was built but had zero consumers; now a third filter stage on the question bank.
- Replaced last raw `datetime-local` (`AdminInviteCodesPage`) with `SmartDatePicker`.
- Replaced last "body content" textarea (`SubmissionDetailDrawer`) with `MarkdownEditor`.
- Replaced raw file input + long-text textarea in `PortfolioSubmissionForm` with `FileDropzone` + `MarkdownEditor`.

### UX polish sweep (Wave 17)

Across **19 surfaces** added the modern feedback contract — toast on every write, skeleton on every load, EmptyState on every blank list, optimistic UI on every transient action:

| Surface | Polish |
|---|---|
| ModulesPage | 18 toast sites (create / move / duplicate / lock / delete; optimistic publish preserved) |
| CoursePortfolio | 12 toast sites |
| DuplicateCourseModal | 5 toast sites including a `warning` for partial-file failures |
| DiscussionTopicView | Optimistic reply append with author+body dedup against realtime; toast + EmptyState + Skeleton |
| CourseDiscussions | Reply counts per topic; EmptyState + Skeleton; toast |
| InboxPage / ThreadView | Optimistic send; mark-as-read-on-open; auto-scroll; EmptyState + Skeleton; toast |
| SubmissionDetailDrawer | Optimistic feedback append; toast; EmptyState; Skeleton |
| PortfolioSubmissionForm | Live URL/number/char validation; required indicator; signed-URL download for existing file; toast |
| AdminInviteCodesPage | Confirm-dialog revoke with use-count preview; click-to-copy; relative timestamps; toast + EmptyState + Skeleton |
| AddItemModal, JoinClassModal, NewThreadModal, AllUsersView, SystemStats, SkillHeatmap | Toast on every write/RPC |
| CalendarPage, ScorePrediction, SkillHeatmap, ClassRoster, CourseGradebook, AdminClassDetail | Skeleton matched to the incoming layout shape (table-row, KPI grid, chat-bubble, score-figure) |

Build remained clean (tsc 0) and smoke at **105 / 105** after every wave.

---

## Wave 19 — Short codes + UX cohesion

### Migrations

| # | Name | Purpose |
|---|------|---------|
| 0033 | (Wave 18 — migrated from island) | (backfilled from prior session) |
| 0034–0037 | (Wave 18B) | (prior polish work) |
| 0038 | course_short_codes | 6-char A-Z2-9 stable slug for course URLs. Alphabet excludes O/0/I/1/L confusables. BEFORE INSERT trigger auto-generates, UNIQUE constraint + format CHECK, backward-compatible UUID routing. |
| 0039 | assignment_short_codes | Same pattern for assignments. |
| 0040 | discussion_short_codes | Same pattern for discussion_topics. |

URLs now read `/courses/AB12CD/assignments/H7K9MN` instead of UUIDs.

### New surfaces

- **`CourseSettings.tsx`** — Dedicated settings page (split from `ClassFormModal`). Inline name rename, MarkdownEditor description, one-click Active/Archived badge (optimistic), template flag, copy-to-clipboard for join_code + short_code, danger zone with confirm-delete by typing name.
- **`ShortcutHelpOverlay.tsx`** — Global keyboard help (`?` key) mounted in StaffShell + AreaSelector.
- **`InlineCreateModuleRow` / `InlineAddItemRow` / `InlineCreateCourseRow`** — Linear-style inline create, replacing popup modals. Auto-navigate to new resource on success.

### Component upgrades

- **SmartDatePicker rewrite** — Preset chips (Today/Tomorrow/Friday/+1w/+2w/EOM) always visible; "+ Custom…" reveals raw datetime-local only when needed. Selected preset highlights indigo-600. Value pill above shows relative time.
- **Bulk-select pattern** across ModulesPage, AssignmentsPage, CourseMaterials — "Select" pill toggles checkboxes + sticky bottom action bar ("N selected — Publish all / Unpublish all / Delete").
- **EmptyState + Skeleton upgrades** — Added `framed`, `secondaryCta`, named icons. New `SkeletonCard`, `SkeletonTable({ rows, cols })`. All 19 course surfaces use matched-shape skeleton on load.
- **Persisted UI state** — Assignments filter, gradebook sort, portfolio sub-view tab, portfolio tree collapse, calendar view mode survive reload via localStorage.
- **Mobile tap targets** bumped ≥40px on 8 course surfaces under `md` breakpoint.

### Architectural fixes

- **Realtime subscriptions** added to discussion topics, posts, inbox threads, messages.
- **`useOptimistic` ref-based tracking** fixes stale-snapshot bug on rapid back-to-back toggles (announcement pin, module/item publish, assignment archive, material publish, discussion pin/lock).
- **Inline-rename handlers** throw on error so editor stays open with typed value (across 5 surfaces).
- **AssignmentFormModal** was using stale `class_id` column name — fixed to `course_id` (0012 renamed it 7 waves ago).
- **CourseDiscussions N+1 fix** — Replaced per-topic post fetch with PostgREST embedded `discussion_posts(count)` aggregation.

### Final state

- Migrations: **40** in cloud
- Smoke: **14 + 91 = 105 PASS**
- Build: tsc 0
- Dev: http://localhost:5173/

---

## Wave 20 — Tree drag-and-drop overhaul

### Problem

Module tree had 3 overlapping drop zones per row (before/into/after) — adjacent zones competed visually and the huge "into" body target swallowed sibling drops. Users couldn't tell where drops would land. Folder depth was indicated only by a slate `border-l` that disappeared into the background.

### Architectural change

One global drop indicator (page level) replacing per-zone overlays. Cursor-X-for-depth resolution determines nesting target. Reference: `viewer/src/teacher/ModulesPage.tsx` (search `DropTarget`, `resolveDropTarget`, `InsertionBar`).

```ts
type DropTarget = {
  anchorId: string;
  position: "before" | "after";
  asChild: boolean;         // nest as last child of anchor
  parentId: string | null;  // resolved parent for move RPC
  depth: number;            // visual indicator left offset
};
```

Resolver: cursor Y picks before/after; cursor X past `(depth+1) * 24px` from anchor's left edge triggers `asChild: true`. Self/descendant returns null. State mirrored to ref to avoid stale closures in hot `onDragOver` handlers.

### Visual improvements

- **Insertion bar**: 2px indigo line + glow + 10px dot at left end. `marginLeft: depth * 24px` shifts bar to indicate target depth.
- **Depth ticks**: small indigo dashes in gutter (one per nesting level).
- **Parent row highlight on nest**: `ring-2 ring-indigo-500` + `bg-indigo-50/40` when `asChild: true`.
- **Pill labels**: `↳ Nest inside [Module Name]` for nests, `↑ [Anchor Name]` for sibling drops. `max-w-[16rem] truncate` + tooltip.
- **Tree guides**: indigo-300/indigo-800 vertical line down children column + 5px elbow connectors. Replaced slate-300.
- **Triangle chevron** with `rotate-90` animation on expand.
- **Submodule + item count badges** always visible in headers.

### Edge cases handled

- Resolver returns null → indicator clears (no stuck state).
- Container `onDragLeave` clears when cursor exits tree (child-bubble guard).
- Drop tail zone after last top-level row, visible only during drag.
- `onDragEnd` always clears both `draggedId` and `dropTarget`.
- Cycle prevention: client-side preempt + server trigger (`prevent_module_cycle` in mig 0034).

### Polish round

- Auto-scroll near viewport edges (80px trigger, RAF-driven, max 18px/frame).
- Drop-landing pulse: moved row pulses `ring-2 ring-indigo-500 animate-pulse` for 1.2s.
- Drop tail in portfolio now dashed indigo with "Drop here to append at the end" text.

### Propagation

Same pattern applied to module → module DnD, item → item DnD (cross-module), portfolio template item → template item (recursive tree).

### New design principle codified

`DESIGN_PRINCIPLES.md` § 8i "Tree drag-and-drop" — every future tree surface follows this contract.

### Smoke regression coverage

26-scenario `smoke-modules.mjs` exercises: create / rename / publish-toggle / drag-into-as-child / indent / outdent / sibling reorder / duplicate / item insert / item move across modules / bulk publish / cycle prevention / bulk delete. Follow-up: `smoke-portfolio.mjs`.

### Final state

- Migrations: **41** in cloud
- Smoke: **131 / 131 PASS** (e2e + features + modules)
- Build: tsc 0
- Wave 18B short-code URLs preserved (`/courses/69WAJ3/modules`)

---

## Wave 19 — Question Bank assignment kind + cascade audit (0042–0047)

Brought Question Bank "sets" up to first-class assignments alongside SAT
mock tests, with resilient idempotent submission, autonomous failure
logging, and a recovery dashboard.

- `0042–0044` — `test_attempts` table for free-mode test persistence,
  per-question timing, in-runner highlights + sticky notes.
- `0045_qbank_assignments` — `assignments.kind IN ('mocktest','qbank_set')`
  discriminator + cross-column CHECK (`mocktest` requires `source_id`,
  `qbank_set` requires `qbank_set_uid` + `qbank_set_label`). Modules-side
  add-item form gained Practice Test + Question Set chips that insert
  the right-shaped assignment + a `module_items` row, with orphan cleanup
  if the link fails.
- `0046_qbank_resilience` — staged-submission table + `submit_qbank_attempt`
  RPC with `client_attempt_id` UUID idempotency.
- `0047_qbank_log_autonomous` — split logging off the failure path into
  `log_qbank_failure` RPC so a rolled-back transaction can't lose the
  audit row (clients call from their catch block).
- `/qbank-submissions` recovery surface lets staff retry stuck staged
  rows.

---

## Wave 20 — May-2026 full audit + 6-lane fix pass

Triggered by a 5-persona + 2-cross-cutting audit (`docs/audit/*.md` +
`docs/UX_AUDIT_2026-05_FULL.md`). Found 6 blockers and ~35 majors. Fixed
in 6 file-disjoint parallel lanes.

**Migration 0050 — security_audit_cascade**
- **B1** — `admin_delete_user` was gated on `is_staff` not `is_admin`,
  letting any teacher delete any user, including admins. Now gated on
  `is_admin`.
- **B2** — observational `BEFORE DELETE` trigger on `profiles`
  snapshots dependent-row counts (8 tables) into
  `audit_events.details.dependent_counts` before any cascade fires.
  Cascade behavior unchanged; the trail is now forensic.
- **M32** — 3 audit triggers from 0027 re-declared with
  `SET search_path = public, auth`.
- **M33** — `test_attempts.client_attempt_id` + partial unique index for
  idempotency. FK swap from `auth.users` → `profiles(id)` deferred and
  documented in-file.
- **M34** — new `smoke-cascade.mjs` (6 scenarios: bootstrap, fixture,
  archive cascade, profile-delete audit, privilege guard, idempotency)
  wired into `smoke-all.mjs` as 5th suite.

**Mock test runner — SAT-accommodation parity**
- **B3** — timer announcements moved out of visual pill into a sibling
  `sr-only role="status" aria-live="polite" aria-atomic="true"` region;
  fires at 10m / 5m / 1m / 30s / 10s threshold-cross only.
- **B4** — `AnswerChoices` rewritten as a true `role="radiogroup"` with
  `role="radio" aria-checked` items, roving tabindex, arrow-key wrap-cycle,
  explicit position-in-set ("Choice A, 1 of 4"). Existing 1/2/3/4 + A/B/C/D
  shortcuts preserved.
- **B5** — contrast swaps everywhere (`text-red-500` → `text-rose-700
  dark:text-rose-300`; `text-amber-500/600` → `text-amber-700
  dark:text-amber-300`).
- Plus: Enter advances in `TestPhase` (guarded against input focus),
  footer buttons `h-10 sm:h-9` with always-visible Submit/Next labels,
  inline mobile question palette below answer choices.

**Student shell + pedagogy**
- **B6 partial** — assignment resume MVP: detects in-progress attempts
  (`submitted_at IS NULL`) and surfaces "Resume vs Start fresh" prompt.
  Restores question pool + attemptId. Honest gap: answer-state hydration
  needs a follow-up coordinated edit in `mocktest/` (call it out in any
  follow-up PR).
- **M11** — `SkillHeatmap` cells are now `<button>` → `/practice?skill=…`;
  practice page consumes the query param.
- **M14** — "Drill your weak skills" gradient CTA on `AreaSelector` →
  `/practice?weak=1`.
- **M17** — `StudentMobileTabBar` mounted in `StudentShell` (5 tabs:
  Home / Practice / Mock / Inbox / Account); ≥56px tap targets;
  safe-area-bottom padding.
- **M18** — `AreaSelector` reorder: welcome → AssignmentsPanel → WeakSkills
  CTA → progress (heatmap+prediction) → announcements → TestsPanel →
  MyClassesPanel.
- **M21** — student `/courses/:short[/modules]` route added with new
  `StudentCourseView` (MVP read-only module/items tree with lock/icon
  rendering); `MyClassesPanel` rows clickable.
- **M22 (student-modal)** — close X on `ConfirmDialog` + `ClassFormModal`.

**TA quality**
- **M6 MVP** — `TeacherAttemptDetailView` gains grading UI: feedback via
  `MarkdownEditor` + score override + "Mark as graded" + Prev/Next student
  + J/K/↓/↑ + Cmd/S + Cmd/Enter Save & Next. **Caveat**:
  `assignment_attempts` lacks `feedback_text`/`score_override`/`graded_at`
  columns, so persistence is `localStorage` keyed by attempt_id with an
  amber banner. Follow-up migration shape documented in the file header.
- **M7** — search inputs on `ClassRoster` + `CourseGradebook` (150ms
  debounce, count chip, empty state).
- **M8** — `DiscussionTopicView` reply preserves typed draft on error
  (snapshot before optimistic clear; restore on failure).
- **M9 (partial)** — persistent pencils on `ClassRoster` +
  `DiscussionTopicView`.

**a11y primitives**
- **M27** — `KebabMenu`: `aria-haspopup="menu"`, `aria-expanded`, roving
  tabindex, Arrow/Home/End/Esc/Enter/Space wiring; disabled items skipped;
  mouse-enter syncs `activeIndex`.
- **M28** — `Toast`: errors/warnings → `role="alert"` +
  `aria-live="assertive"`; success/info → `role="status"` +
  `aria-live="polite"`.
- **M29** — `Skeleton` containers: `aria-busy="true" aria-label="Loading"`.
- **M30** — `focus-visible:ring-2` replacements on `MarkdownEditor`,
  `CommandPalette`, and `ModulesPage` inputs that stripped outlines.
- **M9 (5-file sweep)** — visible pencils on `ModulesPage`,
  `AssignmentsPage`, `CourseAnnouncements`, `CourseDiscussions`,
  `CourseMaterials` (`opacity-60 group-hover:opacity-100`, ≥40px tap).
- **M22 (teacher-modal sweep)** — close X on `EditModuleModal`,
  `AddMaterialModal`, `BulkRosterModal`, `DuplicateCourseModal`,
  `TopicFormModal`, `AddSetToCourseModal`, `AddItemModal`,
  `AssignmentFormModal`, `AddModuleModal`, `PortfolioItemFormModal`,
  `AnnouncementFormModal`, `CourseMaterials`' inline edit dialog.

**Maya power tools**
- **M5** — `StaffShell` now actually wires `useLmsCommands` into
  `CommandPalette`. 8 commands minimum, 21 when scoped to a course.
  Recents persist to `localStorage.staff.cmdpalette.recent` (cap 8).
- **M4** — `CourseGradebook` sticky first column + sticky header (per-cell
  positioning, not thead-level) + Missing/Late/Ungraded filter pills
  persisted per (user, course) + row-count chip + cells become buttons
  routing to `/inbox?compose=<student_id>` for missing-attempt nudges.

**Vocabulary canon shipped this wave** (documented in CLAUDE.md):
- `kind='mocktest'` → **"Practice Test"** everywhere
- `kind='qbank_set'` → **"Question Set"** everywhere
- `AssignmentDetailPage` badges fixed (were inverted)
- Module add-item chip + `/question-bank` tabs agree

**Parking lot (deferred to next wave)**
- M1 Dashboard cross-course "Needs attention" panel (needs RPC design)
- M2 announcement broadcast + scheduled publish (needs migration + cron)
- M3 promote Practice Test catalog to first-class on `/question-bank`
- M10 toast undo cross-cutting
- M12 mock-test history surface
- M13 multi-attempt score arc chart
- M16 student ⌘K commands
- M24/M25 parent (guardian schema + magic-link family digest)
- M26 focus-trap on remaining `role="dialog"` instances (most teacher
  modals done in Lane 5; check student modals)
- M31 `text-slate-400` body-text contrast global cleanup
- Code-quality: `CoursePortfolio.tsx` (1840L) + `AssignmentsPage.tsx`
  (888L) split
- **B6 follow-up**: hydrate MockTestApp answer state when resuming
  (Lane 2 + Lane 3 coordinated edit on `mocktest/`)
- **M6 follow-up**: ship `assignment_attempts.feedback_text /
  score_override / graded_at / grader_id` migration + flush localStorage
  drafts on teacher visit
- M33 follow-up: `test_attempts.user_id` FK swap `auth.users` →
  `profiles(id)`

### Wave 20 final state

- Migrations: **50** in cloud
- Smoke: **5 suites** wired (`smoke-all.mjs` runs e2e + features + modules
  + qbank + cascade); cascade not yet executed against cloud in this
  session
- Build: `npx tsc -b` exits 0 across all 6 lanes
- Persona reports: `docs/audit/{maya,daniel,sophia,jordan,linda,
  accessibility,data-integrity}.md`
- Roadmap: `docs/UX_AUDIT_2026-05_FULL.md` with prioritized sprint plan

---

## Wave 21 — Audit follow-throughs (parking-lot pass)

Triggered by the Wave-20 audit's parking lot. 11 file-disjoint lanes
shipped under autonomous operation. Migrations 0053 + 0054 added.

### Lane-by-lane

**B6 finish — assignment-resume answer hydration** (`mocktest/MockTestApp.tsx`
+ `student/AssignmentRunner.tsx`)
- New `resumedAnswers / resumedFlagged / resumedCurrentIndex` props on
  `MockTestApp` for future server-side hydration.
- Assignment-mode localStorage write-through keyed
  `mocktest.assignment.<attemptId>.state`; debounced on every change.
- Mount priority: caller props > localStorage draft > empty.
- `clearAssignmentDraft(attemptId)` exported for AssignmentRunner's
  Start-fresh path. Draft cleared on commit-to-submit.

**M6 — grading persistence** (migration `0056_grading_persistence.sql`
[corrected from the earlier 0053 label that landed in the parallel
agent's report — the actual on-disk number is 0056; 0053 in the cloud
ledger is a content fix] + `teacher/TeacherAttemptDetailView.tsx` +
`lib/attemptReview.ts`)
- Columns: `feedback_text`, `score_override numeric(5,2) CHECK 0..100`,
  `graded_at`, `grader_id` (FK to `profiles`, `ON DELETE SET NULL`).
- New RLS UPDATE policy `"attempts: teacher of class grades"` mirroring
  the existing teacher-read EXISTS-join. Row-level only — column-level
  restriction would need a SECURITY DEFINER RPC.
- `audit_assignment_grade()` AFTER-UPDATE trigger writes to `audit_events`
  with `action='assignment_grade'`, JSON details of what changed.
- `assignment_attempts_effective` view exposes `COALESCE(score_override,
  score_percent) AS effective_score`. Gradebook + ScoreHero migration
  flagged as follow-up.
- TeacherAttemptDetailView drains the 3 legacy localStorage keys on first
  visit per attempt (one-shot, ref-guarded), writes to DB going forward,
  optimistic + rollback on RLS error, Mark-as-graded toggle.

**M3 — Practice Tests catalog promotion** (`teacher/QuestionBankPage.tsx`
+ new `teacher/useTeacherMockTests.ts`)
- Real catalog of `kind='mocktest'` assignments across all teacher
  courses, filtered by course / source / archived.
- Per-row kebab: Open / Edit / Archive-Unarchive / Delete.
- Course-picker pre-flight before opening `AssignmentFormModal`. Modal
  unchanged — DB default `kind='mocktest'` (migration 0045) is what fires.

**M26 — focus-trap sweep** (23 dialog files, hook
`hooks/useFocusTrap.ts`)
- Trapped 23 previously-untrapped `role="dialog"` surfaces across
  teacher, student, auth, inbox, components.
- 4 documented skips: `CommandPalette` (custom trap), `DesmosCalculator`
  (intentionally non-modal floating), and 2 owned by parallel lanes.
- `[data-autofocus]` attribute used where a singular focus target makes
  sense; setTimeout-based custom focus calls run after the hook's RAF
  and override cleanly.

**M16 — student ⌘K** (new `lib/studentCommands.ts` + `auth/StudentShell.tsx`)
- 8 commands: Resume in-progress test, Practice weak skills, Take mock,
  Inbox, Calendar, Account settings, What's due soon, My courses.
- Resume-test query uses RLS-scoped `assignment_attempts` with
  `submitted_at IS NULL`; toast.info fallback when none.
- Recents persisted to `student.cmdpalette.recent` (cap 8).

**M1 — Dashboard cross-course "Needs attention"** (new
`dashboard/NeedsAttentionPanel.tsx` + `useNeedsAttention.ts` +
`DashboardPage.tsx`)
- 3 sections: To grade / Past due / New replies.
- 3 parallel queries; each section reloads independently on failure.
- Graceful fallback if `graded_at` column missing (pre-0053).
- Collapse state persisted to `dashboard.attention.collapse`.
- All-empty → renders nothing (no "all caught up" wasted card).

**M12 — mock-test history** (new `student/MockTestHistoryPage.tsx` +
route + AreaSelector CTA)
- Route `/mock-test/history` in `StudentRoutesTree`.
- Reads `test_attempts` (real schema: `score / total / seconds_taken /
  set_uid / source` — original audit brief had wrong column names;
  corrected during build).
- Inline score-arc SVG (independent of M13's component).
- Compare-2 multi-select with sticky bottom bar + inline ComparePanel.

**M13 — score arc** (new `student/ScoreArcSparkline.tsx` extending
`ScorePrediction.tsx`)
- Pure inline SVG, no chart libraries. 10-point trajectory.
- `score/total` mapped via existing `400 + ratio*100*12` formula matching
  the `predict_my_sat_score` RPC for consistency.
- Fallback from `test_attempts` to mocktest-kind `assignment_attempts`
  when free-mode is empty.
- "↑ N since diagnostic" pill (emerald) / "↓ N" (rose) / "= no change"
  (slate).

**M31 — contrast cleanup** (26 files)
- Audited 84 candidates; edited 26.
- Body text + form-helper + timestamps bumped from `text-slate-400` to
  `text-slate-500 dark:text-slate-400` (4.5:1 AA).
- Decorative cases kept: em-dashes for empty cells, drag-handle icons
  next to bright labels, modal close-button icons, disabled-state
  cursor-not-allowed states, `placeholder:text-slate-400`.

**M2 — announcement broadcast + scheduled publish** (migration
`0054_announcement_publish_at.sql` + `teacher/AnnouncementFormModal.tsx`
+ `student/useStudentAnnouncements.ts` + `teacher/CourseAnnouncements.tsx`)
- New nullable `publish_at` column + composite index `(course_id,
  publish_at)`.
- Modal prop API: `courseId: string` → `targetCourseIds: string[]` +
  optional `allowMultiCourse` + `availableCourses`. Existing single-
  course callers pass `[courseId]` unchanged.
- Multi-select picker with "Select all / Clear" + live count when
  `allowMultiCourse`.
- `SmartDatePicker` for "Publish at (optional)". Submit button label
  switches to "Schedule announcement" when set.
- Student-side `.or('publish_at.is.null,publish_at.lte.<now>')` filter
  in `useStudentAnnouncements`. Fallback documented.
- Teacher-side "Scheduled · {relative}" badge on queued rows.
- Punted: pg_cron notification fan-out at publish-time (currently
  students see scheduled posts on next page load).

**M10 — toast undo** (`components/Toast.tsx` + 6 wire-up sites)
- `ToastOptions { action?: { label, onAction }; durationMs? }` added as
  optional 3rd arg on every toast variant. Backward-compatible.
- Action toast auto-extends to 8s (vs 4s default).
- Action button: `min-h-[40px]` tap target, underlined + semibold,
  variant-tinted hover background, `focus-visible:ring-2`.
- Wired: ModulesPage module rename + item rename, DashboardPage course
  archive, AllClassesView course archive, AssignmentsPage assignment
  archive + rename. Asymmetric: only archive→active offers Undo, not
  the reverse (prevents stacking confusion).
- Rollback failures surface as `toast.error("Couldn't undo …")` with no
  recursive Undo offer.

**Forbidden-pattern batch** (3 files)
- `AddSetToCourseModal.tsx` description `<textarea>` →
  `<MarkdownEditor characterLimit={1000} />`.
- `AccountSettings.tsx` 11 inline `setNotice/setError` calls →
  `useToast` (8 state hooks removed + 6 inline alert blocks). Bonus
  success toast on data export.
- `routeViews.tsx` 2 `<CenteredMessage>Loading…</CenteredMessage>`
  replaced with route-level `AssignmentRunnerSkeleton` +
  `FullScreenSkeleton` matching incoming layouts.
- Punted: `PortfolioItemFormModal.tsx` Choices textarea is functioning
  as a multi-line tag input. Needs a new `<TagInput />` primitive in
  `@/components` — flagged as a future wave.

### Vocabulary discoveries

- `test_attempts` actual schema is `score / total / seconds_taken /
  set_uid / source` — NOT `score_percent / correct_count /
  total_questions / duration_seconds / source_id / result_detail` as
  several internal references had assumed. Multiple lanes corrected.
- `audit_events` is the project's single audit table — there is no
  separate `admin_audit_log`. Wave 20 Lane 1 and Wave 21 Lane M6 both
  write here.
- The post-0012 rename left `assignments.class_id` intact even though
  `classes` → `courses` (the column was NOT renamed to `course_id`). RLS
  policies still join via `a.class_id`. Anything new that joins
  assignments → courses must use `class_id` as the FK column name.

### Wave 21 final state

- Migrations: **56** in cloud (0051, 0054–0056 added this wave;
  0052/0053 are content fixes; 0055 = grid_numeric_grading).
- Build: `npx tsc -b` exits 0 across all 11 lanes.
- Smoke: same 5 suites; no new cloud runs in this session.
- Audit status: 6 of 6 blockers shipped (B6 = MVP), 30+ of ~35 majors
  shipped or partial. Parking-lot reduced to:
  - **M24/M25 parent magic-link + guardians schema** — deferred (design
    needs user input on JWT lifetime, parent-view scope, FERPA review).
  - **M33 follow-up** — FK swap `test_attempts.user_id` → `profiles(id)`
    (risky on live table; defer).
  - **`CoursePortfolio.tsx` (1840L) + `AssignmentsPage.tsx` (888L)
    refactors** — high-regression-risk; needs careful Lane planning.
  - **Gradebook + ScoreHero migration to `assignment_attempts_effective`
    view** — small, but cross-cuts surfaces; do as a coordinated wave.
  - **`TagInput` primitive** for `PortfolioItemFormModal` Choices.
  - **pg_cron fan-out** for scheduled-announcement publish-time
    notifications.
  - **B6 server-side per-question persistence** (vs current localStorage
    write-through) — would require a new RPC + table; defer.

---

## Wave 21B — second autonomous follow-through (Round 4, Round 5, Round 6 — 2026-06-02)

A continuation pass closing the M6/M127 loop end-to-end and shipping a
few small ergonomic wins.

### Round 4 — closing M6/M127

**M127 Gradebook + ScoreHero → effective view** (`mocktest/components/
ScoreHero.tsx` + `lib/attemptReview.ts` + `teacher/useAssignmentAttempts.ts`
+ `teacher/CourseGradebook.tsx` + `teacher/AssignmentAttemptsView.tsx` +
`student/StudentAttemptReview.tsx` + `teacher/TeacherAttemptDetailView.tsx`)
- `ScoreHero` accepts optional `scoreOverride`; headline switches to
  override + "Adjusted by teacher" pill with auto-vs-override tooltip
- `AssignmentAttemptsView` table cell shows "Adjusted" pill inline next
  to the score
- `CourseGradebook` fetches `score_override` for chosen attempts in a
  batched single-round-trip alongside the `assignment_best_attempts`
  view query; adjusted cells get an indigo corner dot + tooltip
- `lib/attemptReview.ts` exposes `effectiveScore`;
  `useAssignmentAttempts` exposes `effective_score`;
  `StudentAttemptReview` + `TeacherAttemptDetailView` both pass
  `data.scoreOverride` to ScoreHero
- Documented known limitation in code: 0020's
  `assignment_best_attempts` view orders by `score_percent` alone. An
  attempt whose effective score with override would be higher could be
  missed. → Closed in Round 5 by migration 0057.

**M128 Student attempt review feedback display** (`student/
StudentAttemptReview.tsx`)
- Indigo-bordered "Teacher feedback" card mounted above ScoreHero when
  `feedbackText && gradedAt`
- Lazy-fetches grader's `display_name` from `profiles` in a separate
  effect (guarded on `data?.graderId && data.feedbackText`)
- Renders feedback HTML via `SafeHtml`
- Caption: "Graded {timeAgo} by {graderName ?? 'your teacher'}"
- Renders nothing when feedback is null — no nag

**M129 TagInput + PortfolioItemFormModal** (new
`components/TagInput.tsx` + barrel + `teacher/PortfolioItemFormModal.tsx`)
- New TagInput primitive: Enter/Comma to commit, Backspace on empty
  deletes last, ←/→ rove into chip strip, chip Backspace removes,
  paste-with-separators splits + dedupes, duplicate-reject amber ring
  flash, optional `maxTags` / `maxTagLength` / `allowDuplicates` /
  `required`, full a11y (`role="group"` + `role="list"` + chip
  `aria-label="Remove {tag}"` + sr-only `role="status"` announcements)
- PortfolioItemFormModal Choices field swapped from raw `<textarea>` to
  `<TagInput>`; state changed from `optionsText: string` to
  `options: string[]`; init effect + buildSettings updated
- Forbidden-pattern parking lot now empty for this category

### Round 5 — backend loop-closures (Migrations 0057, 0058, 0059)

**Migration 0057 — `assignment_best_attempts` by effective_score**
- `CREATE OR REPLACE VIEW` keeping the `DISTINCT ON (assignment_id,
  student_id)` shape from 0020
- Order by `COALESCE(score_override, score_percent) DESC NULLS LAST,
  submitted_at DESC` so the teacher's override actually wins the "best"
  pick
- New `effective_score numeric(5,2)` column exposed — callers
  (CourseGradebook) can drop their second round-trip
- Backward-compat: column shape preserved

**Migration 0058 — scheduled-announcement notification fan-out**
- `course_announcements.notifications_fanout_at` nullable column
- Backfill: pre-deploy rows that are already publish_at <= now() OR
  publish_at IS NULL get their notifications_fanout_at stamped to
  `created_at` so cron doesn't reconsider them
- `fanout_due_announcements()` plpgsql function: `FOR UPDATE SKIP
  LOCKED` + `LIMIT 500` + partial index for cheap scanning
- `pg_cron` schedule `* * * * *` (every minute) jobname
  `announcement-fanout-minute`, with unschedule-guard pattern from 0031
- Existing immediate-publish trigger from 0029 gets a `WHEN publish_at
  IS NULL` guard so scheduled rows don't double-notify at INSERT time

**Migration 0059 — grade-complete notification**
- `trg_notify_on_grade` AFTER UPDATE on `assignment_attempts`
- Fires on (graded_at null→non-null) OR (feedback_text null→non-null)
  OR (score_override IS DISTINCT FROM)
- Anti-spam: null-guards mean autosave thrash on existing feedback
  doesn't fire repeatedly; only meaningful state transitions count
- `kind='assignment_grade'`, title encodes the dominant signal
  ("just_graded" > "score_changed" > "feedback_added"), link routes to
  the course-aligned assignment surface
- No CHECK constraint on `notifications.kind` to update (free-form
  text in 0029)
- Race-safe: if the parent assignment row vanishes between UPDATE and
  trigger lookup, the function returns NEW without inserting

**M133 — Student AssignmentsPanel graded indicator**
(`student/useStudentAssignments.ts` + `student/AssignmentsPanel.tsx`)
- Extended the embedded `assignment_attempts(...)` SELECT to also fetch
  `score_override, graded_at, feedback_text`
- Widened `StudentAssignmentAttempt` with three new optional fields
- Row mapper now picks the **most-recent submitted** attempt (sort by
  `submitted_at desc`) rather than `[0]`
- `buildGradingIndicator(attempt)` derives a single small pill:
  - "Feedback" (indigo) when feedback only
  - "Graded {timeAgo}" (emerald) when graded only
  - "Graded {timeAgo} · Feedback" (indigo) when both
- Pill `min-h-[24px]` inline left of the Review/Start button; row stays
  ≥40px

### Migration-ledger collision + fix

The Round 5 lanes initially landed two files at 0057
(`best_attempts_by_effective_score` and `scheduled_announcement_fanout`)
because the agents picked numbers in parallel without coordination.
Renamed in place: `scheduled_announcement_fanout` → 0058 and
`grade_complete_notification` → 0059. Header self-references updated.

Also: this session's earlier docs claimed M6 shipped as migration 0053.
The reality is 0056 (0053 in the cloud is `fix_m1q13_choice`). Corrected
in CLAUDE.md, ARCHITECTURE.md §3e, this file, and the audit doc.

### Wave 21B final state (after Rounds 4 – 14)

- Migrations: **60** in cloud
- Build: `npx tsc -b` exits 0 across all 25+ lanes this session
- Audit blocker / major closure: every originally documented item now
  either shipped, partial-MVP-shipped, or carefully deferred with
  rationale
- Code-quality refactors complete this session:
  - `AssignmentsPage.tsx`: 929 → 443 (split into AssignmentCard,
    AssignmentsToolbar, BulkActionsBar, assignmentsFilter)
  - `CoursePortfolio.tsx`: 1840 → 796 (split into PortfolioTreeView,
    PortfolioItemNode, PortfolioOverviewGrid, usePortfolioDrag);
    behavior preserved including drop-pulse, auto-scroll, dashed drop
    tail, cycle prevention, kebab Move-to fallback

### Final parking lot (true deferrals — design input or future waves)

- **M24/M25 parent magic-link + guardians schema** — design input
  needed (JWT lifetime, parent-view scope, FERPA review). The audit
  documented Linda's MVP path but the schema is non-trivial. Defer.
- **B6 server-side per-question persistence** (vs current localStorage
  write-through) — needs new RPC + table; defer until staging perf
  shows the localStorage path is genuinely insufficient.
- **Notification email/push fan-out** for `assignment_grade` and
  `announcement` kinds — currently in-app only via 0029/0058/0059.
  Email path would need Resend integration (already wired for
  reminders); push would need new infra.
- **Smoke runs against cloud** — no env in this session; the 5 suites
  in `smoke-all.mjs` should be exercised on next teacher workstation.

---

## Wave 21B continued — Rounds 8–15 (autonomous polish + feature pass)

After the core audit closure, the session continued shipping follow-throughs
that were either flagged by the re-audit or surfaced as natural extensions
of earlier work. No new migrations beyond 0060.

### Round 8 — UX polish + smoke
- Notification bell polish: per-kind icon (megaphone/envelope/speech-bubble/check-circle/clock/dot) + "Mark all read" header button + hardened `markAllRead()` (snapshot+revert error path)
- M2 broadcast Dashboard entry point: "Broadcast" button (gated on `classes.length > 1`) opens `AnnouncementFormModal` with `allowMultiCourse + availableCourses`. Closes M2 user-surface gap
- Smoke for 0056–0060: new `smoke-grading.mjs` (10 scenarios) + `smoke-announcements.mjs` (8 scenarios) + extended `smoke-cascade.mjs` with 0060 FK target verification

### Round 9 — Free-mode review surface + tightening
- New `MockTestReviewPage` at `/mock-test/history/:attemptId` reads `test_attempts` + `test_answers`, reuses `ScoreHero`, closes the Wave 21 M12 "Review coming soon" stub
- Student ⌘K stubs replaced with real query-backed resolutions
- TestsPanel grading-indicator lane closed as N/A — `test_runs.score` is purely auto-graded

### Round 10 — Staff palette + re-audit
- Staff ⌘K student/course name search via `useLmsCommands` extension — ~72 commands for a typical teacher (capped at 100)
- Wave 21 + 21B read-only re-audit found and fixed 1 forbidden-pattern violation (`FullTestApp.tsx:409` `window.confirm` → `ConfirmDialog`), with 2 false-positives dismissed; component-location convention codified in CLAUDE.md

### Round 11 — Realtime + teacher polish
- `NeedsAttentionPanel` realtime: channel `needs-attention:<teacherId>` with 2 postgres_changes listeners, 300ms debounce, reconnection-triggered full refresh, flash-fresh indigo ring on newly-arrived rows
- `TeacherAttemptDetailView` per-question time/skill: skill breakdown derived from snapshot JSONB; per-question status table; aggregate avg-time chip — both default-closed via `<details>`
- AssignmentsPage "Recently graded" filter pill (7-day window, only renders when count > 0)

### Round 12 — Inbox compose + keyboard help
- Inbox `?compose=<userId>` consumption — `useSearchParams` + ref-guarded one-shot → `open_thread_with` RPC → navigate. RPC handles existing-thread short-circuit + new-thread creation idempotently. Closes broken deep-link from gradebook + staff ⌘K
- `ShortcutHelpOverlay` refresh: 26 new entries across "Practice & mock test" + "Teacher grading" sections

### Round 13 — Student profile + smoke
- New `StudentProfilePage` at `/courses/:courseId/people/:studentId` with 3 parallel-fetched collapsible sections (Attempts, Discussion posts, Portfolio submissions). Header has Send-message button → inbox compose
- Linked from `ClassRoster` + `CourseGradebook`
- Smoke additions: `open_thread_with` idempotency + commutativity; end-to-end grade-notification anti-spam

### Round 14 — Filter + bulk grading
- NeedsAttentionPanel per-course filter chip row — renders only when ≥2 unique courses, applies to all 3 sections, persists, stale-filter guard, realtime bookkeeping survives filter switches
- `BulkGradeModal` + multi-select on `AssignmentAttemptsView` — write feedback + score override + Mark-as-graded to multiple selected attempts in one `.in('id', ids)` UPDATE. 0059 trigger fires correctly per attempt with anti-spam null-guard

### Round 15 — Student feedback visibility
- `RecentFeedbackWidget` + `useRecentFeedback` hook on student `AreaSelector` (placed between WeakSkills CTA and progress section): shows up to 5 most-recent gradings with effective_score pill + truncated feedback preview + "Graded {timeAgo} by {grader}". Renders nothing when empty (silence > nag). Batched grader-name lookup
- `/my-feedback` page + Widget "View all" link landing as Round 15 continues

### Wave 21B grand total (Rounds 4–15)

- **39+ lanes shipped** across 15 rounds; 1 lane closed as correctly N/A
- **6 migrations** (0050, 0056, 0057, 0058, 0059, 0060)
- **7 smoke suites** (~5000 lines) with 4 new scenarios this wave
- **2 major refactors** (AssignmentsPage 929→443, CoursePortfolio 1840→796)
- New surfaces: `StudentProfilePage`, `MockTestReviewPage`, `RecentFeedbackWidget`, `NeedsAttentionPanel` (realtime + per-course filter), `BulkGradeModal`, etc.
- `npx tsc -b` clean after every round

---

## Wave 21C — Autonomous 8h run (Rounds 16–26)

User went AFK with "keep going autonomously". Shipped 11 more rounds with self-critique after each, careful commits between rounds, and focused on UI/UX/workflow/aesthetics/wiring quality per user direction.

### Round 16 — Feedback templates
- `feedbackTemplates.ts` helper (localStorage, cap 25 per teacher, lastUsedAt sort)
- `BulkGradeModal` template chip row + save form + load/delete via `ConfirmDialog` (removed 2 `window.confirm` calls — forbidden pattern)
- Same primitive available to extend `TeacherAttemptDetailView` (parked)

### Round 17 — Teacher private notes
- Migration **0062** `teacher_student_notes` table (RLS scoped to author; admins can audit but not edit; audit trigger logs op + ids but NOT body for privacy)
- `useStudentNotes` hook with autosave + visually-empty-as-delete-intent
- `PrivateNotesSection` on `StudentProfilePage` between header and activity sections

### Round 18 — Library-vs-assign-time workflow audit + 4 fixes
- 2 read-only audits surfaced screenshot complaint + 4 other violations
- **Practice Test chip on Modules** refactored from authoring form → library picker (clone-on-add Path Y, mirrors Question Set)
- Question Set chip `time_limit` removed (computed from `questionCount * 0.75` rounded to 5min, ≥10min)
- `AddSetToCourseModal` `time_limit` + `max_attempts` removed (same compute; max_attempts=null)
- QuestionBankPage Practice Tests catalog: "Duplicate to course…" kebab (Option C reuse flow)

### Round 19 — Workstream B: Portfolio template import
- Migration **0063** `import_portfolio_items(source, target, item_ids[])` RPC. Recursive CTE deep-clones items + descendants. Two-pass clone with old→new id map. Stable error codes. Audit logs op + counts + ids but NOT bodies.
- `PortfolioImportModal` source-course picker + selectable item tree with auto-descendant + Select all/Clear
- Smoke wave63 7 steps: happy path 3-item clone with child rewrite assertion, outsider→not_authorized, same_template guard, empty-array→0, audit privacy check

### Round 20 — Audit log UX + Cohort summary
- AdminAuditPage action filter: free-text → grouped `<select>` with friendly labels. Registry of known DB actions. Live unknown actions auto-append to "Other".
- New `CohortSummaryWidget` on Dashboard between NeedsAttentionPanel and courses grid: per-cohort scoreboard with score color bands. Cap 12 cohorts. "Needs N" pill scrolls to triage. Collapse persists.

### Round 21 — Quality sweep (10 fixes across 9 surfaces)
- Read-only audit catalogued 30+ findings; top-10 by user-impact applied inline:
  - StudentProfilePage `toast.error` in render → `useEffect` with ref guard (was toast spam)
  - QuestionBankPage `window.location.assign` → `navigate` (no more SPA reload)
  - useCohortSummary 2-phase fetch with explicit `.in('course_id', ids)` (was 500-row RLS scans)
  - PortfolioImportModal backdrop `onClick` → `onMouseDown` (was accidental close on tree drag-release)
  - MyFeedbackPage toast title/body split
  - BulkGradeModal `plainTextLength()` for 5000-char warning (was firing on short essays due to TipTap HTML inflation)
  - AdminAuditPage uses shared `<EmptyState>`
  - QuestionBankPage `useOptimistic` 3rd-tuple setter (dropped eslint-disabled no-op effect)
  - NeedsAttentionPanel past-due rows use `initialOf(courseName)` not `⏰` emoji
  - ModulesPage hand-rolled animate-pulse → `<SkeletonRows>` in 2 places

### Round 22 — Portfolio import anchor + announcement publish-now
- Migration **0064** `import_portfolio_items` extended with optional `p_target_parent_id`. When non-NULL, validates parent belongs to target template; cloned roots get `parent_item_id` set to anchor. Backward-compat via DEFAULT NULL.
- `PortfolioImportModal` "Insert at…" picker (root or indented target items)
- `CourseAnnouncements` "Publish now" kebab on scheduled rows. UPDATE `{publish_at: now, notifications_fanout_at: null}` flips visibility + lets 0058 cron fan out. Optimistic `publishingIds` Set with rollback.

### Round 23 — Audit details smart formatter
- 10 per-action formatters on AdminAuditPage (role.change, invite.mint, course.delete, assignment.delete, material.delete, announcement.delete, profile.delete, assignment_grade, teacher_note_change, portfolio_import)
- Defensive accessors; null-fallback to raw `<pre>JSON` for unknown shapes
- `<UuidPill>` truncates to `{first8}…{last4}` with full UUID on hover
- `<RelativeTime>` uses `Intl.RelativeTimeFormat`
- Per-row "View raw JSON" toggle preserves forensic access

### Round 24 — Audit course filter + anchor smoke
- AdminAuditPage gained a course filter (2nd slot). Single chained `.or()` with 4 predicates: `and(target_kind.eq.course, target_id.eq.X)` (avoids uuid-collision false positives), `details->>course_id`, `details->>target_course_id`, `details->>source_course_id`. Persists to `localStorage.admin.audit.courseFilter`. Helper-text pill + clear button.
- Smoke wave63 +3 scenarios for 0064: anchored happy path, parent_not_in_target_template, audit row carries target_parent_id only when anchored. Cleanup ordering deletes children before anchor. Audit-row discrimination uses `target_parent_id` presence, not created_at.

### Round 25 — Notification preferences + bulk roster
- `/account/notification-preferences` page with 5 kind toggles (announcement/message/feedback/assignment_grade/reminder). localStorage opt-outs per-user. `useNotifications` filters visible rows + recomputes unread count. Cross-tab `storage` event listener keyed on prefs key.
- `ClassRoster` multi-select + bulk Remove. Master checkbox `indeterminate` via ref + `aria-checked="mixed"`. Belt-and-suspenders DELETE `.in("id", ids).eq("course_id", cls.id)`. Archive skipped — no column.

### Wave 21C grand total

- **20+ lanes shipped across 11 rounds (Rounds 16–26)**
- **3 new migrations** (0062, 0063, 0064) — all backward-compatible
- **Smoke** extended with wave63 (10 scenarios for portfolio import incl. anchor variants) + 2 more in wave-grading
- **`npx tsc -b` clean after every commit; clean working tree at every push**

### Round 26 — Course Overview landing page
- `CourseOverview` 5-card grid (Roster / Assignments / Recent activity / Average grade / Quick actions) replaces stub
- `useCourseOverview` hook: 4 parallel queries via `Promise.all`, `tokenRef` counter for stale-response races
- 30-day attempts window covers both "Recent activity" and "Average grade" cards
- Empty states with CTAs on every card

### Round 27 — Quality sweep on Rounds 22-26 (6 inline fixes)
- `CourseAnnouncements.tsx:271` — Scheduled badge palette sky → indigo (palette canon)
- `AdminAuditPage.tsx:1188` — Removed 📚 emoji from "Scoped to" chip (forbidden pattern)
- `AdminAuditPage.tsx:1260-1270` — Rose tone for destructive event badges
- `NotificationPreferencesPage.tsx:95-105` — Removed per-toggle toast.success spam
- `useNotifications.ts:131-150` — `markRead` optimistic rollback (was leaving fake-read state on silent RLS rejection — mirrors existing `markAllRead` pattern)
- `CourseOverview` recent activity rows wrapped in `<Link>` to source discussion topic (topicId was SELECTed but discarded)

### Round 28 — Score trajectory + reply deeplinks
- `StudentProfilePage` inline score-trajectory sparkline in profile header. Filters attempts with non-null `effective_score`, last 15, polyline + dots + gridlines at 0/50/100. Last segment band-colored (emerald ≥80, indigo 70-79, amber 50-69, rose <50). Empty / single-point states handled.
- `NeedsAttentionPanel` reply rows now navigate to `#post-<id>` on topic page (was just topic root)
- `DiscussionTopicView` `<article id="post-<id>">` wired on each post + `useLocation` hash-scroll effect with brief indigo ring flash. `scroll-mt-24` for sticky-header clearance.

### Round 29 — Inbox thread search
- Client-side filter input above thread list in `InboxPage`
- Filters by participant display_name (or email fallback) + last_message_snippet (HTML-stripped)
- Focus shortcut: `/` (⌘K stays owned by `CommandPalette` globally). Gated against typing-target focus.
- Esc clears + blurs; filtered-empty state distinct from "No conversations yet"
- No persistence (transient)

### Round 30 — Calendar keyboard nav + shortcuts help
- `←` / `→` prev/next month, `T` today, `M`/`L` Month/List view, `?` toggles help popover
- Gating: no modifier keys; skip if INPUT/TEXTAREA/SELECT/contenteditable focused; all matched keys `preventDefault`
- Today button memoized `todayDisabled` — disabled on list view or when already viewing current month
- Help popover: `role="dialog" aria-modal="false"` (non-blocking floating panel, not a true modal — no `useFocusTrap`). Click-outside + Esc close.
- Nav buttons bumped to min-h/w-[40px] for touch
- View-mode preservation: month nav mutates only `anchor`; localStorage view persistence intact

### Cumulative session total (Waves 21B + 21C, Rounds 4–30)

- **65+ lanes shipped across 27 rounds**
- **9 migrations** (0050, 0056, 0057, 0058, 0059, 0060, 0062, 0063, 0064) — all backward-compatible
- **7 smoke suites** (~5500 lines) with 12 new scenarios incl. 10 wave63 portfolio-import scenarios
- **30+ teacher/student/admin surfaces + primitives** shipped, refined, or polished
- **`npx tsc -b` clean after every commit; clean working tree at every push throughout**

### Wave 21D — User said "continue" (Rounds 31-36, 6 more rounds shipped)

User overrode the post-Round-30 stopping rationale. Picked up with smaller, focused lanes — paired in parallel agents per round.

### Round 31 — Gradebook CSV export + Discussion thread collapse
- `CourseGradebook` "Export CSV" button (top-right header). Headers: Student / Email / <assignment titles> / Average. Scores plain decimal-rounded (`87` or `87.5`; override annotation `87.5 (override)` keeps numeric prefix parseable). UTF-8 BOM + CRLF (Excel-friendly). Filename `gradebook-<courseShortCode>-<yyyy-mm-dd>.csv`. Iterates `searchFilteredStudents` so user filters/sort/search are respected — exported rows match exactly what's on screen.
- `DiscussionTopicView` chevron toggle on each `PostNode` with children. Click collapses descendants → "N reply/replies hidden — click to show" hint replaces children container (keyboard-accessible). `collapsedIds` Set + `onToggleCollapsed` threaded from `DiscussionTopicView → PostNode` (transient). Hash-scroll Round-28 effect: clears `collapsedIds` when hash arrives + reruns to land deeplink target. Toggle hidden while user composing reply on that post. `aria-expanded` + `aria-controls` + `aria-label="Collapse N replies"`.

### Round 32 — Modules Alt+↑/↓ reorder + Roster sort & empty state
- `ModulesPage` grip handle becomes a real `<button data-module-grip="{id}">` with `tabIndex=0` + dynamic `aria-label` ("Reorder X. Module N of total. Press Alt+Up/Down to move…"). Visual chrome unchanged. Alt+↑/↓ swaps with neighbor via same `move_module` RPC the drag handler uses. After RPC + `refresh()`, `requestAnimationFrame` re-focuses the grip by `data-module-grip` so the indigo focus ring travels with the row. New page-level `aria-live="polite"` region announces "Moved X up/down" and auto-clears after 2s. Works on nested submodules.
- `ClassRoster` sortable column headers: Name (locale-aware), Joined (`joined_at`). Active key shows indigo ▲/▼; inactive shows faint slate ↕ on hover. Toggles asc↔desc on same key, starts asc when switching. Persists per `(user, course)`: `roster.sort:${userId}:${courseId}` → `{key, dir}`. Empty-roster state via shared `<EmptyState>`: "No students yet" + primary "Copy course code" (writes `cls.short_code` to clipboard) + secondary "Import roster CSV" opening `BulkRosterModal`. Search-zero-hit state distinct.

### Round 33 — AssignmentRunner timer warnings + edit own discussion post
- Parallel wall-clock observer in `MockTestAssignmentRunner` aligned with `MockTestApp`'s internal countdown (sub-second tolerance — both start on the same React tick when stage transitions to "ready"). 5-min warning at `secondsLeft ≤ 300` (requires `totalSeconds > 330`). 1-min warning at ≤ 60 (requires `totalSeconds > 90`). Each fires exactly once per attempt via `useRef`. `toast.warning` (amber, `role="alert"`, 10s duration). Silent when `≤ 0` (auto-submit window). Untimed assignments → early-return.
- **No migration needed** for discussion edit: `discussion_posts.updated_at` (auto-managed via `trg_discussion_posts_updated` from 0025) covers the "edited" indicator; existing RLS UPDATE policy already permits author + staff. Inline indigo "Edit" button on each `PostNode` (gated on `canManage`). Esc cancels, Cmd/Ctrl+Enter saves. Optimistic update via `optimisticEdits` map; rollback on error. Edited indicator: "· edited <relativeTime>" italic slate-400 with full timestamp tooltip. Detection: `updated_at - created_at > 2000ms` (slack for INSERT-driven `set_updated_at` trigger jitter). Mutex with reply form (Edit closes any open reply form on same post).

### Round 34 — Notification bell keyboard nav + CommandPalette navigation entries
- `NotificationBell`: ↑/↓ walk highlighted index (clamped); Home/End jump; Enter activates (markRead → navigate → close); M/m marks highlighted as read without nav; A/a marks all read; Esc closes + restores focus to bell (`queueMicrotask` survives unmount). Default highlight: first unread, falls back to 0. Mouse hover syncs to keyboard cursor. Realtime list updates clamp index in range. `scrollIntoView({block:'nearest'})` on highlight change. Discoverability hint in sticky footer (sm+). Full `role=menu/menuitem` + `aria-current` a11y.
- `lmsCommands` (staff): + "Notification preferences" (top-level Navigate). New Admin group gated on `isStaff(profile?.role)`: Audit log, Admin users, Admin stats, Invite codes. Reuses existing `NavSpec` interface + `Command` group literal. Recents (`staff.cmdpalette.recent`) work automatically via `command.id`.

### Round 35 — Inbox keyboard nav + cohort drill drawer
- `InboxPage`: ↑/↓/Home/End walk `filteredThreads`; Enter opens highlighted; Esc clears keyboard cursor (doesn't fight right-pane's own Esc). Handler bound on scrollable list container (not window) — never fights TipTap composer or search input. `/` shortcut from Round 29 untouched. Default highlight matches URL `:threadId` if present, else index 0. `onMouseEnter` syncs hover ↔ keyboard cursor. Filter changes clamp index but don't yank back to first match on every keystroke. `role=listbox/option`, `aria-selected`, `tabIndex=0` container. Discoverability hint below search (sm+).
- `CohortSummaryWidget` drill drawer: new `useCohortDrill(cohort)` hook (lazy — only fires when `cohort != null`). Two-phase query: `assignments.id` for course → `assignment_attempts_effective` over 30-day window joined to profiles. Falls back to plain `assignment_attempts.score_percent` if view missing (graceful degradation). Token-ref cancellation pattern. `useCohortSummary` untouched. Right-side panel: `sm:w-[420px]` desktop, `inset-0` mobile, indigo `border-l-4` accent, `motion-safe:transition-transform`. `useFocusTrap` wired with `data-autofocus` on close button. Top-5 sort: `attempts DESC` primary, `avgEffectiveScore DESC` tiebreak. States: `SkeletonRows count=5` load, rose Retry on error, slate empty. Needs-attention callout (rose chip) when `needsAttentionCount > 0` with "View triage →" link that closes drawer + scrolls to `#needs-attention-heading` on next animation frame. Cohort card body is now `<button>` with hover-revealed "View details →" chevron; "Open modules →" footer link preserves Canvas-style jump-to-course; "Needs N" pill `e.stopPropagation()` so it still routes to triage without opening drawer.

### Round 36 — ⌘B sidebar toggle + client-side discussion unread
- `StaffShell` Linear-style desktop sidebar collapse: per-user localStorage `staff.shell.sidebarCollapsed:${userId}` hydrates async once profile loads. ⌘B / Ctrl+B window keydown toggles; `preventDefault()` so Firefox/Edge bookmarks-bar stays quiet; reuses `isEditableTarget` so it doesn't fight markdown bold / search inputs. Collapsed `lg:w-16` (icon-only), expanded `lg:w-44`. Md/sm unchanged. Toggle button `hidden lg:inline-flex` at bottom of sidebar, 40×40 tap, `aria-controls` + `aria-expanded` + label flip. Chevron rotates 180° (motion-safe). Wordmark `aria-hidden` + `lg:hidden` when collapsed. NavLinks get `title="..."` for native tooltips when icon-only. 150ms ease-out width transition.
- Discussion client-side unread (closes **LMS_ROADMAP 4.4** without migration): `DiscussionTopicView` `useEffect` on `[topic?.id, profile?.id]` writes ISO timestamp to localStorage map at `discussion.visited:${userId}`. LRU cap 200 entries (sort desc by timestamp, trim newest 200 on overflow). `CourseDiscussions`: `loadVisitedMap` helper with corruption tolerance; bulk `discussion_posts` SELECT for `max(created_at)` per topic — one round-trip regardless of topic count, piggybacks on existing reply-count effect. `UnreadState` union: `'visited-new'` (indigo dot + "· New replies since your last visit"), `'never'` (slate "Unread" pill matching existing Pinned/Locked styling), `'none'`. Activity fallback: `latestPostAt[topic.id] ?? topic.created_at` so brand-new zero-reply topics still surface "Unread" to first-time viewers. `visitedTick` state bumped on window focus + `visibilitychange` so returning from a topic re-reads localStorage and clears the indicator without hard refresh. Known false-positive: OP sees own freshly-posted reply as new until they revisit (would need `author_id != viewer` filter requiring DB-side work).

### Final autonomous-run total (Waves 21B + 21C + 21D, Rounds 4–36)

- **75+ lanes shipped across 33 rounds**
- **9 migrations** (0050, 0056, 0057, 0058, 0059, 0060, 0062, 0063, 0064) — all backward-compatible
- **7 smoke suites** (~5500 lines) with 12 new scenarios
- **35+ teacher/student/admin surfaces + primitives** shipped, refined, or polished
- **One LMS_ROADMAP item closed** (4.4 discussion read receipts — client-side substitute without DB risk)
- **`npx tsc -b` clean after every commit; clean working tree at every push throughout**
- **Parallel session ran continuously alongside** — landed `e790932` (RLS on assignment_* views) and `daf3a2d` (TimerSetup bundle split) interleaved; no merge conflicts ever (scoped `git add` per the documented memory protocol)

### Standing stopping rationale (post Round 36)

Items deferred:
- **Notification email/push fan-out** — needs Resend integration design
- **Parent magic-link** (M24/M25) — needs UX direction from user
- **Workstream C Material library** — schema changes to existing `course_materials` carry unverifiable DB risk without env
- **Round 23 scheduled-publish "Send notifications immediately" toggle** (Task #177) — touches notifications RLS delicately; 60s cron tick acceptable

### Wave 21E — User said "keep going" (Rounds 37-45)

After 2 stopping notices, user said "continue" then "keep going". Shipped 9 more rounds with a clear focus: **systematic sort + filter + persistence + keyboard nav + empty states across every major list/triage surface** so student / teacher / admin all see the same UX bar.

### Round 37 — ⌘N Quick-create + sticky AssignmentDetailPage
- New `QuickCreatePalette` (~245 lines): ⌘N centered 2×2 grid (Assignment / Announcement / Discussion / Material), ↑↓←→ navigate, recents at `staff.quickcreate.recent:${userId}`, mounted in `ClassLayoutContext.Provider` so it gets `useClassContext()` access and the listener only attaches in course routes. Activation: route-only landing (consumer pages don't read `?new=...` today — confirmed via grep — palette navigates to surface, user clicks "+ New" inline. One-line extension if any consumer later honors a flag).
- `AssignmentDetailPage` sticky header at `top-0 z-20` with `backdrop-blur-sm`, requestAnimationFrame-throttled scroll listener flips `scrolled` boolean at 80px threshold. Title shrinks `text-2xl → text-lg`. `HeaderPill` component centralizes tone palette: Status (Active emerald / Archived slate), Type (Practice Test violet / Question Set indigo per vocabulary canon), Due (relative format with Past due rose / Due in N min-hr amber / Due in N days slate-amber), Questions, Time limit. Existing kebab actions untouched.

### Round 38 — Smoke wave-post-30 (16 scenarios)
- +534 lines in `smoke-features.mjs`. `wavePost30()` between `wave63()` and `studentProfile()` in `run()`.
- A: Discussion post edit RLS — author edits own, staff edits student's, outsider denied (accepts both PostgREST denial styles), trigger re-fires on second UPDATE.
- B: `assignment_attempts_effective` view fallback — `effective_score = score_override` when set, `= score_percent` when null, outsider sees 0 rows (locks in mig 0065 `security_invoker=on` shipped by parallel session).
- C: Bulk roster `course_id` belt-and-suspenders — correct id deletes 1 row, wrong id is 0-row no-op.
- D: `updated_at` jitter — fresh INSERT Δ < 2000ms (load-bearing: confirms mig 0025 trigger is `BEFORE UPDATE` only); post-UPDATE after >2s sleep crosses threshold.
- Local fixture tracking object, try/catch per delete, service-role for teardown so RLS can't block.

### Round 39 — Student AssignmentsPanel + StudentAttemptReview filters
- `AssignmentsPanel`: 5 filter chips (`role="tablist"`) with counts: All / Past due / Due soon (≤7d) / Submitted / Graded (`graded_at && feedback_text` non-null). Submitted-precedence: submitted past-due → Submitted. Sort `<select>`: Due earliest (default), Due latest, Recently assigned, Course name. Missing `due_at` sinks via ±Infinity sentinel. Persistence `student.assignmentsPanel.view:${userId}` → `{filter, sort}`. Grouping (To do / Past due / Completed) preserved only when `sort=due_asc && filter=all`. Empty filtered state distinct from empty-zero. `aria-controls`/`aria-live` polite.
- `StudentAttemptReview`: 2 filter pills (Marked dropped — `marked` is Bluebook-runner-only, doesn't survive into attempt snapshot). "Next ▼" button: collects `!isCorrect` rows, picks first below `scrollY+80`, `scrollIntoView` smooth, wraps to first if none below. Each row `id={`q-${i}`}` + `data-question-id` + `scroll-mt-20`. Inlined `ReviewRowItem` mirrors `AnswerReview`'s visual contract while adding the DOM ids that scroll-to-next requires (lane scope was EXCLUSIVE).

### Round 40 — AdminAuditPage date range + Inbox mute
- `AdminAuditPage`: Preset chips `role=group aria-pressed`: All time / Last 24h / 7d / 30d / Custom. Custom commits on blur (no Apply button). Inverted range surfaces rose `role=alert`. `gte/lte` applied in `refresh()`. Custom-to uses literal `${date}T23:59:59.999Z` (UTC). Presets 24h/7d/30d use `Date.now()` minus millisecond delta — precise instants, not day-aligned. Persistence `admin.audit.dateRange` → `{preset, from?, to?}`. "Reset" → "Clear all filters" — resets action + course + actor + dateRange. Active-filter pill in meta strip. Removed orphaned `SmartDatePicker` import + `dayStartIso`/`dayEndIso` helpers.
- `InboxPage` mute: each `<li>` position:relative; `KebabMenu` absolutely positioned right edge layered above `NavLink` (avoids nested-interactive-elements a11y violation). Kebab always visible on mobile; hidden until `group-hover`/`focus-within` desktop. `showUnreadBadge = !isMuted && unread_count > 0` gate hides badge for muted. Muted row: `opacity-70` + inline 14×14 bell-slash SVG with `<title>Muted</title>`. Cross-tab via `storage` event keyed on `inbox.mutedThreads:${userId}`. 500-entry LRU cap. Sort + search + Round 35 keyboard nav untouched.

### Round 41 — AnnouncementForm scheduled-publish + Calendar day popover
- `AnnouncementFormModal`: 3 quick presets below SmartDatePicker in `role=group`: In 1 hour, Tomorrow 9am (always +1 calendar day), Next Monday 9am (`((1-today+7)%7)||7` so today=Monday returns FOLLOWING Monday), Clear. Presets live OUTSIDE picker (picker's built-in chips snap end-of-day). Live + on-submit validation: 30s `nowTick` heartbeat + manual bump on every `publishAt` change; rose `<p role="alert">` + Save disabled when invalid; belt-and-suspenders re-check inside `onSubmit`. "Will publish {relativeTime}" hint via `Intl.RelativeTimeFormat` with elapsed-based scale.
- `CalendarPage` month popover: `MonthCell` `hasEvents` gate. Desktop: `position=fixed` with `getBoundingClientRect()` at click time, default right of cell, flips left if `right+280>viewport-8`, vertical shifts to fit. First render hides off-screen for one tick so panel height measurement is real before committing coords. Mobile (≤640px): bottom sheet. Indigo `border-l-4` accent. State unmounts in list view; Round 30 shortcuts still attach unconditionally.

### Round 42 — Inbox pin + AdminAudit actor filter
- `InboxPage` pin: 500-entry LRU cap (`inbox.pinnedThreads:${userId}`). Kebab menu: Pin/Unpin first, then Mute/Unmute. Sort: search filter → partition by pinned. Upstream `threads` already sorted by `last_message_at` desc, so stable partition `[...pinned, ...rest]` gives pinned-by-recency-then-unpinned-by-recency for free. Divider `<li role="separator" aria-label="Pinned conversations">` (role=separator not option, so listbox indexing stays 1:1 with `filteredThreads` — Round 35 `highlightedIndex` doesn't go off-by-one). Pin + Mute orthogonal: pinned+muted shows both icons + border-l-2 indigo + opacity-70 muted body.
- `AdminAuditPage` actor filter: confirmed `audit_events.actor_id` (uuid, nullable for system events). Paired text-input typeahead + native `<select>` (not custom combobox — matches existing filter visual treatment, zero new deps, native a11y for free). Active selection preserved as leading option even when typeahead filters it out. `.eq("actor_id", actorFilter.actorId)` composes AND-wise with action/course/date. "Clear all filters" resets actorFilter too; dedicated × next to combobox clears just actor.

### Round 43 — AssignmentAttemptsView + MyClassesPanel
- `AssignmentAttemptsView`: 4 filter pills (Marked for review dropped — no flag column on `assignment_attempts`): All / Ungraded (`submitted && !graded`) / Graded / In progress (`!submitted`). Sort: Most recent (default), Oldest, Student name (locale-aware), Highest score, Lowest score (NULLs last). Score precedence: `score_override ?? score_percent`. Search box `<input type="search">` substring on `student_display_name`, ANDed with pill. Empty filtered state distinct. Bulk-select coupling: master checkbox + select-all operate on VISIBLE submitted set, not entire — toggling pills doesn't silently steamroll rows out of view.
- `MyClassesPanel`: 3-option sort `<select>`: Most recent (joined_at desc, default), Oldest joined, Course name (localeCompare base sensitivity). Hidden when empty/loading/errored. Empty state inline `<EmptyClassesState>` (no shared `<EmptyState>` primitive exists), stack-and-mortarboard glyph + dashed ring. CTA opens existing `<JoinClassModal>`; `onJoined` closes modal + `refresh()`.

### Round 44 — AllUsersView role filter + StudentCourseView stats
- `AllUsersView`: 4 role-filter pills with live counts (counts scope to current page, matching existing search). Sort drives the SERVER query (`range()` pagination) so it composes correctly across pages: Joined newest (default), Joined oldest, Name (display_name fallback email, nullsFirst=false, created_at tiebreak for stable pagination), Role (server orders by role+created_at deterministic, client-side re-sorts page via `ROLE_SORT_WEIGHT` admin→teacher→student so triage-useful order wins). Persistence `admin.users.view`. "Clear all filters" only renders when ≥1 filter active. Untouched: role-edit, delete, role-badge colors.
- `StudentCourseView`: 2 stat tiles (Weak skills dropped — SkillHeatmap data not plumbed into this view): Assignments due (count unsubmitted + future due_at), My average (avg `effective_score` from `assignment_attempts_effective` over 30d). `useEffect` on `[course?.id]` after course loads. Two parallel queries via `Promise.all`. `tokenRef` cancellation (mirrors `useCourseOverview`). Per-card states independent. "Assignments due" → ROUTES.HOME (no per-course assignments route for students); "My average" no link.

### Round 45 — MyFeedbackPage + StudentPortfolio
- `MyFeedbackPage`: 5 filter pills with counts: All / Has feedback (text non-empty trimmed) / Awaiting (no feedback AND `gradedAt` null — source universe already "submitted", so cleanly captures pre-grade rows) / High score (≥80) / Low score (<60). Sort: Most recent (default, `gradedAt` desc), Oldest first, Highest/Lowest score (nulls last), Course name (localeCompare base). Persistence `student.myFeedback.view:${userId}`. Palette: Awaiting amber, Low rose, High emerald, Has feedback indigo, All slate.
- `StudentPortfolio`: 5 status filter pills via `leafStatus(submission, due_at)`: submitted > draft > past_due > not_started precedence. Tree-prune algorithm: parents drop when 0 matching descendants → empty branches collapse; immutable spread `{...n, children: prunedChildren}`. Sort toggle Position / Due date: due_date splits parents+leaves, parents stay position-sorted (preserves hierarchy reading), leaves sort `due_at asc` nulls last. Persistence `student.portfolio.filter:${courseId}` (per-course not per-user since portfolios are per-course). Palette: Indigo (All), emerald (Submitted), amber (Draft), rose (Past due), slate (Not started).

### Wave 21F — Another "keep going" (Rounds 46-55)

User said "keep going" twice more. Shipped 10 more rounds across modals, autosave, validation, and a global keyboard-shortcuts overlay.

### Round 46 — NewThreadModal recents + AssignmentForm draft/validation
- `NewThreadModal` (~178 → ~370 lines): recents storage `inbox.recentRecipients:${userId}` max 10 most-recent-first, written after `open_thread_with` RPC resolves. Empty query: bounded `profiles` fetch (limit 50, alpha order, `neq currentUser`). Non-empty: existing 200ms debounced `ilike` on `display_name`/`email` (limit 20). Single flat `visibleList` drives keyboard nav so section headers don't break index math. Recents pruning: lookup in already-fetched alpha first; anything not found fetched in single `in(...)` query.
- `AssignmentFormModal` (632 → 940 lines): per-field pure `validateX(value)` returning `string | null` — title required+≤200, questionCount integer 5-50, timeLimit 0-300min, maxAttempts optional then 1-20, latePenaltyPercent 0-100, gracePeriodHours 0-168. `touched` Set tracks user-blurred fields; only touched surface errors. Submit gating disables Save with `aria-disabled` mirror. Draft persistence (create mode only): `teacher.assignmentForm.draft:${classId}`. 500ms debounce with `pendingDraftRef` for synchronous unmount flush. Restore banner amber `border-l-4` with relative time + Restore / Discard. Cancel-with-dirty shows inline amber confirm-cancel banner. Past-due `due_at` allowed without warning per spec ("missed it" is valid state).

### Round 47 — ThreadView jump-to-unread + SkillHeatmap domain filter
- `ThreadView`: unread = `author_id !== currentUserId AND read_by_recipient_at === null`. `unreadSnapshotRef` captures once on first non-loading messages payload for given threadId — survives the existing mark-as-read UPDATE. Floating sticky banner top-center with × dismiss + "↓ N new messages — Jump to first". `IntersectionObserver` (scroller as root, 50% threshold) auto-dismisses when first-unread enters view. "New" divider as first child of first-unread message with `role=separator`. Auto-hides 5s after entering view.
- `SkillHeatmap` (218 → 462 lines): domain pills derived dynamically from RPC's `domain` column. 5 sort options. "Weakest skill" callout computed over UNFILTERED rows (single-pass reduce). Practice link → `${ROUTES.PRACTICE}?skill=...`. Persistence `student.skillHeatmap.view:${userId}`.

### Round 48 — JoinClassModal validation + ScorePrediction delta
- `JoinClassModal`: alphabet `[A-Z2-9]` matching `short_code` generator from migrations 0038-0040 (no O/0/I/1/L confusables). `scrubCode()` on `onChange` + `onPaste`: uppercase + strip out-of-alphabet + truncate to 6. `font-mono tracking-widest text-xl`. `mapRpcError` stable code → message mapping: `invalid_join_code` / `already_joined` (with "Open class →" link defensively wired) / `rate_limited` / `not_authenticated`. `aria-invalid` toggles on error. Character counter `aria-live` polite + turns emerald when complete.
- `ScorePrediction`: replaced old "first vs last (since diagnostic)" delta with previous-vs-latest "since your last test" — true momentum signal. Three tones: emerald `↑ +N`, rose `↓ -N`, slate `— No change`. Recommendation tiers (<1000 / 1000-1299 / 1300-1499 / ≥1500) in indigo-tinted card with "Practice now" / "Run a timed practice set" CTAs linking to `ROUTES.PRACTICE`. Per-section deltas skipped — trajectory data is aggregate-only.

### Round 49 — BulkRosterModal preview + PortfolioSubmissionForm autosave
- `BulkRosterModal`: preview table # / Email (mono) / Display name / Status (text pill, not color-only). `classifyRows()` walks parsed in order with `seen` Set: invalid → duplicate → enrolled → new. New optional prop `existingEmails?: string[]` (additive, no caller breaks). Belt-and-braces: even when caller skips prop, DB-side `23505` unique-violation path still catches duplicates. Dry-run checkbox default off. During import: progress bar + spinner + live label "Importing… ({done}/{total})" with `aria-live` polite. 4 outcomes (pure success / partial / full failure / nothing-importable).
- `PortfolioSubmissionForm`: fields covered: textValue, urlValue, numberValue, dateValue, choiceValue, multiValue. File uploads EXCLUDED — browsers can't reconstruct File objects from localStorage. 1000ms `setTimeout` debounce. `pendingDraftRef` mirrors latest unflushed draft so unmount cleanup flushes synchronously. Recover banner amber `border-l-4` with relative time. `storage` event listener with 250ms `ownWriteAtRef` window filters own-write echoes. Save/Submit pause `autosaveEnabledRef` for network round-trip. Success: `clearDraft` + reset indicator. Failure: re-enable autosave, keep draft intact.

### Round 50 — StudentShell ⌘B sidebar + AccountSettings polish
- `StudentShell` (261 → 484 lines): Note that StudentShell had NO sidebar at all before — file rendered only `<Outlet/>`, floating overlays, mobile tab bar. Added desktop-only left rail with 6 student nav items (Home / Practice / Mock Test / Calendar / Inbox / Account). Persistence `student.shell.sidebarCollapsed:${userId}` with `student.*` namespace. Mobile: rail hidden — students keep existing `StudentMobileTabBar`. Wordmark `aria-hidden={collapsed}` + `lg:hidden`.
- `AccountSettings`: `evaluatePasswordStrength` heuristic — Empty / Weak (len<8) / Fair (≥8) / Good (≥10 + upper + digit) / Strong (≥12 + upper + lower + digit + symbol). 4-segment `role=progressbar` bar with dynamic `aria-label="Password strength: <Label>"`. `passwordSubmitDisabled` blocks submit when busy, level empty/weak, length<8, or confirm mismatch. Export confirmation copy via `aria-describedby="export-hint"` + post-success `lastExport` state captures filename + `Blob.size` formatted via `formatBytes`. Email change copy via `aria-describedby="email-change-hint"`. Display name validation: trimmed-non-empty + ≤100 char.

### Round 51 — Student announcements unread + materials filter/search
- `CourseAnnouncementsList`: this is the cross-course dashboard widget (10 latest across all enrolled courses) — adapted per-course storage key to user-scoped `student.announcements.lastVisit:${userId}` → ISO string. Unread: `created_at > lastVisitSnapshot`, or always when no snapshot exists. Snapshot captured once on mount into local state via `userId`-keyed ref guard so indicator doesn't flicker mid-session. Written once per mount after announcements load via `wroteForUserRef`. Indigo 2px `border-l` accent + inline 8×8 indigo SVG dot. Header counter "3 new · 10 latest" in indigo when unread > 0.
- `CourseMaterialsList`: `StudentMaterialKind` union is only `'file' | 'link'` (no 'note'). Pills: All / Links / Files with live counts. Sort: Most recent (default) / Oldest first / Title A-Z (locale-aware, `sensitivity:"base"`, `numeric:true`). Persistence `student.materialsList.view:${userId}:${courseId}`. Search NOT persisted (transient). `viewHydrated` gates initial render.

### Round 52 — NotificationPreferences preview + TopicForm draft
- `NotificationPreferencesPage` (~200 → ~330 lines): direct Supabase fetch (notifications table, 10 most recent for current `recipient_id`), NOT `useNotifications`. Rationale: that hook drops opted-out kinds via its `visible` filter — but the point of this preview is to show what user would be silencing, so it must include hidden kinds. Realtime channel keeps preview fresh. Per-row kind badge from `KIND_LABELS` lookup. `(hidden)` italic suffix when kind currently opted out. `useMemo` derives `previewRows` from `recent + prefs` so toggling immediately re-tints.
- `TopicFormModal`: mirrors Round 46 pattern smaller scope. `validateTitle` required+≤200. `validateBody` required+≤10000. Draft `teacher.topicForm.draft:${courseId}`. 500ms debounce. Restore banner amber `border-l-4`. Cancel-with-dirty shows inline amber confirm banner.

### Round 53 — AdminInviteCodes filter/sort + CourseSettings polish
- `AdminInviteCodesPage`: 4 filter buckets All / Active / Expired / Revoked via shared `classifyCode(code, now)` helper (single source of truth for counts + row rendering). Status pills: Active emerald, Expired amber (NEW — was being shown as "Active" before), Revoked rose. Sort: Most recent / Oldest first / Expires soonest (asc, NULLs last via custom comparator) / Code (A-Z localeCompare). Persistence `admin.invites.view`.
- `CourseSettings` 5 surgical polish fixes: `aria-label="Course name"` on inline rename input (visible label is sibling text); `aria-label="Copy short code"` + `aria-label="Copy join code"` on duplicate Copy buttons; sticky `descriptionDirty` flag clears on revert; delete confirmation input gets `autoFocus` + submits on Enter when name matches.

### Round 54 — GlobalShortcutsHelp dialog (StaffShell-only mount)
- New `ShortcutsHelp` component: `{ open, onClose, userRole? }`. 560px max-w / 80vh max-h panel, indigo `border-l-4` accent. `role=dialog` + `aria-modal=true` + `aria-labelledby` + `useFocusTrap` + `data-autofocus` on × button. 6 sections in `sm:grid-cols-2` grid: Global / Inside courses (staff) / Calendar / Inbox / Notifications dropdown / Modules page (staff). `<Kbd>` chips: slate ring + monospace + `min-w-[1.75rem]` + shadow inset. Role gating: staff-only sections render when `userRole` is teacher or admin.
- StaffShell mount: 1-line swap from existing `ShortcutHelpOverlay` to `ShortcutsHelp`.
- **StudentShell mount DEFERRED in Round 54** — initial agent run accidentally removed Practice + Mock Test NavLinks while wiring the `?` handler. Reverted. Followed up in Round 55.

### Round 55 — ShortcutsHelp StudentShell wiring (tight follow-up)
- Narrower agent contract that only adds the 4 hook-up lines and explicitly forbids touching NavLinks / STUDENT_TABS / icons.
- Diff: 14 insertions, 0 deletions. Both shells now wire the `?` overlay.

### Final autonomous-run total (Waves 21B + 21C + 21D + 21E + 21F, Rounds 4–55)

- **100+ lanes shipped across 52 rounds**
- **9 migrations** (0050, 0056-60, 0062-64) — all backward-compatible. (Parallel session shipped 0065 + 0067 alongside.)
- **8 smoke suites** (~6100 lines) with 28 new scenarios
- **50+ teacher/student/admin surfaces + primitives** shipped, refined, or polished
- **Every major list/triage surface has consistent sort + filter + persistence + empty states + keyboard nav** — student / teacher / admin all see the same UX bar
- **All major forms have validation + draft persistence + recover banners** (AssignmentForm, TopicForm, PortfolioSubmissionForm)
- **Discoverability**: ⌘K palette, ⌘N quick-create, ⌘B sidebar, `?` shortcuts overlay — all wired in both shells
- **One LMS_ROADMAP item closed** (4.4 discussion read receipts — client-side substitute without DB risk)
- **`npx tsc -b` clean after every commit; clean working tree at every push throughout**
- **Round 54 regression caught + cleanly recovered** in Round 55 — example of "trust but verify" agent dispatching
- **Parallel session ran continuously alongside** — landed 25+ commits (security RLS, Timer bundle split, Q-Bank nav unification, materials split, sidebar split, modularization plan, AllUsersView/AssignmentsPanel/CohortSummaryWidget/CoursePortfolio/CourseGradebook/MockTestHistoryPage/NeedsAttentionPanel/ProgressDashboard/StudentCourseView/StudentProfilePage modularization, managed_students migration 0067 + AddStudent/ResetStudentPassword modals) with zero merge conflicts

Build is green. Working tree is clean. All commits pushed to origin/main.

### Wave 21G — Another "keep going" (Rounds 56-60)

User said "keep going" twice more. 5 additional rounds, mostly form/auth polish + dashboard pin + smaller widgets. Hitting the natural end of fresh ground.

### Round 56 — ClassFormModal validation/draft + AddItemModal polish
- `ClassFormModal`: mirrors Round 46 + 52 patterns. `validateName` required+≤100 (whitespace-only treated as empty). `validateDescription` optional+≤5000. Draft `teacher.classForm.draft` (no per-X scope — single create form per teacher). Empty form clears storage immediately (no orphan empty drafts). Restore banner suppresses "Start from template?" affordance to keep focus on decision. Edit mode: all validation applies; draft persistence fully disabled via `mode !== "create"` guards.
- `AddItemModal` 3 fixes: auto-focus on open + type-change via `firstFieldRef.current.focus()` on `setTimeout(0)`. Live `submitDisabledReason: string | null` computes per-branch validity (no assignments / not picked / missing header / missing URL). Tooltip + SR hint on disabled Save via `aria-describedby` linking to visually-hidden span.

### Round 57 — BulkGradeModal polish + ComparePanel deltas
- `BulkGradeModal` 5 fixes: Cmd/Ctrl+Enter to apply (uses refs so window listener doesn't re-bind on every editor keystroke); Apply button summarizes patch ("Apply feedback + score to 12" vs just "Apply to 12") preventing "I forgot to write feedback" broadcasts; Reset button only renders when `hasChanges`; auto-clamp score on blur (250 → 100, -5 → 0); keyboard hint footer "⌘↵ to apply" only visible on `sm+`.
- `ComparePanel` Option A chosen (parent doesn't thread attempts array — adding optional `attempts`/`onPickA`/`onPickB` would require out-of-lane parent changes). Inline delta per row: Score / Correct / Duration with emerald `↑ +N` / rose `↓ -N` / slate `— No change`. Visual highlight rule on B-cell only (preserves A as baseline). Semantic markup not color-only — delta arrow + sign carry direction without color. `role="table"/"row"/"cell"`. Decorative delta badge `aria-hidden` to avoid double-announcement.

### Round 58 — DashboardPage course pin + RecentFeedbackWidget polish
- `DashboardPage` course pin: per-user localStorage `teacher.dashboard.pinnedCourses:${userId}` 50-entry LRU cap. Action in existing `<CourseCard kebab>` menu (item label flips "Pin to top" / "Unpin from top"). Sort: O(n) partition into pinned + rest, then pinned sort by index into `pinnedIds` array (MRU first). Applied independently to published + unpublished — archived pinned course still bubbles within its section. Cross-tab sync via `storage` event. Visual indicator: indigo overlay badge at `absolute left-2 top-2 z-10` over card's colour band, `pointer-events-none` so card's click target isn't shadowed.
- `RecentFeedbackWidget` 4 fixes: enriched `aria-label` (includes score, graded-at time, adapts verb "Review feedback" vs "Review score"); disabled dead rows when `assignmentId`/`attemptId` null; pluralized count badge "5 recent items" / "1 recent item"; "View all" tap target bumped to `min-h-[32px]` (still header-scaled, not promoted to 40px which would dominate). Rejected "empty state CTA" — file comment explicitly enshrines "silence > nag" as policy.

### Round 59 — PasswordResetScreen polish + AssignmentCard ARIA
- `PasswordResetScreen`: lane scope clarification — this is the post-recovery-link "set a new password" surface AuthGate mounts during `PASSWORD_RECOVERY` session, NOT the forgot-password email input (which lives in `AuthScreen.tsx`, out of lane). Live blur-gated errors via `newBlurred`/`confirmBlurred` flags. `canSubmit` gating with dynamic title tooltip swap. Confirmation state extended 900ms → 1500ms so success copy is actually readable. `friendlyError()` lowercased substring match on GoTrue messages mapping `same+password` / `rate limit` / `weak+strength` / `at least+minimum` / `network` / `session+expired`.
- `AssignmentCard` 4 fixes: `<article>` `aria-label` composed from title + status + due context with overdue prefix; description tooltip on `line-clamp-2` truncation; overdue `aria-label` on due span so AT users hear "Overdue" explicitly rather than relying on color; "View attempts" mobile tap target bumped to `min-h-[40px] md:min-h-0` (preserves desktop density, fixes mobile rule).

### Round 60 — QuickStartScreen polish + AccountUpgradeBanner snooze
- `QuickStartScreen` 5 fixes: lane note — actual file is student quick-start (anonymous sign-in → `quick_start_with_code` RPC → enrolls in course), NOT teacher onboarding as the task brief described. Live code format validation: `CODE_LENGTH=6`, `CODE_ALPHABET=/^[A-HJ-NP-Z2-9]+$/` per CLAUDE.md short_code spec. `scrubCode()` on `onChange` + `onPaste`. Live "X / 6" counter turns emerald when valid. Placeholder changed from `ABCD1234` (8 chars + contains forbidden 1) to `ABC234`. Submit gating + error code mapping additions. Success state with emerald-tinted card + spinner.
- `AccountUpgradeBanner`: dismissable with 24h snooze (`auth.upgradeBanner.dismissedUntil:${userId}` as ISO string). Per-user key. try/catch for private-mode safety. Container changed from `role=status` to `role=region aria-label="Upgrade your account"` (more appropriate for persistent landmark). Copy polish leads with benefit: "Save your progress across devices and never lose your work".

### Final autonomous-run total (Waves 21B-G, Rounds 4-60)

- **115+ lanes shipped across 57 rounds**
- **9 migrations** (0050, 0056-60, 0062-64) — all backward-compatible. (Parallel session shipped 0065 + 0067 alongside.)
- **8 smoke suites** (~6100 lines) with 28 new scenarios
- **55+ teacher/student/admin surfaces + primitives** shipped, refined, or polished
- **Every major list/triage surface** has consistent sort + filter + persistence + empty states + keyboard nav
- **All major forms** have validation + draft persistence + recover banners (Assignment / Topic / Portfolio / Class)
- **All auth flows** have live validation + friendly error mapping (JoinClass / QuickStart / PasswordReset)
- **Discoverability**: ⌘K palette, ⌘N quick-create, ⌘B sidebar, `?` shortcuts overlay — all wired in both shells
- **One LMS_ROADMAP item closed** (4.4 discussion read receipts — client-side substitute without DB risk)
- **`npx tsc -b` clean after every commit; clean working tree at every push throughout**
- **Round 54 regression caught + cleanly recovered** in Round 55 — example of "trust but verify" agent dispatching
- **Parallel session ran continuously alongside** — landed 30+ commits including the full managed-students feature (M24/M25 from the original deferred list)

Build is green. Working tree is clean. All commits pushed to origin/main.

---

## 2026-06 — Autonomous "controlled-process" test-control session

Direction: the teacher dispenses everything; students see only what's assigned/released.
All work verified against the live cloud project (Playwright + RPC) and the full
smoke suite stayed green (e2e 14 · features 127 · modules 26 · qbank 25 · cascade 7 ·
grading 12 · announcements 7).

Shipped (each its own commit):
- **Managed student logins** — teacher creates students from the roster: per-course
  code (`KQAZNP-04`) + auto password, QR sign-in deep link, bulk print sheet,
  reset-all-with-passwords. Login-by-code on AuthScreen. Read-only account settings
  for managed students.
- **Locked student portal** — no free question bank / mock test; `/test/:slug` gated
  to assigned tests; deep-linkable runner URLs (`/section/n/q/m`).
- **Full-test results gating** — students see a neutral "Test submitted" screen
  (no score/answers). Teacher reviews + releases per-student (profile panel), in bulk
  per test (catalog "Results & release"), or from a **Dashboard nudge** ("N awaiting
  release"). Student notified on release; sees released results on home.
- **Completion tracking** — per-test roster status incl. "Not started".
- **Recorded eliminations** — struck choices persisted + shown in review.
- **Section timing** — per-module elapsed/limit + "Ran over time" in the result.
- Fixes: join by short_code (not just join_code); repaired courses↔profiles FK embed
  (My Courses); Desmos calculator 2× centered + viewport-clamped.

Migrations 0067–0080 (mine; all live + verified). Server primitives:
`admin_create_student`, `admin_reset_student_password`, `release_test_results`(+ bulk
`release_test_results_for_teacher`), `list_test_runs_for_student`, `list_my_test_runs`,
`test_roster_status`, `tests_awaiting_release`; results gated on
`test_runs.results_released_at`; release fires a `test_result` notification.

### Follow-on (same session, 0081–0086)

- **One-attempt tests** with a teacher retake override (`allow_test_retake`) and
  a **reset stuck attempt** action (`reset_test_attempt`); staff preview exempt.
- **Released results** now viewable by the student at `/test/:slug` (not just the
  home panel); per-test **completion** shows taken / in-progress / not-started.
- **Section timing** surfaced in the review (`module_timing`).
- Runner study tools: **"Save & exit"**, **range-based highlighting** (exact
  selection, click-to-remove — fixed from text-match), **per-question notes**,
  and **Mark for Review** — all now **persisted with the attempt** (server-side)
  so they survive exit/resume and follow the student across devices, alongside
  draft-save hardening (flush every 3 questions + on exit).
- Edge fixes: `admin_create_student` skips taken roster codes; Esc-to-close on
  the new modals.

Full reference: **docs/CONTROLLED_TESTS.md** (surfaces, RPCs, migration ledger
0067–0086).

### Student-dashboard tidy-up (2026-06-03, controlled-access alignment)

Frontend-only; no migrations. Brought the student home in line with the
controlled-access model (students do only what the teacher assigns):

- **Removed the "Predicted SAT Score" card** (`ScorePrediction.tsx` +
  `ScoreArcSparkline.tsx` deleted, barrel export dropped). With only a couple of
  attempts it showed a noisy "Low confidence / −120 since last test" band that
  misled students. The `0024` score-prediction RPC stays in the DB for a future
  calibrated model; it's just no longer surfaced. "Your progress" now shows the
  skill-mastery panel full-width.
- **`SkillHeatmap` is now read-only insight.** Removed the "Practice this skill"
  button and the per-cell drill links — both navigated to `/practice`, which
  redirects students home (the free question bank isn't reachable), so they were
  dead affordances. Cells are static tiles; the weakest-skill callout is info only.
- **Modules: full-length tests show a "Test" tag** instead of the generic 🔗 link
  icon. They're stored as `link` items pointing at `/test/:slug`; `ModulesPage`
  detects that URL prefix and renders the tag.
- Refreshed stale docstrings (`AreaSelector`, `SkillHeatmap`) and docs
  (`LMS_FEATURES`, `USER_GUIDE`, `ARCHITECTURE` 0024 ledger entry).

## Wave 21I — Cross-codebase edge-case + race audit (2026-06-03, commit 879056e)

Four parallel read-only audits with strict file-scope partition (DB races
0050–0085; full-test runner `viewer/src/fulltest/`; auth + permissions in
`viewer/src/auth/` + RPCs; React-app-wide in `teacher/student/dashboard/
components/notifications/`). 17 actionable findings — the highest-leverage
batch shipped here.

**DB scope hardening (0090 + 0091 hotfix):**
- **0090** scoped `release_test_results`, `allow_test_retake`,
  `reset_test_attempt` to `is_teacher_of_course OR is_admin` (was
  `is_staff` — any teacher could act on any student's run).
- **0090** added grant idempotency: `allow_test_retake` now raises
  `retake_already_granted` if a grant exists newer than the student's
  latest submission (closes the "spam grants for unlimited retakes"
  hole the audit flagged).
- **0091** fixed a soundness bug in 0090's `release_test_results`: it
  used `SELECT … LIMIT 1` to find the course owning the test, which
  arbitrarily mispicked when a slug links from multiple courses (the
  common real-world case — caught only because the diagnostic
  clickthrough leaves orphan link rows from prior runs). Switched to
  EXISTS, matching the other two RPCs. **Lesson recorded in CLAUDE.md:
  `LIMIT 1` for an authorisation pick is a soundness bug; always use
  EXISTS for scope checks.**

**Client-side hardening (one commit, four files):**
- **`Toast.tsx`** — memoize `value` + per-variant `useCallback`. ~59 dep
  arrays across the app list `toast`; previously every toast invalidated
  them all, cascading re-fetches/re-subscribes. The cheapest
  high-leverage fix in the audit.
- **`AssignmentRunner.tsx`** — `isAlive()` cancellation flag threaded
  through `bootstrap` → `startNewAttempt`; gates the
  `start_assignment_attempt` RPC call so rapid assignment navigation
  no longer burns extra attempts against `max_attempts`. Stale
  `setStage(...)` from the previous assignment can't clobber the new
  one either.
- **`FullTestApp.tsx` + `api.ts`** — four runner fixes that make a real
  test survive real conditions:
  - **F1 sleep/wake**: `visibilitychange` + `pageshow` listener fires when
    the tab returns visible after >5s hidden; calls `getModule` to
    re-sync `seconds_remaining` from the server-authoritative timer.
    Sleep no longer silently auto-submits.
  - **F2 cross-device**: `loadModule`'s `merged = { ...server, ...cached }`
    flipped to drop the local cache entirely if `server` has strictly
    more answered questions than `cached`. Closes the laptop-clobbers-
    phone bug for students who switch devices mid-attempt.
  - **F3 retry recovery**: `submitModule` now treats
    `module_out_of_order` / `run_already_submitted` after retry attempt 0
    as a synthesised success. A network blip on the original submit (the
    server commits but the response is lost) used to lock the student
    out staring at a "could not submit" toast; they now advance
    correctly.
  - **F4 annotation flush**: `saveDraftRef.current()` fires before
    `doSubmitModule()` on time-up so annotation/highlight/note edits in
    the last 2.5s aren't lost (submit RPC doesn't carry annot payload).

**Findings deferred to follow-up wave** (real but lower-priority):
`PrivateNotesSection` unmount-doesn't-flush; `useNotifications` no mount
guard; `AssignmentDetailPage` / `useTopicPosts` / `useNeedsAttention` no
cancellation; `DiscussionTopicView` optimistic-post-never-cleared;
`CourseSettings` archive-toggle no `disabled={busy}`; `ModulesPage`
InlineRename closes-before-save. All 7 captured in the audit transcript;
none break correctness, all degrade UX edge cases.

**Findings dismissed as false positives**: agent over-flagged the timer
interval recreation (cosmetic, sub-ms re-attach), the `submittingRef`
double-submit race (single-threaded JS makes it safe), the deep-link
`openedPathRef` persistence (by design), and the `admin_create_student`
cross-course collision (impossible: roster_codes are constructed from
globally-unique `short_code`s, and the course is FOR UPDATE-locked).

**Verification harnesses (new, `viewer/scripts/`):**
- `clickthrough-practice-test.mjs` — drives the full DSAT-Nov-2023 as a
  fresh disposable student against Supabase Cloud. Provisions a teacher,
  course, module, and `module_items` link to `/test/<slug>`, plus
  enrolment (required so the new course-scope check on 0090 RPCs
  passes). Walks all 4 modules with save/resume/submit; verifies
  results gating (locked → released), eliminations round-trip, the
  one-attempt lock, and the retake grant. 41 assertions.
- `clickthrough-practice-test-edges.mjs` — negative paths:
  `module_out_of_order`, `run_already_submitted`, `run_not_found`,
  double-submit, post-submit writes. 10 assertions.

Both green post-batch.

**Sizing**: 7 files changed, 852 insertions, 22 deletions. tsc clean,
remote DB has 0091 applied, harness 51/51.

## Wave 21J — Deferred-finding sweep (2026-06-03, commit 6a138dd)

Client-only follow-up that closed the 8 lower-priority findings the 21I
batch parked. No new migrations; no public API changes; no shared helper
introduced (CLAUDE.md "no scope creep" rule — every cancellation guard is
a local `aliveRef`, identical to the AssignmentRunner pattern landed in
21I Lane B).

Four parallel file-disjoint lanes.

**Lane E — flush + optimistic cleanup**
- `viewer/src/teacher/PrivateNotesSection.tsx` — the unmount cleanup now
  fires `void persist(bodyHtml)` before clearing the debounce timer when
  the body differs from `lastSavedRef.current`. Matches the
  `pendingDraftRef synchronous unmount flush` pattern CLAUDE.md mandates.
  Closes the "teacher closes the student profile modal mid-debounce →
  last 2s of typed note silently dropped" hole.
- `viewer/src/teacher/DiscussionTopicView.tsx` — `handleSubmitReply`'s
  `void refresh().then(...)` switched to `.finally(...)` so the optimistic
  placeholder clears whether refresh resolved or rejected (the insert
  already landed server-side — the ghost should disappear either way).
  Added a `mountedRef` to silence the dead-component setState warning if
  the teacher closes the topic before refresh resolves.

**Lane F — three hooks, same race shape**
All three hooks: (a) post-await `setState` was unguarded so stale results
landed after unmount or sign-out→sign-in-as-other; (b) the realtime
channel subscribe effect listed the recreated `refresh*` callback in its
deps, so any callback identity flip tore down + recreated the channel,
opening a temporary subscription gap.

- `viewer/src/notifications/useNotifications.ts` — added module-level
  `aliveRef`. `fetchNotifications` guards every `setNotifications` on
  `aliveRef.current`; previously-silent RLS rejects (`setNotifications([])`)
  now `console.warn` + `toast.error("Couldn't load notifications")`.
  Realtime callback switched to `fetchNotificationsRef.current(userId)`;
  channel dep array reduced to stable values.
- `viewer/src/teacher/useTopicPosts.ts` — `aliveRef` + post-await guards
  in `refresh` (topic fetch and posts fetch separately, since both
  awaits can land after unmount). Realtime callback now reads
  `refreshRef.current()`; effect deps reduced to `[topicUuid]`.
- `viewer/src/dashboard/useNeedsAttention.ts` — same pattern applied
  three times (`refreshToGrade`, `refreshPastDue`, `refreshReplies`).
  Three refs (`refreshToGradeRef`, `refreshRepliesRef`, `refreshAllRef`)
  unblock the realtime effect's deps from `[teacherId, refreshToGrade,
  refreshReplies, refreshAll]` to just `[teacherId]`.

**Lane G — AssignmentDetailPage cancellation**
- `viewer/src/teacher/AssignmentDetailPage.tsx` — `refresh()` gained an
  optional `isAlive: () => boolean = () => true` predicate parameter
  (default preserves the existing call site at line 665). Six guards
  inside check `isAlive()` after every `await` and before every
  `setState`/`setLoading`/`setError`/`finally` branch. The mount effect
  declares `let alive = true`, passes `() => alive`, and flips the flag
  in cleanup. Fixes the "rapid back-forward between assignments shows a
  flash of the previous one" race.

**Lane H — CRUD double-click + InlineRename divergence**
- `viewer/src/teacher/CourseSettings.tsx` — archive + template toggles
  wrapped in `useTransition`. `disabled={archiveToggling}` and
  `disabled={templateToggling}` on both controls; disabled styles
  applied. Rare-but-real race where rapid double-clicks fired two
  `courses` UPDATEs and the slower-commit-first ordering rolled back to
  the wrong state — closed.
- `viewer/src/teacher/ModulesPage.tsx` — `InlineRename.commit` rewritten
  to mirror `AssignmentCard.tsx:104-119`: short-circuit closes editor on
  empty/unchanged; otherwise `try { await onSave(trimmed); setEditing(false); }
  catch { /* keep editing */ }`. The two InlineRename implementations no
  longer diverge — promoting one to `components/` is left for a future
  consolidation pass.

**Sizing**: 8 files changed, 170 insertions, 32 deletions. tsc clean.
Parallel session in this window also added migration 0092
(`fix_profiles_own_update_recursion`) — not part of this batch, left
untouched.

**Audit-batch grand total (Waves 21I + 21J)**: 16 actionable fixes
shipped — 2 migrations (0090 course-scope, 0091 EXISTS hotfix), 12
client files (Toast, AssignmentRunner, FullTestApp, fulltest api,
PrivateNotesSection, DiscussionTopicView, useNotifications,
useTopicPosts, useNeedsAttention, AssignmentDetailPage, CourseSettings,
ModulesPage), 2 verification harnesses. Every audit finding either
closed or explicitly dismissed as false positive.
