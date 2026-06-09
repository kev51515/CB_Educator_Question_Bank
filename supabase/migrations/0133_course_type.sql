-- =============================================================================
-- Migration: 0133_course_type.sql
-- Description: Distinguish a normal teaching Class from a Counseling course.
--
-- A course now has a `course_type`:
--   'class'      — the default SAT-prep teaching course (Modules, Assignments,
--                  Grades, Skills, etc.).
--   'counseling' — a college/career counseling course that unlocks counseling-
--                  specific surfaces (Portfolio today; college lists,
--                  applications, essays, counselor tasks, etc. as they're built
--                  — see docs / the MaiaLearning feature reference for the
--                  roadmap).
--
-- The split is purely additive: existing courses backfill to 'class', and the
-- column drives which tabs/features the UI shows per course. No RLS change —
-- visibility is unchanged; this only categorises the course.
--
-- Forward-only.
-- =============================================================================

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS course_type text NOT NULL DEFAULT 'class';

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_course_type_check;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_course_type_check
  CHECK (course_type IN ('class', 'counseling'));

CREATE INDEX IF NOT EXISTS courses_course_type_idx
  ON public.courses (course_type);

-- =============================================================================
-- END OF MIGRATION 0133_course_type.sql
-- =============================================================================
