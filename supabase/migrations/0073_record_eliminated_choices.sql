-- =============================================================================
-- Migration: 0073_record_eliminated_choices.sql
-- Description: Persist the answer choices a student crossed out ("eliminated")
--              during a full-length test, so the teacher can see their
--              reasoning/process when reviewing.
--
-- Until now the strikethrough tool was browser-only local state, reset per
-- module and never saved. This records it:
--   • test_run_answers.eliminated text[] — letters the student struck for that
--     question (every question in a module already gets a row, so eliminations
--     are captured even when no answer was chosen).
--   • save_test_progress / submit_test_module gain p_eliminated jsonb
--     ({ "<question_id>": ["A","C"], ... }) and write it.
--   • get_test_module returns saved_eliminations so a resume restores the
--     strikes on any device.
--   • get_test_result returns `eliminated` per question for the teacher review.
--
-- To avoid a PostgREST overload ambiguity (two functions differing only by a
-- trailing defaulted arg), the two mutating RPCs are DROPped and recreated with
-- the new defaulted p_eliminated; a 3-arg call still resolves (default applies).
-- Bodies are otherwise the 0051 versions. Forward-only.
-- =============================================================================

ALTER TABLE public.test_run_answers
  ADD COLUMN IF NOT EXISTS eliminated text[] NOT NULL DEFAULT '{}'::text[];

-- -----------------------------------------------------------------------------
-- save_test_progress(+p_eliminated) — draft persistence incl. eliminations
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_test_progress(uuid, integer, jsonb);

