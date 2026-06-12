-- =============================================================================
-- 0198_trash_soft_delete.sql
--
-- TRASH CAN: deleting a course or a user now moves it to a trash with a
-- 90-day recovery window instead of destroying it immediately ("just to be
-- safe" — Kevin, 2026-06-12). Hard deletion still exists but only the daily
-- purge job (and the legacy admin_delete_user RPC, kept for the smoke suite
-- and as the purge primitive) performs it.
--
--   • courses.deleted_at/deleted_by + profiles.deleted_at/deleted_by.
--   • Teacher + student SELECT policies on courses gain `deleted_at IS NULL`
--     so a trashed course vanishes app-wide with zero client-query changes.
--     The admin read-all policy is untouched — admins manage the trash and
--     the Trash page reads trashed rows directly under it.
--   • trash_course / restore_course — owner-or-admin (mirrors the 0130
--     delete policy). Audit: course.trash / course.restore.
--   • trash_user / restore_user — admin-only (mirrors admin_delete_user's
--     B1 gate). Trashing also BANS the auth user (banned_until) so they
--     can't sign in while trashed; restore lifts the ban. Audit:
--     user.trash / user.restore.
--   • purge_trash() — hard-deletes anything trashed > 90 days ago. Courses
--     via plain DELETE (FK cascades take dependents); users via DELETE FROM
--     auth.users (profiles cascade fires 0050's BEFORE DELETE audit snapshot,
--     so the forensic trail survives the purge). EXECUTE revoked from
--     authenticated — only the pg_cron job (runs as postgres) calls it.
--   • cron job 'trash-purge-daily' at 03:40 UTC.
--
-- All functions SECURITY DEFINER + SET search_path = public, auth per the
-- CLAUDE.md trigger/RPC rule. Stable string error codes. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns + partial indexes
-- -----------------------------------------------------------------------------
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS courses_deleted_at_idx
  ON public.courses (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON public.profiles (deleted_at) WHERE deleted_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Hide trashed courses from teachers + students via RLS
--    (Recreate the 0132 teacher policy + the 0012 student policy with the
--    deleted_at filter. The owner check stays a DIRECT column compare so
--    INSERT ... RETURNING keeps working — the 0132 lesson.)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "courses: teacher sees own or shared" ON public.courses;
CREATE POLICY "courses: teacher sees own or shared"
  ON public.courses
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      teacher_id = (SELECT auth.uid())
      OR public.is_teacher_of_course((SELECT auth.uid()), id)
    )
  );

DROP POLICY IF EXISTS "courses: student sees enrolled" ON public.courses;
CREATE POLICY "courses: student sees enrolled"
  ON public.courses
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.is_student_in_class((SELECT auth.uid()), id)
  );

-- ("courses: admin reads all" intentionally NOT filtered — the Trash page
--  and admin tooling read trashed rows under it.)

