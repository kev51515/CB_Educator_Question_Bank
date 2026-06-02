-- =============================================================================
-- Migration: 0055_grid_numeric_grading.sql
-- Purpose:   Fix a grid-in grading gap found in QA. For grid (student-produced
--            response) questions the canonical answer is stored in `accepted`
--            (a jsonb array of equivalent string forms) and `correct_answer`
--            is NULL. The numeric-equivalence fallback in _grade_answer (0048)
--            compared the student's value against `correct_answer` only — which
--            is NULL for grids — so it never fired, and a numerically-equal but
--            not-literally-listed answer (e.g. "4.750" for 4.75, "17.0" for 17,
--            "-23.0" for -23) was wrongly graded incorrect.
--
--   Fix: derive the numeric key from `accepted[0]` when `correct_answer` is
--   NULL. Literal membership in `accepted` is still checked first (covers
--   fraction forms like "45/8" and "1/8"). CREATE OR REPLACE keeps the exact
--   signature so submit_test_module picks up the new logic with no other
--   changes. Idempotent / forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._grade_answer(
  p_type text, p_correct text, p_accepted jsonb, p_chosen text
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  c text := btrim(coalesce(p_chosen, ''));
  sv numeric;
  kv numeric;
BEGIN
  IF c = '' THEN RETURN false; END IF;
  IF p_type = 'mcq' THEN
    RETURN upper(c) = upper(coalesce(p_correct, ''));
  END IF;
  -- grid: exact (case/space-insensitive) membership in the accepted forms.
  IF p_accepted IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_accepted) a
     WHERE lower(btrim(a)) = lower(c)
  ) THEN
    RETURN true;
  END IF;
  -- ...else numeric equivalence. The key is correct_answer when present, else
  -- the first accepted form (grids store the canonical value there).
  sv := public._spr_numeric(c);
  kv := public._spr_numeric(coalesce(nullif(p_correct, ''), p_accepted ->> 0));
  IF sv IS NOT NULL AND kv IS NOT NULL AND abs(sv - kv) < 1e-9 THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
