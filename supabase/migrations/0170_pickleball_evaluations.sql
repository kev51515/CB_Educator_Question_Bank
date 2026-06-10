-- =============================================================================
-- Migration: 0169_pickleball_evaluations.sql
-- Description: Coach evaluations for the 'pickleball_coach' course type.
--
-- The academy owner (educator of the course) records periodic rubric
-- evaluations of a coach-in-development across four competency dimensions —
-- instruction, communication, safety, retention — each a 1..5 score (any may
-- be left NULL), plus optional written notes the coach can read on their own
-- card. The coach reads their OWN evaluations (read-only).
--
-- One table + one RPC:
--   pickleball_coach_evaluations — one row per recorded evaluation.
--   pk_add_evaluation(...)       — educator records one; notifies the coach.
--
-- RLS mirrors the coach-track tables (0162/0163):
--   * Educator of the course (owner / co-teacher / admin) — full read+write.
--   * The coach (coach_id = auth.uid()) reads their OWN rows.
--
-- All person FK columns point at profiles(id). This migration shares no
-- objects with Lane A's 0168 and is safe to author in parallel.
--
-- RPC raises stable string error codes the client switches on:
--   not_authenticated / not_authorized / invalid_input.
-- The cross-recipient notification fan-out happens inside the SECURITY DEFINER
-- RPC (RLS on notifications restricts a plain client to recipient_id=auth.uid()).
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pickleball_coach_evaluations — rubric evaluations recorded per coach.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickleball_coach_evaluations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  coach_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluator_id  uuid NOT NULL REFERENCES public.profiles(id),
  instruction   int,
  communication int,
  safety        int,
  retention     int,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_eval_instruction_range
    CHECK (instruction   IS NULL OR instruction   BETWEEN 1 AND 5),
  CONSTRAINT pk_eval_communication_range
    CHECK (communication IS NULL OR communication BETWEEN 1 AND 5),
  CONSTRAINT pk_eval_safety_range
    CHECK (safety        IS NULL OR safety        BETWEEN 1 AND 5),
  CONSTRAINT pk_eval_retention_range
    CHECK (retention     IS NULL OR retention     BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS pickleball_coach_evaluations_course_coach_idx
  ON public.pickleball_coach_evaluations (course_id, coach_id, created_at);
ALTER TABLE public.pickleball_coach_evaluations ENABLE ROW LEVEL SECURITY;

-- Educator of the course (owner / co-teacher / admin) — full read+write.
DROP POLICY IF EXISTS "pk_evaluations: educator manages" ON public.pickleball_coach_evaluations;
CREATE POLICY "pk_evaluations: educator manages" ON public.pickleball_coach_evaluations
  FOR ALL
  USING (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_teacher_of_course((SELECT auth.uid()), course_id) OR public.is_admin((SELECT auth.uid())));

-- The coach reads their OWN evaluations.
DROP POLICY IF EXISTS "pk_evaluations: coach reads own" ON public.pickleball_coach_evaluations;
CREATE POLICY "pk_evaluations: coach reads own" ON public.pickleball_coach_evaluations
  FOR SELECT
  USING (coach_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. pk_add_evaluation — educator records a rubric evaluation for a coach and
--    notifies the coach. Returns the new row. At least one dimension must be
--    scored (else invalid_input). Each supplied score must be 1..5.
--    Stable error codes: not_authenticated / not_authorized / invalid_input.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pk_add_evaluation(
  p_course_id     uuid,
  p_coach_id      uuid,
  p_instruction   int  DEFAULT NULL,
  p_communication int  DEFAULT NULL,
  p_safety        int  DEFAULT NULL,
  p_retention     int  DEFAULT NULL,
  p_notes         text DEFAULT NULL
)
  RETURNS public.pickleball_coach_evaluations
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.pickleball_coach_evaluations;
  v_link   text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_course_id IS NULL OR p_coach_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_teacher_of_course(v_caller, p_course_id) OR public.is_admin(v_caller)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Each supplied score must be within 1..5.
  IF (p_instruction   IS NOT NULL AND p_instruction   NOT BETWEEN 1 AND 5)
    OR (p_communication IS NOT NULL AND p_communication NOT BETWEEN 1 AND 5)
    OR (p_safety        IS NOT NULL AND p_safety        NOT BETWEEN 1 AND 5)
    OR (p_retention     IS NOT NULL AND p_retention     NOT BETWEEN 1 AND 5)
  THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- At least one dimension OR notes must be present.
  IF p_instruction IS NULL
    AND p_communication IS NULL
    AND p_safety IS NULL
    AND p_retention IS NULL
    AND (p_notes IS NULL OR btrim(p_notes) = '')
  THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pickleball_coach_evaluations
    (course_id, coach_id, evaluator_id, instruction, communication, safety, retention, notes)
  VALUES
    (p_course_id, p_coach_id, v_caller, p_instruction, p_communication, p_safety, p_retention,
     CASE WHEN p_notes IS NULL OR btrim(p_notes) = '' THEN NULL ELSE p_notes END)
  RETURNING * INTO v_row;

  -- Notify the coach (cross-recipient insert; allowed because we are DEFINER).
  v_link := '/student/courses/' || p_course_id::text;
  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  VALUES (
    p_coach_id,
    'pickleball_evaluation',
    'New coaching evaluation',
    'Your academy owner shared a new evaluation of your coaching.',
    v_link
  );

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_add_evaluation(uuid, uuid, int, int, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_add_evaluation(uuid, uuid, int, int, int, int, text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0169_pickleball_evaluations.sql
-- =============================================================================
