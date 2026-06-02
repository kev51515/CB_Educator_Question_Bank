-- =============================================================================
-- Migration: 0081_one_attempt_tests.sql
-- Description: One-attempt-only full-length tests, with a teacher retake override.
--
-- Before: once a run was submitted, the next start_test() minted a FRESH run
-- (the "one active run" index only covers in_progress), so a student could
-- retake a proctored test unlimited times.
--
-- Now: start_test()
--   1. resumes an in_progress run if present;
--   2. else, if a submitted run exists AND no retake was granted since that
--      submission, RETURNS that submitted run (the client then shows the
--      "Test submitted" / result state — no new attempt);
--   3. else (no runs, or a fresh retake grant) creates a new run.
--
-- A teacher grants a retake via allow_test_retake(student, slug); the grant is
-- "valid" only while it's newer than the student's latest submission, so it's
-- naturally consumed once the retake is submitted (grant again for another).
--
-- Forward-only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.test_retake_grants (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_id    uuid NOT NULL REFERENCES public.tests(id)    ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_retake_grants_lookup
  ON public.test_retake_grants (user_id, test_id, granted_at DESC);
-- Locked down: only the SECURITY DEFINER RPCs below touch this table.
ALTER TABLE public.test_retake_grants ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- allow_test_retake — staff grants one more attempt to a student
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allow_test_retake(p_student_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  INSERT INTO public.test_retake_grants (user_id, test_id, granted_by)
  VALUES (p_student_id, v_test_id, v_uid);

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.retake_granted', 'profile', p_student_id::text,
          jsonb_build_object('slug', p_slug));
END;
$$;

REVOKE ALL ON FUNCTION public.allow_test_retake(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allow_test_retake(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- start_test — one-attempt aware (otherwise identical to 0066)
-- -----------------------------------------------------------------------------
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- 1. Resume an in-progress run.
  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  v_have := FOUND;

  -- 2. One-attempt: if there's no active run but a submitted one, return it
  --    unless a retake was granted after that submission.
  IF NOT v_have THEN
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

  -- 3. Create a new run (first attempt, or a granted retake).
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

-- =============================================================================
-- END OF MIGRATION 0081_one_attempt_tests.sql
-- =============================================================================