CREATE OR REPLACE FUNCTION public.save_test_progress(
  p_run_id uuid, p_position integer, p_answers jsonb,
  p_eliminated jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_chosen text;
  v_elim text[];
  v_saved integer := 0;
  q RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  IF p_position <> v_run.current_module THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  FOR q IN SELECT id FROM public.test_questions WHERE module_id = v_mod.id LOOP
    v_chosen := nullif(btrim(coalesce(p_answers ->> q.id::text, '')), '');
    v_elim := ARRAY(SELECT jsonb_array_elements_text(
                      coalesce(p_eliminated -> q.id::text, '[]'::jsonb)));
    INSERT INTO public.test_run_answers (run_id, question_id, module_position, chosen, eliminated, is_correct)
    VALUES (v_run.id, q.id, p_position, v_chosen, v_elim, NULL)
    ON CONFLICT (run_id, question_id) DO UPDATE
      SET chosen = EXCLUDED.chosen, eliminated = EXCLUDED.eliminated, answered_at = now()
      WHERE public.test_run_answers.is_correct IS NULL;
    IF v_chosen IS NOT NULL THEN v_saved := v_saved + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('saved', v_saved);
END;
$$;

REVOKE ALL ON FUNCTION public.save_test_progress(uuid, integer, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_test_progress(uuid, integer, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- submit_test_module(+p_eliminated) — graded submit incl. eliminations
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_test_module(uuid, integer, jsonb);

CREATE OR REPLACE FUNCTION public.submit_test_module(
  p_run_id uuid, p_position integer, p_answers jsonb,
  p_eliminated jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_max_position integer;
  v_chosen text;
  v_elim text[];
  v_correct boolean;
  v_answered integer := 0;
  v_score integer;
  v_total integer;
  v_elapsed integer;
  v_timed_out boolean := false;
  v_grace constant integer := 120;
  q RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  IF p_position <> v_run.current_module THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  IF v_run.current_module_started_at IS NOT NULL THEN
    v_elapsed := floor(extract(epoch FROM (now() - v_run.current_module_started_at)))::int;
    v_timed_out := v_elapsed > v_mod.time_limit_seconds + v_grace;
  ELSE
    v_elapsed := NULL;
  END IF;

  FOR q IN
    SELECT * FROM public.test_questions WHERE module_id = v_mod.id ORDER BY position
  LOOP
    v_chosen := nullif(btrim(coalesce(p_answers ->> q.id::text, '')), '');
    v_elim := ARRAY(SELECT jsonb_array_elements_text(
                      coalesce(p_eliminated -> q.id::text, '[]'::jsonb)));
    v_correct := public._grade_answer(q.type, q.correct_answer, q.accepted, v_chosen);
    IF v_chosen IS NOT NULL THEN v_answered := v_answered + 1; END IF;
    INSERT INTO public.test_run_answers (run_id, question_id, module_position, chosen, eliminated, is_correct)
    VALUES (v_run.id, q.id, p_position, v_chosen, v_elim, v_correct)
    ON CONFLICT (run_id, question_id) DO UPDATE
      SET chosen = EXCLUDED.chosen, eliminated = EXCLUDED.eliminated,
          is_correct = EXCLUDED.is_correct, answered_at = now();
  END LOOP;

  UPDATE public.test_runs SET module_timing = module_timing || jsonb_build_object(
    p_position::text, jsonb_build_object(
      'elapsed_seconds', v_elapsed,
      'limit_seconds', v_mod.time_limit_seconds,
      'timed_out', v_timed_out,
      'answered', v_answered,
      'submitted_at', now()))
   WHERE id = v_run.id;

  SELECT max(position) INTO v_max_position FROM public.test_modules WHERE test_id = v_run.test_id;

  IF p_position >= v_max_position THEN
    SELECT count(*) FILTER (WHERE a.is_correct), count(*)
      INTO v_score, v_total
      FROM public.test_run_answers a WHERE a.run_id = v_run.id;
    UPDATE public.test_runs SET
      status = 'submitted',
      submitted_at = now(),
      current_module = v_max_position,
      current_module_started_at = NULL,
      score = v_score,
      total = v_total,
      duration_seconds = floor(extract(epoch FROM (now() - started_at)))::int,
      section_scores = (
        SELECT jsonb_object_agg(s.section, jsonb_build_object('correct', s.correct, 'total', s.total))
        FROM (
          SELECT m.section,
                 count(*) FILTER (WHERE a.is_correct) AS correct,
                 count(*) AS total
            FROM public.test_run_answers a
            JOIN public.test_questions tq ON tq.id = a.question_id
            JOIN public.test_modules m ON m.id = tq.module_id
           WHERE a.run_id = v_run.id
           GROUP BY m.section
        ) s)
     WHERE id = v_run.id;
    RETURN jsonb_build_object('finished', true, 'run_id', v_run.id,
      'score', v_score, 'total', v_total, 'timed_out', v_timed_out);
  ELSE
    UPDATE public.test_runs SET
      current_module = p_position + 1,
      current_module_started_at = NULL
     WHERE id = v_run.id;
    RETURN jsonb_build_object('finished', false, 'next_module', p_position + 1,
      'answered', v_answered, 'timed_out', v_timed_out);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_test_module(uuid, integer, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_test_module(uuid, integer, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_test_module — also return saved_eliminations for resume
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_test_module(p_run_id uuid, p_position integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_started timestamptz;
  v_remaining integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  IF p_position > v_run.current_module THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  IF p_position = v_run.current_module THEN
    IF v_run.current_module_started_at IS NULL THEN
      UPDATE public.test_runs SET current_module_started_at = now()
       WHERE id = v_run.id RETURNING current_module_started_at INTO v_started;
    ELSE
      v_started := v_run.current_module_started_at;
    END IF;
    v_remaining := greatest(0,
      v_mod.time_limit_seconds - floor(extract(epoch FROM (now() - v_started)))::int);
  ELSE
    v_remaining := 0;
  END IF;

  RETURN jsonb_build_object(
    'module', jsonb_build_object(
      'position', v_mod.position, 'section', v_mod.section, 'label', v_mod.label,
      'time_limit_seconds', v_mod.time_limit_seconds, 'question_count', v_mod.question_count),
    'seconds_remaining', v_remaining,
    'saved_answers', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, a.chosen)
                        FILTER (WHERE a.chosen IS NOT NULL), '{}'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'saved_eliminations', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, to_jsonb(a.eliminated))
                        FILTER (WHERE array_length(a.eliminated, 1) > 0), '{}'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'questions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'ref', q.ref, 'number', q.number, 'type', q.type,
        'section', v_mod.section, 'passage', q.passage, 'passage_alt', q.passage_alt,
        'stem', q.stem, 'choices', q.choices, 'figure', q.figure
      ) ORDER BY q.position), '[]'::jsonb)
      FROM public.test_questions q WHERE q.module_id = v_mod.id)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- get_test_result — include eliminated per question (for the teacher review)
-- (signature + release gate unchanged from 0072)
-- -----------------------------------------------------------------------------
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
-- END OF MIGRATION 0073_record_eliminated_choices.sql
-- =============================================================================
