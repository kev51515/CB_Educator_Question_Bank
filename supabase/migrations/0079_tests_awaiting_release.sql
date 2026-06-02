-- =============================================================================
-- Migration: 0079_tests_awaiting_release.sql
-- Description: Dashboard nudge data — tests with submitted-but-unreleased runs
--              among the teacher's students, so a teacher logging in after a
--              test day is told there's work waiting (and can release in place).
--
-- Returns one row per test that has ≥1 unreleased submitted run belonging to
-- the caller's students (admins: all), with the awaiting count. Staff-only.
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tests_awaiting_release()
RETURNS TABLE (
  slug           text,
  title          text,
  awaiting_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.is_admin(v_uid);

  RETURN QUERY
  SELECT t.slug, t.title, count(*)::int AS awaiting_count
    FROM public.test_runs r
    JOIN public.tests t ON t.id = r.test_id
   WHERE r.status = 'submitted'
     AND r.results_released_at IS NULL
     AND (v_admin OR EXISTS (
            SELECT 1 FROM public.course_memberships cm
              JOIN public.courses c ON c.id = cm.course_id
             WHERE cm.student_id = r.user_id AND c.teacher_id = v_uid))
   GROUP BY t.slug, t.title
   ORDER BY t.title;
END;
$$;

REVOKE ALL ON FUNCTION public.tests_awaiting_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tests_awaiting_release() TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0079_tests_awaiting_release.sql
-- =============================================================================
