-- =============================================================================
-- Migration: 0062_teacher_student_notes.sql
-- Purpose:   Teacher-private per-student notes. Maya/Daniel need a place to
--            jot down observations about a student that are NEVER visible to
--            the student. Today they have nowhere to track things like
--              "Maria needs a gentler approach during conferences"
--              "Jordan does well on word problems, struggles with abstract
--               symbols"
--            so they sprinkle these into Google docs and lose them. This adds
--            a first-class home for them, scoped per (teacher, student, course).
--
-- Summary:
--   1. New table public.teacher_student_notes with FKs to profiles.id (twice —
--      teacher and student) and courses.id, plus a unique index on
--      (teacher_id, student_id, course_id) so the UI can do a clean upsert
--      and never accidentally fan out duplicates.
--
--   2. RLS — four policies, all carrying the project's "(SELECT auth.uid())"
--      pattern so the planner can hoist the auth call out of the per-row scan:
--        a. SELECT:  teacher_id = uid OR is_admin(uid)
--                    (admins can audit; nobody else — not even other teachers
--                     of the same course — can read another teacher's notes.)
--        b. INSERT:  teacher_id = uid AND is_teacher_of_course(uid, course_id)
--                    (you can only file a note as yourself, and only on a
--                     course you actually teach.)
--        c. UPDATE:  teacher_id = uid                       (author edits only)
--        d. DELETE:  teacher_id = uid OR is_admin(uid)      (author or admin)
--
--   3. updated_at trigger using the existing public.set_updated_at() helper.
--
--   4. AFTER UPDATE OR DELETE audit trigger that writes to audit_events with
--      action = 'teacher_note_change', target_kind = 'teacher_student_note'.
--      The note body is INTENTIONALLY NOT included in details — these notes
--      are private and the audit trail should track WHO touched WHAT and
--      WHEN, not surface the contents to admin/forensic readers. We only
--      include the (teacher_id, student_id, course_id) keys so a forensic
--      reviewer can correlate the event to a (course, student) pair without
--      reading the teacher's private observations.
--
-- Design notes:
--   • Why private to the authoring teacher (vs. visible to all teachers of
--     the course)? A TA's note for one student shouldn't be visible to the
--     head teacher unless they make it explicit later. We can always loosen
--     later; tightening after the fact is harder. If a future surface needs
--     "shared coaching notes", that should be a separate table with its own
--     RLS rather than overloading this one.
--   • Why teacher-private (vs. feedback_text from 0056 which is student-visible)?
--     feedback_text is one teacher writing TO one student about ONE attempt.
--     teacher_student_notes is one teacher writing FOR THEMSELVES about ONE
--     student in ONE course — never shown to the student. Different audience,
--     different visibility, different table.
--   • Why unique per (teacher, student, course) and not just (teacher, student)?
--     Two reasons: (1) the same teacher may teach the same student in
--     multiple courses (SAT prep + ACT prep) and notes are course-scoped
--     observations, not global. (2) the UI lives on the per-course
--     StudentProfilePage — a single editor per surface — so a per-course
--     row is the natural shape and lets us do an upsert that never collides.
--
-- Idempotent: every DDL guarded by IF NOT EXISTS / DROP TRIGGER IF EXISTS.
-- Forward-only — no rollback. Re-runnable on a clean database.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECTION 1: TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teacher_student_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES public.courses(id)  ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One note per (teacher, student, course) — see header comment for why.
CREATE UNIQUE INDEX IF NOT EXISTS teacher_student_notes_unique_idx
  ON public.teacher_student_notes (teacher_id, student_id, course_id);

-- Secondary index for the common SELECT pattern (teacher viewing a roster
-- in one course): WHERE teacher_id = $1 AND course_id = $2.
CREATE INDEX IF NOT EXISTS teacher_student_notes_teacher_course_idx
  ON public.teacher_student_notes (teacher_id, course_id);


-- -----------------------------------------------------------------------------
-- SECTION 2: RLS POLICIES
-- -----------------------------------------------------------------------------

ALTER TABLE public.teacher_student_notes ENABLE ROW LEVEL SECURITY;

-- (a) SELECT — authoring teacher or admin only. NOT other teachers of the
--     course, and NEVER the student themselves.
DROP POLICY IF EXISTS "teacher_student_notes: read own or admin"
  ON public.teacher_student_notes;
CREATE POLICY "teacher_student_notes: read own or admin"
  ON public.teacher_student_notes
  FOR SELECT
  USING (
    teacher_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

-- (b) INSERT — must file as yourself AND must actually teach the course.
--     We deliberately do NOT allow admins to insert on behalf of teachers
--     here; admins audit, they don't author private notes.
DROP POLICY IF EXISTS "teacher_student_notes: insert own as teacher"
  ON public.teacher_student_notes;
CREATE POLICY "teacher_student_notes: insert own as teacher"
  ON public.teacher_student_notes
  FOR INSERT
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    AND public.is_teacher_of_course((SELECT auth.uid()), course_id)
  );

-- (c) UPDATE — author only. teacher_id may not be changed (USING + WITH CHECK
--     both require teacher_id = uid, so a row hand-off is rejected).
DROP POLICY IF EXISTS "teacher_student_notes: update own"
  ON public.teacher_student_notes;
CREATE POLICY "teacher_student_notes: update own"
  ON public.teacher_student_notes
  FOR UPDATE
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));

