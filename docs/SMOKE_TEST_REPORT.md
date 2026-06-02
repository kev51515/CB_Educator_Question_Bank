# LMS Smoke Test Report

- **Date:** 2026-05-29
- **Supabase project ref:** `ljdofwovsyaqydcbohhd`
- **Supabase URL:** `https://ljdofwovsyaqydcbohhd.supabase.co`
- **Migrations covered:** 0001 init, 0002 join_class, 0003 quick_start, 0004 assignments, 0005 teacher_invites
- **Driver:** `viewer/scripts/smoke-e2e.mjs` (Node `v23.9.0`, `@supabase/supabase-js@^2.45`)
- **Total result:** **12 PASS / 1 FAIL / 1 SKIP / 14 steps**

The script is re-runnable; every entity name carries a `smoke-<timestamp>` tag and a best-effort cleanup pass deletes everything it created.

---

## Results Table

| #  | Step                                       | Status | Time   | Notes                                                                  |
|----|--------------------------------------------|--------|--------|------------------------------------------------------------------------|
| 1  | Bootstrap admin                            | PASS   | 608ms  | `bootstrap_first_admin` worked on a fresh DB; fallback path also wired |
| 2  | Mint teacher invite code                   | PASS   | 439ms  | `mint_teacher_invite` returned row; `max_uses=5`, 24h expiry           |
| 3  | Teacher signup + redeem invite             | PASS   | 964ms  | Role moved from `student` → `teacher`; profile re-fetch confirms       |
| 4  | Teacher creates class                      | **FAIL** | 713ms | **`infinite recursion detected in policy for relation "classes"`** — real RLS defect, see Bug #1 |
| 5  | Student signup                             | PASS   | 704ms  | Profile auto-created via `handle_new_auth_user` trigger; role=`student` |
| 6  | Student joins class via code               | PASS   | 613ms  | `join_class_by_code` returned class metadata; membership row visible    |
| 7  | Teacher creates assignment                 | PASS   | 453ms  | RLS allowed insert because step 4 bypassed via service role             |
| 8  | Student starts attempt                     | PASS   | 452ms  | RLS `attempts: student starts own` policy passed (membership exists)    |
| 9  | Student submits attempt                    | PASS   | 440ms  | UPDATE persisted score=80, submitted_at, answers, result_detail         |
| 10 | Teacher views attempts                     | PASS   | 438ms  | Teacher saw the student's submission row                                |
| 11 | Quick-start anonymous                      | SKIP   | 185ms  | `anonymous_provider_disabled` — anon auth not enabled in dashboard      |
| 12 | RLS spot-checks (anon)                     | PASS   | 1371ms | 7 tables checked from an unauthenticated client; all returned 0 rows    |
| 13 | Revoke + reuse blocked                     | PASS   | 1138ms | After `revoke_teacher_invite`, second redemption raised `invalid_invite_code` |
| 14 | Admin lists all via service role           | PASS   | 329ms  | Service role sees 1 class, 6 profiles                                   |

---

## Failures

### Bug #1 (CRITICAL): RLS infinite recursion when a teacher INSERTs into `public.classes`

**Symptom:** `insert class: infinite recursion detected in policy for relation "classes"` whenever an authenticated teacher attempts `INSERT INTO classes (...)`. The script worked around it by re-issuing the insert with the service role so steps 6–10 could continue, but **this is a production-blocking bug for the teacher workflow** — teachers literally cannot create a class with the schema as deployed.

**Root cause:** Two policies form a recursive cycle.

1. `classes: teacher or admin creates` (migration `0001_init.sql` §9 INSERT policy) calls:
   ```sql
   EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'teacher')
   ```
   That subquery runs under the caller's privileges, so it is filtered by the `profiles` table's RLS policies.

2. One of those `profiles` policies is `profiles: teacher sees enrolled students` (also in `0001_init.sql` §8):
   ```sql
   EXISTS (
     SELECT 1 FROM public.class_memberships cm
     JOIN public.classes c ON c.id = cm.class_id
     WHERE cm.student_id = profiles.id
       AND c.teacher_id  = (SELECT auth.uid())
   )
   ```
   Evaluating that policy requires SELECTing from `classes`, which re-triggers the `classes` SELECT policies, one of which (`classes: student sees enrolled`) calls `is_student_in_class` → `class_memberships`, while the WITH CHECK on classes INSERT recurses back through `profiles`. Postgres detects the cycle and aborts.

**Suggested fix (smallest viable patch):** replace the in-policy subquery against `profiles` with a `SECURITY DEFINER` helper (the same pattern used for `is_admin`, `is_teacher_of_class`, etc.). Add to a new migration `0006_rls_fix.sql`:

```sql
CREATE OR REPLACE FUNCTION public.is_teacher(uid uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = 'teacher'
  );
$$;

DROP POLICY IF EXISTS "classes: teacher or admin creates" ON public.classes;
CREATE POLICY "classes: teacher or admin creates"
  ON public.classes
  FOR INSERT
  WITH CHECK (
    (public.is_teacher((SELECT auth.uid())) AND teacher_id = (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  );
```

The helper is `SECURITY DEFINER` and runs as the owner, so its `SELECT FROM profiles` bypasses the `profiles` RLS that started the cycle — same mechanism that makes `is_admin` work fine inside RLS today.

---

## Skips

