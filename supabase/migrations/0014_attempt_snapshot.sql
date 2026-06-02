-- =============================================================================
-- Migration: 0014_attempt_snapshot.sql
-- Description: Close the assignment-loop trust gap by snapshotting the exact
--              question pool a student saw into a new
--              `assignment_attempt_questions` table, plus an atomic
--              `start_assignment_attempt` RPC that creates / resets an attempt
--              and seeds the snapshot in one transaction.
--
--              Replaces the MVP workaround from 0004 where the rendered
--              `TestQuestion[]` was inlined into
--              `assignment_attempts.result_detail.questions`. That field is
--              backfilled into the new table and stripped from result_detail
--              by this migration so review surfaces stop relying on it.
--
-- Trust boundary (intentional design):
--   The source adapters (CB JSON, SAT JSON) live in the browser bundle. The
--   server cannot easily replicate that selection, so the client passes the
--   question array it built from the assignment's config + adapters and the
--   RPC snapshots it as-is. A student could in principle craft a different
--   question set, but the per-question data IS the right answer + rationales
--   — gaming the snapshot only helps them see the answer faster, which they
--   could already do via DevTools today. Snapshotting still closes the gap
--   between attempt and review (the bug we're fixing) and gives teachers a
--   reproducible per-student answer trail.
--
-- Platform: Supabase (PostgreSQL 15+).
-- Note: Supabase wraps each migration in a transaction automatically.
-- =============================================================================


-- =============================================================================
-- SECTION 1: assignment_attempt_questions TABLE
-- One row per (attempt, position). The full TestQuestion payload (stem,
-- choices, correctAnswer, rationales) is stored as jsonb so the review
-- surfaces can render exactly what the student saw.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.assignment_attempt_questions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid        NOT NULL REFERENCES public.assignment_attempts(id) ON DELETE CASCADE,
  position    integer     NOT NULL,
  -- Full TestQuestion shape. Validating the shape at the DB layer would
  -- duplicate a TypeScript type; we trust the start_assignment_attempt RPC
  -- to enforce array-ness and let the client renderer surface any drift.
  question    jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Ordered slots: position is 0-based and uniquely identifies a question
  -- within the attempt so review always renders in the same order.
  UNIQUE (attempt_id, position)
);

-- Why: the review path loads "all snapshot rows for this attempt ORDER BY
-- position". A plain (attempt_id) index covers that path without redundancy
-- against the UNIQUE constraint (which already covers (attempt_id, position)
-- but a single-column index is cheaper for the SELECT-all-by-attempt case).
CREATE INDEX IF NOT EXISTS idx_attempt_questions_attempt
  ON public.assignment_attempt_questions(attempt_id);

ALTER TABLE public.assignment_attempt_questions ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 2: RLS POLICIES — assignment_attempt_questions
--
-- INSERT/UPDATE/DELETE are deliberately not granted to end users. Mutation is
-- restricted to the start_assignment_attempt RPC (SECURITY DEFINER) which
-- runs as the table owner and bypasses RLS. The cascading FK + the DELETE
-- on the attempts table handle cleanup; teachers/staff already have DELETE
-- on assignment_attempts and the ON DELETE CASCADE propagates here.
-- =============================================================================

-- ---- SELECT ----

