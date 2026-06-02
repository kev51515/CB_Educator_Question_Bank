-- =============================================================================
-- Migration: 0045_qbank_assignments.sql
-- Purpose:   Introduce a second "kind" of assignment: a Question-Bank Set,
--            distinct from the existing mock-test assignment.
--
--   • Add `kind` column to `assignments` with CHECK ('mocktest' | 'qbank_set').
--   • Add `qbank_set_uid` and `qbank_set_label` (the static-test set the
--     assignment links to and a human label for display).
--   • Loosen `source_id` to allow NULL (qbank_set rows have no SAT source),
--     but keep the value CHECK so legacy 'cb'|'sat'|'mixed' values stay valid.
--   • Cross-column consistency check: a mocktest must have source_id and no
--     qbank_set_uid; a qbank_set must have a qbank_set_uid.
--
--   • New RPC `submit_qbank_attempt(p_assignment_id, p_payload)` that mirrors
--     the existing submit_attempt flow but is scoped to qbank_set kind. It
--     validates auth, enrollment, max_attempts, and inserts a row in
--     assignment_attempts using the graded payload from the static-test
--     runner.
--
-- Drift gotchas captured:
--   • SECURITY DEFINER + explicit search_path so the function can insert into
--     assignment_attempts even though RLS would otherwise block. The classic
--     0008/0013 inline-EXISTS recursion trap is avoided by routing enrollment
--     check through a single COALESCE expression with `is_staff(uid)`.
--   • `course_memberships` uses `student_id` (not `user_id`); see 0012 rename.
--   • Error codes raised match the convention from 0014/0020: stable strings
--     that the client can switch on.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema additions
-- -----------------------------------------------------------------------------
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'mocktest';

-- Add the kind CHECK constraint idempotently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'assignments_kind_check'
       AND conrelid = 'public.assignments'::regclass
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_kind_check
      CHECK (kind IN ('mocktest', 'qbank_set'));
  END IF;
END$$;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS qbank_set_uid text NULL;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS qbank_set_label text NULL;

-- source_id is currently NOT NULL CHECK IN (cb,sat,mixed). For qbank_set we
-- need NULL. Drop the NOT NULL but KEEP the value CHECK (still constrained).
ALTER TABLE public.assignments ALTER COLUMN source_id DROP NOT NULL;

-- Cross-column consistency: a qbank_set MUST have qbank_set_uid; a mocktest
-- MUST have source_id and MUST NOT have qbank_set_uid.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'assignments_kind_consistency'
       AND conrelid = 'public.assignments'::regclass
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_kind_consistency
      CHECK (
        (kind = 'mocktest'  AND source_id IS NOT NULL AND qbank_set_uid IS NULL)
        OR (kind = 'qbank_set' AND qbank_set_uid IS NOT NULL)
      );
  END IF;
END$$;

-- Helpful index for the student-side "what qbank assignments do I have" query.
CREATE INDEX IF NOT EXISTS idx_assignments_kind_course_archived
  ON public.assignments(course_id, kind, archived);

COMMENT ON COLUMN public.assignments.kind IS
  'Discriminator for assignment flavor: ''mocktest'' (existing SAT mock-test) or ''qbank_set'' (static question-bank set).';
COMMENT ON COLUMN public.assignments.qbank_set_uid IS
  'For kind=qbank_set: stable identifier of the static set the assignment links to (e.g. "alg-linear-12q"). Free-form string; the client resolves it to the test bank entry.';
COMMENT ON COLUMN public.assignments.qbank_set_label IS
  'For kind=qbank_set: cached human label shown in the teacher list, so we don''t have to round-trip to the test catalog.';

-- -----------------------------------------------------------------------------
-- 2. RPC: submit_qbank_attempt
--    Mirrors submit_attempt but scoped to kind = 'qbank_set'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_qbank_attempt(
  p_assignment_id uuid,
  p_payload       jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id           uuid := auth.uid();
  v_course_id         uuid;
  v_kind              text;
  v_archived          boolean;
  v_max_attempts      integer;
  v_existing_attempts integer;
  v_attempt_id        uuid;
  v_score             numeric;
  v_correct           integer;
  v_total             integer;
BEGIN
  -- Authn ---------------------------------------------------------------------
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Look up the assignment ----------------------------------------------------
  SELECT a.course_id, a.kind, a.archived, a.max_attempts
    INTO v_course_id, v_kind, v_archived, v_max_attempts
    FROM public.assignments a
   WHERE a.id = p_assignment_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = '02000';
  END IF;
  IF v_archived THEN
    RAISE EXCEPTION 'assignment_archived' USING ERRCODE = '22000';
  END IF;
  IF v_kind <> 'qbank_set' THEN
    RAISE EXCEPTION 'wrong_kind' USING ERRCODE = '22000';
  END IF;

  -- Enrollment / staff bypass -------------------------------------------------
  -- Avoid inline-EXISTS-with-RLS-recursion (see 0008/0013). Run as definer
  -- against course_memberships directly.
  IF NOT (
    public.is_staff(v_user_id)
    OR EXISTS (
      SELECT 1
        FROM public.course_memberships cm
       WHERE cm.course_id = v_course_id
         AND cm.student_id = v_user_id
    )
  ) THEN
    RAISE EXCEPTION 'not_enrolled' USING ERRCODE = '42501';
  END IF;

  -- Enforce max_attempts (NULL = unlimited) -----------------------------------
  IF v_max_attempts IS NOT NULL THEN
    SELECT count(*) INTO v_existing_attempts
      FROM public.assignment_attempts aa
     WHERE aa.assignment_id = p_assignment_id
       AND aa.student_id    = v_user_id
       AND aa.submitted_at IS NOT NULL;
    IF v_existing_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'max_attempts_reached' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Extract graded fields from payload with safe defaults ---------------------
  v_score   := COALESCE((p_payload->>'score_percent')::numeric, 0);
  v_correct := COALESCE((p_payload->>'correct_count')::int, 0);
  v_total   := COALESCE((p_payload->>'total_questions')::int, 0);

  -- Insert the attempt --------------------------------------------------------
  INSERT INTO public.assignment_attempts (
    assignment_id, student_id,
    started_at, submitted_at,
    score_percent, correct_count, total_questions,
    answers, result_detail
  ) VALUES (
    p_assignment_id,
    v_user_id,
    COALESCE((p_payload->>'started_at')::timestamptz, now()),
    now(),
    v_score, v_correct, v_total,
    COALESCE(p_payload->'answers',       '{}'::jsonb),
    COALESCE(p_payload->'result_detail', '{}'::jsonb)
  )
  RETURNING id INTO v_attempt_id;

  RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_qbank_attempt(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.submit_qbank_attempt(uuid, jsonb) IS
  'Atomic submit for question-bank-set assignments. Validates auth, archive state, kind=qbank_set, enrollment, and max_attempts; inserts an assignment_attempts row with the graded payload from the static test runner. Stable error codes: not_authenticated, assignment_not_found, assignment_archived, wrong_kind, not_enrolled, max_attempts_reached.';
