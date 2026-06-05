# Migration ledger

The authoritative, human-readable index of every SQL migration in
`supabase/migrations/`. **Update this file in the same commit as any new
migration** — one row per file. It exists because migrations are forward-only
and the CLI keys them by numeric prefix, so a lost or duplicated number is a
silent, hard-to-diagnose bug (see the 0086 collision, June 2026).

## How migrations work here

- **Forward-only.** No rollbacks. A mistake is fixed by a *new* migration.
- **Versioning is the numeric prefix** (`0086`), not the whole filename. The
  Supabase CLI records `0086` in `supabase_migrations.schema_migrations` and
  will mark a version applied after the **first** file with that prefix — any
  second `0086_*.sql` then **silently never runs**. Never reuse a number.
- **Apply:** `cd viewer && npm run db:push` (reads `SUPABASE_DB_PASSWORD` from
  the gitignored root `.env`).
- **Verify state:** `supabase migration list -p "$SUPABASE_DB_PASSWORD"` — every
  row must read `NNNN | NNNN` (Local == Remote). A `NNNN | (blank)` row is a
  local-only phantom that never applied (usually a number collision).
- **Smoke after every backend change:** `cd viewer && npm run smoke`.

## Recurring gotchas (learned the hard way)

- **Number collisions silently skip a migration.** Two `0086_*` files → the
  second never applied; `release_test_results`/`allow_test_retake`/
  `reset_test_attempt` stayed `is_staff`-gated instead of course-scoped. Fixed
  by renumbering to `0090`. Always check `migration list` after a push.
- **`CREATE OR REPLACE VIEW` can only append columns**, never insert/reorder.
  0057 failed `42P16` by adding `effective_score` mid-list; fix was to move it
  last (else `DROP`+`CREATE`).
