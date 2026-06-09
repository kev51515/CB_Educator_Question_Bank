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
| 0106 | `function_search_path` | Close the remaining advisor "Function Search Path Mutable" warnings (7 functions): `_grade_answer`, `_spr_numeric`, `apply_late_penalty`, `module_items_validate_assignment_ref`, `prevent_module_cycle`, `prevent_portfolio_item_cycle`, `scale_section_score`. All were non-DEFINER but inherited the caller's `search_path`. Fix: `ALTER FUNCTION … SET search_path = ''` (Supabase's recommended value, config-only change — no body rewrite). Provably behavior-preserving: every cross-schema reference in all 7 bodies is ALREADY fully-qualified (`public._spr_numeric`, `public.course_modules`, `public.assignments`, `public.portfolio_items`) and the rest are `pg_catalog` built-ins (always implicitly searched even when search_path is empty); none reference `auth`. Verified Remote: `migration list` Local==Remote through 0106; re-query shows **0** public functions missing a pinned search_path; full smoke **all-green** (grading 12/12 exercises the 3 score fns; modules 26/26 exercises both cycle triggers + the assignment-ref validator). **NOT fixed (intentional):** `rate_limit_attempts` / `reminder_log` / `test_retake_grants` show "RLS enabled, no policy" — that's a deliberate full lockdown (touched only via SECURITY DEFINER RPCs); adding policies would OPEN them. **Deferred:** `pg_net` "Extension in Public" — relocating a platform-managed extension the 0058 cron fanout depends on is too risky pre-launch. **Manual (dashboard, no SQL/management-token path):** enable Leaked-Password Protection, add an MFA option, shorten OTP expiry — see PRODUCTION_RUNBOOK. |

