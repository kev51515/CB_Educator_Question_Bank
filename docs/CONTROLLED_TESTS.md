# Controlled tests & teacher-managed students

The 2026-06 build turned the SAT-prep LMS into a **controlled-process** product:
the teacher creates student logins, assigns work, and dispenses test results —
students only ever see what they've been given. This doc is the reference for
that system (surfaces, data model, RPCs, migrations 0067–0091, plus proctoring
0108–0109).

---

## 1. Teacher-managed student logins

Teachers create students directly from a course roster (`/courses/:id/people`)
— no email, no self-signup.

- **Add student** → `admin_create_student(course, name, password)` mints an
  `auth.users` row (synthetic email `<code>@students.local`, bcrypt password)
  + a bare, non-guessable code mirrored into `roster_code` like `CWXKHR`
  (6 distinct letters from the confusable-free set A–Z minus I/L/O/Q). The
  student signs in with that **code + password** (the sign-in screen maps the
  code → synthetic email).
  Returns the code + password to hand out (shown once).
  - Codes skip already-taken values, so removing then re-adding a student never
    collides on the freed code/email (0084/0085).
- **QR + bulk** — each created/reset student gets a scan-to-prefill login QR;
  the roster has **Print logins** (class sheet + CSV) and **Reset all & print
  with passwords**. Per-student **Reset password** is on the profile.
- **Account page** is read-only for managed students (shows their login code +
  "your teacher manages your password") — no email/password self-service.

Profile carries `managed` + `login_code` (0067); `useProfile` exposes them.

## 2. Locked student portal

Students see ONLY assigned work — no free question bank / free mock test:
- `/practice`, `/mock-test*` redirect home; the student home (`AreaSelector`)
  drops the free tiles; sidebar/⌘K drop free-practice entries.
- `/test/:slug` is gated by `StudentTestRunGuard` (the test must be linked in a
  Module of one of their courses). Join works with the **short_code** OR
  join_code (0070).

## 3. Full-length tests — the dispense loop

1. **Take (locked).** One attempt per student (`start_test` returns the existing
   submitted run instead of a fresh one — 0081); staff preview is exempt (0082).
   A teacher can grant a retake via `allow_test_retake` (0081) — valid only until
   the next submission. A stuck in-progress attempt can be cleared with
   `reset_test_attempt` (0083).
2. **End of test.** Students see a neutral "Test submitted" screen — **no score,
   no answers** — until results are released. `get_test_result` is server-gated
   on `test_runs.results_released_at` (0072): staff read any submitted run; the
   owner reads only once released.
3. **Review & release (teacher).**
   - Per student: the profile **Full-length tests** panel (0074) — Review +
     Release toggle + Allow retake.
   - Per test, whole class: Full-Test catalog → **Results & release** modal
     (`test_roster_status` shows taken / in-progress / not-started; bulk
     `release_test_results_for_teacher`) — 0076/0078/0083.
   - **Dashboard nudge** "N awaiting release" → opens the same modal (0079).
   - Release fires a `test_result` notification to the student (0077).
4. **Student sees released results** on the home **Your test results** panel
   (`list_my_test_runs`, 0075) and at `/test/:slug` once released (0083). The
   review shows scaled score, per-question correctness, **eliminated choices**
   (0073) and **per-section timing** (0080).

## 4. Runner (Bluebook-style) — `FullTestApp` / `QuestionPane`

- Fullscreen takeover **outside the shell** (no left rail). Deep-linkable URLs:
  `/test/:slug/section/:pos/q/:n`, `/break`, `/done`.
- **Tools, all persisted with the attempt** (survive exit/resume + cross-device):
  - **Answers** + **eliminations** (strikethrough) — graded.
  - **Highlights** — RANGE-based (only the exact selection; click to remove),
    NOT text-match.
  - **Notes** — per question.
  - **Mark for Review**.
- **Save cadence**: per-keystroke localStorage cache + 2.5s debounced autosave +
  flush every 3 question navigations + flush on **Save & exit**. Server-side via
  `save_test_progress(p_answers, p_eliminated, p_annot)`; resume hydrates from
  `get_test_module` (`saved_answers/eliminations/marks/highlights/notes`), local
  cache winning where present (0073/0086).
- Desmos calculator (math modules) opens 2× centered, viewport-clamped. Timer is
  server-authoritative — leaving via Save & exit does NOT pause it.

## 4a. Proctoring (0108–0109)

Per-test integrity monitoring. See `docs/PROCTORING.md` for the full design.

- **Level (per test).** `tests.proctoring_level` ∈ `off` / `soft` / `strict`, set
  by `set_test_proctoring_level(slug, level)` (teacher/admin, audited).
- **Event log.** `test_run_events` — one row per signal. Owner-read RLS, **writes
  only via RPC** (no client INSERT grant) so the log is forgery-proof. Hot
  aggregates are denormalized onto `test_runs`: `away_count`,
  `away_total_seconds`, `focus_loss_count`/`focus_loss_seconds`, and an
  `integrity` jsonb roll-up.
- **Logger** `test_log_proctor_event(run, type, [duration], [module], [question])`
  — best-effort, **never throws** (a failed log must not break the runner).
- **Reader** `get_test_run_timeline(run)` — owner OR teacher (via
  `is_teacher_of_test`).
- **Signals.** Duration-tracked tab-away, second-monitor focus loss (blur/focus,
  de-duped against away), copy/paste, fullscreen exit. **Strict** mode also
  enforces fullscreen + blocks copy/paste — and **fails open on iPhone** (no
  fullscreen API) so students aren't locked out.
