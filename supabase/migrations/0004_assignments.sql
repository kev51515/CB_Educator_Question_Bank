-- =============================================================================
-- Migration: 0004_assignments.sql
-- Description: Assignments + assignment_attempts tables for the core LMS loop.
--              Teachers create assignments scoped to a class; students attempt
--              them; teachers see results.
-- Platform: Supabase (PostgreSQL 15+)
-- Note: Supabase wraps each migration in a transaction automatically.
--
-- Design trade-off (MVP):
--   We intentionally do NOT persist the exact question pool a student saw.
--   The mock-test runner generates a pool client-side from source_id +
--   question_count + difficulty_mix at start time. This means a teacher
--   reviewing a submission later cannot reconstruct the exact items the
--   student answered (only the answers map + aggregate breakdowns are saved
--   in assignment_attempts.result_detail / .answers). When we need
--   reproducible reviews (e.g., for academic integrity or item-level
--   analytics) we'll add a server-side question selection RPC and an
--   `assignment_questions` snapshot table. For now this is fine — the
--   product loop ships, and the answers + per-domain/per-skill breakdowns
--   carry enough signal for formative feedback.
-- =============================================================================


-- =============================================================================
-- SECTION 1: ASSIGNMENTS TABLE
-- One row per assignment a teacher publishes to a class.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.assignments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            uuid        NOT NULL REFERENCES public.classes(id)  ON DELETE CASCADE,
  created_by          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title               text        NOT NULL,
  description         text,
  -- Mirrors mocktest TestSourceId. CHECK keeps invalid values out at the DB
  -- layer; the app layer also validates, but defence in depth.
  source_id           text        NOT NULL
                                  CHECK (source_id IN ('cb', 'sat', 'mixed')),
  question_count      integer     NOT NULL
                                  CHECK (question_count > 0 AND question_count <= 100),
  -- 0 means "untimed". Stored as minutes rather than seconds so teacher input
  -- doesn't have to round-trip through a unit conversion.
  time_limit_minutes  integer     NOT NULL DEFAULT 0
                                  CHECK (time_limit_minutes >= 0),
  difficulty_mix      text        NOT NULL DEFAULT 'any'
                                  CHECK (difficulty_mix IN ('easy', 'medium', 'hard', 'any')),
  -- Nullable: a teacher may publish an assignment with no due date (e.g.,
  -- ongoing practice).
  due_at              timestamptz,
  opens_at            timestamptz NOT NULL DEFAULT now(),
  archived            boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Why: the student list query filters by class_id + archived and orders /
-- filters by due_at. A composite index keeps that path index-only.
CREATE INDEX IF NOT EXISTS idx_assignments_class_archived_due
  ON public.assignments(class_id, archived, due_at);

CREATE OR REPLACE TRIGGER trg_assignments_set_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 2: ASSIGNMENT_ATTEMPTS TABLE
-- One row per (assignment, student). Insert-on-start, update-on-submit.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.assignment_attempts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid        NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  -- Nullable until the student submits. Submitting flips this and freezes
  -- the answers / score columns.
  submitted_at    timestamptz,
  score_percent   numeric(5,2),
  correct_count   integer,
  total_questions integer,
  duration_seconds integer,
  -- Full TestResult payload (byDomain, bySkill, byDifficulty, etc.) for
  -- later review. Stored as jsonb so we don't have to invent a schema.
  result_detail   jsonb,
  -- Per-question answers as { qid: 'A'|'B'|'C'|'D'|null }. Sufficient for
  -- the teacher to display a per-student answer recap alongside the
  -- aggregate breakdowns even though the exact pool isn't snapshotted.
  answers         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- One attempt per student per assignment for the MVP. When we add
  -- multi-attempt support we'll either drop this constraint or rename it
  -- with an attempt_number column.
  UNIQUE (assignment_id, student_id)
);