| 0107 | `hot_fk_indexes` | Index the foreign keys on the live-test + modules HOT paths (Supabase **Performance** advisor: "Unindexed foreign keys"): `test_runs(test_id)` (proctor monitor/roster/release filter runs BY test, polled live), `test_run_answers(question_id)` (result + per-item analysis joins), `module_item_completion(module_item_id)` (completion ticks + cascade), `course_modules(parent_module_id)` + `portfolio_items(parent_item_id)` (tree recursion / child lookups on every Modules/Portfolio load). **Surgical, not blanket** — the ~17 remaining unindexed FKs are pure authorship/created_by columns filtered by already-indexed `course_id`/`topic_id`; indexing them would only add write overhead. Plain `CREATE INDEX IF NOT EXISTS` (tables small pre-launch → instant; CONCURRENTLY can't run in a migration txn). Verified Remote: `migration list` Local==Remote through 0107 + full smoke all-green. **Validated under load:** `npm run loadtest --n=25` → 25/25 concurrent full flows pass, p95 3.7s, all answers round-trip; ceiling at n=40 is GoTrue auth rate-limiting (sign-in), NOT the DB — see PRODUCTION_RUNBOOK §7b/§5b. |

| 0108 | `proctor_timeline` | Per-event proctor timeline + denormalized aggregates + a per-test proctoring level. (1) `test_runs` gains `away_total_seconds` / `focus_loss_count` / `focus_loss_seconds` (existing `away_count` / `integrity` jsonb / `last_seen_at` / `current_question` kept + still maintained). (2) NEW `test_run_events` (one row per signal: `away`/`focus_loss`/`fullscreen_exit`/`fullscreen_enter`/`copy`/`paste`/`copy_blocked`/`paste_blocked`/`contextmenu_blocked`/`devtools`; cols `id`/`run_id`/`at`/`type`/`module`/`question`/`duration_seconds`/`meta`; idx `(run_id, at)`; RLS owner-READ only, NO write policy — writes flow only through the DEFINER logger, mirroring `test_run_answers`). (3) `test_log_proctor_event(run, type, [duration], [module], [question])` — UNIFIED best-effort logger (owner + allowlist only; **never throws**, wrapped `EXCEPTION WHEN OTHERS THEN RETURN`): inserts one event then bumps the matching aggregate — `away`→away_count+away_total_seconds+last_seen_at, `focus_loss`→focus_loss_count+focus_loss_seconds, copy/paste/fs-exit/blocked/devtools→the existing 0103 `integrity` jsonb counter shape the monitor already reads. (4) `get_test_run_timeline(run)` — ordered event log, owner OR teacher-of-the-administering-course (new `is_teacher_of_test(uid, test_id)` SECURITY DEFINER helper, factored from the proctor RPCs' slug-link join). (5) `tests.proctoring_level` (`off`/`soft`/`strict`, default `soft`) + `set_test_proctoring_level(slug, level)` (teacher-of-course/admin; codes `not_authenticated`/`invalid_level`/`test_not_found`/`not_authorized`; audited `proctor.set_level`). (6) `start_test` DROP+CREATE adds top-level `proctoring_level` (jsonb return preserved; else byte-identical to 0082). `test_live_progress` DROP+CREATE appends — IN ORDER after `run_id` — `away_total_seconds` / `focus_loss_count` / `focus_loss_seconds` / `flagged` / `flag_reasons` (inline reasons: away_total>60s→`away_60s`, away_count≥3→`away_3x`, integrity.fullscreen_exit≥2→`fs_exit`, integrity.paste≥1→`paste`, focus_loss_count≥3→`focus_3x`; flagged = any reason). Forward-only. Applied to Remote 2026-06-05; **the `start_test` rebuild here was diffed against 0082 and silently dropped the `results_released` key added by 0083 — caught live by `clickthrough-practice-test.mjs` and fixed forward in 0109** (see below). |

| 0109 | `start_test_restore_results_released` | **Hotfix for 0108.** 0108's `start_test` rebuild used the 0082 body as its baseline, which pre-dates 0083's addition of the `results_released` jsonb key (the full-test intro/runner reads it to gate score visibility for finished students). 0108 therefore shipped `start_test` WITHOUT `results_released` — a live regression. Fix forward: DROP+CREATE `start_test` with BOTH keys — the restored `results_released` (from 0083) AND `proctoring_level` (from 0108); body otherwise byte-identical. jsonb return type unchanged → DROP+CREATE safe. **Lesson:** when rebuilding a CREATE-OR-REPLACE function, diff against the LATEST prior definition — `start_test` was touched by 0048/0061/0066/0081/0082/0083 before 0108. Verified Remote: `migration list` Local==Remote through 0109; `clickthrough-practice-test.mjs` **42/42**, edge harness **10/10**, full smoke **all-green** (e2e 14, features 127, modules 26, qbank 25, cascade 7, grading 12, announcements 7 +1 pre-existing pg_cron skip). |
| 0110 | `fix_rwm2_q7_answer_key` | **Content fix (data only, no schema).** DSAT Nov-2023 · Reading & Writing · Module 2 · Q7 (`ref "2-7"`) was mis-keyed `D`. The passage states the microorganism community composition "was unchanged" — that is precisely what lets the researchers attribute the accelerated nutrient cycling to temperature, i.e. it RULES OUT a compositional alternative explanation = choice **C**. Choice D ("activity varied depending on which microorganisms comprised the community") directly contradicts the passage. Caught by an independent re-solve of all 98 questions; the printed third-party answer key carried the same typo, so a letter-vs-key match alone missed it. Scoped `UPDATE test_questions SET correct_answer='C'` joined through `test_modules`→`tests` on `slug='dsat-nov-2023' AND position=2 AND ref='2-7' AND correct_answer='D'`, plus a `DO` block asserting exactly 1 row ends up keyed C. Applied to Remote 2026-06-05 (scoped service-role update, 1 row); staff QA review page + re-exported Canvas QTI both confirm C. **Lesson:** verifying an export against its own source key only proves faithful transcription, not correctness — re-solve the items to catch keying errors that predate the export. |
| 0111 | `grid_repeating_decimal` | **Grading fix (function only, no data).** `_grade_answer` for grid (student-produced response) questions now grades rounded/truncated decimal entries of a REPEATING answer as correct — matching the College Board SPR rule (for `2/3` it accepts `.6666`, `.6667`, `0.667`; for `1/3`, `.3333`). The 0055 grader only accepted a literal `accepted[]` form or a value within `1e-9` of the key, so `.6667` (off by 3.3e-5 from 2/3) was wrongly marked incorrect unless every truncation was hand-enumerated. Added an approximation branch gated on three conditions so it can't over-accept: (1) the key is genuinely non-terminating in grid space (`round(kv,4) <> round(kv,10)` — a terminating key like `0.125` still rejects `0.1249`); (2) a DECIMAL entry (fractions stay exact-equality) with enough places to fill the grid (`places >= greatest(1, 4 - <int digits of |kv|>)` — rejects under-precise `0.67`/`0.7` for `2/3`); (3) the value equals the key TRUNCATED or ROUNDED to that many places. `CREATE OR REPLACE` keeps the signature so `submit_test_module` picks it up untouched; preserves the 0106 `search_path=''` pin. Found by a grid-grading edge-case battery; the live DSAT-Nov-2023 has only terminating grid answers so it was latent, but the grader is general. Applied to Remote 2026-06-05; **`migration list` Local==Remote through 0111** (also recorded 0110, which had been applied as data-only and was untracked); regression guard `grid-grading-check.mjs` **29/29** green; `smoke-grading` **12/12**. **Lesson:** a numeric-equality grader is wrong for SPR — repeating answers require round/truncate-to-grid matching, not an epsilon. |
| 0112 | `test_answer_breakdown` | **Two staff-gated read RPCs (functions only, no data/schema).** Power the new teacher **Review** surface (answer key + per-class results). `list_test_review_courses(slug)` returns the classes the caller can review for a test (courses they teach whose Modules link `/test/<slug>`; admins: all) each with a count of students who submitted — mirrors the assigned-roster CTE of 0078. `get_test_answer_breakdown(slug, course_id)` returns one row per (question, student) for each student's LATEST submitted run in that class (`DISTINCT ON (user_id) … ORDER BY submitted_at DESC`): `chosen, is_correct, student_id, student_name`; the client aggregates into per-option counts + name lists. Needed because `test_run_answers` RLS is owner-read only, so a teacher can't SELECT peers' answers directly. Both `SECURITY DEFINER SET search_path = public, auth`, gated `is_staff` + (`is_admin` OR `is_teacher_of_course`), `REVOKE ALL` then `GRANT EXECUTE TO authenticated`; no answer key returned (client reads it via the staff `tests` SELECT). Applied to Remote 2026-06-08; **`migration list` Local==Remote through 0112**; full smoke all-green (e2e 14, features 127, modules 26, qbank 25, cascade 7, grading 12). |
| 0113 | `proctor_messages` | **Two-way proctor ⇄ student messaging for a paused live test (table + 2 write RPCs + realtime).** New append-only `proctor_messages` table (run_id, sender 'student'|'staff', sender_id, kind 'text'|'preset'|'pause', body, created_at) — RLS SELECT for the run's owner (student) and any staff; **no INSERT/UPDATE/DELETE policy** so writes go only through the DEFINER RPCs (`sender` can't be forged; log is permanent). Added to the `supabase_realtime` publication so the student overlay + proctor monitor get live inserts. `student_send_proctor_message(run, kind, body)` — own run only, **only while `paused_at IS NOT NULL`** (the safe window; raises `not_paused` otherwise); `proctor_send_message(run, kind, body)` — staff, gated like proctor_set_pause (admin OR teacher-of-course at first; tightened in 0114). Both validate kind + body 1..500 chars, raise `run_not_found`/`run_already_submitted`/`not_authorized`. Applied to Remote 2026-06-08. |
| 0114 | `proctor_send_admin_only` | **Tighten `proctor_send_message` to admin-only.** `CREATE OR REPLACE` swapping the 0113 `is_staff + teacher-of-course` gate for `IF NOT is_admin → not_authorized`, matching the 0104 model where every proctor ACTION (pause/add-time/force-submit/reset/release) is admin-only to avoid conflicting actions on one sitting. Reads unchanged — the `proctor_messages` staff-read RLS still lets any staff see the thread (parity with the read-only live monitor); the student RPC is unchanged. Applied to Remote 2026-06-08; **`migration list` Local==Remote through 0114**; new `smoke-proctor-chat.mjs` **14/14** (paused-gating, admin-only send, staff read, RLS isolation, records, resume-closes-window) + full smoke all-green. **Lesson:** a new proctor capability must inherit the 0104 admin-only stance, not the broader is_staff gate. |
| 0115 | `seed_dsat_june_2026_asia` | **Seed Test #2 — Digital SAT, June 2026 (Asia-Pacific), Reading & Writing only (data only, no schema).** `slug='dsat-june-2026-asia'`, ordinal 2, 2 timed RW modules (32 min each) × 27 = 54 MCQ questions, into the 0048 full-test tables. Source: `pdf/2026-June-Asia.pdf` (Witry Education reconstruction, Form A) — an **image-only PDF (no text layer)**, so questions were OCR'd from page renders (parallel opus agents) and the **answer key triple-verified**: manual full-res read of all 54 `答案` lines + the transcription agents + an independent second model — all three agree 54/54. All data tables/graphs are transcribed into the passage as text, so **no web-served figure assets** exist. Same idempotent upsert pattern as 0049 (conflict on slug / (test_id,position) / (module_id,position)). Note: source key is letter-skewed ({A:3,B:25,C:22,D:4}) — faithful to the PDF's printed answers, not balanced like an official CB form. Applied to Remote 2026-06-08; **`migration list` Local==Remote through 0115**; verified end-to-end by a fresh-student take-and-score walkthrough (`start_test`→both modules→`submit_test_module`) scoring **54/54** with no answer-key leak + results teacher-gated; full smoke all-green (e2e 14, features 127, modules 26, qbank 25, cascade 7, grading 12, announcements 7). **Lesson:** for an image-only source, decouple the two correctness concerns — OCR the text (cheap, re-runnable) but verify the answer key independently and hardcode it authoritatively in the assembler. |

| 0116 | `seed_dsat_2025_aug_asia_a` | **Seed Test #3 — Digital SAT, August 2025 (Asia-Pacific, Form A), Reading & Writing only (data only, no schema).** `slug='dsat-2025-aug-asia-a'`, ordinal 3, 2 RW modules × 27 = 54 MCQ. Source: `2025-08-asia-a-rw.pdf` (Two Engineers Prep, **Bluebook-format, image-only, NO printed answer key**). Questions OCR'd by parallel agents; **answer key SOLVED by Claude** — the agents transcribe well but over-default to D and mishandle page boundaries, so I independently re-solve every item from the transcribed text. Caught a real agent error (M2 Q20 is a participial "information, generating" → C, not the agent's run-on D) plus structural fixes (Q8 duplicate, Q17 gap, missing Q27 — M2 is clean 1:1 so number = page−29). 4 garbled science passages re-read at full res. Applied to Remote 2026-06-08; take-and-score 54/54, no key leak. **Lesson:** sub-agents are fine at transcription but NOT at solving — re-solve the key yourself. |
| 0117 | `seed_dsat_2025_jun_us_c` | **Seed Test #4 — Digital SAT, June 2025 (US, Form C), Reading & Writing only (data only, no schema).** `slug='dsat-2025-jun-us-c'`, ordinal 4, 2 RW modules × 27 = 54 MCQ. Source: `2025-06-us-c-rw.pdf` (Two Engineers Prep, keyless Bluebook). Same pipeline as 0116: transcribe-only agents (these PDFs are strictly 1 question/page — M1 p2–28, divider p29, M2 p30–56 — so number = page−1 / page−29, validated against the printed box number with zero mismatches), answers SOLVED by Claude from the transcribed text. 2 garbled science passages re-read/cleaned (M2 Q16 Lecithaster, M2 Q26 dup bullet). Applied to Remote 2026-06-08; take-and-score 54/54, no key leak. |
| 0118 | `seed_dsat_2025_oct_asia_a` | **Seed Test #5 — the first FULL Digital SAT: October 2025 (Asia-Pacific, Form A), Reading & Writing + Math (data only, no schema).** `slug='dsat-2025-oct-asia-a'`, ordinal 5, 4 modules (RW 1+2 × 27, Math 1+2 × 22) = 98 questions incl. 11 **grid-in** (`type='grid'`) items. Source: `2025-10-asia-a.pdf` (RW) + `202510 Asia_A_MATH.pdf` (Two Engineers Prep, keyless Bluebook). RW 1:1 like 0116/0117; Math has 2 leading pages so number = page−2 (M1) / page−26 (M2), plus a divider + a reference-sheet page. **Answers SOLVED by Claude** — Math derived with near-certainty (grid answers stored as fractions, e.g. `16/3`, `5/72`; the 0111 repeating-decimal grader accepts student decimal entries); RW solved from transcribed text. Figure-dependent Math items keep the figure described as text in the passage (no image assets). **2 defective source questions flagged** (RW M1 Q24's choices reference a "large tree finch" absent from its notes; RW M2 Q9's options don't match the Oklahoma-economy table) — best-guess answers assigned (A, C), worth a teacher's review. Applied to Remote 2026-06-08; **take-and-score 98/98** (RW 54 + Math 44), grid-ins grade correctly, no key leak. **Lesson:** for full tests, remap the two source PDFs' module 1/2 onto test positions 1–4 and derive numbers from page offsets per sub-test. |
| 0119 | `seed_dsat_2026_mar_asia_a` | **Seed Test #6 — full Digital SAT, March 2026 (Asia-Pacific, Form A), RW + Math (data only, no schema).** `slug='dsat-2026-mar-asia-a'`, ordinal 6, 4 modules (RW 1+2 × 27, Math 1+2 × 22) = 98 questions incl. 10 grid-ins. Source: `2026 March - Asia-A Eng.pdf` (RW) + `202603 Asia_A.pdf` (Math) (Two Engineers Prep, keyless Bluebook). Identical pipeline to 0118. **Answers solved by Claude** (Math near-certain; grid answers stored as fractions e.g. `9/17`, `36/13`, `27/4`, `17/2`). Figure-dependent items keep figures described as text. Applied to Remote 2026-06-08; **take-and-score 98/98**, grid-ins grade correctly, no key leak. |
| 0123 | `course_skill_mastery` | **Class-wide, cross-test SAT skill mastery RPC (new SECURITY DEFINER function, no schema change).** `course_skill_mastery(p_course_id uuid)` → jsonb `{ students, tests, attempts, domains:[{section,domain,correct,total}] }`, aggregating per-domain correct/total over the **latest submitted run per (student, test)** for students enrolled in the course (`course_memberships`). Powers the teacher "Skills" tab (`ClassSkillsView`). Course-scope guard `is_teacher_of_course OR is_admin` (mirrors 0112). `GRANT EXECUTE TO authenticated`. Applied to Remote 2026-06-09; verified (3 students × 1 test → 51-answer domain totals, weakest callout, CSV export). |
| 0122 | `student_report_latest_attempt_domains` | **Latest-attempt-per-test dedup in `student_test_report`'s domain rollup (no schema change, no return-shape change).** The per-domain aggregate counted every submitted run, so a student who retook the same form had its questions counted once per attempt (e.g. 34/34 not 17/17), inflating the teacher per-student "Skills by domain" denominators. Now the `domains` subquery sources from `DISTINCT ON (test_id) … ORDER BY submitted_at DESC` (latest submitted run per test); the `runs` array is unchanged so the trajectory still spans all attempts. Faithful `CREATE OR REPLACE` of 0088, only the domains run-source changed. Applied to Remote 2026-06-09; verified (2-attempt same-test student → 98 domain answers, both runs in trajectory). |
| 0121 | `result_question_domain` | **Surface each question's SAT skill `domain` in `get_test_result` (additive jsonb key, no behavior change).** Faithful `CREATE OR REPLACE` of the 0080 body (release gate from 0072 + eliminated + module_timing) with one new per-question key, `'domain', tq.domain`. `test_questions.domain` is staff-only via RLS, so the student browser only gets it through this SECURITY DEFINER RPC — powers the student-facing per-domain "skill profile" (strengths / focus areas) on the released result screen, alongside the teacher Review heatmap's By-skill view. Domains for all seeded forms were classified into the 8 official College Board domains and stored in `test_questions.domain` (a column that existed empty since the original full-test bundle). Applied to Remote 2026-06-09; verified end-to-end (`get_test_result` returns domain on 98/98 nov-2023 questions as the student; profile aggregates + renders). **Lesson:** when extending a `CREATE OR REPLACE FUNCTION`, diff against the LATEST prior definition (here 0080), not an earlier one. |
| 0120 | `test_question_rationale` | **Optional per-choice rationale on `test_questions` (additive column, no behavior change).** `ADD COLUMN IF NOT EXISTS rationale jsonb` — shape `{ "A": { "wrong": "<distractor phrase>", "reason": "<why>" }, "C": { "reason": "<why right>" }, ... }`. Powers Review Mode's "Explain" toggle (highlights the wrong word in each choice + shows the reason; correct choice shows why it's right). Read via the staff `tests` SELECT (0048 RLS `is_staff`; students can't read `test_questions`), so no new policy. Nullable; empty until authored/generated → the toggle shows a graceful "No explanation yet" state. Applied to Remote 2026-06-08. **UI built first; content authoring/generation is a follow-up.** |

---

_Last updated: 2026-06-09 (through 0123 — `course_skill_mastery` class-wide
cross-test skill RPC for the teacher Skills tab, applied to Remote). Prior:
0122 — latest-attempt-per-test dedup in
`student_test_report`'s domain rollup, applied to Remote, no return-shape change).
Prior: 0121 — `get_test_result` returns per-question
`domain` for the student skill profile + teacher heatmap By-skill view, additive,
applied to Remote, no behavior change. Prior: 0120 — optional per-choice `rationale` jsonb
on test_questions for Review Mode's "Explain" toggle; additive nullable column,
applied to Remote, no behavior change. Prior: through 0119 — seed Test #6 DSAT Mar-2026 Asia Form A,
full test RW 54 + Math 44 = 98 Q across 4 modules incl. 10 grid-ins; keyless
Bluebook PDF, answers solved by Claude, applied to Remote, take-and-score 98/98.
Tests #3–#6 (0116–0119) all from Two Engineers Prep keyless Bluebook PDFs in pdf/new/.
Prior: 0118 — seed Test #5 DSAT Oct-2025 Asia Form A, full 98 Q, take-and-score 98/98.
Prior: 0117 — seed Test #4 DSAT Jun-2025 US Form C, 54 Q RW, take-and-score 54/54.
Prior: 0116 — seed Test #3 DSAT Aug-2025 Asia Form A, 54 Q RW, take-and-score 54/54.
Prior: 0115 — seed Test #2 DSAT June-2026
Asia-Pacific Reading & Writing, 54 Q across 2 modules; image-only PDF OCR'd,
answer key triple-verified, applied to Remote, `migration list` Local==Remote
through 0115, take-and-score 54/54 + full smoke all-green.
Prior: 0114 — proctor ⇄ student paused-test
messaging: `proctor_messages` + send RPCs (0113), `proctor_send_message`
tightened to admin-only (0114); applied to Remote, `migration list`
Local==Remote through 0114, `smoke-proctor-chat` 14/14 + full smoke all-green.
Prior: 0112 — staff review answer-breakdown RPCs
(`list_test_review_courses` + `get_test_answer_breakdown`), applied to Remote,
`migration list` Local==Remote through 0112, full smoke all-green (215 checks).
Prior: through 0111 — grid repeating-decimal grading fix
(0111) + RW-M2-Q7 answer-key content fix (0110, now tracked); both applied to
Remote, `migration list` Local==Remote through 0111, grid-grading-check 29/29 +
smoke-grading 12/12 green. Prior: through 0109 — proctor timeline + per-test
proctoring level (0108) + a `start_test` `results_released` hotfix (0109); both
applied to Remote, `migration list` Local==Remote, clickthrough 42/42 + edge
10/10 + full smoke all-green. Prior: 0107 — hot-path FK indexes, applied to Remote,
`migration list` Local==Remote, full smoke all-green, load-tested 25 concurrent
green. Prior: 0106 — function search_path pinned on 7 fns,
applied to Remote, `migration list` Local==Remote, 0 mutable fns remain, full
smoke all-green. Prior: 0105 — security_invoker on 3 advisor-flagged
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
