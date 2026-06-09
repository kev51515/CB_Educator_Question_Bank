-- =============================================================================
-- Migration: 0132_fix_courses_select_returning.sql
-- Description: Fix a regression from 0130 that broke teacher course CREATION.
--
-- BUG: 0130 rewrote the courses SELECT policy "courses: teacher sees own or
-- shared" to USING ( public.is_teacher_of_course(auth.uid(), id) ). That helper
-- is STABLE and re-queries public.courses for the given id. PostgreSQL applies
-- the SELECT policy to the row produced by INSERT ... RETURNING, and the app
-- creates a course via PostgREST `.insert().select()` (= INSERT ... RETURNING).
-- Inside that same statement the brand-new row is NOT yet visible to the STABLE
-- function's snapshot, so is_teacher_of_course returns false and the insert is
-- rejected with 42501 "new row violates row-level security policy". A plain
-- INSERT (no RETURNING) succeeded, which is why the policy looked correct in
-- isolation. The pre-0130 policy compared the row's own column
-- (teacher_id = auth.uid()) and therefore worked for RETURNING.
--
-- FIX: restore the direct column comparison for the OWNER case and keep the
-- helper only for the SHARED case. `A OR B` is true whenever A is true
-- regardless of B, so an owner's just-inserted row passes via teacher_id even
-- though is_teacher_of_course can't see it mid-statement. Shared recipients
-- (teacher_id <> them) still match via the helper on already-committed rows.
--
-- LESSON: an RLS SELECT policy that must support INSERT ... RETURNING (every
-- PostgREST `.insert().select()`) has to include a direct comparison against
-- the new row's own columns — a function that re-queries the same table can't
-- see the in-flight row.
--
-- Forward-only.
-- =============================================================================

DROP POLICY IF EXISTS "courses: teacher sees own or shared" ON public.courses;
CREATE POLICY "courses: teacher sees own or shared"
  ON public.courses
  FOR SELECT
  USING (
    -- Owner: direct column compare — works for INSERT ... RETURNING (the new
    -- row's teacher_id is the caller) without re-querying the table.
    teacher_id = (SELECT auth.uid())
    -- Shared: re-query via the helper (safe here: shared rows already exist).
    OR public.is_teacher_of_course((SELECT auth.uid()), id)
  );

-- =============================================================================
-- END OF MIGRATION 0132_fix_courses_select_returning.sql
-- =============================================================================
