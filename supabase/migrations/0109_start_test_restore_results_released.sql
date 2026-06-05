-- 0109_start_test_restore_results_released.sql
-- -----------------------------------------------------------------------------
-- HOTFIX for 0108. The 0108 rebuild of start_test was diffed against the 0082
-- body, which PRE-DATES 0083's addition of the `results_released` key. As a
-- result 0108 shipped start_test WITHOUT `results_released` — the full-test
-- intro/runner reads that flag to decide whether a finished student may see
-- their score, so its absence is a live regression (caught by
-- clickthrough-practice-test.mjs: "start_test contains 'results_released'").
--
-- Fix forward: re-create start_test with BOTH keys — the restored
-- `results_released` (from 0083) AND the `proctoring_level` (from 0108).
-- Body is otherwise identical to 0108/0083. jsonb return type unchanged, so
-- DROP+CREATE is safe (no dependent OUT columns).
--
-- Lesson (noted for future readers): when rebuilding a CREATE-OR-REPLACE
-- function, diff against the LATEST prior definition, not an arbitrary earlier
-- one — start_test was touched by 0048, 0061, 0066, 0081, 0082, 0083 before 0108.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.start_test(text);

CREATE FUNCTION public.start_test(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_test       public.tests%ROWTYPE;
  v_run        public.test_runs%ROWTYPE;
  v_have       boolean := false;
  v_can_retake boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- 1. Resume an in-progress run.
  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  v_have := FOUND;

  -- 2. One-attempt — STUDENTS ONLY. Staff (preview) always get a fresh run.
  IF NOT v_have AND NOT public.is_staff(v_uid) THEN
    SELECT * INTO v_run FROM public.test_runs
     WHERE user_id = v_uid AND test_id = v_test.id AND status = 'submitted'
     ORDER BY submitted_at DESC LIMIT 1;
    IF FOUND THEN
      SELECT EXISTS (
        SELECT 1 FROM public.test_retake_grants g
         WHERE g.user_id = v_uid AND g.test_id = v_test.id
           AND g.granted_at > v_run.submitted_at
      ) INTO v_can_retake;
      v_have := NOT v_can_retake;  -- keep the submitted run unless retake granted
    END IF;
  END IF;

  -- 3. Create a new run (first attempt, granted retake, or any staff preview).
  IF NOT v_have THEN
    BEGIN
      INSERT INTO public.test_runs (user_id, test_id) VALUES (v_uid, v_test.id)
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
    'results_released', (v_run.results_released_at IS NOT NULL),
    'answered', (
      SELECT count(*) FROM public.test_run_answers
       WHERE run_id = v_run.id AND chosen IS NOT NULL),
    'test', jsonb_build_object(
      'slug', v_test.slug, 'title', v_test.title,
      'short_title', v_test.short_title, 'total_questions', v_test.total_questions),
    'modules', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'position', m.position, 'section', m.section, 'label', m.label,
        'time_limit_seconds', m.time_limit_seconds, 'question_count', m.question_count
      ) ORDER BY m.position), '[]'::jsonb)
      FROM public.test_modules m WHERE m.test_id = v_test.id),
    'proctoring_level', v_test.proctoring_level
  );
END;
$$;
REVOKE ALL ON FUNCTION public.start_test(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_test(text) TO authenticated;
