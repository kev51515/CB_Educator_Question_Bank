-- =============================================================================
-- Migration: 0125_admin_user_overview.sql
-- Description: Per-user activity snapshot for the admin "All Users" detail
--              drawer — so an admin can monitor any user at a glance (last
--              sign-in, last activity, how many courses they teach / are
--              enrolled in, assignment attempts, full-test runs).
--
-- Single jsonb for one user. ADMIN-ONLY (is_admin) — stricter than the
-- is_staff admin RPCs, since this exposes a user's cross-surface activity.
-- last_sign_in_at comes from auth.users (readable here because the function is
-- SECURITY DEFINER with auth on the search_path). Read-only; new function.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_user_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_prof public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  RETURN jsonb_build_object(
    'id', v_prof.id,
    'email', v_prof.email,
    'display_name', v_prof.display_name,
    'role', v_prof.role,
    'created_at', v_prof.created_at,
    'last_sign_in_at', (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = p_user_id),
    'courses_teaching', (SELECT count(*) FROM public.courses WHERE teacher_id = p_user_id),
    'courses_enrolled', (SELECT count(*) FROM public.course_memberships WHERE student_id = p_user_id),
    'assignment_attempts', (SELECT count(*) FROM public.assignment_attempts WHERE student_id = p_user_id),
    'test_runs', (SELECT count(*) FROM public.test_runs WHERE user_id = p_user_id),
    'test_runs_submitted',
      (SELECT count(*) FROM public.test_runs WHERE user_id = p_user_id AND status = 'submitted'),
    -- best-effort "last seen doing anything": newest of sign-in / test / assignment activity
    'last_active', greatest(
      (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = p_user_id),
      (SELECT max(coalesce(last_seen_at, submitted_at, started_at)) FROM public.test_runs WHERE user_id = p_user_id),
      (SELECT max(coalesce(submitted_at, created_at)) FROM public.assignment_attempts WHERE student_id = p_user_id)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_overview(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0125_admin_user_overview.sql
-- =============================================================================
