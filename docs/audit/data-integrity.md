# Data Integrity, RLS & Recovery Audit — 2026-06-01

Scope: `supabase/migrations/0001..0047`, client call-sites under
`viewer/src/`, and `viewer/scripts/smoke-*.mjs`. Read-only. Focus is data
integrity / RLS / recovery — **not** UI.

## 1. Summary

| Dimension | Blocker | Major | Minor |
|---|---|---|---|
| RLS coverage | 0 | 1 | 2 |
| SECURITY DEFINER traps | 0 | 1 | 1 |
| Idempotency | 0 | 0 | 2 |
| Audit log integrity | 0 | 1 | 1 |
| NOT NULL + DEFAULT (PostgREST trap) | 0 | 0 | 1 |
| FK cascade safety | 1 | 2 | 1 |
| Migration ordering | 0 | 0 | 0 |
| Recovery paths | 0 | 1 | 1 |
| Smoke coverage | 0 | 1 | 2 |
| **Privilege gating** (separate) | **1** | 0 | 0 |

Headline: the migration discipline is high — every `SECURITY DEFINER` has
`SET search_path` set, every public table has RLS enabled, idempotency
plus a client-side failure-logging RPC are present on the qbank path, and
the migration ledger is contiguous (0001..0047, no gaps, no DROP TABLEs).
The remaining risk concentrates around **destructive cascades through
`auth.users` / `profiles`** and a **privilege-elevation flaw in
`admin_delete_user`** where any teacher can delete any user.

## 2. Blockers

### B1. `admin_delete_user` is `is_staff`-gated, not `is_admin`-gated
`supabase/migrations/0009_is_staff.sql:245`

```
IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized' ...
DELETE FROM auth.users WHERE id = p_user_id;
```

The migration header explicitly says it "flips the gate" from `is_admin`
to `is_staff`. The function then `DELETE FROM auth.users` which cascades
through `profiles ON DELETE CASCADE` (0001:42), wiping every
`assignment_attempts`, `course_memberships`, `portfolio_submissions`,
`discussion_topics`-by-author-RESTRICT-error, `notifications`, and
`module_item_completion` row for the victim. **Any teacher can delete any
user, including admins.** There is no soft-delete or confirmation surface;
the cascade is silent.

Fix sketch: gate on `public.is_admin(v_uid)` (already exists, see
`0001_init.sql:130`). Add an `admin_soft_delete_user` alternative that
sets a `profiles.deleted_at` column and revokes session, leaving the
row data intact for forensic / GDPR purposes. Add an audit event hook
on auth.users delete via an `AFTER DELETE` trigger on `public.profiles`
(currently no such trigger — see Major M3).

### B2. Cascading `profiles` deletes wipe student work with no audit row
`supabase/migrations/0001_init.sql:42`

`public.profiles.id REFERENCES auth.users(id) ON DELETE CASCADE`, and
**every** student-data FK points at `profiles(id) ON DELETE CASCADE`
(0004:76 attempts, 0004:32 assignments.created_by RESTRICT actually — see
note, 0012:* memberships, 0017:147 portfolio_submissions, 0023:44
reminder_log, 0026:3 message participants, 0029:7 notifications, 0033:15
module_item_completion). There is **no audit trigger on profile delete**
— 0022 covers role-change, invite-mint, course-delete only. A single
deletion (legitimate or accidental) silently destroys all the user's
graded work with zero ledger trail.

Fix sketch: (1) replace `ON DELETE CASCADE` with `ON DELETE RESTRICT` on
`assignment_attempts.student_id`, `portfolio_submissions.student_id`, and
`course_memberships.student_id` — force the admin pathway to explicitly
unmake work; or (2) add an `audit_profile_delete` BEFORE DELETE trigger
that captures the row count being orphaned per table, mirroring
`audit_course_delete` in 0028:19. Note: `test_attempts.user_id`
(0042:23) references `auth.users` not `profiles`, so the cascade chain
is different there — a profile delete will *not* cascade to test_attempts,
which is itself a latent orphan bug (Major M4).

## 3. Majors

