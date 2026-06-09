-- =============================================================================
-- Migration: 0131_admin_only_privileged_rpcs.sql
-- Description: Re-tighten privileged + system-wide RPCs from is_staff → is_admin.
--
-- WHY: migration 0009 ("cross-staff parity") deliberately downgraded a set of
-- admin RPCs from is_admin to is_staff so the husband-wife team's teacher
-- accounts could also mint invite codes, change roles, and read system-wide
-- stats. That over-shares now: a teacher is here to run their OWN courses and
-- must NOT mint/revoke teacher invites, change anyone's role, or see whole-
-- system dashboards. These are admin-only actions again.
--
-- Bodies are reproduced verbatim from their latest definitions (mint/revoke/
-- set_user_role from 0009; admin_dashboard_stats from 0012 — the courses-era
-- rewrite) with ONLY the authorization gate flipped is_staff → is_admin.
--
-- admin_delete_user was already re-locked to is_admin in 0050 (B1), so it is
-- intentionally not touched here. The error contract (not_authenticated /
-- not_authorized + ERRCODE) is unchanged, so existing clients keep working.
--
-- The matching AccountRoutes UI change hides the whole Admin section (Stats /
-- Users / Invite codes / Audit log) from non-admins; this migration is the
-- server-side half so the gate holds even against a direct API call.
--
-- Forward-only.
-- =============================================================================

-- ---- mint_teacher_invite (gate: is_staff → is_admin) ----
CREATE OR REPLACE FUNCTION public.mint_teacher_invite(
  p_code       text,
  p_note       text,
  p_expires_at timestamptz,
  p_max_uses   integer
)
  RETURNS public.teacher_invite_codes
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_code    text;
  v_row     public.teacher_invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Admin-only (was is_staff in 0009).
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_code := lower(trim(coalesce(p_code, '')));
  IF char_length(v_code) < 6 OR char_length(v_code) > 32 THEN
    RAISE EXCEPTION 'invalid_code_length' USING ERRCODE = '22023';
  END IF;

  IF v_code !~ '^[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'invalid_code_format' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.teacher_invite_codes WHERE code = v_code) THEN
    RAISE EXCEPTION 'code_already_exists' USING ERRCODE = '23505';
  END IF;

  IF p_max_uses IS NOT NULL AND p_max_uses <= 0 THEN
    RAISE EXCEPTION 'invalid_max_uses' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.teacher_invite_codes (code, note, created_by, expires_at, max_uses)
  VALUES (v_code, NULLIF(trim(p_note), ''), v_uid, p_expires_at, p_max_uses)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_teacher_invite(text, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_teacher_invite(text, text, timestamptz, integer) TO authenticated;


-- ---- revoke_teacher_invite (gate: is_staff → is_admin) ----
CREATE OR REPLACE FUNCTION public.revoke_teacher_invite(p_code text)
  RETURNS public.teacher_invite_codes
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_row  public.teacher_invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Admin-only (was is_staff in 0009).
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.teacher_invite_codes
     SET revoked = true
   WHERE code = lower(trim(p_code))
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found' USING ERRCODE = '02000';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_teacher_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_teacher_invite(text) TO authenticated;


-- ---- set_user_role (gate: is_staff → is_admin) ----
-- Self-demotion guard (cannot_demote_self) preserved verbatim.
CREATE OR REPLACE FUNCTION public.set_user_role(
  p_user_id uuid,
  p_role    public.user_role
)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Admin-only (was is_staff in 0009). A teacher must not change roles.
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;

  IF p_user_id = v_uid AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'cannot_demote_self' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET role = p_role,
         updated_at = now()
   WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '02000';
  END IF;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.user_role) TO authenticated;


