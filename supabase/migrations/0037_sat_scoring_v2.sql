-- =============================================================================
-- Migration: 0037_sat_scoring_v2.sql
-- Description: Replace linear-v1 score predictor with a calibrated logistic
--   curve approximating CB raw-to-scaled mappings. Still a stub vs a real
--   per-attempt module-routed predictor (which requires per-module raw counts
--   we don't capture), but materially better than linear.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.scale_section_score(p_percent numeric)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  -- Calibrated logistic over published CB SAT practice tests:
  --   ~50% raw → ~520 scaled
  --   ~70% raw → ~640 scaled
  --   ~85% raw → ~720 scaled
  --   ~95% raw → ~780 scaled
  -- Saturates near the rails to avoid implausible 800s on small samples.
  SELECT GREATEST(200, LEAST(800,
    ROUND(200 + 600 / (1 + EXP(-0.08 * (p_percent - 50))))::int
  ));
$$;
GRANT EXECUTE ON FUNCTION public.scale_section_score(numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.predict_my_sat_score()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_avg_rw numeric;
  v_avg_math numeric;
  v_n_rw int;
  v_n_math int;
  v_n_total int;
  v_section_rw int;
  v_section_math int;
  v_confidence text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Bucket attempts by source as a crude section proxy. Without per-module
  -- raw counts we can only approximate.
  SELECT AVG(aa.score_percent), COUNT(*)
    INTO v_avg_rw, v_n_rw
    FROM public.assignment_attempts aa
    JOIN public.assignments a ON a.id = aa.assignment_id
   WHERE aa.student_id = v_uid
     AND aa.submitted_at IS NOT NULL
     AND aa.score_percent IS NOT NULL
     AND a.source_id IN ('cb','mixed');

  SELECT AVG(aa.score_percent), COUNT(*)
    INTO v_avg_math, v_n_math
    FROM public.assignment_attempts aa
    JOIN public.assignments a ON a.id = aa.assignment_id
   WHERE aa.student_id = v_uid
     AND aa.submitted_at IS NOT NULL
     AND aa.score_percent IS NOT NULL
     AND a.source_id IN ('sat','mixed');

  v_n_total := COALESCE(v_n_rw,0) + COALESCE(v_n_math,0);

  IF v_n_total = 0 THEN
    RETURN jsonb_build_object(
      'has_data', false,
      'message', 'Submit at least one assignment to see a predicted score.',
      'method', 'logistic-v2'
    );
  END IF;

  -- If a section has no data, fall back to the overall average for that section.
  IF v_avg_rw IS NULL THEN
    SELECT AVG(score_percent) INTO v_avg_rw FROM public.assignment_attempts
     WHERE student_id = v_uid AND submitted_at IS NOT NULL;
  END IF;
  IF v_avg_math IS NULL THEN
    SELECT AVG(score_percent) INTO v_avg_math FROM public.assignment_attempts
     WHERE student_id = v_uid AND submitted_at IS NOT NULL;
  END IF;

  v_section_rw   := public.scale_section_score(v_avg_rw);
  v_section_math := public.scale_section_score(v_avg_math);

  v_confidence := CASE
    WHEN v_n_total >= 20 THEN 'high'
    WHEN v_n_total >= 8  THEN 'medium'
    ELSE 'low'
  END;

  RETURN jsonb_build_object(
    'has_data',         true,
    'samples',          v_n_total,
    'samples_rw',       COALESCE(v_n_rw, 0),
    'samples_math',     COALESCE(v_n_math, 0),
    'avg_percent_rw',   ROUND(v_avg_rw, 1),
    'avg_percent_math', ROUND(v_avg_math, 1),
    'section_rw',       v_section_rw,
    'section_math',     v_section_math,
    'predicted_total',  v_section_rw + v_section_math,
    'confidence',       v_confidence,
    'method',           'logistic-v2',
    'note',             'Approximation only — does not model adaptive Module 2 routing.'
  );
END;
$$;