### M1. Auditing UPDATE/DELETE policies on `course_modules.position` are inferable but tests don't probe ordering tampering
Smoke suites (`smoke-modules.mjs`) cover happy-path reorder. They do not
exercise: a student attempting to UPDATE another student's
`module_item_completion`, nor a teacher in course A attempting to reorder
course B's modules. Policies in `0011_modules.sql:93+` look correct
(`is_teacher_of_course` helper) but only one path is tested.

Fix sketch: add adversarial reorder scenario to smoke-modules.

### M2. `audit_assignment_delete` / `audit_material_delete` / `audit_announcement_delete` lack `, auth` in search_path
`supabase/migrations/0027_audit_more.sql:3,17,31`

These use `SET search_path = public` (no `, auth`). They call
`auth.uid()` which works because it's fully qualified, but the CLAUDE.md
contract is `SET search_path = public, auth`. Latent risk if anything in
the chain ever references an unqualified `auth.` object. (0028's
`audit_course_delete` fix added `, auth` — these three weren't
back-ported.)

Fix sketch: rewrite the three function bodies in a new
`0048_audit_search_path.sql` to add `, auth`.

### M3. No `audit_profile_delete` trigger — corollary of B2
Already covered. Even if B2 isn't fixed by RESTRICT, an audit trail of
profile deletes is mandatory.

### M4. `test_attempts.user_id` references `auth.users`, not `profiles`
`supabase/migrations/0042_test_attempts.sql:23`

Every other student-facing FK references `public.profiles`. This means a
profile-only delete (if you ever introduce a soft-delete) leaves
`test_attempts` orphaned to a phantom user. Also: `test_attempts` has no
`client_attempt_id` for idempotency, only the partial unique index
`test_attempts_one_draft_per_set` (0042:74). A double-submit race on
final submit would NOT be caught — only drafts are constrained.

Fix sketch: change FK to `public.profiles(id)` to match the project
norm. Add `client_attempt_id uuid NULL` + partial unique index analogous
to 0046:25 for finalised attempts.

### M5. Smoke coverage gap for archive-cascade and kebab actions
`viewer/scripts/smoke-*.mjs`

`smoke-e2e.mjs` covers join/start/submit; `smoke-features.mjs` covers
discussions/inbox/notifications/portfolio; `smoke-modules.mjs` covers
module reorder; `smoke-qbank.mjs` covers 11 qbank scenarios. **No
scenario** exercises: course archive → assignment visibility,
course delete → cascade row counts, assignment delete during student
mid-attempt, or teacher restore-from-archive. The top-10 fix areas
(course CRUD, kebab actions, archive cascade) per the audit brief are
unprotected.

Fix sketch: add `smoke-cascade.mjs` covering (a) archive flips student
listing, (b) delete-course populates audit_events with expected
target_id, (c) delete-assignment during in-progress attempt yields a
clean failure code rather than orphan rows.

### M6. Notifications `INSERT` happens through `SECURITY DEFINER` triggers but no policy guards mass-spoof from definer abuse
`supabase/migrations/0029_notifications.sql:5`

`notifications` has only SELECT/UPDATE policies (intentional — inserts
via `notify_*` SECURITY DEFINER fns at lines 31, 46, 63). Each fn writes
`recipient_id` from a trigger NEW row. A logic bug in a future trigger
that picks the wrong recipient_id would be silently authoritative — the
absence of any client-side WITH CHECK means the SECURITY DEFINER path
has no second layer of defence.

Fix sketch: add an internal CHECK constraint
`recipient_id IS NOT NULL AND recipient_id <> coalesce(actor_id, '00000000-...')`
to prevent self-notification storms; consider a per-recipient rate
limiter via `check_rate_limit('notify', ...)`.

## 4. Minors

- **Mi1**: `qbank_submission_log` (0046:58) lacks an UPDATE/DELETE policy.
  Intentional — never edited. Document this explicitly to avoid future
  drift.
- **Mi2**: `rate_limit_attempts` (0021:22) has RLS enabled but **zero
  policies**, which denies all direct access. Correct, but worth a
  one-line comment so a future maintainer doesn't add a permissive
  policy. Already commented at 0021:33; keep it.
