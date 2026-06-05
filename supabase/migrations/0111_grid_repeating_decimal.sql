-- =============================================================================
-- Migration: 0111_grid_repeating_decimal.sql
-- Purpose:   Grade rounded/truncated decimal entries for grid (student-produced
--            response) questions whose answer is a REPEATING / non-terminating
--            decimal — matching the actual College Board SPR rule.
--
--   Background: the digital SAT accepts any rounded OR truncated decimal that
--   "fills the grid" for a repeating answer. e.g. for 2/3 it accepts .6666,
--   .6667, 0.667; for 1/3 it accepts .3333. The 0055 grader only accepted an
--   answer that was (a) literally listed in `accepted`, or (b) numerically
--   equal to the key within 1e-9 — so .6667 (off by 3.3e-5 from 2/3) was
--   wrongly marked incorrect unless every truncation was hand-enumerated in the
--   seed data. Found by the grid-grading edge-case battery (2026-06-05); the
--   live DSAT-Nov-2023 has no repeating-decimal grid answers so it was latent,
--   but the grader is general and future tests will hit it.
--
--   Fix: add an approximation branch to _grade_answer, used ONLY when:
--     1. the key is genuinely non-terminating in grid space
--        (round(kv,4) <> round(kv,10)) — so a terminating key like 0.125 still
--        rejects near-misses like 0.1249; AND
--     2. the student entered a DECIMAL (fractions still go through exact
--        equality), with enough places to "fill the grid":
--        places >= greatest(1, 4 - <integer digits of |kv|>)
--        — rejects under-precise entries like 0.67 / 0.7 for 2/3; AND
--     3. the student's value equals the key TRUNCATED or ROUNDED to that many
--        places.
--
--   CREATE OR REPLACE keeps the exact signature so submit_test_module picks up
--   the new logic with no other changes. Preserves the 0106 `search_path = ''`
--   hardening (all built-ins resolve from pg_catalog; public._spr_numeric is
--   schema-qualified). Idempotent / forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._grade_answer(
  p_type text, p_correct text, p_accepted jsonb, p_chosen text
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  c text := btrim(coalesce(p_chosen, ''));
  sv numeric;
  kv numeric;
  v_places int;
  v_req int;
BEGIN
  IF c = '' THEN RETURN false; END IF;

  IF p_type = 'mcq' THEN
    RETURN upper(c) = upper(coalesce(p_correct, ''));
  END IF;

  -- grid: exact (case/space-insensitive) literal membership in accepted forms.
  IF p_accepted IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_accepted) a
     WHERE lower(btrim(a)) = lower(c)
  ) THEN
    RETURN true;
  END IF;

  -- numeric key: correct_answer when present, else the first accepted form
  -- (grids store the canonical value there).
  sv := public._spr_numeric(c);
  kv := public._spr_numeric(coalesce(nullif(p_correct, ''), p_accepted ->> 0));
  IF sv IS NULL OR kv IS NULL THEN
    RETURN false;
  END IF;

  -- exact numeric equivalence (handles terminating decimals, trailing zeros,
  -- reduced/unreduced fractions, e.g. 2.7 vs 2.70, 45/8 vs 90/16 vs 5.625).
  IF abs(sv - kv) < 1e-9 THEN
    RETURN true;
  END IF;

  -- approximation branch — ONLY for repeating / non-terminating keys, and ONLY
  -- when the student entered a DECIMAL with enough places to fill the grid.
  IF c ~ '^-?(\d+\.?\d*|\.\d+)$' AND position('.' in c) > 0
     AND round(kv, 4) <> round(kv, 10)
  THEN
    v_places := length(split_part(c, '.', 2));
    v_req := greatest(1, 4 - length(trunc(abs(kv))::text));
    IF v_places >= v_req
       AND (sv = trunc(kv, v_places) OR sv = round(kv, v_places))
    THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;
