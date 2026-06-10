-- =============================================================================
-- Migration: 0150_pacing_cohort_course_scope.sql
-- Purpose: Scope the per-question pacing cohort to the run's OWN course so that
--          students (and teacher review) NEVER see timing data from outside
--          their own course.
--
-- THE LEAK BEING CLOSED
-- ---------------------
-- The prior get_test_question_times (0147) built its "class average" cohort as
-- COURSE PEERS first, then — when there were fewer than 3 course peers — FELL
-- BACK to ALL other students who had sat the test in ANY course. That fallback
-- leaked cross-course timing data into a student's review surface whenever a
-- class was small/new/solo. The product owner requires a hard course boundary
-- with NO cross-course fallback.
--
-- THE FIX
-- -------
-- Migration 0143 added test_runs.course_id (the course a run was taken
-- through). We now scope the cohort to other students' LATEST submitted run of
-- THIS test whose course_id matches THIS run's course_id — and nothing else.
-- If there are no same-course peers, class_n is 0 / the comparison columns are
-- NULL and the UI already renders no comparison. No fallback-to-all.
--
-- Everything else (the dwell→time mapping, qmap, mine, class aggregation, the
-- final SELECT, and the REVOKE/GRANT) is reproduced exactly from 0147.
--
-- Forward-only, idempotent CREATE OR REPLACE — signature unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_test_question_times(p_run_id uuid)
  RETURNS TABLE (
    question_id  uuid,
    your_time_ms integer,
    class_avg_ms integer,
    class_n      integer
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test    uuid;
  v_student uuid;
  v_course  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT r.test_id, r.user_id, r.course_id INTO v_test, v_student, v_course
    FROM public.test_runs r WHERE r.id = p_run_id;
  IF v_test IS NULL THEN
    RAISE EXCEPTION 'run_not_found';
  END IF;
  IF v_student <> v_uid AND NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH cohort AS (
    -- Other students' LATEST submitted run of THIS test in the SAME course.
    -- No cross-course fallback: same course_id binding only.
    SELECT DISTINCT ON (r.user_id) r.id AS run_id
      FROM public.test_runs r
     WHERE r.test_id = v_test
       AND r.status = 'submitted'
       AND r.user_id <> v_student
       AND r.course_id IS NOT DISTINCT FROM v_course   -- same course binding; NULL=NULL for legacy runs
     ORDER BY r.user_id, r.submitted_at DESC NULLS LAST
  ),
  -- (module position, question number) → question_id for THIS test
  qmap AS (
    SELECT tm.position AS module_pos, tq.number AS qnum, tq.id AS question_id
      FROM public.test_modules tm
      JOIN public.test_questions tq ON tq.module_id = tm.id
     WHERE tm.test_id = v_test
  ),
  -- the viewer's own seconds per question (sum across revisits)
  mine AS (
    SELECT qm.question_id, sum(e.duration_seconds) AS secs
      FROM public.test_run_events e
      JOIN qmap qm ON qm.module_pos = e.module AND qm.qnum = e.question
     WHERE e.run_id = p_run_id AND e.type = 'dwell' AND e.duration_seconds > 0
     GROUP BY qm.question_id
  ),
  -- each cohort run's seconds per question (one total per student per question)
  class_per_student AS (
    SELECT e.run_id, qm.question_id, sum(e.duration_seconds) AS secs
      FROM public.test_run_events e
      JOIN cohort c ON c.run_id = e.run_id
      JOIN qmap qm ON qm.module_pos = e.module AND qm.qnum = e.question
     WHERE e.type = 'dwell' AND e.duration_seconds > 0
     GROUP BY e.run_id, qm.question_id
  ),
  class_times AS (
    SELECT cps.question_id AS question_id,
           round(avg(cps.secs) * 1000)::int AS avg_ms,
           count(*)::int AS n
      FROM class_per_student cps
     GROUP BY cps.question_id
  )
  SELECT qm.question_id,
         (m.secs * 1000)::int AS your_time_ms,
         ct.avg_ms            AS class_avg_ms,
         COALESCE(ct.n, 0)    AS class_n
    FROM qmap qm
    LEFT JOIN mine        m  ON m.question_id  = qm.question_id
    LEFT JOIN class_times ct ON ct.question_id = qm.question_id
   WHERE m.secs IS NOT NULL OR ct.avg_ms IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_test_question_times(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_question_times(uuid) TO authenticated;