- **Trigger functions that INSERT into another table must be `SECURITY DEFINER`
  with `SET search_path = public, auth`** or RLS silently blocks the insert
  (0028 fixed 0022's audit trigger this way).
- **Never inline `EXISTS (SELECT 1 FROM profiles …)` in a WITH CHECK** — the
  RLS-recursion bug bit 0008 and 0013. Use a SECURITY DEFINER helper.
- **`RETURNS TABLE` / defaulted-arg signature changes need `DROP` then
  `CREATE`** (PostgREST overload ambiguity, 0064).

## Ledger

> Remote state verified 2026‑06‑03: migrations **0001–0091 all live**
> (`migration list` Local == Remote for every row; full smoke green;
> end-to-end student clickthrough 41/41 + edge harness 10/10).

| #    | File | Summary |
|------|------|---------|
| 0001 | `init` | Foundation schema — identity, class structure, RLS, helper fns. |
| 0002 | `join_class_rpc` | `join_class_by_code` RPC; all enrollments must flow through it. |
| 0003 | `quick_start_rpc` | `quick_start_with_code` — frictionless "I have a test code" entry. |
| 0004 | `assignments` | `assignments` + `assignment_attempts` — the core LMS loop. |
| 0005 | `teacher_invites` | Teacher invite codes + redemption ledger; bootstrap-first-admin RPC. |
| 0006 | `admin_rpcs` | `set_user_role`, `admin_delete_user`, `admin_dashboard_stats`. |
| 0007 | `teacher_workflows` | `regenerate_class_join_code` (server-side collision retry). |
| 0008 | `fix_classes_insert_recursion` | Fix RLS infinite-recursion on class INSERT (smoke-caught). |
| 0009 | `is_staff` | Collapse admin/teacher boundary into one `is_staff(uid)` helper. |
| 0010 | `cross_staff_writes` | Cross-staff write parity. |
| 0011 | `modules` | Canvas-style Modules: `course_modules` + `module_items`. |
| 0012 | `rename_courses` | Rename `classes`→`courses`, `class_memberships`→`course_memberships`. |
| 0013 | `refix_courses_insert_recursion` | Re-fix the INSERT-policy recursion regression from the rename. |
| 0014 | `attempt_snapshot` | Snapshot the exact question pool a student saw (trust gap). |
| 0015 | `announcements` | `course_announcements` — teacher posts students see on landing. |
| 0016 | `materials` | Course materials: private Storage bucket + metadata rows. |
| 0017 | `portfolio` | Per-course college-app portfolio template + private submissions. |
| 0018 | `course_clone` | Course duplication + `is_template` flag. |
| 0019 | `smoke_fixes` | Three bug fixes surfaced by `smoke-features.mjs`. |
| 0020 | `multi_attempts` | Multiple attempts per assignment + `assignment_best_attempts` view. |
| 0021 | `rate_limit` | Per-user rate limiting for high-traffic RPCs. |
| 0022 | `audit_log` | System-wide `audit_events` (role changes, invites, deletes). |
| 0023 | `gdpr_dedup` | GDPR de-duplication / cleanup. |
| 0024 | `mastery_predictions` | Per-skill mastery tracking + simple SAT score-prediction RPC. |
| 0025 | `discussions` | Per-course discussion topics + posts. |
| 0026 | `inbox` | Direct messages (inbox). |
| 0027 | `audit_more` | Additional audit-event coverage. |
| 0028 | `helper_cleanup` | SECURITY DEFINER on 0022's audit trigger; `is_student_in_course` alias. |
| 0029 | `notifications` | Notifications table + fan-out plumbing. |
| 0030 | `fix_thread_bump` | Fix message-insert trigger thread-bump (smoke-caught). |
| 0031 | `cron_schedules` | pg_cron + pg_net schedules for the two edge functions. |
| 0032 | `anon_profile_trigger` | Fix anonymous sign-in failing in `handle_new_auth_user`. |
| 0033 | `modules_v2` | Canvas Modules UX: lock_at, completion tracking, 4 RPCs. |
| 0034 | `modules_tree` | Promote `course_modules` to a per-course tree (`parent_module_id`). |
| 0035 | `portfolio_tree` | Promote `portfolio_items` to a per-template tree. |
| 0036 | `tree_clone_fixes` | Deferrable unique slots; recursive duplicate_module / clone_course. |
| 0037 | `sat_scoring_v2` | Calibrated logistic raw→scaled score predictor (replaces linear). |
| 0038 | `course_short_codes` | Stable 6-char `short_code` on `courses`. |
| 0039 | `assignment_short_codes` | `short_code` on `assignments`. |
| 0040 | `discussion_short_codes` | `short_code` on `discussion_topics`. |
| 0041 | `short_code_alphabet_check` | Format CHECK on the short-code alphabet (no O/0/I/1/L). |
| 0042 | `test_attempts` | Persistence backend for the Question Bank test runner. |
| 0043 | `test_answer_timing` | Per-question pacing analytics + JSONB draft bag. |
| 0044 | `highlights_notes` | Per-question highlights + notes on submitted attempts. |
| 0045 | `qbank_assignments` | Question-bank-set assignment kind. |
| 0046 | `qbank_resilience` | Question-bank runner resilience fixes. |
| 0047 | `qbank_log_autonomous` | Autonomous-run logging for the qbank. |
| 0048 | `full_tests` | Full-length proctored tests: `tests`, `test_questions`, `test_runs`. |
| 0049 | `seed_dsat_nov_2023` | Seed the Nov-2023 Digital SAT form. |
| 0050 | `security_audit_cascade` | Wave 19 security + audit + idempotency hardening (B1+B2). |
| 0051 | `full_test_hardening` | `submit_test_module` + module-timing record + hardening. |
| 0052 | `fix_m3q16_typo` | Content fix: M3 Q16 typo. |
| 0053 | `fix_m1q13_choice` | Content fix: M1 Q13 choice. |
| 0054 | `announcement_publish_at` | Scheduled-publish (`publish_at`) for announcements. |
| 0055 | `grid_numeric_grading` | Grid-in numeric grading. |
| 0056 | `grading_persistence` | M6 grading columns + RLS + audit + `assignment_attempts_effective` view. |
| 0057 | `best_attempts_by_effective_score` | `assignment_best_attempts` picks by effective_score (+column). |
| 0058 | `scheduled_announcement_fanout` | pg_cron fan-out of scheduled-announcement notifications. |
| 0059 | `grade_complete_notification` | Notify student on grade/feedback complete (anti-spam guards). |
| 0060 | `test_attempts_fk_profiles` | Swap `test_attempts.user_id` FK `auth.users`→`profiles`. |
| 0061 | `start_test_answered_count` | `start_test` returns `answered` so intro reads "Resume". |
| 0062 | `teacher_student_notes` | Teacher-private per-student notes (author-only; body excluded from audit). |
| 0063 | `portfolio_import` | `import_portfolio_items` cross-course deep-clone of template items. |
| 0064 | `portfolio_import_anchor` | Optional `p_target_parent_id` to import under an existing item. |
| 0065 | `views_security_invoker` | Mark views `security_invoker` so RLS applies to the caller. |
| 0066 | `start_test_race_safe` | Race-safe `start_test` (concurrent-open guard). |
| 0067 | `managed_students` | Teacher-managed student accounts + per-course recognition codes. |
| 0068 | `is_teacher_of_class_shim` | Compat shim: `is_teacher_of_class` → `is_teacher_of_course`. |
| 0069 | `fanout_announcement_now` | "Publish now & notify immediately" per-row fan-out RPC. |
| 0070 | `join_by_short_code` | Students join with course `short_code` OR `join_code`. |
| 0071 | `rename_courses_teacher_fk` | Rename `courses.teacher_id` FK constraint post-rename. |
| 0072 | `gate_test_results` | Full-test results under teacher control (`results_released_at`). |
| 0073 | `record_eliminated_choices` | Persist crossed-out ("eliminated") choices during a test. |
| 0074 | `list_student_test_runs` | Staff RPC: list a student's submitted test runs. |
| 0075 | `list_my_test_runs` | Student RPC: own submitted tests + released flag. |
| 0076 | `test_completion_bulk_release` | Per-test completion overview + class-wide bulk release. |
| 0077 | `notify_test_result_release` | Notify student when test results are released. |
| 0078 | `test_roster_status` | Completion across the assigned roster (who hasn't started). |
| 0079 | `tests_awaiting_release` | Dashboard nudge: submitted-but-unreleased runs. |
| 0080 | `result_module_timing` | Return per-module timing in `get_test_result`. |
| 0081 | `one_attempt_tests` | One-attempt-only tests + `test_retake_grants` + `allow_test_retake`. |
| 0082 | `one_attempt_staff_exempt` | Exempt staff from the one-attempt lock. |
| 0083 | `release_view_and_reset_attempt` | `start_test` returns `results_released`; `reset_test_attempt`. |
| 0084 | `create_student_code_skip_taken` | `admin_create_student` skips already-taken roster codes. |
| 0085 | `create_student_qualify_cols` | Fix ambiguous `login_code` column ref in 0084. |
| 0086 | `persist_marks_annotations` | Persist Mark-for-Review + highlights + notes server-side. |
| 0087 | `live_proctoring` | Live monitoring: `current_question`, `last_seen_at`, `test_heartbeat`, `test_live_progress`. |
| 0088 | `student_test_report` | Per-student scaled-score trajectory + weak-domain accuracy. |
| 0089 | `assign_test_to_course` | One-click assign a full test to a course (Modules link). |
| 0090 | `test_rpcs_course_scope` | Course-scope `release_test_results`/`allow_test_retake`/`reset_test_attempt` (renumbered from a duplicate 0086). |
| 0091 | `release_test_results_multi_course` | Fix 0090: `release_test_results` used `SELECT … LIMIT 1` to find one course, which mispicked when a test slug is linked from multiple courses; switched to EXISTS pattern. |
| 0092 | `fix_profiles_own_update_recursion` | Fix "infinite recursion detected in policy for relation profiles" on student/self rename. The 0001 `"profiles: own row update"` policy inlined `SELECT role FROM profiles` in WITH CHECK (self-reference); replaced with a `SECURITY DEFINER` `profile_role(uid)` helper. Latent since 0001; surfaced once roster + Account did direct client `.update()`s. |
| 0093 | `lock_student_self_rename` | A student may not change their own `display_name` (teacher owns it). `BEFORE UPDATE` trigger `guard_student_self_rename` on profiles. |
| 0094 | `student_rename_guard_rpc_exempt` | Fix 0093 (caught by smoke-e2e before shipping): the guard was SECURITY DEFINER and blocked `quick_start_with_code` onboarding. Switched to SECURITY INVOKER + `current_user IN ('authenticated','anon')` so only direct end-user PostgREST writes are blocked; RPCs / teacher-rename / service paths pass. |
| 0095 | `claim_student_seat` | A student CLAIMS a pre-created managed seat with their own email+password instead of minting a duplicate via quick-start. `profiles.claimed_at` + `seat_claim_requests` table + `claim_student_seat()` (first claim takes over the seat — swaps synthetic `@students.local` email→real email, sets chosen password, keeps teacher-owned `display_name` + all work; already-claimed → files a teacher-approval request) + `decide_seat_claim_request()` (approve = credential recovery on the same seat, deny = drop). Notifies the course teacher (kind `seat_claim_request`). |
| 0096 | `fix_claim_seat_status_ambiguity` | Fix `column reference "status" is ambiguous` in `claim_student_seat` (caught by `clickthrough-claim-seat.mjs` before the re-claim path shipped): the `RETURNS TABLE(status …)` OUT column collided with `seat_claim_requests.status` in the `ON CONFLICT … WHERE status='pending'` predicate. Replaced the upsert with a table-qualified UPDATE-then-INSERT (race-safe via `unique_violation` fallback). **Lesson: an OUT column name that matches a table column referenced in the body is ambiguous inside plpgsql — qualify the column or rename the OUT.** |
| 0097 | `code_redemptions_log` | Durable, cumulative log of SHARED class-code redemptions so a teacher sees how many times the course code has been used, by whom, when, and via which path — surviving student removal. New `code_redemptions` table (`student_id` ON DELETE SET NULL + `name`/`email` snapshots; RLS course-staff read). `join_course_by_code` + `quick_start_with_code` (0070 bodies verbatim) now append a redemption row, gated on `FOUND` after `ON CONFLICT DO NOTHING` so idempotent re-calls don't inflate the count (`method` = `'join'` \| `'quick_start'`). Per-seat personal codes stay tracked by `profiles.claimed_at`, not here. |
| 0098 | `claim_seat_review_fixes` | Review follow-ups for 0095/0096 (multi-agent review): (1) `claim_student_seat` re-claim path now notifies the teacher ONLY on a genuinely new pending request, not on every re-submit/refresh; (2) the `auth.users` email swap in claim + approve stamps `email_confirmed_at = now()` (defensive); (3) that UPDATE is wrapped in a `unique_violation`→`email_in_use` handler so a race raises the stable code, not a raw error; (4) `seat_claim_requests.decided_by` FK gains `ON DELETE SET NULL`. Verified: claim clickthrough 9/9 + a notify-once check (re-submit stays at 1 notification) against Remote. |
| 0099 | `live_progress_started_at` | Add `started_at` to `test_live_progress` (proctor live monitor) so a teacher sees WHEN each student began — alongside current-question / answered / time-left / submitted. DROP+CREATE (return-type change); body otherwise identical to 0087; `COALESCE(ip.started_at, sub.started_at)`. Verified against Remote (live_progress returns started_at for an in-progress sitting). |
| 0100 | `proctor_tools` | Make the live monitor actionable + add an integrity signal. (1) `test_runs.away_count` + `test_report_away(run)` (owner/in-progress, best-effort like heartbeat) — counts tab-leaves; the runner reports a >2s tab-hide. (2) `proctor_add_time(run, seconds)` — teacher-of-a-linking-course/admin extends the current module by shifting `current_module_started_at` later (existing deadline math picks it up); audited; codes `not_authenticated`/`not_authorized`/`invalid_seconds`/`run_not_found`. (3) `test_live_progress` recreated (DROP+CREATE) to also return `away_count` + `run_id`. Verified against Remote 5/5 (away tracked, run_id exposed, add-time extends 1920→2211s, non-staff blocked). Client: runner extend-only 30s re-sync so added time reaches an active student; monitor shows ⚠ tab-leaves, sorts attention-first, +5 min action. |
| 0101 | `proctor_force_submit` | `proctor_force_submit(run)` — a teacher of a linking course (or admin) ends a student's in-progress sitting NOW: re-grades whatever's recorded (`_grade_answer`), finalizes the run like a normal completion but scores against the FULL test denominator (unreached Qs count wrong), audited. Codes `not_authenticated`/`not_authorized`/`run_not_found`/`run_already_submitted`. Verified Remote 5/5 (ends + grades 1/98, runner blocked after, teacher reads result, double-end refused, non-staff blocked). Client: overview STUDENTS rows now show section · Q# · answered · started · ⚠ tab-leaves via `test_live_progress` merge; **End** action (confirm) + **locked Reset** (type the student's name); runner shows an "ended by your teacher" screen when force-submitted. |
| 0102 | `proctor_pause` | Force pause/resume a live sitting WITHOUT touching the core get_test_module/submit_test_module RPCs. `test_runs.paused_at` + `proctor_set_pause(run, paused)` (pause stamps paused_at; resume shifts `current_module_started_at` forward by the paused duration so normal deadline math resumes exactly — no time lost). `test_run_state(run)` light owner poll (status/paused/paused-aware seconds_remaining) drives the runner (replaces the heavy 30s getModule re-sync; one cheap call handles pause+add-time+end). `test_live_progress` recreated to add `paused` + freeze remaining while paused. Verified Remote 6/6 (timer frozen 1920→1920 over 3s, resume no time lost, proctor sees paused, non-staff blocked). Runner: "Paused by your teacher" overlay + frozen tick; overview + monitor get Pause/Resume + paused badge. |
| 0103 | `integrity_signals` | Extensible live-proctoring integrity telemetry. `test_runs.integrity` jsonb counter bag + `test_report_integrity(run, event)` (owner/in-progress, best-effort like heartbeat; event held to an allowlist `paste`/`copy`/`blur`/`fullscreen_exit` so a tampered client can't write arbitrary keys). `test_live_progress` recreated to return `integrity`. Verified Remote 3/3 (paste counted ×2, fullscreen_exit ×1, arbitrary key rejected). Runner reports paste/copy/fullscreen-exit during a module; overview + monitor show a `⚑ paste 2× · left FS 1×` flag. Detection, not blocking. |
| 0104 | `proctor_admin_only` | Lock the 7 full-test proctor MUTATION RPCs (`release_test_results`, `release_test_results_for_teacher`, `allow_test_retake`, `reset_test_attempt`, `proctor_add_time`, `proctor_force_submit`, `proctor_set_pause`) to **admin-only**. Owner decision (launch-prep): a single designated proctor (the admin) avoids two teachers issuing conflicting live-test actions. The ONLY change per function is the first auth gate `is_staff(v_uid)` → `is_admin(v_uid)` — the now-redundant course-scope blocks are kept (harmless; an admin always satisfies them) so the rest of each body is byte-identical (mechanically diff-verified). Read surfaces unchanged: `test_live_progress` (monitor), `test_roster_status`, `test_run_state`, `get_test_result` — non-admin staff stay READ-ONLY. Client: proctor action controls hidden for non-admins (`isAdmin = profile.role==='admin'`) across TestOverviewPage / TestMonitorModal / StudentTestRunsPanel, with a "view only" hint. Verified Remote: `clickthrough-practice-test` 42/42 (admin proctor works; **non-admin teacher → `not_authorized`**) + full smoke all-green. |
| 0105 | `security_invoker_views` | Close 3 CRITICAL Supabase advisor "Security Definer View" warnings: `module_tree` (0034), `portfolio_item_tree` (0035), `student_skill_stats` (0024) were created with the PG default (DEFINER) semantics — they run their underlying queries as the view OWNER, BYPASSING the caller's RLS. `module_tree` + `portfolio_item_tree` are `GRANT SELECT … TO authenticated` recursive walks of `course_modules` / `portfolio_items` with no per-user filter, so a direct `/rest/v1/module_tree` query leaked **every** course's rows cross-tenant. Fix (matches 0065): `ALTER VIEW … SET (security_invoker = on)` on all three → each now runs with the CALLER's perms and the base-table RLS is enforced. Safe: the two tree views have no client/RPC consumers (app reads base tables directly); `student_skill_stats` is read only inside `my_skill_mastery()` (0024, SECURITY DEFINER) where the view still executes as the function owner and the function's own `WHERE` scopes to the caller — mastery/predictions unchanged. Verified Remote: `migration list` Local==Remote through 0105 + full smoke **all-green** (features 127/127 covers modules/portfolio/mastery). |

---

_Last updated: 2026-06-05 (through 0105 — security_invoker on 3 advisor-flagged
views, applied to Remote, `migration list` Local==Remote, full smoke all-green
incl. features 127/127. Prior: through 0104 — proctor admin-only, applied to Remote,
`migration list` Local==Remote, verified clickthrough 42/42 + smoke all-green.
History: through 0103; 0092–0103 applied to Remote. 0095/0096/0098
verified by `clickthrough-claim-seat.mjs` 9/9 + notify-once; 0097 by a redemption
clickthrough (13/13); 0099 by a live-proctor check. **Full student journey verified by
`clickthrough-register-and-test.mjs`: class-code registration → take DSAT Nov-2023
(98 Qs) → every answer + every elimination round-trips on resume AND in the released
result (98/98).** smoke-e2e 14/14, features/cascade/grading green. smoke-modules/qbank
still red on a pre-existing seed-account gap unrelated to these migrations.). When you
add a migration, append a row here and bump the "verified" line once `migration list`
shows Local == Remote._
