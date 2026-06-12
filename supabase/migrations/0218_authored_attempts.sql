-- =============================================================================
-- Migration: 0218_authored_attempts.sql
-- Description: Phase 3b (ISOLATED PARTS) of the Recordings → quiz publish path.
--   Builds the pieces that DON'T touch the shared assignment-kind machinery:
--     - `authored_questions.assignment_id` (snapshot link — published copies
--       carry the assignment id; drafts keep it NULL)
--     - `get_authored_questions(assignment)`  — enrolled-student reader that
--       returns stem + choices but NEVER the correct answer/rationale
--     - `submit_authored_attempt(...)`        — SERVER-SIDE graded, idempotent
--       submit into assignment_attempts (client never sends a score)
--
--   STILL DEFERRED (couples to the parallel session's assignment rework, and
--   NOT in this migration): altering `assignments_kind_consistency` to allow
--   kind='authored_set', the `publish_authored_quiz` RPC, and the
--   AssignmentRunner branch. Until those land, no `authored_set` assignment can
--   exist, so the two RPCs below are dormant (they validate kind='authored_set'
--   and will simply raise wrong_kind on anything else).
--
-- NOTE: numbered 0218; a parallel session is adding migrations rapidly
--   (…0217). Re-check `supabase migration list` for a collision + renumber
--   before pushing. NOT yet pushed.
--
-- Mirrors `submit_qbank_attempt` (0045) for validation + error codes.
-- Forward-only. Idempotent re-runs OK.
-- =============================================================================

-- Snapshot link: a published question carries its assignment id; drafts NULL.
ALTER TABLE public.authored_questions
  ADD COLUMN IF NOT EXISTS assignment_id uuid
    REFERENCES public.assignments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS authored_questions_assignment_idx
  ON public.authored_questions (assignment_id, position)
  WHERE assignment_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reader: answer-stripped questions for a student taking the quiz.
--   `authored_questions` is owner-only RLS, so a student can't read it directly;
--   this SECURITY DEFINER reader returns ONLY stem + choices (no correct_answer,
--   no rationale) to an enrolled student / teacher / admin.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_authored_questions(p_assignment_id uuid)
RETURNS TABLE (id uuid, "position" integer, stem text, choices jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_course_id uuid;
  v_kind      text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT a.course_id, a.kind INTO v_course_id, v_kind
    FROM public.assignments a WHERE a.id = p_assignment_id;
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = '02000';
  END IF;
  IF v_kind <> 'authored_set' THEN
    RAISE EXCEPTION 'wrong_kind' USING ERRCODE = '22000';
  END IF;

  IF NOT (
    public.is_staff(v_user_id)
    OR EXISTS (
      SELECT 1 FROM public.course_memberships cm
       WHERE cm.course_id = v_course_id AND cm.student_id = v_user_id
    )
  ) THEN
    RAISE EXCEPTION 'not_enrolled' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT aq.id, aq.position, aq.stem, aq.choices
      FROM public.authored_questions aq
     WHERE aq.assignment_id = p_assignment_id
       AND aq.status = 'published'
     ORDER BY aq.position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_authored_questions(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Submit: server-side graded, idempotent on client_attempt_id.
--   p_answers is { "<question_id>": "A"|"B"|"C"|"D", ... }. We grade against
--   authored_questions.correct_answer (definer-read), so the client can't fake
--   a score. Stable error codes mirror submit_qbank_attempt.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_authored_attempt(
  p_assignment_id    uuid,
  p_client_attempt_id uuid,
  p_answers          jsonb
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
  v_existing          integer;
  v_attempt_id        uuid;
  v_total             integer := 0;
  v_correct           integer := 0;
  v_detail            jsonb := '{}'::jsonb;
  r                   record;
  v_given             text;
  v_is_correct        boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT a.course_id, a.kind, a.archived, a.max_attempts
    INTO v_course_id, v_kind, v_archived, v_max_attempts
    FROM public.assignments a WHERE a.id = p_assignment_id;
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = '02000';
  END IF;
  IF v_archived THEN
    RAISE EXCEPTION 'assignment_archived' USING ERRCODE = '22000';
  END IF;
  IF v_kind <> 'authored_set' THEN
    RAISE EXCEPTION 'wrong_kind' USING ERRCODE = '22000';
  END IF;

  IF NOT (
    public.is_staff(v_user_id)
    OR EXISTS (
      SELECT 1 FROM public.course_memberships cm
       WHERE cm.course_id = v_course_id AND cm.student_id = v_user_id
    )
  ) THEN
    RAISE EXCEPTION 'not_enrolled' USING ERRCODE = '42501';
  END IF;

  -- Idempotency: same client_attempt_id returns the existing row.
  IF p_client_attempt_id IS NOT NULL THEN
    SELECT aa.id INTO v_attempt_id
      FROM public.assignment_attempts aa
     WHERE aa.assignment_id = p_assignment_id
       AND aa.student_id = v_user_id
       AND aa.client_attempt_id = p_client_attempt_id
     LIMIT 1;
    IF v_attempt_id IS NOT NULL THEN
      RETURN v_attempt_id;
    END IF;
  END IF;

  -- max_attempts (NULL = unlimited)
  IF v_max_attempts IS NOT NULL THEN
    SELECT count(*) INTO v_existing
      FROM public.assignment_attempts aa
     WHERE aa.assignment_id = p_assignment_id
       AND aa.student_id = v_user_id
       AND aa.submitted_at IS NOT NULL;
    IF v_existing >= v_max_attempts THEN
      RAISE EXCEPTION 'max_attempts_reached' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Server-side grade against the published snapshot.
  FOR r IN
    SELECT aq.id, aq.correct_answer
      FROM public.authored_questions aq
     WHERE aq.assignment_id = p_assignment_id
       AND aq.status = 'published'
  LOOP
    v_total := v_total + 1;
    v_given := p_answers ->> r.id::text;
    v_is_correct := (v_given IS NOT NULL AND v_given = r.correct_answer);
    IF v_is_correct THEN
      v_correct := v_correct + 1;
    END IF;
    v_detail := v_detail || jsonb_build_object(
      r.id::text,
      jsonb_build_object('given', v_given, 'correct', r.correct_answer, 'is_correct', v_is_correct)
    );
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'no_questions' USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.assignment_attempts (
    assignment_id, student_id, client_attempt_id,
    started_at, submitted_at,
    score_percent, correct_count, total_questions,
    answers, result_detail
  ) VALUES (
    p_assignment_id, v_user_id, p_client_attempt_id,
    now(), now(),
    round((v_correct::numeric / v_total) * 100, 2), v_correct, v_total,
    COALESCE(p_answers, '{}'::jsonb), v_detail
  )
  RETURNING id INTO v_attempt_id;

  RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_authored_attempt(uuid, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.submit_authored_attempt(uuid, uuid, jsonb) IS
  'Server-side-graded, idempotent submit for kind=authored_set assignments. Grades p_answers against authored_questions.correct_answer; writes assignment_attempts. Error codes: not_authenticated, assignment_not_found, assignment_archived, wrong_kind, not_enrolled, max_attempts_reached, no_questions.';

-- =============================================================================
