-- =============================================================================
-- Migration: 0123_course_skill_mastery.sql
-- Description: Class-wide, cross-test SAT skill mastery for a course. Powers the
--              teacher "Class skills" tab: per-domain %-correct aggregated over
--              every full-length test the class's enrolled students have taken.
--
-- Counts the LATEST submitted run per (student, test) — so a student who retook
-- a form isn't double-counted, and a student who took 3 different tests
-- contributes all 3. Scoped to students enrolled in the course
-- (course_memberships). Returns a single jsonb:
--   { students, tests, attempts,
--     domains: [ { section, domain, correct, total }, ... ] }
-- The client groups domains by section (skills.ts) and renders mastery bars.
--
-- SECURITY DEFINER + is_teacher_of_course/is_admin guard, mirroring the 0112
-- review RPCs. Forward-only; new function.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.course_skill_mastery(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, p_course_id) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN (
    WITH submitted AS (
      SELECT r.id, r.user_id, r.test_id, r.submitted_at
        FROM public.test_runs r
        JOIN public.course_memberships cm
          ON cm.student_id = r.user_id AND cm.course_id = p_course_id
       WHERE r.status = 'submitted'
    ),
    latest AS (
      -- one run per (student, test): their most recent submission
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
          'section', d.section,
          'domain', d.domain,
          'correct', d.correct,
          'total', d.total
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

REVOKE ALL ON FUNCTION public.course_skill_mastery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_skill_mastery(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0123_course_skill_mastery.sql
-- =============================================================================
