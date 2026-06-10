-- =============================================================================
-- Migration: 0143_test_question_times.sql
-- Description: Per-question pacing — a student's time on each question vs. the
--              average of their classmates on the SAME test.
--
-- WHERE THE TIME COMES FROM
-- -------------------------
-- The runner does NOT write a per-question time onto test_run_answers
-- (time_ms is unused/always NULL). Instead it emits a `dwell` event into
-- test_run_events every time the student LEAVES a question: type='dwell',
-- `module` = module position, `question` = the question NUMBER within that
-- module, `duration_seconds` = active seconds spent that visit (the dwell
-- stopwatch pauses while the tab is hidden). A question revisited several
-- times produces several dwell rows, so a student's total time on a question
-- is the SUM of its dwell durations. We map (module position, question number)
-- → question_id through test_modules ⋈ test_questions so the review surface can
-- key the result by question id like everything else.
--
-- WHICH PEERS FORM "THE CLASS"
-- ----------------------------
--   1. COURSE PEERS first — the OTHER students who share at least one course
--      with the run's student and who have a SUBMITTED run of this same test.
--      Each peer's LATEST submitted run is used. This is the meaningful "your
--      class" comparison.
--   2. FALLBACK to ALL other students — if there are fewer than 3 course peers
--      (new class, solo student, or nobody else has sat it yet), a 1–2 person
--      average is noise, so we widen to every other student's latest submitted
--      run of the test.
--   3. The VIEWER is always excluded from the average.
--
-- Returns one row per question the viewer spent time on (and/or that the class
-- has data for): your_time_ms, class_avg_ms (NULL when no peer data), class_n
-- (how many peers the average is over — 0 ⇒ no comparison). All times in ms.
--
-- SECURITY DEFINER (reads peers' runs past RLS) but returns only aggregate
-- timings — no answers, names, or ids beyond the question. Gated to the run's
-- owner or staff.
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT r.test_id, r.user_id INTO v_test, v_student
    FROM public.test_runs r WHERE r.id = p_run_id;
  IF v_test IS NULL THEN
    RAISE EXCEPTION 'run_not_found';
  END IF;
  IF v_student <> v_uid AND NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH course_peers AS (
    SELECT DISTINCT cm2.student_id
      FROM public.course_memberships cm1
      JOIN public.course_memberships cm2 ON cm2.course_id = cm1.course_id
     WHERE cm1.student_id = v_student
       AND cm2.student_id <> v_student
  ),
  latest_course AS (
    SELECT DISTINCT ON (r.user_id) r.id AS run_id
      FROM public.test_runs r
      JOIN course_peers cp ON cp.student_id = r.user_id
     WHERE r.test_id = v_test AND r.status = 'submitted'
     ORDER BY r.user_id, r.submitted_at DESC NULLS LAST
  ),
  latest_all AS (
    SELECT DISTINCT ON (r.user_id) r.id AS run_id
      FROM public.test_runs r
     WHERE r.test_id = v_test AND r.status = 'submitted'
       AND r.user_id <> v_student
     ORDER BY r.user_id, r.submitted_at DESC NULLS LAST
  ),
  cohort AS (
    SELECT run_id FROM latest_course WHERE (SELECT count(*) FROM latest_course) >= 3
    UNION ALL
    SELECT run_id FROM latest_all    WHERE (SELECT count(*) FROM latest_course) <  3
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
