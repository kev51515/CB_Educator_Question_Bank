-- =============================================================================
-- Migration: 0006_admin_rpcs.sql
-- Description: Admin-only RPCs powering the AdminShell surface in viewer/:
--                set_user_role        — change a profile's role
--                admin_delete_user    — hard-delete a user (cascades from auth.users)
--                admin_dashboard_stats — aggregate KPIs for the Overview tab
-- Platform: Supabase (PostgreSQL 15+)
-- Note: Supabase wraps each migration in a transaction automatically.
--
-- All three RPCs are SECURITY DEFINER + guarded internally by
-- public.is_admin(auth.uid()), so we can safely GRANT EXECUTE to authenticated
-- without leaking anything to non-admins. Non-admins get a clean
-- "not_authorized" error.
-- =============================================================================


-- =============================================================================
-- SECTION 1: RPC — set_user_role(p_user_id, p_role)
-- Admin-only. Updates a profile's role to p_role. Returns the new profile row.
-- Refuses to demote the caller (so admins can't lock themselves out by
-- demoting their own row).
-- =============================================================================

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

  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;

  -- Self-demotion guard: if the caller is updating their own profile and the
  -- new role isn't 'admin', refuse. Prevents accidental admin lockout.
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


-- =============================================================================
-- SECTION 2: RPC — admin_delete_user(p_user_id)
-- Admin-only. Deletes a user from auth.users; the profiles FK cascades, which
-- in turn cascades to every dependent table (classes, memberships, attempts).
-- Refuses to delete the caller's own account (caller must use a separate
-- "delete my account" surface for that).
-- =============================================================================

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

  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE = '22023';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_delete_self' USING ERRCODE = '22023';
  END IF;

  -- Deleting from auth.users cascades to public.profiles (FK ON DELETE
  -- CASCADE established in 0001), which in turn cascades to every dependent
  -- table that references profiles(id) with ON DELETE CASCADE.
  DELETE FROM auth.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = '02000';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- =============================================================================
-- SECTION 3: RPC — admin_dashboard_stats()
-- Admin-only. Aggregates a single JSON payload of KPIs for the Overview tab,
-- so the client makes ONE call instead of 8+ separate queries. All numbers
-- come from plain SQL aggregates against tables RLS-readable by admins.
--
-- Shape:
--   {
--     users_by_role: { student, teacher, admin },
--     classes:       { active, archived },
--     memberships:   <int>,
--     assignments_by_source: { cb, sat, mixed },
--     attempts:      { in_progress, completed },
--     avg_score:     <numeric|null>,
--     recent_signups_count: <int>,   -- last 7 days
--     recent_attempts_count: <int>,  -- last 7 days, completed only
--     most_active_teachers: [
--       { id, display_name, email, classes_count, assignments_count }, ...top 5
--     ],
--     most_active_students: [
--       { id, display_name, email, completed_attempts }, ...top 5
--     ]
--   }
-- =============================================================================

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
    classes_agg AS (
      SELECT
        count(*) FILTER (WHERE archived = false) AS active,
        count(*) FILTER (WHERE archived = true)  AS archived
      FROM public.classes
    ),
    memberships_agg AS (
      SELECT count(*) AS total FROM public.class_memberships
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
        (SELECT count(*) FROM public.classes c WHERE c.teacher_id = p.id) AS classes_count,
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
    'classes', jsonb_build_object(
      'active',   (SELECT active   FROM classes_agg),
      'archived', (SELECT archived FROM classes_agg)
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
-- END OF MIGRATION 0006_admin_rpcs.sql
-- =============================================================================
