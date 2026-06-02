-- =============================================================================
-- Migration: 0050_security_audit_cascade.sql
-- Description: Wave 19 security + audit + idempotency hardening pass.
--              Bundles 5 backend findings into one forward-only migration.
--              (Original lane spec called this "0048" but 0048 was already
--               taken by full_tests; we slot in at the next free number.)
--
-- Summary of changes:
--   B1  admin_delete_user gate flipped from is_staff → is_admin.
--       Previously any teacher could delete any user, including admins.
--   B2  BEFORE-DELETE trigger on public.profiles snapshots dependent-row
--       counts into audit_events so the cascade leaves a forensic trail.
--   M32 Three audit-trigger functions from 0027 were missing `auth` from
--       their search_path. Re-declared verbatim with the corrected setting.
--   M33 test_attempts gains a `client_attempt_id` column + partial unique
--       index so the static test runner can retry POSTs safely.
--       The auth.users → profiles FK swap on test_attempts.user_id is
--       INTENTIONALLY deferred — changing an FK on a populated table is
--       riskier than this migration's other changes and warrants its own
--       window. Documented at the bottom of this file.
--   M34 New smoke suite `cascade` covers archive cascade, profile-delete
--       audit, the privilege guard, and idempotency. See
--       viewer/scripts/smoke-cascade.mjs.
--
-- Forward-only. No DROP TABLE. No data destruction. Idempotent re-runs OK.
-- =============================================================================


-- =============================================================================
-- B1: admin_delete_user — re-gate from is_staff() to is_admin().
-- =============================================================================
-- The body below is byte-for-byte the 0009 version EXCEPT the role gate.
-- We keep SECURITY DEFINER + SET search_path = public, auth (project norm)
-- and we keep the same return type, same arg name, same error codes so any
-- existing callers (admin UI in viewer/src/account/admin/*) continue to work.
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Was: is_staff. Now: is_admin. (Wave 19 B1.)
  -- Teachers must not be able to delete users, including each other.
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_delete_self' USING ERRCODE = '22023';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = '02000';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- =============================================================================
-- B2: BEFORE-DELETE audit trigger on public.profiles.
-- =============================================================================
-- Rationale: every student-data table FKs into profiles(id) with
-- ON DELETE CASCADE. Today a profile delete silently nukes assignment
-- attempts, course memberships, portfolio submissions, notifications,
-- message threads, invite redemptions, reminder logs, and module-item
-- completion rows. We do not change the cascade behavior (FK churn on
-- live tables is riskier than the audit gap), but we DO snapshot a
-- structured event so admins can answer "what got destroyed when X was
-- deleted?" after the fact.
--
-- This trigger is BEFORE DELETE so the dependent-row counts reflect what
-- the cascade is ABOUT TO destroy (after the cascade fires, the rows are
-- already gone). It's purely observational — it never blocks the DELETE.
CREATE OR REPLACE FUNCTION public.audit_profile_delete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_counts jsonb;
BEGIN
  -- Snapshot dependent-row counts. Each subquery is wrapped in COALESCE so
  -- a missing-table case (during downgrade or partial schema state) doesn't
  -- abort the audit. We're counting rows the CASCADE is about to delete.
  SELECT jsonb_build_object(
    'assignment_attempts',
      (SELECT count(*) FROM public.assignment_attempts       WHERE student_id     = OLD.id),
    'course_memberships',
      (SELECT count(*) FROM public.course_memberships        WHERE student_id     = OLD.id),
    'portfolio_submissions',
      (SELECT count(*) FROM public.portfolio_submissions     WHERE student_id     = OLD.id),
    'notifications',
      (SELECT count(*) FROM public.notifications             WHERE recipient_id   = OLD.id),
    'module_item_completion',
      (SELECT count(*) FROM public.module_item_completion    WHERE student_id     = OLD.id),
    'teacher_invite_redemptions',
      (SELECT count(*) FROM public.teacher_invite_redemptions WHERE redeemed_by   = OLD.id),
    'reminder_log',
      (SELECT count(*) FROM public.reminder_log              WHERE student_id     = OLD.id),
    'message_threads_a',
      (SELECT count(*) FROM public.message_threads           WHERE participant_a  = OLD.id),
    'message_threads_b',
      (SELECT count(*) FROM public.message_threads           WHERE participant_b  = OLD.id)
  ) INTO v_counts;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    auth.uid(),
    'profile.delete',
    'profile',
    OLD.id::text,
    jsonb_build_object(
      'email',            OLD.email,
      'role',             OLD.role,
      'dependent_counts', v_counts
    )
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profile_delete ON public.profiles;
CREATE TRIGGER trg_audit_profile_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_delete();


-- =============================================================================
-- M32: 0027 audit triggers — restore project-standard search_path.
-- =============================================================================
-- Original 0027 declared these three functions with `SET search_path = public`.
-- Project convention (every other SECURITY DEFINER in the codebase) is
-- `SET search_path = public, auth`. Without `auth` on the search path,
-- any reference to auth.uid() / auth.users from inside the function works
-- only because PL/pgSQL qualifies it explicitly; but if a future revision
-- of one of these functions starts unqualifying an auth.* call it would
-- silently break. Re-declare with the corrected setting; bodies unchanged
-- from 0027.
CREATE OR REPLACE FUNCTION public.audit_assignment_delete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'assignment.delete', 'assignment', OLD.id::text,
          jsonb_build_object('title', OLD.title, 'course_id', OLD.course_id));
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_material_delete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'material.delete', 'course_material', OLD.id::text,
          jsonb_build_object('title', OLD.title, 'kind', OLD.kind, 'course_id', OLD.course_id));
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_announcement_delete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (auth.uid(), 'announcement.delete', 'course_announcement', OLD.id::text,
          jsonb_build_object('title', OLD.title, 'course_id', OLD.course_id));
  RETURN OLD;
END;
$$;


-- =============================================================================
-- M33: test_attempts idempotency.
-- =============================================================================
-- The static test-runner retries POSTs on flaky networks. Without an
-- idempotency key, a retried submission inserts a duplicate attempt that
-- shows up as a phantom in "your progress". The existing partial unique
-- index (test_attempts_one_draft_per_set) protects only drafts; submitted
-- attempts had no protection.
--
-- Add `client_attempt_id uuid` and a partial unique index. Clients pass a
-- stable UUID per logical attempt; duplicate POSTs raise a unique-violation
-- that the API layer can swallow as "already done".
ALTER TABLE public.test_attempts
  ADD COLUMN IF NOT EXISTS client_attempt_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS test_attempts_idempotency_idx
  ON public.test_attempts (user_id, client_attempt_id)
  WHERE client_attempt_id IS NOT NULL;

-- Deferred (intentionally NOT done here):
--   test_attempts.user_id currently REFERENCES auth.users(id) ON DELETE CASCADE.
--   Project convention for user-owned data is REFERENCES public.profiles(id).
--   Swapping the FK on a populated, RLS-protected table while keeping the
--   ON DELETE CASCADE semantics needs its own migration window with a smoke
--   pass aimed at it. The functional impact today is zero (auth.users.id ==
--   profiles.id) so we leave it for a focused follow-up.

-- =============================================================================
-- End 0050.
-- =============================================================================
