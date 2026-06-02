-- =============================================================================
-- Migration: 0008_fix_classes_insert_recursion.sql
-- Description: Fix RLS infinite-recursion bug discovered by smoke test on
--   2026-05-29. The `classes: teacher or admin creates` INSERT policy from
--   0001 used an inline `EXISTS (SELECT 1 FROM profiles WHERE …)`, which
--   triggered profile-RLS evaluation, which in turn referenced classes via
--   the `profiles: teacher sees enrolled students` policy — Postgres
--   detected the cycle and aborted every INSERT with code 42P17.
--
--   Fix: introduce a `SECURITY DEFINER` helper `is_teacher(uid)` that reads
--   the profile bypassing RLS (same pattern as `is_admin`), and rewrite the
--   INSERT policy to use it.
--
--   This unblocks the basic teacher workflow (creating a class). It does NOT
--   yet collapse the teacher/admin distinction — that is migration 0009.
-- =============================================================================


-- =============================================================================
-- SECTION 1: HELPER — is_teacher
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_teacher(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = uid
      AND role = 'teacher'
  );
$$;

REVOKE ALL ON FUNCTION public.is_teacher(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher(uuid) TO authenticated, anon;


-- =============================================================================
-- SECTION 2: REWRITE classes INSERT POLICY (the recursion fix)
-- =============================================================================

DROP POLICY IF EXISTS "classes: teacher or admin creates" ON public.classes;
CREATE POLICY "classes: teacher or admin creates"
  ON public.classes
  FOR INSERT
  WITH CHECK (
    -- Why: teachers may create classes for themselves; admins may create for
    -- anyone. Uses SECURITY DEFINER helpers to avoid RLS recursion through
    -- profiles → class_memberships → classes.
    (
      public.is_teacher((SELECT auth.uid()))
      AND teacher_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );
