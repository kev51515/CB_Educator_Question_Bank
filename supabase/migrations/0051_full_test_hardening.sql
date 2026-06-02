-- =============================================================================
-- Migration: 0051_full_test_hardening.sql
-- Purpose:   Fortify the proctored full-test feature (0048) on three axes:
--
--   P1  Time integrity. The server already stamps each module's start and
--       returns seconds_remaining, but it never RECORDED how long a module
--       actually took or whether it ran past time. submit_test_module now
--       records per-module elapsed seconds + a `timed_out` flag (beyond a
--       generous network/clock grace) into test_runs.module_timing, giving
--       teachers a forensic timing trail without punishing a slightly-late
--       network submit (we still grade — practice tests shouldn't lose work).
--
--   P2  Durability. In-progress answers previously lived ONLY in the browser
--       (localStorage) until a module was submitted — a device loss mid-module
--       lost work. New RPC save_test_progress() persists drafts server-side
--       (chosen with is_correct = NULL, ungraded → no answer leak), and
--       get_test_module() now returns those saved drafts so a resume on any
--       device rehydrates from the server.
--
--   P3  No schema needed — the teacher QA/review surface reads test_questions
--       directly (staff already have SELECT per 0048 RLS).
--
--   Drift gotchas:
--     • CREATE OR REPLACE of submit_test_module / get_test_module keeps the
--       exact signatures + error codes from 0048 so the client is unchanged
--       except for the new optional payload fields.
--     • Drafts reuse test_run_answers (is_correct NULL). The owner SELECT
--       policy lets a student read their own drafts — fine, drafts carry no
--       key. Final submit overwrites the NULL with the graded value.
--     • Forward-only, idempotent.
-- =============================================================================

-- P1: per-module timing trail.
ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS module_timing jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Generous grace (seconds) before a submit is considered "past time". Covers
-- the auto-submit round-trip + minor client clock skew.
-- (Inlined as a literal in the functions below; documented here for readers.)

-- -----------------------------------------------------------------------------
-- P2: save_test_progress — persist an ungraded draft for the active module.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_test_progress(
  p_run_id uuid, p_position integer, p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_chosen text;
  v_saved integer := 0;
  q RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;
  -- Drafts only for the active module.
  IF p_position <> v_run.current_module THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'module_out_of_order'; END IF;

  FOR q IN SELECT id FROM public.test_questions WHERE module_id = v_mod.id LOOP
    v_chosen := nullif(btrim(coalesce(p_answers ->> q.id::text, '')), '');
    -- Upsert as an ungraded draft. Do NOT overwrite an already-graded row
    -- (shouldn't exist for the active module, but be defensive).
    INSERT INTO public.test_run_answers (run_id, question_id, module_position, chosen, is_correct)
    VALUES (v_run.id, q.id, p_position, v_chosen, NULL)
    ON CONFLICT (run_id, question_id) DO UPDATE
      SET chosen = EXCLUDED.chosen, answered_at = now()
      WHERE public.test_run_answers.is_correct IS NULL;
    IF v_chosen IS NOT NULL THEN v_saved := v_saved + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('saved', v_saved);
END;
$$;

-- -----------------------------------------------------------------------------
-- P2: get_test_module — same as 0048 but also returns saved drafts.
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
    -- Server-side drafts for cross-device resume (chosen only; no key).
    'saved_answers', (
      SELECT coalesce(jsonb_object_agg(a.question_id::text, a.chosen)
                        FILTER (WHERE a.chosen IS NOT NULL), '{}'::jsonb)
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
-- P1: submit_test_module — same as 0048 plus per-module timing record.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_test_module(
  p_run_id uuid, p_position integer, p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_max_position integer;
  v_chosen text;
  v_correct boolean;
  v_answered integer := 0;
  v_score integer;
  v_total integer;
  v_elapsed integer;
  v_timed_out boolean := false;
  v_grace constant integer := 120;   -- seconds of slack for network + clock skew
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

  -- P1: record how long this module actually took.
  IF v_run.current_module_started_at IS NOT NULL THEN
    v_elapsed := floor(extract(epoch FROM (now() - v_run.current_module_started_at)))::int;
    v_timed_out := v_elapsed > v_mod.time_limit_seconds + v_grace;
  ELSE
    v_elapsed := NULL;
  END IF;

  -- Grade + upsert each question in this module (overwrites any draft).
  FOR q IN
    SELECT * FROM public.test_questions WHERE module_id = v_mod.id ORDER BY position
  LOOP
    v_chosen := nullif(btrim(coalesce(p_answers ->> q.id::text, '')), '');
    v_correct := public._grade_answer(q.type, q.correct_answer, q.accepted, v_chosen);
    IF v_chosen IS NOT NULL THEN v_answered := v_answered + 1; END IF;
    INSERT INTO public.test_run_answers (run_id, question_id, module_position, chosen, is_correct)
    VALUES (v_run.id, q.id, p_position, v_chosen, v_correct)
    ON CONFLICT (run_id, question_id) DO UPDATE
      SET chosen = EXCLUDED.chosen, is_correct = EXCLUDED.is_correct, answered_at = now();
  END LOOP;

  -- Stamp this module's timing into the run.
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

REVOKE ALL ON FUNCTION public.save_test_progress(uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_test_progress(uuid, integer, jsonb) TO authenticated;
