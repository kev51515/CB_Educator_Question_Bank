-- =============================================================================
-- Migration: 0086_persist_marks_annotations.sql
-- Description: Persist Mark-for-Review + highlights + notes server-side so they
--              survive exit/resume and follow the student across devices (like
--              answers + eliminations already do).
--
--   • test_run_answers gains: marked boolean, highlights jsonb, note text.
--   • save_test_progress gains p_annot jsonb { "<qid>": { marked, highlights,
--     note } } and writes those per question (DROP+CREATE with a defaulted 5th
--     arg; the 4-arg shape from 0073 still resolves).
--   • get_test_module returns saved_marks / saved_highlights / saved_notes for
--     resume hydration.
--   • submit_test_module is untouched: it only overwrites chosen/eliminated/
--     is_correct, so a submitted module keeps whatever annotations the drafts
--     held (harmless; the module can't be revisited).
--
-- Forward-only.
-- =============================================================================

ALTER TABLE public.test_run_answers
  ADD COLUMN IF NOT EXISTS marked     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS highlights jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS note       text;

-- -----------------------------------------------------------------------------
-- save_test_progress(+p_annot) — drafts incl. marks/highlights/notes
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_test_progress(uuid, integer, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.save_test_progress(
  p_run_id uuid, p_position integer, p_answers jsonb,
  p_eliminated jsonb DEFAULT '{}'::jsonb,
  p_annot jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_chosen text;
  v_elim text[];
  v_marked boolean;
  v_hl jsonb;
  v_note text;
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
    v_marked := coalesce((p_annot -> q.id::text ->> 'marked')::boolean, false);
    v_hl := coalesce(p_annot -> q.id::text -> 'highlights', '[]'::jsonb);
    v_note := nullif(p_annot -> q.id::text ->> 'note', '');
    INSERT INTO public.test_run_answers
      (run_id, question_id, module_position, chosen, eliminated, marked, highlights, note, is_correct)
    VALUES (v_run.id, q.id, p_position, v_chosen, v_elim, v_marked, v_hl, v_note, NULL)
    ON CONFLICT (run_id, question_id) DO UPDATE
      SET chosen = EXCLUDED.chosen, eliminated = EXCLUDED.eliminated,
          marked = EXCLUDED.marked, highlights = EXCLUDED.highlights, note = EXCLUDED.note,
          answered_at = now()
      WHERE public.test_run_answers.is_correct IS NULL;
    IF v_chosen IS NOT NULL THEN v_saved := v_saved + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('saved', v_saved);
END;
$$;

REVOKE ALL ON FUNCTION public.save_test_progress(uuid, integer, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_test_progress(uuid, integer, jsonb, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_test_module — also return saved marks / highlights / notes
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
    'saved_marks', (
      SELECT coalesce(jsonb_agg(a.question_id::text) FILTER (WHERE a.marked), '[]'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'saved_highlights', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, a.highlights)
                        FILTER (WHERE jsonb_array_length(a.highlights) > 0), '{}'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      WHERE a.run_id = v_run.id AND tq.module_id = v_mod.id),
    'saved_notes', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, to_jsonb(a.note))
                        FILTER (WHERE a.note IS NOT NULL AND a.note <> ''), '{}'::jsonb)
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

-- =============================================================================
-- END OF MIGRATION 0086_persist_marks_annotations.sql
-- =============================================================================
