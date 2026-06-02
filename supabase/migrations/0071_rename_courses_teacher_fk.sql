-- =============================================================================
-- Migration: 0071_rename_courses_teacher_fk.sql
-- Description: Rename the courses.teacher_id FK constraint to match the
--              post-rename naming (classes_* → courses_*).
--
-- The bug: migration 0012 renamed the `classes` table to `courses` and renamed
-- its index + the course_memberships/assignments FK constraints — but it
-- MISSED the teacher_id FK, which is still named `classes_teacher_id_fkey`.
-- A table rename does NOT rename a constraint. So PostgREST embeds that use the
-- canonical hint `profiles!courses_teacher_id_fkey` fail with:
--   "Could not find a relationship between 'courses' and 'profiles'".
-- This broke the student "My courses" panel and the per-course student view
-- (useStudentClasses / StudentCourseView), which a student saw as a red error.
--
-- Fix: rename the constraint to courses_teacher_id_fkey. The one staff caller
-- still using the old hint (AllClassesView) is updated to the new name in the
-- same patch, so every embed now resolves.
--
-- Guarded so it's safe if the constraint was already renamed by another path.
-- Forward-only.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'classes_teacher_id_fkey'
       AND conrelid = 'public.courses'::regclass
  ) THEN
    ALTER TABLE public.courses
      RENAME CONSTRAINT classes_teacher_id_fkey TO courses_teacher_id_fkey;
  END IF;
END $$;

-- Nudge PostgREST to refresh its schema cache so the new relationship name is
-- resolvable immediately.
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- END OF MIGRATION 0071_rename_courses_teacher_fk.sql
-- =============================================================================
