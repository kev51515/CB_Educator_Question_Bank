-- =============================================================================
-- Migration: 0080_result_module_timing.sql
-- Description: Surface per-module timing in the test result (teacher review +
--              released student view). submit_test_module (0051) already records
--              test_runs.module_timing { "<pos>": {elapsed_seconds, limit_seconds,
--              timed_out, answered, submitted_at} }; get_test_result just didn't
--              return it. Useful coaching signal — did the student rush or run
--              out of time?
--
-- CREATE OR REPLACE of get_test_result: identical to 0073 (release gate from
-- 0072 + eliminated per question) plus a top-level 'module_timing'. Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_test_result(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'submitted' THEN RAISE EXCEPTION 'run_not_submitted'; END IF;

  IF public.is_staff(v_uid) THEN
    NULL;
  ELSIF v_run.user_id = v_uid THEN
    IF v_run.results_released_at IS NULL THEN
      RAISE EXCEPTION 'results_locked'
        USING HINT = 'Your teacher has not released results for this test yet.';
    END IF;
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'score', v_run.score, 'total', v_run.total,
    'duration_seconds', v_run.duration_seconds,
    'section_scores', v_run.section_scores,
    'module_timing', coalesce(v_run.module_timing, '{}'::jsonb),
    'questions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', tq.id, 'ref', tq.ref, 'number', tq.number, 'type', tq.type,
        'section', m.section, 'module_position', m.position,
        'stem', tq.stem, 'choices', tq.choices, 'figure', tq.figure,
        'passage', tq.passage, 'passage_alt', tq.passage_alt,
        'your_answer', a.chosen, 'correct_answer', tq.correct_answer,
        'accepted', tq.accepted, 'is_correct', a.is_correct,
        'eliminated', to_jsonb(a.eliminated)
      ) ORDER BY m.position, tq.position), '[]'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      JOIN public.test_modules m ON m.id = tq.module_id
     WHERE a.run_id = v_run.id)
  );
END;
$$;

-- =============================================================================
-- END OF MIGRATION 0080_result_module_timing.sql
-- =============================================================================
