-- =============================================================================
-- Migration: 0056_grading_persistence.sql (renumbered from 0053 — collided with 0053_fix_m1q13_choice)
-- Purpose:   Ship the real grading-persistence path that Wave 20 Lane 4
--            deferred. Teacher feedback / score override / graded-at currently
--            live in browser localStorage (see TeacherAttemptDetailView header
--            note circa Wave 20A). This migration adds the columns + RLS +
--            audit trigger + a thin effective-score view, so the teacher
--            UI can drain those drafts into the database on next visit and
--            students will (in a follow-up surface change) finally see their
--            teacher's written feedback.
--
-- Summary:
--   1. ALTER assignment_attempts to add:
--        feedback_text   text                — teacher-authored markdown/HTML.
--        score_override  numeric(5,2)        — 0-100 manual override, nullable.
--        graded_at       timestamptz         — when the teacher marked done.
--        grader_id       uuid → profiles(id) — who graded (ON DELETE SET NULL).
--      All idempotent ADD COLUMN IF NOT EXISTS.
--
--   2. New UPDATE RLS policy "attempts: teacher of class grades". Mirrors the
--      existing teacher-read EXISTS-join pattern from 0004 (lines 234-249).
--      USING and WITH CHECK both go through assignments.course_id +
--      is_teacher_of_class(uid, course_id), plus an OR is_admin(uid) fallback.
--      [QA fix: originally referenced a.class_id, which migration 0012 renamed
--       to course_id on public.assignments — corrected to a.course_id; and is_teacher_of_class → is_teacher_of_course (also renamed in 0012).]
--
--      Important caveat: PostgreSQL RLS cannot restrict UPDATE at the column
--      level — this policy allows a satisfying teacher/admin to UPDATE ANY
--      column on the row (including answers/score_percent/result_detail). The
--      mid-attempt UPDATE path for the OWNING STUDENT continues to use the
--      pre-existing "attempts: student updates in-progress own" policy from
--      0004 (still in force for the in_progress branch). No privilege
--      escalation: only teacher-of-class or admins satisfy this predicate,
--      and they already have read access to all of these columns. If we
--      later want column-level restriction we can move grading writes
--      through a SECURITY DEFINER RPC that checks the same predicate and
--      whitelists the four columns.
--
--   3. AFTER UPDATE trigger trg_audit_assignment_grade fires when any of the
--      four grading columns change, inserting into audit_events with
--      action='assignment_grade', target_kind='assignment_attempt',
--      target_id=<attempt_id>, details=jsonb of which fields changed +
--      the new score_override / graded_at / grader_id. SECURITY DEFINER +
--      SET search_path so the INSERT survives the audit_events RLS (admin
--      reads only — INSERT is unrestricted by policy since no INSERT
--      policy exists, mirroring the pattern from 0027 audit triggers
--      and the 0050 M32 search_path fix).
--
--   4. View assignment_attempts_effective: SELECT *, COALESCE(score_override,
--      score_percent) AS effective_score. Lets gradebook + score-hero
--      surfaces read one column for "the score the student should see".
--      FOLLOW-UP (not in this migration's scope): migrate the gradebook RPC
--      and the student-facing ScoreHero to read from this view so a teacher's
--      override actually surfaces. This migration only ships the column —
--      callers must opt in.
--
-- Forward-only. Idempotent re-runs OK.
-- =============================================================================


-- 1) Columns ------------------------------------------------------------------
ALTER TABLE public.assignment_attempts
  ADD COLUMN IF NOT EXISTS feedback_text  text,
  ADD COLUMN IF NOT EXISTS score_override numeric(5,2),
  ADD COLUMN IF NOT EXISTS graded_at      timestamptz,
  ADD COLUMN IF NOT EXISTS grader_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Re-affirm the score_override range. ADD COLUMN above can't accept an inline
-- CHECK across IF NOT EXISTS branches cleanly, so we ADD CONSTRAINT separately
-- and guard with a NOT EXISTS lookup to keep idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'assignment_attempts_score_override_check'
       AND conrelid = 'public.assignment_attempts'::regclass
  ) THEN
    ALTER TABLE public.assignment_attempts
      ADD CONSTRAINT assignment_attempts_score_override_check
      CHECK (score_override IS NULL OR (score_override >= 0 AND score_override <= 100));
  END IF;
END$$;


-- 2) UPDATE RLS for teachers/admins ------------------------------------------
DROP POLICY IF EXISTS "attempts: teacher of class grades" ON public.assignment_attempts;
CREATE POLICY "attempts: teacher of class grades"
  ON public.assignment_attempts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
       WHERE a.id = assignment_attempts.assignment_id
         AND public.is_teacher_of_course((SELECT auth.uid()), a.course_id)
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
       WHERE a.id = assignment_attempts.assignment_id
         AND public.is_teacher_of_course((SELECT auth.uid()), a.course_id)
    )
    OR public.is_admin((SELECT auth.uid()))
  );


-- 3) Audit trigger ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_assignment_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF (NEW.feedback_text   IS DISTINCT FROM OLD.feedback_text)
     OR (NEW.score_override IS DISTINCT FROM OLD.score_override)
     OR (NEW.graded_at      IS DISTINCT FROM OLD.graded_at)
     OR (NEW.grader_id      IS DISTINCT FROM OLD.grader_id) THEN
    INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
    VALUES (
      auth.uid(),
      'assignment_grade',
      'assignment_attempt',
      NEW.id::text,
      jsonb_build_object(
        'feedback_changed', NEW.feedback_text IS DISTINCT FROM OLD.feedback_text,
        'score_override',   NEW.score_override,
        'graded_at',        NEW.graded_at,
        'grader_id',        NEW.grader_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_assignment_grade ON public.assignment_attempts;
CREATE TRIGGER trg_audit_assignment_grade
  AFTER UPDATE ON public.assignment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_assignment_grade();


-- 4) Effective-score view -----------------------------------------------------
-- Surfaces should COALESCE override → auto. This is the canonical place.
-- NOTE: gradebook + ScoreHero do NOT yet read from this view; switching them
-- over is a follow-up (cross-surface change, parallel work in flight).
CREATE OR REPLACE VIEW public.assignment_attempts_effective AS
SELECT
  a.*,
  COALESCE(a.score_override, a.score_percent) AS effective_score
FROM public.assignment_attempts a;

GRANT SELECT ON public.assignment_attempts_effective TO authenticated;
