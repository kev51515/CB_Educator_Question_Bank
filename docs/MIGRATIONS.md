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

---

_Last updated: 2026-06-04 (through 0098; 0092–0098 applied to Remote. 0095/0096/0098
verified by `clickthrough-claim-seat.mjs` 9/9 + notify-once check; 0097 verified by a
redemption clickthrough (log + dedupe + RLS read + survives removal, 13/13) against
Remote; smoke-e2e 14/14, features/cascade/grading green. smoke-modules/qbank still
red on a pre-existing seed-account gap — `demo-teacher@example.com` not provisioned
on Remote — unrelated to these migrations.). When you add a migration, append a row
here and bump the "verified" line once `migration list` shows Local == Remote._
