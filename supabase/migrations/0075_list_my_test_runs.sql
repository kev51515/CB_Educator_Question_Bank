-- =============================================================================
-- Migration: 0075_list_my_test_runs.sql
-- Description: Student-facing list of their own submitted full-length tests,
--              with a released flag — powers the student "Your test results"
--              surface so a teacher's release actually becomes visible.
--
-- Deliberately does NOT return score/answers (those only come from
-- get_test_result, which stays gated to released runs per 0072). This is just
-- the index: which tests I've finished and whether results are available yet.
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_my_test_runs()
RETURNS TABLE (
  run_id       uuid,
  test_slug    text,
  test_title   text,
  submitted_at timestamptz,
  released     boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  RETURN QUERY
  SELECT r.id, t.slug, t.title, r.submitted_at,
         (r.results_released_at IS NOT NULL) AS released
    FROM public.test_runs r
    JOIN public.tests t ON t.id = r.test_id
   WHERE r.user_id = v_uid
     AND r.status = 'submitted'
   ORDER BY r.submitted_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_test_runs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_test_runs() TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0075_list_my_test_runs.sql
-- =============================================================================
