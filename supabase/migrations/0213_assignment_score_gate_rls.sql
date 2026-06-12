-- =============================================================================
-- Migration: 0213_assignment_score_gate_rls.sql
-- Description: Make a student's assignment SCORE genuinely unreadable until the
--   teacher releases it — closing the 0210 residual (the bare aggregate score
--   was still readable via direct PostgREST because the student could SELECT
--   their own attempt row). 0210 gated only the answer KEY (fetch_attempt_
--   questions); this gates the row's score/breakdown/feedback too.
--
-- Mechanism: tighten the student SELECT policy on assignment_attempts so a
--   student CANNOT read their own SUBMITTED attempt while it is withheld and
--   unreleased. In-progress rows (submitted_at IS NULL, needed for resume),
--   released rows, and rows of non-withholding assignments stay fully visible.
--   The score/breakdown views (assignment_attempts_effective, _best_attempts —
--   security_invoker per 0065) inherit this automatically, and useRecentFeedback
--   (graded-row reads) stops showing withheld feedback. Teacher/admin policies
--   are untouched (separate policies) so the educator Overview still sees all.
--
--   Because the gated row is now hidden, the student assignment LIST would lose
--   the "you submitted, results pending" signal. my_gated_assignments() returns
--   just {assignment_id, attempt_id, submitted_at} (NO score) for the caller's
--   gated submissions so the list can render "Results pending" + a Review link
--   that lands on the locked screen (0210) — without exposing any score.
--
-- assignment_is_withholding() is a SECURITY DEFINER helper used inside the
--   policy so we don't inline an EXISTS subquery into RLS (per CLAUDE.md rule;
--   also avoids triggering assignments' own RLS from within the policy).
--
-- Forward-only. Idempotent.
-- =============================================================================

-- 1) Helper: does this assignment withhold results? (DEFINER → no nested RLS) ---
CREATE OR REPLACE FUNCTION public.assignment_is_withholding(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT withhold_results FROM public.assignments WHERE id = p_assignment_id),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.assignment_is_withholding(uuid) TO authenticated;

-- 2) Tighten the student SELECT policy ----------------------------------------
DROP POLICY IF EXISTS "attempts: student reads own" ON public.assignment_attempts;
CREATE POLICY "attempts: student reads own"
  ON public.assignment_attempts
  FOR SELECT
  USING (
    student_id = (SELECT auth.uid())
    AND NOT (
      submitted_at IS NOT NULL
      AND results_released_at IS NULL
      AND public.assignment_is_withholding(assignment_id)
    )
  );

-- 3) Pending signal for the list (no score exposed) ---------------------------
DROP FUNCTION IF EXISTS public.my_gated_assignments();
CREATE FUNCTION public.my_gated_assignments()
RETURNS TABLE (
  assignment_id uuid,
  attempt_id    uuid,
  submitted_at  timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  SELECT DISTINCT ON (att.assignment_id)
         att.assignment_id, att.id, att.submitted_at
    FROM public.assignment_attempts att
    JOIN public.assignments a ON a.id = att.assignment_id
   WHERE att.student_id = v_uid
     AND att.submitted_at IS NOT NULL
     AND att.results_released_at IS NULL
     AND a.withhold_results
   ORDER BY att.assignment_id, att.submitted_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_gated_assignments() TO authenticated;

-- END OF MIGRATION 0213_assignment_score_gate_rls.sql
