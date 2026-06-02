-- =============================================================================
-- Migration: 0074_list_student_test_runs.sql
-- Description: Staff RPC to list a student's submitted full-length test runs,
--              powering the teacher "review & release results" surface.
--
-- test_runs is owner-only under RLS (test_runs_owner, 0048), so a teacher can't
-- SELECT a student's runs directly. This SECURITY DEFINER function returns the
-- submitted runs (joined to the test catalog) for any student, gated to staff —
-- mirroring is_staff visibility used elsewhere. Per-run detail still goes
-- through get_test_result (staff-readable since 0072); release is via
-- release_test_results (0072).
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_test_runs_for_student(p_student_id uuid)
RETURNS TABLE (
  run_id              uuid,
  test_slug           text,
  test_title          text,
  score               integer,
  total               integer,
  duration_seconds    integer,
  submitted_at        timestamptz,
  results_released_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  SELECT r.id, t.slug, t.title, r.score, r.total, r.duration_seconds,
         r.submitted_at, r.results_released_at
    FROM public.test_runs r
    JOIN public.tests t ON t.id = r.test_id
   WHERE r.user_id = p_student_id
     AND r.status = 'submitted'
   ORDER BY r.submitted_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_test_runs_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_test_runs_for_student(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0074_list_student_test_runs.sql
-- =============================================================================