- **Mi3**: `assignment_attempts_count_consistency` (0046:46) allows the
  combo `correct_count=NULL, total_questions=10` (because of OR). Tighten
  to require both NULL or both non-NULL.
- **Mi4**: `AssignmentFormModal.tsx:273` direct `.from("assignments")
  .insert` omits `kind` (added 0045:33 with DEFAULT 'mocktest') and
  `archived` (DEFAULT false). Fine today because PostgREST sends column
  omissions as DEFAULT — but this is the exact PostgREST batch-trap
  pattern CLAUDE.md warns about. A future migration changing the default
  semantics would break this silently. Prefer the RPC pattern used by
  qbank, or pass `archived: false` and `kind: 'mocktest'` explicitly.
- **Mi5**: `audit_record` (0022:43) is defined and granted but never
  called. Either wire it into the new audit-emit paths or remove it to
  avoid drift.
- **Mi6**: `message_threads` has no UPDATE/DELETE policy — only SELECT
  (0026:69). Threads are opened by an RPC; inserts/deletes never happen.
  Acceptable, but `bump_thread_last_message` trigger relies on
  `SECURITY DEFINER` (0030:14) — verified correct.

## 5. RLS Coverage Matrix

Legend: Y = explicit policy exists, R = relies on SECURITY DEFINER RPC,
— = not applicable (table is admin-side / append-only audit).

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Y | R (trigger 0001) | Y | R (admin RPC) |
| `courses` | Y | Y | Y | Y |
| `course_memberships` | Y | Y | — | Y |
| `assignments` | Y | Y | Y | Y |
| `assignment_attempts` | Y | Y | Y | Y |
| `assignment_attempt_questions` | Y | R | — | — |
| `course_modules` | Y | Y | Y | Y |
| `module_items` | Y | Y | Y | Y |
| `module_item_completion` | Y | Y | — | Y |
| `course_announcements` | Y | Y | Y | Y |
| `course_materials` | Y | Y | Y | Y |
| `portfolio_templates` | Y | Y | Y | Y |
| `portfolio_items` | Y | Y | Y | Y |
| `portfolio_submissions` | Y | Y | Y | Y |
| `portfolio_feedback` | Y | Y | — | Y |
| `discussion_topics` | Y | Y | Y | Y |
| `discussion_posts` | Y | Y | Y | Y |
| `message_threads` | Y | R | — | — |
| `messages` | Y | Y | Y | — |
| `notifications` | Y | R | Y | — |
| `audit_events` | Y (admin) | R | — | — |
| `reminder_log` | — | R | — | R |
| `rate_limit_attempts` | — | R | — | R |
| `teacher_invite_codes` | Y (admin) | R | — | — |
| `teacher_invite_redemptions` | Y (admin) | R | — | — |
| `qbank_submission_log` | Y | R | — | — |
| `test_attempts` | Y (ALL) | Y (ALL) | Y (ALL) | Y (ALL) |
| `test_answers` | Y (ALL) | Y (ALL) | Y (ALL) | Y (ALL) |

No "INSERT-without-SELECT" foot-guns found.

## 6. SECURITY DEFINER Inventory (search_path check)

Every `SECURITY DEFINER` function I located has `SET search_path` set
(programmatic check across all 47 migrations: 0 violations once
comment-line noise is filtered). Distribution:

| Path setting | Count | Notes |
|---|---|---|
| `SET search_path = public, auth` | majority | Canonical |
| `SET search_path = public` | 6 | 0027 (3), 0011 (1 helper), 0038/0039/0040 short-code triggers |
| Missing | **0** | |

The six `public`-only entries are a minor consistency issue (M2). All
call paths use fully-qualified `auth.uid()`, so they work — but they
diverge from CLAUDE.md's contract.

## 7. Audit Log Integrity