-- Why: the student-side "my attempts across all assignments" list orders by
-- submitted_at DESC. NULLS LAST is the default for DESC, matching our
-- "in-progress at the bottom" ordering.
CREATE INDEX IF NOT EXISTS idx_assignment_attempts_student_submitted
  ON public.assignment_attempts(student_id, submitted_at DESC);

-- Why: the teacher attempts view filters by assignment_id and orders by
-- submitted_at DESC.
CREATE INDEX IF NOT EXISTS idx_assignment_attempts_assignment_submitted
  ON public.assignment_attempts(assignment_id, submitted_at DESC);

CREATE OR REPLACE TRIGGER trg_assignment_attempts_set_updated_at
  BEFORE UPDATE ON public.assignment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.assignment_attempts ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 3: RLS POLICIES — ASSIGNMENTS
-- =============================================================================

-- ---- SELECT ----

DROP POLICY IF EXISTS "assignments: teacher of class reads" ON public.assignments;
CREATE POLICY "assignments: teacher of class reads"
  ON public.assignments
  FOR SELECT
  USING (
    -- Why: the owning teacher needs to manage assignments they created. We
    -- delegate the membership check to the existing helper so the policy
    -- stays one-liner-readable and inlines well.
    public.is_teacher_of_class((SELECT auth.uid()), class_id)
  );

