-- =============================================================================
-- Migration: 0128_system_skill_mastery.sql
-- Description: Cohort-wide SAT skill mastery for the admin Overview — per-domain
--              %-correct across EVERY full-length test EVERY student has taken
--              (latest attempt per student per test). A program-level signal:
--              "across all our students, which domains are weakest?"
--
-- Mirrors course_skill_mastery (0123) but global, scoped to student-role users
-- (excludes staff preview runs). ADMIN-ONLY (is_admin). Read-only; new function.
-- Returns: { students, tests, attempts, domains:[{section,domain,correct,total}] }.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.system_skill_mastery()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN (
    WITH submitted AS (
      SELECT r.id, r.user_id, r.test_id, r.submitted_at
        FROM public.test_runs r
        JOIN public.profiles p ON p.id = r.user_id AND p.role = 'student'
       WHERE r.status = 'submitted'
    ),
    latest AS (
      SELECT DISTINCT ON (s.user_id, s.test_id) s.id
        FROM submitted s
       ORDER BY s.user_id, s.test_id, s.submitted_at DESC NULLS LAST
    )
    SELECT jsonb_build_object(
      'students', (SELECT count(DISTINCT user_id) FROM submitted),
      'tests', (SELECT count(DISTINCT test_id) FROM submitted),
      'attempts', (SELECT count(*) FROM latest),
      'domains', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'section', d.section, 'domain', d.domain, 'correct', d.correct, 'total', d.total
        ) ORDER BY d.section, d.domain), '[]'::jsonb)
        FROM (
          SELECT m.section AS section,
                 tq.domain AS domain,
                 count(*) FILTER (WHERE a.is_correct) AS correct,
                 count(*) AS total
            FROM latest l
            JOIN public.test_run_answers a ON a.run_id = l.id
            JOIN public.test_questions tq ON tq.id = a.question_id
            JOIN public.test_modules m ON m.id = tq.module_id
           WHERE tq.domain IS NOT NULL AND tq.domain <> ''
           GROUP BY m.section, tq.domain
        ) d
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.system_skill_mastery() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_skill_mastery() TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0128_system_skill_mastery.sql
-- =============================================================================
