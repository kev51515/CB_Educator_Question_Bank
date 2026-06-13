-- =============================================================================
-- Migration: 0238_course_skill_by_student.sql
-- Description: Per-student SAT skill mastery for a course — the drill-down behind
--              the teacher "Class skills" tab's "Teach next" panel. Where 0123
--              (course_skill_mastery) rolls the whole class up to one %-per-domain,
--              this returns one row per (student, section, domain) so the teacher
--              can see WHICH students are weak in a given domain and target them.
--
-- Same data spine as 0123: counts the LATEST submitted run per (student, test)
-- so a retake isn't double-counted, scoped to students enrolled in the course
-- (course_memberships), only rows whose question carries a domain. Joins
-- profiles.display_name for the per-student label.
--
-- Returns a SETOF rows (not jsonb) — the drill-down filters client-side by domain:
--   (student_id uuid, student_name text, section text, domain text,
--    correct int, total int)
--
-- SECURITY DEFINER + is_teacher_of_course/is_admin guard, mirroring 0123.
-- Forward-only; new function. Idempotent (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.course_skill_by_student(p_course_id uuid)
RETURNS TABLE (
  student_id uuid,
  student_name text,
  section text,
  domain text,
  correct int,
  total int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, p_course_id) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH submitted AS (
    SELECT r.id, r.user_id, r.test_id, r.submitted_at
      FROM public.test_runs r
      JOIN public.course_memberships cm
        ON cm.student_id = r.user_id AND cm.course_id = p_course_id
     WHERE r.status = 'submitted'
  ),
  latest AS (
    -- one run per (student, test): their most recent submission
    SELECT DISTINCT ON (s.user_id, s.test_id) s.id, s.user_id
      FROM submitted s
     ORDER BY s.user_id, s.test_id, s.submitted_at DESC NULLS LAST
  )
  SELECT
    l.user_id AS student_id,
    COALESCE(p.display_name, 'Student') AS student_name,
    m.section AS section,
    tq.domain AS domain,
    count(*) FILTER (WHERE a.is_correct)::int AS correct,
    count(*)::int AS total
  FROM latest l
  JOIN public.test_run_answers a ON a.run_id = l.id
  JOIN public.test_questions tq ON tq.id = a.question_id
  JOIN public.test_modules m ON m.id = tq.module_id
  LEFT JOIN public.profiles p ON p.id = l.user_id
  WHERE tq.domain IS NOT NULL AND tq.domain <> ''
  GROUP BY l.user_id, p.display_name, m.section, tq.domain
  ORDER BY m.section, tq.domain, student_name;
END;
$$;

REVOKE ALL ON FUNCTION public.course_skill_by_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_skill_by_student(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0238_course_skill_by_student.sql
-- =============================================================================
