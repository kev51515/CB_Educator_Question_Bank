-- =============================================================================
-- Migration: 0024_mastery_predictions.sql
-- Description: Per-skill mastery tracking + a simple SAT score-prediction RPC.
--   * Introduces the student_skill_stats view, which aggregates per-student
--     per-skill (domain, skill) attempts and correct counts from the
--     assignment_attempt_questions snapshot (see 0014). Correctness is
--     decided by comparing the answer recorded in assignment_attempts.answers
--     (qid → letter) against the snapshotted question's correctAnswer.
--   * Adds public.my_skill_mastery(): a SECURITY DEFINER RPC returning the
--     calling student's per-skill mastery rows (attempts, correct, mastery%).
--     Views don't carry RLS cleanly across joins to other RLS'd tables, so
--     we wrap the view in a function and scope by auth.uid().
--   * Adds public.predict_my_sat_score(): a stub linear score predictor that
--     maps the caller's average assignment score_percent to a 400-1600 SAT
--     total. v1, intentionally crude — see README.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: per-student per-skill stats view
-- -----------------------------------------------------------------------------
-- The view itself reads from RLS'd tables (assignment_attempts +
-- assignment_attempt_questions), so when invoked through a normal SELECT it
-- will only show the caller's own rows. We still expose access via the
-- my_skill_mastery() wrapper below for ergonomic per-student scoping.

CREATE OR REPLACE VIEW public.student_skill_stats AS
SELECT
  aa.student_id,
  (aaq.question->>'domain') AS domain,
  (aaq.question->>'skill')  AS skill,
  COUNT(*)                  AS attempts,
  SUM(CASE
        WHEN (aa.answers->>(aaq.question->>'id')) = (aaq.question->>'correctAnswer')
          THEN 1 ELSE 0
      END) AS correct
FROM public.assignment_attempts aa
JOIN public.assignment_attempt_questions aaq ON aaq.attempt_id = aa.id
WHERE aa.submitted_at IS NOT NULL
  AND (aaq.question->>'skill') IS NOT NULL
GROUP BY aa.student_id, (aaq.question->>'domain'), (aaq.question->>'skill');

-- -----------------------------------------------------------------------------
-- SECTION 2: my_skill_mastery() RPC
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so we can stable-scope to the calling student via
-- auth.uid() without depending on view-traversal RLS edge cases. Caller
-- gets only their own rows.

CREATE OR REPLACE FUNCTION public.my_skill_mastery() RETURNS TABLE (
  domain text, skill text, attempts bigint, correct bigint, mastery numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT s.domain, s.skill, s.attempts, s.correct,
         ROUND(100.0 * s.correct / NULLIF(s.attempts, 0), 1) AS mastery
  FROM public.student_skill_stats s
  WHERE s.student_id = auth.uid()
  ORDER BY s.domain, s.skill;
$$;
GRANT EXECUTE ON FUNCTION public.my_skill_mastery() TO authenticated;

-- -----------------------------------------------------------------------------
-- SECTION 3: predict_my_sat_score() RPC
-- -----------------------------------------------------------------------------
-- Simple linear mapping:
--   per-section scaled = 200 + (correct_pct * 6)
--   total              = 400 + (correct_pct * 12), clamped to [400, 1600]
-- This is a STUB; real SAT scoring uses an adaptive Module 2 + raw-to-scaled
-- lookup tables that we don't model here. v1 just gives the student a
-- directional number until we ship a calibrated predictor.

CREATE OR REPLACE FUNCTION public.predict_my_sat_score() RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_overall numeric;
  v_n int;
  v_scaled int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT AVG(score_percent), COUNT(*) INTO v_overall, v_n
  FROM public.assignment_attempts
  WHERE student_id = v_uid AND submitted_at IS NOT NULL AND score_percent IS NOT NULL;

  IF v_n = 0 OR v_overall IS NULL THEN
    RETURN jsonb_build_object(
      'has_data', false,
      'message', 'Submit at least one assignment to see a predicted score.'
    );
  END IF;

  -- Linear: 200 → 1600. Floor at 400, ceil at 1600. Total of two equal sections.
  v_scaled := LEAST(1600, GREATEST(400, 400 + ROUND(v_overall * 12)));

  RETURN jsonb_build_object(
    'has_data', true,
    'samples', v_n,
    'avg_percent', ROUND(v_overall, 1),
    'predicted_total', v_scaled,
    'confidence', CASE WHEN v_n >= 10 THEN 'high' WHEN v_n >= 5 THEN 'medium' ELSE 'low' END,
    'method', 'linear-v1'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.predict_my_sat_score() TO authenticated;
