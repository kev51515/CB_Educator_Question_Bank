-- =============================================================================
-- Migration: 0187_test_pacing_cohort.sql  (renumbered from 0174)
-- NOTE: bumped 0174 → 0187 to sit at the head — a parallel session had already
-- pushed 0175–0186 to the remote, so a lower number couldn't `supabase db push`
-- cleanly. Body unchanged. Per CLAUDE.md: verify `supabase migration list` shows
-- Local==Remote after the next push.
-- Description: Per-question pacing curves — a student's time on each question
--              vs. the AVERAGE PACE of the fastest 25% and the slowest 25% of
--              their classmates. Powers the teacher pace line-chart on the
--              Replay page and inside the Class heatmap.
--
-- RELATION TO 0147/0150
-- ---------------------
-- `get_test_question_times` (0147 → course-scoped in 0150) already returns one
-- per-question row with your_time_ms + a single class_avg_ms. This adds the
-- distribution the teacher actually asked for: two reference curves built from
-- STABLE cohorts of students (not per-question percentiles), so "the fast kids"
-- and "the slow kids" are the same people across every question and the chart
-- reads as a coherent pace comparison.
--
-- HOW THE TWO GROUPS ARE PICKED
-- -----------------------------
--   1. COHORT = other students' LATEST submitted run of THIS test in the SAME
--      course as this run (course_id binding, no cross-course fallback — the
--      exact rule 0150 established). The viewer's own run is excluded.
--   2. Each cohort run's TOTAL active time = sum of its dwell seconds across the
--      whole test. ntile(4) over that total (ascending) splits the cohort into
--      quartiles: tile 1 = fastest 25% (least total time), tile 4 = slowest 25%.
--   3. fast_avg_ms / slow_avg_ms per question = the mean of that group's
--      per-question times. class_avg_ms = mean over the WHOLE cohort (matches
--      0150's class_avg_ms for continuity).
--
-- The quartiles are only meaningful with enough peers; the client requires
-- class_n >= 4 before drawing the fast/slow curves (with n < 4, ntile leaves a
-- quartile empty and the curve would be a single noisy student). class_n is
-- returned so the UI can show the right caveat.
--
-- WHERE THE TIME COMES FROM (unchanged from 0147)
-- -----------------------------------------------
-- The runner emits a `dwell` event into test_run_events on leaving a question:
-- type='dwell', module = module position, question = question NUMBER within the
-- module, duration_seconds = active seconds that visit (paused while the tab is
-- hidden). A question's total time is the SUM of its dwell rows. We map
-- (module position, question number) → question_id via test_modules ⋈
-- test_questions so callers key by question id like everything else.
--
-- SECURITY DEFINER (reads peers' runs past RLS) but returns only aggregate
-- timings — no answers, names, or ids beyond the question. Gated to the run's
-- owner or staff. All times in ms.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_test_pacing_cohort(p_run_id uuid)
  RETURNS TABLE (
    question_id  uuid,
    your_time_ms integer,
    fast_avg_ms  integer,
    slow_avg_ms  integer,
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
  v_n       integer := 0;
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
    -- No cross-course fallback (mirrors 0150).
    SELECT DISTINCT ON (r.user_id) r.id AS run_id
      FROM public.test_runs r
     WHERE r.test_id = v_test
       AND r.status = 'submitted'
       AND r.user_id <> v_student
       AND r.course_id IS NOT DISTINCT FROM v_course
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
  -- total active time per cohort run, used to rank into pace quartiles
  totals AS (
    SELECT cps.run_id, sum(cps.secs) AS total_secs
      FROM class_per_student cps
     GROUP BY cps.run_id
  ),
  ranked AS (
    SELECT run_id,
           ntile(4) OVER (ORDER BY total_secs ASC) AS tile  -- 1=fastest … 4=slowest
      FROM totals
  ),
  fast_times AS (
    SELECT cps.question_id,
           round(avg(cps.secs) * 1000)::int AS avg_ms
      FROM class_per_student cps
      JOIN ranked rk ON rk.run_id = cps.run_id AND rk.tile = 1
     GROUP BY cps.question_id
  ),
  slow_times AS (
    SELECT cps.question_id,
           round(avg(cps.secs) * 1000)::int AS avg_ms
      FROM class_per_student cps
      JOIN ranked rk ON rk.run_id = cps.run_id AND rk.tile = 4
     GROUP BY cps.question_id
  ),
  class_times AS (
    SELECT cps.question_id,
           round(avg(cps.secs) * 1000)::int AS avg_ms
      FROM class_per_student cps
     GROUP BY cps.question_id
  )
  SELECT qm.question_id,
         (m.secs * 1000)::int AS your_time_ms,
         ft.avg_ms            AS fast_avg_ms,
         st.avg_ms            AS slow_avg_ms,
         ct.avg_ms            AS class_avg_ms,
         (SELECT count(*)::int FROM totals) AS class_n
    FROM qmap qm
    LEFT JOIN mine        m  ON m.question_id  = qm.question_id
    LEFT JOIN fast_times  ft ON ft.question_id = qm.question_id
    LEFT JOIN slow_times  st ON st.question_id = qm.question_id
    LEFT JOIN class_times ct ON ct.question_id = qm.question_id
   WHERE m.secs IS NOT NULL OR ct.avg_ms IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_test_pacing_cohort(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_pacing_cohort(uuid) TO authenticated;
