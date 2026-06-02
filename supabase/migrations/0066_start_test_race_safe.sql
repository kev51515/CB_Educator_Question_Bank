-- =============================================================================
-- Migration: 0066_start_test_race_safe.sql
-- Purpose:   Make start_test() concurrency-safe. It did SELECT-then-INSERT with
--            no guard against the "one active run per (user,test)" partial
--            unique index, so two near-simultaneous calls (React StrictMode
--            double-invokes the bootstrap effect in dev; retries / two tabs in
--            prod) both find no run, both INSERT, and the second fails with
--            `duplicate key value violates unique constraint` → the client
--            shows "Test unavailable". Surfaced by the teacher "Preview" button
--            on the Full-Test catalog.
--
--   Fix: wrap the INSERT in an exception handler — on unique_violation, the
--   concurrent call already created the active run, so re-SELECT it instead of
--   failing. Idempotent; everything else identical to 0061.
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
    BEGIN
      INSERT INTO public.test_runs (user_id, test_id) VALUES (v_uid, v_test.id)
      RETURNING * INTO v_run;
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent start_test already created the active run; use it.
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
