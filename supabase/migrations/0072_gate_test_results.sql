-- =============================================================================
-- Migration: 0072_gate_test_results.sql
-- Description: Put full-test results under teacher control.
--
-- Requirement (2026-06): when a student finishes a full-length test they must
-- NOT see their score or the questions/answers. The teacher decides if/when to
-- release results. Until then results are locked to the student.
--
-- Changes:
--   • test_runs.results_released_at (NULL = locked / not released).
--   • get_test_result authorization rewritten:
--       - staff (is_staff) may read ANY submitted run (so the teacher can review
--         and grade before releasing);
--       - the run owner (student) may read ONLY once results_released_at is set,
--         else RAISE 'results_locked';
--       - anyone else → not_authorized.
--   • release_test_results(run_id) / unrelease — staff-only toggle primitive the
--     teacher-facing UI will call to dispense (or retract) results. Audited.
--
-- The student client no longer calls get_test_result at all (it shows a neutral
-- "submitted — pending review" screen); this server gate is defense-in-depth so
-- results can't be pulled via the API either.
--
-- Forward-only.
-- =============================================================================

ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS results_released_at timestamptz;

-- -----------------------------------------------------------------------------
-- get_test_result — staff read-any; student read-only-if-released
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

  -- Authorization + release gate.
  IF public.is_staff(v_uid) THEN
    NULL; -- staff may always read (review before releasing)
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
        'accepted', tq.accepted, 'is_correct', a.is_correct
      ) ORDER BY m.position, tq.position), '[]'::jsonb)
      FROM public.test_run_answers a
      JOIN public.test_questions tq ON tq.id = a.question_id
      JOIN public.test_modules m ON m.id = tq.module_id
     WHERE a.run_id = v_run.id)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- release_test_results / unrelease — staff-only dispense primitive
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_test_results(
  p_run_id   uuid,
  p_released boolean DEFAULT true
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_when timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  v_when := CASE WHEN p_released THEN now() ELSE NULL END;

  UPDATE public.test_runs
     SET results_released_at = v_when
   WHERE id = p_run_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_uid,
    CASE WHEN p_released THEN 'test_result.release' ELSE 'test_result.unrelease' END,
    'test_run', p_run_id::text,
    jsonb_build_object('released', p_released)
  );

  RETURN v_when;
END;
$$;

REVOKE ALL ON FUNCTION public.release_test_results(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_test_results(uuid, boolean) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0072_gate_test_results.sql
-- =============================================================================