-- (d) DELETE — author or admin (admins occasionally need to clear notes when
--     a teacher leaves the org or asks for cleanup).
DROP POLICY IF EXISTS "teacher_student_notes: delete own or admin"
  ON public.teacher_student_notes;
CREATE POLICY "teacher_student_notes: delete own or admin"
  ON public.teacher_student_notes
  FOR DELETE
  USING (
    teacher_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );


-- -----------------------------------------------------------------------------
-- SECTION 3: updated_at TRIGGER
-- Reuses the project-standard public.set_updated_at() helper from 0001.
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_teacher_student_notes_set_updated_at
  ON public.teacher_student_notes;
CREATE TRIGGER trg_teacher_student_notes_set_updated_at
  BEFORE UPDATE ON public.teacher_student_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------------------
-- SECTION 4: AUDIT TRIGGER (UPDATE + DELETE)
--
-- Why SECURITY DEFINER + SET search_path = public, auth: the audit row writes
-- through to public.audit_events whose INSERT is gated; SECURITY DEFINER
-- escalates to the function owner so the audit insert always succeeds even
-- when the calling teacher has no direct INSERT on audit_events. The
-- search_path lockdown follows project convention (see 0050 §M32) — without
-- it a future revision of this function that unqualifies an auth.* call
-- could silently break.
--
-- Why no INSERT audit: we already have "INSERT means this teacher started
-- keeping notes about this student" implicit in the row's existence. The
-- audit trail is for change history (who edited what, when) and deletions
-- (who removed the record). If you want creation audit, switch INSERT into
-- the trigger event list — the trigger function is shaped to handle it.
--
-- Body is NEVER included in details — see header comment.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_teacher_student_note_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_row public.teacher_student_notes;
  v_op  text;
BEGIN
  -- Pick whichever row is alive — NEW for UPDATE, OLD for DELETE.
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    v_op  := 'delete';
  ELSE
    v_row := NEW;
    v_op  := 'update';
  END IF;

  INSERT INTO public.audit_events
    (actor_id, action, target_kind, target_id, details)
  VALUES (
    auth.uid(),
    'teacher_note_change',
    'teacher_student_note',
    v_row.id::text,
    jsonb_build_object(
      'op',         v_op,
      'teacher_id', v_row.teacher_id,
      'student_id', v_row.student_id,
      'course_id',  v_row.course_id
      -- DELIBERATELY no 'body' / 'old_body' / 'new_body' field. The contents
      -- of the note are private to the authoring teacher even from admins
      -- reading the audit trail.
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_teacher_student_note_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_audit_teacher_student_note_change
  ON public.teacher_student_notes;
CREATE TRIGGER trg_audit_teacher_student_note_change
  AFTER UPDATE OR DELETE ON public.teacher_student_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_teacher_student_note_change();


-- -----------------------------------------------------------------------------
-- SECTION 5: GRANTS
-- Authenticated users get baseline DML; RLS handles the actual gating.
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_student_notes TO authenticated;