The rollback trap (migration 0047 fix) is correctly applied for qbank:
client-side `log_qbank_failure` RPC is called from
`viewer/src/student/qbankSubmit.ts:154` inside the catch block (verified).
**No other audit-emit path in migrations exhibits the same
RAISE-after-INSERT pattern.** The `audit_*_delete` triggers (0027, 0028)
fire BEFORE DELETE and only INSERT — they don't RAISE — so a failed
delete simply rolls everything back including the audit row, which is
the correct behaviour (no false-positive ledger entry).

The one structural concern: profile deletes generate **no audit event**
(see B2 / M3).

## 8. Idempotency

- `assignment_attempts.client_attempt_id` (0046:21) + partial unique
  index covers qbank submission idempotency. Verified.
- `test_attempts` has NO `client_attempt_id` (Mi/M4).
- Other client-side `.insert()` sites (`module_items`,
  `course_materials`, `assignments`) lack idempotency keys — acceptable
  because they're user-driven authoring actions (a teacher clicking
  "Add" twice produces two visible items, easy to notice and undo).
- Localstorage staging for qbank verified at `qbankSubmit.ts:41`
  (`STAGING_PREFIX`); cleared on success at `:52`. No equivalent staging
  for `AssignmentRunner.tsx` non-qbank flow — but that flow uses
  `start_assignment_attempt` to claim the row up-front (0014/0020), so
  a crash mid-attempt resumes via the existing in-progress row.

## 9. Recovery Paths

- `/qbank-submissions` (`viewer/src/teacher/QBankSubmissionLogPage.tsx`)
  reads `qbank_submission_log` and offers a "Try resubmit" button that
  re-runs `submit_qbank_attempt` with the original `client_attempt_id`
  (verified line 459). Idempotency makes the replay safe.
- Soft-delete: courses, assignments, qbank assignments all have
  `archived boolean` and are filtered in teacher pickers (e.g.
  `AddItemModal.tsx:61`, `AddSetToCourseModal.tsx:73`).
- **Gap**: no "restore from archive" surface for a deleted course —
  only `archived` toggling. A hard DELETE through the courses-table
  RLS path is irreversible (0012:301 staff-deletes policy).

## 10. Top 10 Fixes (ranked by data-loss / privacy risk)

| # | Fix | File:line | Complexity |
|---|---|---|---|
| 1 | Gate `admin_delete_user` on `is_admin`, not `is_staff` | `0009_is_staff.sql:245` | S |
| 2 | Add `audit_profile_delete` trigger capturing orphan counts | new `0048_*.sql` + `0001_init.sql:42` | M |
| 3 | Switch student-data FKs from `ON DELETE CASCADE` to `RESTRICT` (assignment_attempts, portfolio_submissions, course_memberships) | `0004_assignments.sql:76`, `0017_portfolio.sql:147`, `0012_rename_courses.sql:*` | L (data-migration aware) |
| 4 | Add `client_attempt_id` + partial unique idx on `test_attempts` | `0042_test_attempts.sql:21` | S |
| 5 | Change `test_attempts.user_id` FK from `auth.users` to `public.profiles` | `0042_test_attempts.sql:23` | M |
| 6 | Add `, auth` to search_path in three 0027 audit triggers | `0027_audit_more.sql:3,17,31` | S |
| 7 | Add cascade / archive smoke scenarios | `viewer/scripts/smoke-cascade.mjs` (new) | M |
| 8 | Tighten `assignment_attempts_count_consistency` CHECK | `0046_qbank_resilience.sql:46` | S |
| 9 | Explicit `kind` / `archived` in `AssignmentFormModal` insert | `viewer/src/teacher/AssignmentFormModal.tsx:273` | S |
| 10 | Add restore-from-soft-delete RPC + UI surface for courses | new `0049_*.sql` + teacher page | L |

---

Migration ledger verified contiguous (0001..0047, no duplicates, no
`DROP TABLE`s in any migration). The team's discipline on
`SECURITY DEFINER` + `search_path` is exemplary; the remaining risk is
almost entirely in cascade semantics and one privilege-gating regression
introduced when `0009_is_staff.sql` flipped `is_admin` → `is_staff` for
the destructive `admin_delete_user` path.
