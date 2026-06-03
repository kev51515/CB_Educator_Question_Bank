# Controlled tests & teacher-managed students

The 2026-06 build turned the SAT-prep LMS into a **controlled-process** product:
the teacher creates student logins, assigns work, and dispenses test results —
students only ever see what they've been given. This doc is the reference for
that system (surfaces, data model, RPCs, migrations 0067–0086).

---

## 1. Teacher-managed student logins

Teachers create students directly from a course roster (`/courses/:id/people`)
— no email, no self-signup.

- **Add student** → `admin_create_student(course, name, password)` mints an
  `auth.users` row (synthetic email `<code>@students.local`, bcrypt password)
  + a per-course code `roster_code` like `KQAZNP-04`. The student signs in with
  that **code + password** (the sign-in screen maps the code → synthetic email).
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

(0069 = parallel session's announcement fanout, not part of this build.)

## 6. Verification

Every change verified against the live cloud (Playwright + RPC) with the full
smoke suite green (`cd viewer && npm run smoke`). Teacher creds for manual
testing: `demo-teacher@example.com` / `demoteacher123`. The `KQAZNP` course has
`dsat-nov-2023` assigned (use it for guard-passing student tests).
