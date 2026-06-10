-- =============================================================================
-- Migration: 0141_test_access_and_retake_policy.sql
-- Description: Two full-test policy changes (branch feat/test-access-policy):
--
-- (a) ENROLLMENT GATE on start_test. Until now start_test only checked auth +
--     the slug — any signed-in user with the /test/<slug> URL could take or
--     resume a test, and removing a student from the course didn't stop them.
--     Now a NON-STAFF caller must be actively enrolled in a course whose
--     module_items link this test (the same course↔test join the 0090 staff
--     RPCs use). Staff stay exempt (preview). Viewing your OWN released result
--     is unchanged (get_test_result is ownership-based — leaving a course
--     doesn't erase the work you already did).
--
-- (b) PER-TEST retake_policy on public.tests:
--       'one_attempt' (default) — today's behavior: one attempt, teacher grants
--                                 extra attempts via allow_test_retake (0081).
--       'unlimited'             — a replayable practice test: a student may
--                                 start a fresh run any time after submitting.
--     start_test honors it; set_test_retake_policy(slug, policy) is the staff-
--     only setter the test-overview UI calls.
--
-- start_test is otherwise IDENTICAL to 0109 (the latest definition — diffed
-- against it per 0109's own lesson). Return type unchanged (jsonb), so
-- CREATE OR REPLACE is safe.
--
-- Forward-only. NOT YET APPLIED to remote (branch work) — apply on merge.
-- =============================================================================

-- (b) retake policy column ----------------------------------------------------
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS retake_policy text NOT NULL DEFAULT 'one_attempt'
    CHECK (retake_policy IN ('one_attempt', 'unlimited'));

-- (a)+(b) start_test ----------------------------------------------------------
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

  -- (a) Enrollment gate — non-staff must be enrolled in a course that links this
  -- test (mirrors the 0090 course↔test join). Gates both taking AND resuming.
  IF NOT public.is_staff(v_uid) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.course_memberships cm
        JOIN public.course_modules cmod ON cmod.course_id = cm.course_id
        JOIN public.module_items   mi   ON mi.module_id   = cmod.id
       WHERE cm.student_id = v_uid
         AND mi.item_type  = 'link'
         AND mi.url ILIKE '%/test/' || v_test.slug || '%'
    ) THEN
      RAISE EXCEPTION 'not_enrolled'
        USING HINT = 'You must be enrolled in a course that assigns this test.';
    END IF;
  END IF;

  -- 1. Resume an in-progress run.
  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  v_have := FOUND;

  -- 2. One-attempt — STUDENTS ONLY, and only when the test isn't 'unlimited'.
  --    Staff (preview) and unlimited/practice tests always get a fresh run.
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
      v_have := NOT v_can_retake;  -- keep the submitted run unless retake granted
    END IF;
  END IF;

  -- 3. Create a new run (first attempt, granted retake, unlimited replay, or
  --    any staff preview).
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
      'short_title', v_test.short_title, 'total_questions', v_test.total_questions,
      'retake_policy', v_test.retake_policy),
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

-- (b) staff-only setter for the test-overview UI ------------------------------
CREATE OR REPLACE FUNCTION public.set_test_retake_policy(p_slug text, p_policy text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_policy NOT IN ('one_attempt', 'unlimited') THEN
    RAISE EXCEPTION 'invalid_policy';
  END IF;
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  UPDATE public.tests SET retake_policy = p_policy WHERE id = v_test_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.retake_policy_set', 'test', v_test_id::text,
          jsonb_build_object('slug', p_slug, 'policy', p_policy));
END;
$$;
REVOKE ALL ON FUNCTION public.set_test_retake_policy(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_test_retake_policy(text, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0141_test_access_and_retake_policy.sql
-- =============================================================================
