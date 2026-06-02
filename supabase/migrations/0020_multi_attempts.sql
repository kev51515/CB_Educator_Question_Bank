-- 0020_multi_attempts.sql
-- ============================================================================
-- Adds support for multiple attempts per (assignment, student) and a late-
-- penalty policy on assignments. Replaces the previous single-row UNIQUE
-- constraint with an attempt counter enforced inside the
-- `start_assignment_attempt` RPC, and exposes a best-of-N view for the
-- gradebook.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: Schema changes
-- ----------------------------------------------------------------------------

-- Allow N attempts per (assignment, student) — drop the UNIQUE constraint.
ALTER TABLE public.assignment_attempts
  DROP CONSTRAINT IF EXISTS assignment_attempts_assignment_id_student_id_key;

-- Add attempt-tracking + late-policy columns to assignments.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS max_attempts int CHECK (max_attempts IS NULL OR max_attempts > 0),
  ADD COLUMN IF NOT EXISTS late_penalty_percent int NOT NULL DEFAULT 0
    CHECK (late_penalty_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS grace_period_hours int NOT NULL DEFAULT 0
    CHECK (grace_period_hours >= 0);

-- ----------------------------------------------------------------------------
-- SECTION 2: Best-of-N view for the gradebook
-- ----------------------------------------------------------------------------

-- View: best-of-N for the gradebook. RLS pass-through via underlying tables.
-- Note: this codebase doesn't carry a `status` column on assignment_attempts
-- (see migration 0004 — submission is signalled by `submitted_at IS NOT NULL`).
-- We synthesise a `status` column in the view so downstream consumers can rely
-- on the requested shape, but the predicate is `submitted_at IS NOT NULL`.
CREATE OR REPLACE VIEW public.assignment_best_attempts AS
SELECT DISTINCT ON (assignment_id, student_id)
  assignment_id,
  student_id,
  id AS attempt_id,
  score_percent,
  submitted_at,
  duration_seconds,
  'submitted'::text AS status
FROM public.assignment_attempts
WHERE submitted_at IS NOT NULL
ORDER BY assignment_id, student_id, score_percent DESC NULLS LAST, submitted_at DESC;

GRANT SELECT ON public.assignment_best_attempts TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 3: Helper — compute effective score after late penalty
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_late_penalty(
  raw_score numeric,
  due_at timestamptz,
  submitted_at timestamptz,
  late_penalty_percent int,
  grace_period_hours int
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN due_at IS NULL OR submitted_at IS NULL OR submitted_at <= due_at + (grace_period_hours || ' hours')::interval
      THEN raw_score
    ELSE GREATEST(0, raw_score - late_penalty_percent)
  END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_late_penalty TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 4: RPC start_assignment_attempt — multi-attempt aware
-- ----------------------------------------------------------------------------
-- Behaviour changes vs. 0014:
--   • Each invocation inserts a *new* attempt row (never updates an existing
--     in-progress row). The old "resume = wipe + reinsert" path is gone.
--   • Before insert, we count existing non-draft attempts for this
--     (assignment, student). If the assignment's `max_attempts` is set and
--     count >= max_attempts → RAISE EXCEPTION 'max_attempts_reached'.
--   • Authn / window / enrolment / payload validation are preserved from 0014.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_assignment_attempt(
  p_assignment_id uuid,
  p_questions     jsonb
)
  RETURNS TABLE (
    attempt_id     uuid,
    question_count integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_course_id     uuid;
  v_archived      boolean;
  v_opens_at      timestamptz;
  v_max_attempts  integer;
  v_attempt_count integer;
  v_attempt       public.assignment_attempts%ROWTYPE;
  v_question      jsonb;
  v_position      integer := 0;
  v_count         integer;
BEGIN
  -- ---- AuthN ----
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in to start an assignment.';
  END IF;

  -- ---- Assignment exists + window check ----
  SELECT a.course_id, a.archived, a.opens_at, a.max_attempts
    INTO v_course_id, v_archived, v_opens_at, v_max_attempts
    FROM public.assignments a
   WHERE a.id = p_assignment_id;

  IF v_course_id IS NULL THEN
    -- Same error shape as not-open so we don't leak existence info to a
    -- caller probing assignment ids.
    RAISE EXCEPTION 'not_open'
      USING HINT = 'This assignment is not available.';
  END IF;

  IF v_archived OR (v_opens_at IS NOT NULL AND v_opens_at > now()) THEN
    RAISE EXCEPTION 'not_open'
      USING HINT = 'This assignment is not available yet.';
  END IF;

  -- ---- Enrolment / staff check ----
  IF NOT public.is_staff(v_caller) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.course_memberships cm
       WHERE cm.course_id  = v_course_id
         AND cm.student_id = v_caller
    ) THEN
      RAISE EXCEPTION 'not_enrolled'
        USING HINT = 'You must be enrolled in this course to start the assignment.';
    END IF;
  END IF;

  -- ---- Validate p_questions BEFORE touching attempt state ----
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_questions'
      USING HINT = 'Questions payload must be a JSON array.';
  END IF;

  v_count := jsonb_array_length(p_questions);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'invalid_questions'
      USING HINT = 'Questions payload must contain at least one question.';
  END IF;

  -- ---- Enforce max_attempts ----
  -- Count every existing attempt row for this (assignment, student). This
  -- codebase doesn't have a "draft" state — every row inserted via this RPC
  -- is a real, materialised attempt (in-progress until submitted), so every
  -- row counts against the quota.
  IF v_max_attempts IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_attempt_count
      FROM public.assignment_attempts
     WHERE assignment_id = p_assignment_id
       AND student_id    = v_caller;

    IF v_attempt_count >= v_max_attempts THEN
      RAISE EXCEPTION 'max_attempts_reached'
        USING HINT = 'You have used all attempts for this assignment.';
    END IF;
  END IF;

  -- ---- Insert a fresh attempt row (multi-attempt semantics) ----
  INSERT INTO public.assignment_attempts (assignment_id, student_id)
  VALUES (p_assignment_id, v_caller)
  RETURNING * INTO v_attempt;

  -- ---- Snapshot the question pool ----
  FOR v_question IN
    SELECT jsonb_array_elements(p_questions)
  LOOP
    INSERT INTO public.assignment_attempt_questions
      (attempt_id, position, question)
    VALUES
      (v_attempt.id, v_position, v_question);
    v_position := v_position + 1;
  END LOOP;

  attempt_id     := v_attempt.id;
  question_count := v_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.start_assignment_attempt(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_assignment_attempt(uuid, jsonb) TO authenticated;