-- -----------------------------------------------------------------------------
-- 3. trash_course / restore_course
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trash_course(p_course_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_name  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT teacher_id, name INTO v_owner, v_name
    FROM public.courses WHERE id = p_course_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'course_not_found' USING ERRCODE = '22023';
  END IF;

  -- Mirror the DELETE policy: owner or admin (a shared co-teacher may not).
  IF v_owner <> v_uid AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.courses
     SET deleted_at = now(), deleted_by = v_uid
   WHERE id = p_course_id
     AND deleted_at IS NULL;  -- idempotent: re-trashing keeps the first clock

  IF FOUND THEN
    PERFORM public.audit_record(
      'course.trash', 'course', p_course_id::text,
      jsonb_build_object('name', v_name, 'purge_after_days', 90)
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.trash_course(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trash_course(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_course(p_course_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_name  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT teacher_id, name INTO v_owner, v_name
    FROM public.courses WHERE id = p_course_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'course_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_owner <> v_uid AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.courses
     SET deleted_at = NULL, deleted_by = NULL
   WHERE id = p_course_id
     AND deleted_at IS NOT NULL;

  IF FOUND THEN
    PERFORM public.audit_record(
      'course.restore', 'course', p_course_id::text,
      jsonb_build_object('name', v_name)
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_course(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_course(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. trash_user / restore_user (admin-only, mirrors admin_delete_user's gate)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trash_user(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_delete_self' USING ERRCODE = '22023';
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = p_user_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET deleted_at = now(), deleted_by = v_uid
   WHERE id = p_user_id
     AND deleted_at IS NULL;

  IF FOUND THEN
    -- Block sign-in for the trash window. GoTrue refuses banned users at
    -- password/OTP login and at token refresh, so an open session dies at
    -- its next refresh (~1h worst case).
    UPDATE auth.users
       SET banned_until = now() + interval '100 years'
     WHERE id = p_user_id;

    PERFORM public.audit_record(
      'user.trash', 'profile', p_user_id::text,
      jsonb_build_object('display_name', v_name, 'purge_after_days', 90)
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.trash_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trash_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_user(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = p_user_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET deleted_at = NULL, deleted_by = NULL
   WHERE id = p_user_id
     AND deleted_at IS NOT NULL;

  IF FOUND THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = p_user_id;
    PERFORM public.audit_record(
      'user.restore', 'profile', p_user_id::text,
      jsonb_build_object('display_name', v_name)
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_user(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. purge_trash — the only hard-delete path. Cron-only (no authenticated
--    EXECUTE). 0050's BEFORE DELETE trigger on profiles still snapshots
--    dependent-row counts into audit_events when the user purge cascades.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_trash()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_courses integer := 0;
  v_users   integer := 0;
BEGIN
  WITH gone AS (
    DELETE FROM public.courses
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - interval '90 days'
     RETURNING id
  )
  SELECT count(*) INTO v_courses FROM gone;

  WITH gone AS (
    DELETE FROM auth.users u
     USING public.profiles p
     WHERE p.id = u.id
       AND p.deleted_at IS NOT NULL
       AND p.deleted_at < now() - interval '90 days'
     RETURNING u.id
  )
  SELECT count(*) INTO v_users FROM gone;

  IF v_courses > 0 OR v_users > 0 THEN
    INSERT INTO public.audit_events (actor_id, action, target_kind, details)
    VALUES (NULL, 'trash.purge', 'system',
            jsonb_build_object('courses', v_courses, 'users', v_users));
  END IF;

  RETURN jsonb_build_object('courses', v_courses, 'users', v_users);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_trash() FROM PUBLIC;
-- No GRANT to authenticated: pg_cron runs as the function owner (postgres).

-- -----------------------------------------------------------------------------
-- 6. my_available_domains (0197) — a trashed course no longer grants its
--    domain. (derive_user_domain left as-is: it only picks a THEME default,
--    and a stale theme is harmless; the switcher is scoped by this one.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_available_domains()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_domains text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN ARRAY['academic'];
  END IF;

  IF public.is_admin(v_uid) THEN
    RETURN ARRAY['academic', 'counseling', 'coaching'];
  END IF;

  SELECT array_agg(d ORDER BY array_position(ARRAY['academic','counseling','coaching'], d))
    INTO v_domains
  FROM (
    SELECT DISTINCT CASE
      WHEN c.course_type IN ('pickleball_player', 'pickleball_coach') THEN 'coaching'
      WHEN c.course_type = 'counseling' THEN 'counseling'
      ELSE 'academic'
    END AS d
    FROM public.courses c
    WHERE c.deleted_at IS NULL
      AND (
        c.teacher_id = v_uid
        OR EXISTS (
             SELECT 1 FROM public.course_shares s
              WHERE s.course_id = c.id AND s.recipient_id = v_uid
           )
        OR EXISTS (
             SELECT 1 FROM public.course_memberships m
              WHERE m.course_id = c.id AND m.student_id = v_uid
           )
      )
  ) t;

  RETURN COALESCE(v_domains, ARRAY['academic']);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available; skipping schedule. Re-run after enabling.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('trash-purge-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trash-purge-daily');

  PERFORM cron.schedule(
    'trash-purge-daily',
    '40 3 * * *',
    'SELECT public.purge_trash();'
  );
END
$$;

-- =============================================================================
-- END 0198
-- =============================================================================
