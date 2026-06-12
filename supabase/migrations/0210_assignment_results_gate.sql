-- =============================================================================
-- Migration: 0210_assignment_results_gate.sql
-- Description: Phase 3 of assignment↔full-test parity — the STUDENT results gate.
--   When an assignment has withhold_results = true (0209) and a student's
--   submitted attempt has not been released (results_released_at IS NULL), the
--   student must not see the answer key / rationale until the teacher releases.
--   Staff are never gated.
--
--   • fetch_attempt_questions (0014) is the answer-key snapshot RPC (returns each
--     question WITH its correct answer + rationale). It is hardened here: a
--     student reading their OWN gated attempt now raises 'results_locked' instead
--     of returning the key. This is the real server-side enforcement — the
--     student UI's review cannot render answers while withheld.
--   • assignment_results_locked(attempt_id) → boolean — a cheap pre-check the
--     student review surface calls to show a friendly "results not released yet"
--     state instead of erroring.
--
-- Residual (documented): the attempt row's aggregate result_detail (per-domain
--   counts + score%) and score_percent remain readable by the owning student via
--   direct PostgREST (the list needs the row to show "submitted"). The sensitive
--   answer KEY — the thing that enables answer-sharing — is fully gated. Full
--   column-level masking of the bare score is a future hardening (would need a
--   student-facing view replacing direct table reads in useStudentAssignments).
--
-- All SECURITY DEFINER + SET search_path = public, auth. Forward-only, idempotent.
-- =============================================================================

-- 1) Harden the answer-key snapshot RPC with the withhold gate ------------------
-- Identical to 0014 except the student-gate block before the snapshot read.
CREATE OR REPLACE FUNCTION public.fetch_attempt_questions(p_attempt_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_student_id uuid;
  v_result     jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'You must be signed in.';
  END IF;

  SELECT aa.student_id INTO v_student_id
    FROM public.assignment_attempts aa
   WHERE aa.id = p_attempt_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING HINT = 'Attempt not found.';
  END IF;

  IF v_student_id <> v_caller AND NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized' USING HINT = 'You may not read this attempt.';
  END IF;

  -- Withhold gate: the owning student may not read the answer key for a
  -- submitted-but-unreleased attempt of a withholding assignment. Staff exempt.
  IF v_student_id = v_caller AND NOT public.is_staff(v_caller) THEN
    IF EXISTS (
      SELECT 1
        FROM public.assignment_attempts aa
        JOIN public.assignments a ON a.id = aa.assignment_id
       WHERE aa.id = p_attempt_id
         AND aa.submitted_at IS NOT NULL
         AND a.withhold_results
         AND aa.results_released_at IS NULL
    ) THEN
      RAISE EXCEPTION 'results_locked'
        USING HINT = 'Your teacher has not released results for this assignment yet.';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(q.question ORDER BY q.position), '[]'::jsonb)
    INTO v_result
    FROM public.assignment_attempt_questions q
   WHERE q.attempt_id = p_attempt_id;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_attempt_questions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_attempt_questions(uuid) TO authenticated;

-- 2) Cheap gate pre-check for the student review surface -----------------------
DROP FUNCTION IF EXISTS public.assignment_results_locked(uuid);
CREATE FUNCTION public.assignment_results_locked(p_attempt_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_locked boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT (aa.submitted_at IS NOT NULL
          AND a.withhold_results
          AND aa.results_released_at IS NULL
          AND aa.student_id = v_uid
          AND NOT public.is_staff(v_uid))
    INTO v_locked
    FROM public.assignment_attempts aa
    JOIN public.assignments a ON a.id = aa.assignment_id
   WHERE aa.id = p_attempt_id;
  RETURN COALESCE(v_locked, false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.assignment_results_locked(uuid) TO authenticated;

-- END OF MIGRATION 0210_assignment_results_gate.sql