DROP POLICY IF EXISTS "attempt_questions: student reads own" ON public.assignment_attempt_questions;
CREATE POLICY "attempt_questions: student reads own"
  ON public.assignment_attempt_questions
  FOR SELECT
  USING (
    -- Why: the student who owns the parent attempt needs to read the snapshot
    -- to review their answers post-submit. We resolve the owner via a
    -- correlated subquery rather than a join so policy planning stays simple.
    (
      SELECT aa.student_id
        FROM public.assignment_attempts aa
       WHERE aa.id = assignment_attempt_questions.attempt_id
    ) = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "attempt_questions: staff reads all" ON public.assignment_attempt_questions;
CREATE POLICY "attempt_questions: staff reads all"
  ON public.assignment_attempt_questions
  FOR SELECT
  USING (
    -- Why: staff (teacher of the course OR admin) already see the parent
    -- assignment_attempts row via the existing policies in 0012. is_staff()
    -- is a superset; we don't need to walk attempt → assignment → course
    -- here because attempt_questions is itself only useful when the parent
    -- attempt is already authorised, and the teacher's read of the attempt
    -- is gated separately. is_staff keeps this policy fast and recursion-free.
    public.is_staff((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 3: RPC start_assignment_attempt(p_assignment_id, p_questions)
--
-- Atomically:
--   1. Verify the caller is enrolled in the assignment's course (or is staff).
--   2. Verify the assignment is open (exists, not archived, opens_at <= now).
--   3. Look up an existing attempt:
--        - If already submitted → RAISE 'already_submitted'.
--        - If in-progress       → reset its lifecycle columns and delete the
--                                 stale snapshot rows (CASCADE doesn't fire
--                                 because we keep the attempt row).
--        - If none              → INSERT a fresh attempt row.
--   4. Validate p_questions is a non-empty jsonb array.
--   5. INSERT one row per element into assignment_attempt_questions with
--      position = array index (0-based).
--   6. Return { attempt_id, question_count }.
--
-- See header comment for the client-supplies-questions trust trade-off.
-- =============================================================================

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
  v_caller       uuid := auth.uid();
  v_course_id    uuid;
  v_archived     boolean;
  v_opens_at     timestamptz;
  v_attempt      public.assignment_attempts%ROWTYPE;
  v_question     jsonb;
  v_position     integer := 0;
  v_count        integer;
BEGIN
  -- ---- AuthN ----
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in to start an assignment.';
  END IF;

  -- ---- Assignment exists + window check ----
  SELECT a.course_id, a.archived, a.opens_at
    INTO v_course_id, v_archived, v_opens_at
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

  -- ---- Lookup / create the attempt row ----
  SELECT *
    INTO v_attempt
    FROM public.assignment_attempts
   WHERE assignment_id = p_assignment_id
     AND student_id    = v_caller
   FOR UPDATE;

  IF FOUND THEN
    IF v_attempt.submitted_at IS NOT NULL THEN
      RAISE EXCEPTION 'already_submitted'
        USING HINT = 'You have already submitted this assignment. Open the review instead.';
    END IF;

    -- Resume-as-fresh: wipe the old snapshot and reset lifecycle columns.
    -- We document on the client (AssignmentRunner) that resuming pulls a
    -- new question set; this matches the pre-existing Restart behaviour
    -- and is acceptable because the old snapshot wasn't actually presented
    -- in a recoverable way (no answers map for not-yet-submitted attempts).
    DELETE FROM public.assignment_attempt_questions
     WHERE attempt_id = v_attempt.id;

    UPDATE public.assignment_attempts
       SET started_at       = now(),
           submitted_at     = NULL,
           score_percent    = NULL,
           correct_count    = NULL,
           total_questions  = NULL,
           duration_seconds = NULL,
           answers          = NULL,
           result_detail    = NULL,
           updated_at       = now()
     WHERE id = v_attempt.id;
  ELSE
    INSERT INTO public.assignment_attempts (assignment_id, student_id)
    VALUES (p_assignment_id, v_caller)
    RETURNING * INTO v_attempt;
  END IF;

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


-- =============================================================================
-- SECTION 4: RPC fetch_attempt_questions(p_attempt_id)
-- Returns the snapshot as a jsonb array ordered by position. Gated to the
-- owning student or staff. Centralises the read so the client doesn't have
-- to coordinate a second .from() call + RLS shape against the table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fetch_attempt_questions(
  p_attempt_id uuid
)
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
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in.';
  END IF;

  SELECT aa.student_id
    INTO v_student_id
    FROM public.assignment_attempts aa
   WHERE aa.id = p_attempt_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Attempt not found.';
  END IF;

  IF v_student_id <> v_caller AND NOT public.is_staff(v_caller) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'You may not read this attempt.';
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


-- =============================================================================
-- SECTION 5: BACKFILL existing attempts
-- For every attempt that still has result_detail.questions inlined (the old
-- workaround), copy each element into assignment_attempt_questions and then
-- strip the inlined field. The WHERE-NOT-EXISTS guard makes the backfill
-- idempotent — running this migration twice (e.g., after a manual edit) is
-- a no-op on the second pass because the snapshot rows are already there
-- AND result_detail no longer carries the questions key.
-- =============================================================================

WITH source AS (
  SELECT
    aa.id                                              AS attempt_id,
    (elem.value)                                       AS question,
    (elem.ordinality - 1)::int                         AS position
  FROM public.assignment_attempts aa
  CROSS JOIN LATERAL jsonb_array_elements(aa.result_detail -> 'questions')
                       WITH ORDINALITY AS elem(value, ordinality)
  WHERE aa.result_detail ? 'questions'
    AND jsonb_typeof(aa.result_detail -> 'questions') = 'array'
    AND NOT EXISTS (
      SELECT 1
        FROM public.assignment_attempt_questions q
       WHERE q.attempt_id = aa.id
    )
)
INSERT INTO public.assignment_attempt_questions (attempt_id, position, question)
SELECT attempt_id, position, question FROM source;

-- Strip the now-redundant inlined questions field. Safe to run a second time
-- because the `- 'questions'` jsonb operator on a row that no longer has the
-- key is a no-op.
UPDATE public.assignment_attempts
   SET result_detail = result_detail - 'questions'
 WHERE result_detail IS NOT NULL
   AND result_detail ? 'questions';


-- =============================================================================
-- END OF MIGRATION 0014_attempt_snapshot.sql
-- =============================================================================
