-- =============================================================================
-- Migration: 0146_start_test_default_current_module.sql
-- Description: Second hotfix to start_test (after 0145). A test with ZERO
--   modules (e.g. the disposable fixtures the access/edges smoke harnesses
--   create) makes `SELECT min(position) FROM test_modules` return NULL, so the
--   0143/0145 INSERT of `current_module = v_first` (NULL) violated the
--   test_runs.current_module NOT NULL constraint — start_test crashed for any
--   module-less test. The pre-0143 code relied on the column DEFAULT of 1.
--
--   Fix: `current_module = COALESCE(v_first, 1)`. scheduled_first/last stay
--   nullable (submit_test_module already falls back to max(position) when
--   scheduled_last_position IS NULL). This is the AUTHORITATIVE start_test
--   definition; 0143/0145 are superseded. Forward-only. CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.start_test(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_test       public.tests%ROWTYPE;
  v_run        public.test_runs%ROWTYPE;
  v_have       boolean := false;
  v_can_retake boolean;
  v_courses    uuid[];
  v_metered    uuid[];
  v_course     uuid;
  v_win_count  integer;
  v_first      integer;
  v_last       integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  IF NOT public.is_staff(v_uid) THEN
    SELECT array_agg(DISTINCT c.id) INTO v_courses
      FROM public.course_memberships cm
      JOIN public.courses          c    ON c.id = cm.course_id
      JOIN public.course_modules   cmod ON cmod.course_id = cm.course_id
      JOIN public.module_items     mi   ON mi.module_id   = cmod.id
     WHERE cm.student_id = v_uid
       AND mi.item_type  = 'link'
       AND mi.url ILIKE '%/test/' || v_test.slug || '%';
    IF v_courses IS NULL OR array_length(v_courses, 1) IS NULL THEN
      RAISE EXCEPTION 'not_enrolled'
        USING HINT = 'You must be enrolled in a course that assigns this test.';
    END IF;
  END IF;

  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  v_have := FOUND;

  IF NOT v_have AND NOT public.is_staff(v_uid) AND v_test.retake_policy <> 'unlimited' THEN
    SELECT * INTO v_run FROM public.test_runs
     WHERE user_id = v_uid AND test_id = v_test.id AND status = 'submitted'
     ORDER BY submitted_at DESC LIMIT 1;
    IF FOUND THEN
      SELECT EXISTS (
        SELECT 1 FROM public.test_retake_grants g
         WHERE g.user_id = v_uid AND g.test_id = v_test.id
           AND g.granted_at > v_run.submitted_at
      ) INTO v_can_retake;
      v_have := NOT v_can_retake;
    END IF;
  END IF;

  IF NOT v_have THEN
    IF public.is_staff(v_uid) THEN
      v_course := NULL;
      SELECT min(position), max(position) INTO v_first, v_last
        FROM public.test_modules WHERE test_id = v_test.id;
    ELSE
      SELECT array_agg(DISTINCT course_id) INTO v_metered
        FROM public.test_module_windows
       WHERE test_id = v_test.id AND course_id = ANY(v_courses);
      IF v_metered IS NOT NULL AND array_length(v_metered, 1) > 1 THEN
        RAISE EXCEPTION 'ambiguous_course_enrollment'
          USING HINT = 'This test is scheduled differently in two of your courses.';
      END IF;
      v_course := COALESCE(v_metered[1],
                           (SELECT x FROM unnest(v_courses) AS x ORDER BY x LIMIT 1));

      SELECT count(*) INTO v_win_count
        FROM public.test_module_windows WHERE course_id = v_course AND test_id = v_test.id;
      IF v_win_count = 0 THEN
        SELECT min(position), max(position) INTO v_first, v_last
          FROM public.test_modules WHERE test_id = v_test.id;
      ELSE
        SELECT min(module_position), max(module_position) INTO v_first, v_last
          FROM public.test_module_windows
         WHERE course_id = v_course AND test_id = v_test.id AND deployed;
        IF v_first IS NULL THEN
          RAISE EXCEPTION 'no_modules_deployed';
        END IF;
      END IF;
    END IF;

    BEGIN
      INSERT INTO public.test_runs
        (user_id, test_id, course_id, current_module,
         scheduled_first_position, scheduled_last_position)
      VALUES (v_uid, v_test.id, v_course, COALESCE(v_first, 1), v_first, v_last)
      RETURNING * INTO v_run;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_run FROM public.test_runs
       WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1;
    END;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'current_module', v_run.current_module,
    'started_at', v_run.started_at,
    'first_position', v_run.scheduled_first_position,
    'last_position', v_run.scheduled_last_position,
    'results_released', (v_run.results_released_at IS NOT NULL),
    'answered', (
      SELECT count(*) FROM public.test_run_answers
       WHERE run_id = v_run.id AND chosen IS NOT NULL),
    'test', jsonb_build_object(
      'slug', v_test.slug, 'title', v_test.title,
      'short_title', v_test.short_title, 'total_questions', v_test.total_questions,
      'retake_policy', v_test.retake_policy),
    'modules', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'position', m.position, 'section', m.section, 'label', m.label,
        'time_limit_seconds', m.time_limit_seconds, 'question_count', m.question_count,
        'deployed', COALESCE(w.deployed, true),
        'opens_at', w.opens_at
      ) ORDER BY m.position), '[]'::jsonb)
      FROM public.test_modules m
      LEFT JOIN public.test_module_windows w
        ON w.test_id = m.test_id AND w.module_position = m.position
       AND w.course_id = v_run.course_id
     WHERE m.test_id = v_test.id),
    'proctoring_level', v_test.proctoring_level
  );
END;
$$;
REVOKE ALL ON FUNCTION public.start_test(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_test(text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0146_start_test_default_current_module.sql
-- =============================================================================
