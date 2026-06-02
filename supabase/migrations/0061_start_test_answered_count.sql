-- =============================================================================
-- Migration: 0061_start_test_answered_count.sql
-- Purpose:   Fix the resume-label gap found in QA (timeout/resume click-through).
--            The intro screen derived its "Resume" vs "Begin test" label purely
--            from `current_module > 1`, so a student who answered part of
--            MODULE 1, left, and returned saw "Begin test" — even though the run
--            was in progress and clicking it correctly rehydrated their drafts.
--            The label implied a fresh start; the behaviour was a resume.
--
--   Fix: start_test now also returns `answered` — the count of recorded answers
--   with a non-null `chosen` for the resumed run (drafts + graded). The client
--   shows "Resume" when current_module > 1 OR answered > 0, so an in-module-1
--   return reads true. A brand-new run returns answered = 0 → "Begin test".
--
--   CREATE OR REPLACE keeps the exact signature + every existing field, adding
--   one key; the client treats `answered` as optional. Forward-only, idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.start_test(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_test public.tests%ROWTYPE;
  v_run  public.test_runs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.test_runs (user_id, test_id) VALUES (v_uid, v_test.id)
    RETURNING * INTO v_run;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'current_module', v_run.current_module,
    'started_at', v_run.started_at,
    -- How many answers this run already has (drafts + graded). Lets the intro
    -- show "Resume" for an in-progress run even while still on module 1.
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
      FROM public.test_modules m WHERE m.test_id = v_test.id)
  );
END;
$$;