-- ---- admin_dashboard_stats (gate: is_staff → is_admin) ----
-- System-wide aggregation; body reproduced verbatim from the 0012 (courses-era)
-- definition with only the gate flipped.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Admin-only (was is_staff). Whole-system metrics are not for teachers.
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH
    users_roles AS (
      SELECT
        count(*) FILTER (WHERE role = 'student') AS students,
        count(*) FILTER (WHERE role = 'teacher') AS teachers,
        count(*) FILTER (WHERE role = 'admin')   AS admins
      FROM public.profiles
    ),
    courses_agg AS (
      SELECT
        count(*) FILTER (WHERE archived = false) AS active,
        count(*) FILTER (WHERE archived = true)  AS archived
      FROM public.courses
    ),
    memberships_agg AS (
      SELECT count(*) AS total FROM public.course_memberships
    ),
    assignments_src AS (
      SELECT
        count(*) FILTER (WHERE source_id = 'cb')    AS cb,
        count(*) FILTER (WHERE source_id = 'sat')   AS sat,
        count(*) FILTER (WHERE source_id = 'mixed') AS mixed
      FROM public.assignments
    ),
    attempts_agg AS (
      SELECT
        count(*) FILTER (WHERE submitted_at IS NULL)     AS in_progress,
        count(*) FILTER (WHERE submitted_at IS NOT NULL) AS completed,
        avg(score_percent) FILTER (WHERE submitted_at IS NOT NULL) AS avg_score
      FROM public.assignment_attempts
    ),
    recent_signups AS (
      SELECT count(*) AS c
      FROM public.profiles
      WHERE created_at >= now() - interval '7 days'
    ),
    recent_attempts AS (
      SELECT count(*) AS c
      FROM public.assignment_attempts
      WHERE submitted_at IS NOT NULL
        AND submitted_at >= now() - interval '7 days'
    ),
    teacher_activity AS (
      SELECT
        p.id,
        p.display_name,
        p.email,
        (SELECT count(*) FROM public.courses c WHERE c.teacher_id = p.id) AS classes_count,
        (SELECT count(*) FROM public.assignments a WHERE a.created_by = p.id) AS assignments_count
      FROM public.profiles p
      WHERE p.role IN ('teacher', 'admin')
    ),
    top_teachers AS (
      SELECT jsonb_agg(t ORDER BY t.classes_count DESC, t.assignments_count DESC) FILTER (
        WHERE t.classes_count > 0 OR t.assignments_count > 0
      ) AS rows
      FROM (
        SELECT id, display_name, email, classes_count, assignments_count
        FROM teacher_activity
        ORDER BY classes_count DESC, assignments_count DESC
        LIMIT 5
      ) t
    ),
    student_activity AS (
      SELECT
        p.id,
        p.display_name,
        p.email,
        count(aa.id) AS completed_attempts
      FROM public.profiles p
      JOIN public.assignment_attempts aa
        ON aa.student_id = p.id AND aa.submitted_at IS NOT NULL
      WHERE p.role = 'student'
      GROUP BY p.id, p.display_name, p.email
      ORDER BY completed_attempts DESC
      LIMIT 5
    ),
    top_students AS (
      SELECT jsonb_agg(s) AS rows FROM student_activity s
    )
  SELECT jsonb_build_object(
    'users_by_role', jsonb_build_object(
      'student', (SELECT students FROM users_roles),
      'teacher', (SELECT teachers FROM users_roles),
      'admin',   (SELECT admins   FROM users_roles)
    ),
    'courses', jsonb_build_object(
      'active',   (SELECT active   FROM courses_agg),
      'archived', (SELECT archived FROM courses_agg)
    ),
    'memberships', (SELECT total FROM memberships_agg),
    'assignments_by_source', jsonb_build_object(
      'cb',    (SELECT cb    FROM assignments_src),
      'sat',   (SELECT sat   FROM assignments_src),
      'mixed', (SELECT mixed FROM assignments_src)
    ),
    'attempts', jsonb_build_object(
      'in_progress', (SELECT in_progress FROM attempts_agg),
      'completed',   (SELECT completed   FROM attempts_agg)
    ),
    'avg_score', (SELECT avg_score FROM attempts_agg),
    'recent_signups_count',  (SELECT c FROM recent_signups),
    'recent_attempts_count', (SELECT c FROM recent_attempts),
    'most_active_teachers',  COALESCE((SELECT rows FROM top_teachers), '[]'::jsonb),
    'most_active_students',  COALESCE((SELECT rows FROM top_students), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0131_admin_only_privileged_rpcs.sql
-- =============================================================================
