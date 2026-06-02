-- =============================================================================
-- Migration: 0013_refix_courses_insert_recursion.sql
-- Description: Re-fix the INSERT-policy recursion regression introduced by
--   0012's broad rename pass. Migration 0008 had already replaced the
--   inline `EXISTS (SELECT 1 FROM profiles ...)` form with a SECURITY DEFINER
--   helper call (`public.is_teacher`), but when 0012 dropped and recreated
--   every classes/courses policy in one go, it copied the OLDER inline body
--   back in, undoing 0008. This re-applies the helper-based body on the
--   renamed `courses` table.
--
-- Symptoms before this fix:
--   POST /rest/v1/courses → 500
--   { "code": "42P17", "message": "infinite recursion detected in policy
--     for relation \"courses\"" }
--
-- Why the recursion: profiles RLS has a "teacher sees enrolled students"
-- policy that joins classes/courses + class_memberships/course_memberships,
-- so resolving an INSERT to courses by evaluating profiles RLS recursively
-- re-enters the courses policy.
--
-- Caught by viewer/scripts/smoke-e2e.mjs step 4 right after 0012 landed.
-- =============================================================================

DROP POLICY IF EXISTS "courses: teacher or admin creates" ON public.courses;
CREATE POLICY "courses: teacher or admin creates"
  ON public.courses
  FOR INSERT
  WITH CHECK (
    -- Why: teachers may create courses for themselves; admins may create for
    -- anyone. Uses SECURITY DEFINER helpers to avoid RLS recursion through
    -- profiles → course_memberships → courses (see 0008 for the original fix).
    (
      public.is_teacher((SELECT auth.uid()))
      AND teacher_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );
