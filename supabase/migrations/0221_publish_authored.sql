-- =============================================================================
-- Migration: 0221_publish_authored.sql  (renumbered from 0219 — the parallel
--   session took 0219/0220; this depends on 0218 and must sort after it.)
-- Description: Phase 3b (FINAL PIECE) of the Recordings → quiz publish path.
--   This is the part 0218 deliberately deferred because it touches the
--   shared assignment-kind machinery:
--     1. Widen `assignments_kind_consistency` to ALSO allow kind='authored_set'
--        (which requires NEITHER source_id NOR qbank_set_uid — the questions
--        live in authored_questions, snapshot-linked via assignment_id).
--     2. Add `assignments.source_recording_id` so a published quiz can be
--        traced back to the recording it was authored from.
--     3. `publish_authored_quiz(...)` RPC — teacher/admin clones the recording's
--        DRAFT authored_questions into a new authored_set assignment, snapshots
--        each as a PUBLISHED copy carrying the new assignment_id, and optionally
--        links it into a module.
--
--   Once this lands, the dormant 0218 RPCs (get_authored_questions +
--   submit_authored_attempt) and AuthoredQuizRunner become live, closing the
--   loop: recording → AI-drafted quiz → student-takeable, server-graded
--   assignment.
--
-- COLLISION WATCH: numbered 0219. A parallel session churns assignment
--   migrations rapidly. Re-check `supabase migration list` for a collision +
--   renumber before pushing. NOT yet pushed.
--
-- Mirrors `submit_qbank_attempt` (0045) for the SECURITY DEFINER + search_path
-- pattern and stable error-code convention. Forward-only. Idempotent re-runs OK.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trace column: which recording a published authored_set was built from.
-- -----------------------------------------------------------------------------
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS source_recording_id uuid
    REFERENCES public.recordings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assignments.source_recording_id IS
  'For kind=authored_set: the recording whose AI-drafted questions were published into this assignment. NULL for other kinds.';

-- -----------------------------------------------------------------------------
-- 2. Widen the kind CHECK constraints to admit 'authored_set'.
--    - assignments_kind_check: add 'authored_set' to the allowed enum.
--    - assignments_kind_consistency: an authored_set has NEITHER source_id
--      NOR qbank_set_uid (its questions live in authored_questions). Preserve
--      the existing mocktest + qbank_set rules verbatim.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'assignments_kind_check'
       AND conrelid = 'public.assignments'::regclass
  ) THEN
    ALTER TABLE public.assignments DROP CONSTRAINT assignments_kind_check;
  END IF;
  ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_kind_check
    CHECK (kind IN ('mocktest', 'qbank_set', 'authored_set'));
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'assignments_kind_consistency'
       AND conrelid = 'public.assignments'::regclass
  ) THEN
    ALTER TABLE public.assignments DROP CONSTRAINT assignments_kind_consistency;
  END IF;
  ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_kind_consistency
    CHECK (
      (kind = 'mocktest'     AND source_id IS NOT NULL AND qbank_set_uid IS NULL)
      OR (kind = 'qbank_set'    AND qbank_set_uid IS NOT NULL)
      OR (kind = 'authored_set' AND source_id IS NULL AND qbank_set_uid IS NULL)
    );
END$$;

-- -----------------------------------------------------------------------------
-- 3. RPC: publish_authored_quiz
--    Clone the recording's draft questions into a new authored_set assignment.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_authored_quiz(
  p_recording_id uuid,
  p_course_id    uuid,
  p_title        text,
  p_module_id    uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id          uuid := auth.uid();
  v_recording_owner  uuid;
  v_question_count   integer;
  v_assignment_id    uuid;
  v_next_position    integer;
BEGIN
  -- Authn ---------------------------------------------------------------------
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Recording must exist ------------------------------------------------------
  SELECT r.owner_id INTO v_recording_owner
    FROM public.recordings r
   WHERE r.id = p_recording_id;
  IF v_recording_owner IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = '02000';
  END IF;

  -- Authorize: caller owns the recording AND teaches the course, OR is admin.
  IF NOT (
    public.is_admin(v_user_id)
    OR (
      v_recording_owner = v_user_id
      AND public.is_teacher_of_course(v_user_id, p_course_id)
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Count the recording's publishable DRAFT questions -------------------------
  SELECT count(*) INTO v_question_count
    FROM public.authored_questions aq
   WHERE aq.recording_id = p_recording_id
     AND aq.status = 'draft'
     AND aq.assignment_id IS NULL;
  IF v_question_count = 0 THEN
    RAISE EXCEPTION 'no_questions' USING ERRCODE = '02000';
  END IF;

  -- Create the assignment row (kind='authored_set': no source_id, no
  -- qbank_set_uid). Mirrors the column shape used in the modules inline-add
  -- submit-handlers for the other two kinds.
  INSERT INTO public.assignments (
    course_id, created_by, title, kind,
    source_id, qbank_set_uid, question_count,
    source_recording_id, opens_at, archived
  ) VALUES (
    p_course_id, v_user_id, p_title, 'authored_set',
    NULL, NULL, v_question_count,
    p_recording_id, now(), false
  )
  RETURNING id INTO v_assignment_id;

  -- Snapshot: copy each draft into a NEW published row carrying assignment_id.
  -- The draft rows are left intact (status='draft', assignment_id NULL) so the
  -- educator can keep editing / re-publish a fresh version later.
  INSERT INTO public.authored_questions (
    recording_id, owner_id, course_id, assignment_id,
    position, style, stem, choices, correct_answer, rationale, status
  )
  SELECT
    aq.recording_id, aq.owner_id, p_course_id, v_assignment_id,
    aq.position, aq.style, aq.stem, aq.choices, aq.correct_answer,
    aq.rationale, 'published'
  FROM public.authored_questions aq
   WHERE aq.recording_id = p_recording_id
     AND aq.status = 'draft'
     AND aq.assignment_id IS NULL
   ORDER BY aq.position;

  -- Optional: link into a module (item_type='assignment'). Mirrors
  -- linkAssignmentToModule in the modules inline-add submit-handlers.
  IF p_module_id IS NOT NULL THEN
    SELECT COALESCE(max(mi.position) + 1, 0) INTO v_next_position
      FROM public.module_items mi
     WHERE mi.module_id = p_module_id;
    INSERT INTO public.module_items (
      module_id, position, item_type, item_ref_id, title, url
    ) VALUES (
      p_module_id, v_next_position, 'assignment', v_assignment_id, p_title, NULL
    );
  END IF;

  RETURN v_assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_authored_quiz(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.publish_authored_quiz(uuid, uuid, text, uuid) IS
  'Publishes a recording''s AI-drafted DRAFT questions into a new kind=authored_set assignment scoped to p_course_id, snapshotting each draft as a PUBLISHED copy carrying the new assignment_id, and optionally linking it into p_module_id. Auth: caller owns the recording AND teaches the course, OR is admin. Stable error codes: not_authenticated, not_authorized, no_questions, not_found.';

-- =============================================================================