DROP POLICY IF EXISTS "assignments: enrolled student reads" ON public.assignments;
CREATE POLICY "assignments: enrolled student reads"
  ON public.assignments
  FOR SELECT
  USING (
    -- Why: a student must see assignments for classes they belong to. We
    -- check class_memberships directly rather than via a helper because
    -- the (uid, class_id) pair varies per row evaluated; an EXISTS subquery
    -- is the natural shape.
    EXISTS (
      SELECT 1
      FROM public.class_memberships cm
      WHERE cm.class_id   = assignments.class_id
        AND cm.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "assignments: admin reads all" ON public.assignments;
CREATE POLICY "assignments: admin reads all"
  ON public.assignments
  FOR SELECT
  USING (
    -- Why: admins need global visibility for moderation / debugging.
    public.is_admin((SELECT auth.uid()))
  );

-- ---- INSERT ----

DROP POLICY IF EXISTS "assignments: teacher of class creates" ON public.assignments;
CREATE POLICY "assignments: teacher of class creates"
  ON public.assignments
  FOR INSERT
  WITH CHECK (
    -- Why: only the teacher who owns the target class may create an
    -- assignment for it, AND the created_by column must equal auth.uid()
    -- to prevent attributing assignments to a different user. Admins bypass
    -- the teacher check (e.g., school-wide setup) but still cannot
    -- impersonate another created_by.
    (
      public.is_teacher_of_class((SELECT auth.uid()), class_id)
      AND created_by = (SELECT auth.uid())
    )
    OR (
      public.is_admin((SELECT auth.uid()))
      AND created_by = (SELECT auth.uid())
    )
  );

-- ---- UPDATE ----

DROP POLICY IF EXISTS "assignments: teacher of class updates" ON public.assignments;
CREATE POLICY "assignments: teacher of class updates"
  ON public.assignments
  FOR UPDATE
  USING (
    -- Why: only the owning teacher (or admin) may edit. The class_id is the
    -- authority; we don't trust created_by alone in case a teacher's row
    -- got reassigned to another class.
    public.is_teacher_of_class((SELECT auth.uid()), class_id)
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    -- Mirror guard on the post-update row so a teacher cannot move the
    -- assignment to a class they don't own.
    public.is_teacher_of_class((SELECT auth.uid()), class_id)
    OR public.is_admin((SELECT auth.uid()))
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "assignments: teacher of class deletes" ON public.assignments;
CREATE POLICY "assignments: teacher of class deletes"
  ON public.assignments
  FOR DELETE
  USING (
    -- Why: hard-delete is reserved for the owning teacher or an admin.
    -- Students should never see this surface; the archived flag covers
    -- "hide without losing history" for everyone else.
    public.is_teacher_of_class((SELECT auth.uid()), class_id)
    OR public.is_admin((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 4: RLS POLICIES — ASSIGNMENT_ATTEMPTS
-- =============================================================================

-- ---- SELECT ----

DROP POLICY IF EXISTS "attempts: student reads own" ON public.assignment_attempts;
CREATE POLICY "attempts: student reads own"
  ON public.assignment_attempts
  FOR SELECT
  USING (
    -- Why: a student can always read their own attempts (for the "review"
    -- screen and to resume an in-progress attempt).
    student_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "attempts: teacher of class reads" ON public.assignment_attempts;
CREATE POLICY "attempts: teacher of class reads"
  ON public.assignment_attempts
  FOR SELECT
  USING (
    -- Why: the teacher who owns the parent assignment's class needs to see
    -- all attempts to grade / give feedback. We walk attempt → assignment
    -- → class and reuse is_teacher_of_class for the final check.
    EXISTS (
      SELECT 1
      FROM public.assignments a
      WHERE a.id = assignment_attempts.assignment_id
        AND public.is_teacher_of_class((SELECT auth.uid()), a.class_id)
    )
  );

DROP POLICY IF EXISTS "attempts: admin reads all" ON public.assignment_attempts;
CREATE POLICY "attempts: admin reads all"
  ON public.assignment_attempts
  FOR SELECT
  USING (
    public.is_admin((SELECT auth.uid()))
  );

-- ---- INSERT ----

DROP POLICY IF EXISTS "attempts: student starts own" ON public.assignment_attempts;
CREATE POLICY "attempts: student starts own"
  ON public.assignment_attempts
  FOR INSERT
  WITH CHECK (
    -- Why: a student may insert an attempt for themselves, ONLY if they are
    -- actually enrolled in the assignment's class. The subquery verifies
    -- the (student → assignment → class → membership) chain. Without this
    -- we'd allow any signed-in user to insert attempts for any assignment
    -- they happen to know the id of (RLS on assignments hides ids they
    -- can't read, but defence in depth is cheap).
    student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assignments a
      JOIN public.class_memberships cm ON cm.class_id = a.class_id
      WHERE a.id = assignment_attempts.assignment_id
        AND cm.student_id = (SELECT auth.uid())
    )
  );

-- ---- UPDATE ----

DROP POLICY IF EXISTS "attempts: student updates in-progress own" ON public.assignment_attempts;
CREATE POLICY "attempts: student updates in-progress own"
  ON public.assignment_attempts
  FOR UPDATE
  USING (
    -- Why: a student may edit their own attempt while it's still in
    -- progress (submitted_at IS NULL). Once they submit, the row is
    -- effectively immutable from their side. This prevents "fix my answer
    -- after I saw the score" tampering.
    student_id = (SELECT auth.uid())
    AND submitted_at IS NULL
  )
  WITH CHECK (
    -- Mirror on the post-update row: still their attempt, and either still
    -- in-progress OR being transitioned to submitted in this same update.
    -- We allow submitted_at to flip from NULL to a timestamp; once it's
    -- non-null the USING clause will block subsequent updates.
    student_id = (SELECT auth.uid())
  );

-- ---- DELETE ----

DROP POLICY IF EXISTS "attempts: teacher of class deletes" ON public.assignment_attempts;
CREATE POLICY "attempts: teacher of class deletes"
  ON public.assignment_attempts
  FOR DELETE
  USING (
    -- Why: teachers (and admins) may delete attempts for cleanup — e.g., a
    -- student got confused and started twice (once the multi-attempt model
    -- lands, the UNIQUE constraint enforces this single-attempt invariant).
    -- Students are NOT given delete because we treat submitted attempts as
    -- a grading record.
    EXISTS (
      SELECT 1
      FROM public.assignments a
      WHERE a.id = assignment_attempts.assignment_id
        AND public.is_teacher_of_class((SELECT auth.uid()), a.class_id)
    )
    OR public.is_admin((SELECT auth.uid()))
  );


-- =============================================================================
-- END OF MIGRATION 0004_assignments.sql
-- =============================================================================