- **Teacher surfaces.** Live monitor (`test_live_progress` now returns `flagged`
  + `flag_reasons`; flagged students sort to the top) and post-test review, both
  rendering the shared `ProctorTimeline` component.
- **Phase 3 (Safe Exam Browser)** is design-only for now — see
  `docs/PROCTORING.md`.

## 4b. Exporting a test for another LMS (Canvas QTI)

`viewer/scripts/export-test-qti.mjs` packages a full test as a **QTI 1.2**
content package that imports straight into **Canvas LMS** (Settings → Import
Course Content → "QTI .zip file") and, since QTI 1.2 is the cross-LMS standard,
also into Blackboard / Moodle / Brightspace / Schoology.

- **Why a script (not a UI surface).** `test_questions` holds the stem AND the
  answer key and is deliberately NOT student-selectable (0048). The exporter
  runs with the **service-role key** (RLS-bypassing) so it can read both, then
  emits a self-contained zip a teacher can hand to another teacher.
- **Run** (from `viewer/`, reads creds from root `../.env`):
  ```bash
  node --env-file-if-exists=../.env scripts/export-test-qti.mjs --slug=dsat-nov-2023
  node --env-file-if-exists=../.env scripts/export-test-qti.mjs --single      # one combined quiz
  node --env-file-if-exists=../.env scripts/export-test-qti.mjs --out=/tmp/x.zip
  ```
  It reads live from the remote DB, so **re-run it after any answer-key edit**
  (e.g. migration 0110) to regenerate a corrected package.
- **Output:** `<slug>-canvas-qti.zip` at repo root — `imsmanifest.xml`, a
  `README.txt` (import steps + grid-in caveat), one QTI assessment + Canvas
  `assessment_meta.xml` **per module** (default; `--single` merges them), and
  bundled figure PNGs referenced via the Canvas `$IMS-CC-FILEBASE$` token so
  images survive import with no manual re-upload.
- **Question-type mapping:** `mcq` → `multiple_choice_question` (correct
  `correct_answer` flagged); `grid` → `short_answer_question` (the `accepted`
  array becomes the OR of correct text forms, preserving `45/8` alongside
  `5.625`). Per-module time limits carry into each quiz's settings.
- **Grid-in caveat:** Canvas fill-in-blank matches accepted forms as **exact
  text** (case-insensitive) — review grid-in keys after import and add forms as
  needed (the `README.txt` in the zip says the same).
- **Not committed:** the `*-canvas-qti.zip` artifact is gitignored (regenerate
  on demand); the script itself is the versioned source of truth.

## 5. Migration ledger (this build)

| # | Purpose |
|---|---|
| 0067 | managed students: `login_code`/`managed`, `roster_code`/`roster_seq`; `admin_create_student`, `admin_reset_student_password` |
| 0068 | restore `is_teacher_of_class` shim (0063 portfolio RPC referenced the pre-0012 name) |
| 0070 | join by short_code OR join_code |
| 0071 | rename `classes_teacher_id_fkey` → `courses_teacher_id_fkey` (My Courses embed) |
| 0072 | results gate: `results_released_at`, `get_test_result` gate, `release_test_results` |
| 0073 | record eliminated choices (`save`/`submit`/`get_test_module`/`get_test_result`) |
| 0074 | `list_test_runs_for_student` |
| 0075 | `list_my_test_runs` (student) |
| 0076 | `list_test_completion` + bulk `release_test_results_for_teacher` |
| 0077 | `test_result` notification on release (trigger) |
| 0078 | `test_roster_status` (assigned roster incl. not-started) |
| 0079 | `tests_awaiting_release` (dashboard nudge) |
| 0080 | `get_test_result` returns `module_timing` (section timing) |
| 0081 | one-attempt tests; `test_retake_grants` + `allow_test_retake` |
| 0082 | exempt staff from one-attempt (preview) |
| 0083 | `start_test` returns `results_released`; `reset_test_attempt`; `test_roster_status.has_in_progress` |
| 0084/0085 | `admin_create_student` skips taken roster codes (col-qualify fix) |
| 0086 | persist marks/highlights/notes (`save_test_progress.p_annot`, `get_test_module.saved_*`) |
| 0090 | course-scope `release_test_results` / `allow_test_retake` / `reset_test_attempt` (was `is_staff`-only); `allow_test_retake` idempotency (`retake_already_granted`) |
| 0091 | hotfix to 0090: `release_test_results` scope check switched from `SELECT … LIMIT 1` to EXISTS (multi-course test links) |
| 0108 | proctoring data model: `tests.proctoring_level` + `set_test_proctoring_level`; `test_run_events` log (owner-read RLS, RPC-only writes); denormalized aggregates on `test_runs` (`away_*`, `focus_loss_*`, `integrity` jsonb) |
| 0109 | proctoring RPCs + surfaces: `test_log_proctor_event` (best-effort), `get_test_run_timeline` (owner OR teacher); `test_live_progress` returns `flagged`/`flag_reasons` |

(0069 = parallel session's announcement fanout, not part of this build.
 0087/0088/0089 = live proctoring / per-student report / one-click assign,
 logged in `docs/MIGRATIONS.md`. Proctoring (0108–0109) is detailed in §4a and
 `docs/PROCTORING.md`.)

## 6. Verification

Every change verified against the live cloud (Playwright + RPC) with the full
smoke suite green (`cd viewer && npm run smoke`). Teacher creds for manual
testing: `demo-teacher@example.com` / `demoteacher123`. The `KQAZNP` course has
`dsat-nov-2023` assigned (use it for guard-passing student tests).