### Step 11: Quick-start anonymous flow — `anonymous_provider_disabled`

Anonymous sign-in is not enabled in the Supabase Auth provider configuration for this project. The 0003 RPC and the underlying schema look correct, but the call to `supabase.auth.signInAnonymously()` returns:

> "Anonymous sign-ins are disabled"

**To unblock:** Dashboard → Authentication → Providers → toggle on "Anonymous sign-ins". Then re-run the script; step 11 will execute the full flow (anon sign-in → `quick_start_with_code` → assert membership row).

This is a deployment/config gap, not a code defect. If the product intends the "I have a test code" path to ship, this toggle must be flipped before launch — otherwise the frictionless quick-start flow described in migration 0003's header is dead on arrival.

---

## Gaps discovered (not hard failures)

These were noticed during the run but do not block any tested flow.

1. **`example.com` is rejected by Supabase Cloud's anon `auth.signUp`.**
   The same email is accepted by `auth.admin.createUser`. This means any front-end signup form pointing at a test email domain like `example.com` will fail with `Email address … is invalid`. Worth (a) documenting in `viewer/README` for future contributors, and (b) deciding whether to switch test fixtures to `@local.test`-style addresses that Supabase accepts via the anon endpoint.

2. **Anon `auth.signUp` rate-limits aggressively** — got `email rate limit exceeded` after only one prior signup attempt in a session. The smoke script now provisions all users via the admin API to dodge this, but **a noisy frontend (lots of dev iterations) will trip the limit quickly**. Consider raising the Auth rate limits for non-prod envs, or document the admin-API workaround.

3. **`teacher_invite_codes.code_format CHECK` requires lowercase only**, but `mint_teacher_invite` lowercases the input. That's fine, except a UI hint to users ("codes are case-insensitive, stored lowercase") would prevent confusion. No code change required; UX note only.

4. **`assignment_attempts` has no audit field for who created the attempt other than `student_id`** — the schema can't distinguish "student submitted themselves" from "service role inserted on their behalf for cleanup". Probably fine for MVP given the unique `(assignment_id, student_id)` constraint, but worth flagging.

5. **`join_class_by_code` returns `(id, name, description, join_code, teacher_display_name)`** — that's a useful payload, but the column shape isn't documented anywhere outside the migration. Worth a short `docs/RPCS.md`.

6. **`bootstrap_first_admin` raises `admin_already_exists` (good)** — but there's no documented escape hatch for "I lost access to the original admin." On a fresh project that's a non-issue; for ongoing ops it's worth noting that admin recovery happens via `UPDATE profiles SET role='admin' WHERE id=…` from the SQL editor (service role).

7. **Cleanup ordering matters because `classes.teacher_id` is `ON DELETE RESTRICT`.** The first version of the script hit `Database error deleting user` when deleting a teacher before deleting their class. Either change to `ON DELETE CASCADE` (matches the existing class_memberships behaviour) or document the operational ordering requirement. The smoke script now deletes the class first.

8. **No anonymous account → real account conversion path is tested.** Migration 0003 mentions that "Supabase supports linking" but that's not exercised anywhere. Once anonymous auth is enabled, a future test should attempt `updateUser({ email, password })` to convert an anon student to a real account and re-fetch the profile.

---

## Recommended next changes (prioritized)

1. **Ship migration `0006_rls_fix.sql`** that introduces `is_teacher(uid)` (SECURITY DEFINER) and rewrites `classes: teacher or admin creates` to use it. Without this, the teacher cannot create a class in production. **(P0 — blocks the entire teacher workflow.)**

2. **Audit every other RLS policy that does a raw `EXISTS (SELECT … FROM profiles …)` inside a policy on another table.** Same recursion risk. Specifically:
   - `classes: teacher or admin creates` WITH CHECK (fixed above)
   - The pattern doesn't recur elsewhere in 0001–0005 that I saw, but re-grep before shipping.

3. **Enable Anonymous Sign-Ins in the Supabase Auth provider config** to unlock the quick-start flow. Without this the `quick_start_with_code` RPC has no caller. **(P0 if quick-start is in scope for launch; P1 otherwise.)**

4. **Add `viewer/scripts/smoke-e2e.mjs` to CI** (gated by a secret containing the service-role key for a dedicated CI Supabase project, not prod). Treat any step regression as a release-blocker.

5. **Decide on cascade vs. restrict for `classes.teacher_id`.** Either change to `ON DELETE CASCADE` to match `class_memberships`, or document the explicit "delete class first" ordering for admin tooling. Currently the script handles it; future admin UIs will hit the same wall.

6. **Add a short `docs/RPCS.md`** that lists each PUBLIC `auth`-callable RPC, its parameters, returned shape, and raised exception names. Today this knowledge lives only in the migration comments.

7. **Convert the smoke script's hard-coded test data into a `--keep` mode** for manual exploration (skip cleanup, print a summary of created IDs). Cheap follow-up; useful for poking around in the dashboard afterwards.

8. **Add explicit DB tests for the `result_detail` JSON shape** (`byDomain`, `bySkill`, `byDifficulty`, `totalQuestions`, `correctCount`, `scorePercent`, `durationSeconds`). The MVP comment in `0004_assignments.sql` notes this is intentionally untyped, but a CHECK constraint requiring the top-level keys would catch frontend regressions early without forcing a full schema for the breakdown arrays.
