-- =============================================================================
-- 0092: Fix infinite recursion in the "profiles: own row update" RLS policy
-- =============================================================================
-- SYMPTOM (reported 2026-06-03): renaming a student from the teacher roster —
-- and any self-rename from Account settings — failed with:
--     "infinite recursion detected in policy for relation \"profiles\""
--
-- ROOT CAUSE: the "profiles: own row update" policy, defined in 0001_init.sql
-- and never re-created since, inlined a SELECT against profiles in its
-- WITH CHECK to pin the role (anti self-elevation):
--
--     WITH CHECK (
--       id   = (SELECT auth.uid())
--       AND role = (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))
--     )
--
-- A profiles policy that itself queries profiles re-enters profiles RLS while
-- profiles RLS is already on the evaluation stack → Postgres aborts with the
-- recursion error. This is the exact forbidden pattern called out in CLAUDE.md
-- and previously fixed for the `classes` table in 0008 and 0013. It stayed
-- latent because every privileged profile write historically went through a
-- SECURITY DEFINER RPC; it only surfaced when the roster (ClassRoster.tsx) and
-- Account settings (auth/session.ts) started doing direct client `.update()`s.
-- The teacher→student rename trips it too: the staff UPDATE policy lets the row
-- pass USING, but Postgres still plans every OR'd permissive WITH CHECK,
-- including this self-referencing one, so the whole UPDATE plan fails.
--
-- FIX: pull the role lookup into a SECURITY DEFINER helper (bypasses RLS, no
-- recursion) and rewrite the policy to call it. Semantics are preserved: a user
-- editing their own row still cannot change their own role.
--
-- Forward-only. No data change. Idempotent.
-- =============================================================================

-- ---- Helper: caller's current role, fetched without re-entering profiles RLS.
CREATE OR REPLACE FUNCTION public.profile_role(uid uuid)
  RETURNS public.user_role
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

REVOKE ALL ON FUNCTION public.profile_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_role(uuid) TO authenticated;

-- ---- Rewrite the recursive policy.
DROP POLICY IF EXISTS "profiles: own row update" ON public.profiles;
CREATE POLICY "profiles: own row update"
  ON public.profiles
  FOR UPDATE
  USING (
    id = (SELECT auth.uid())
  )
  WITH CHECK (
    -- Same intent as 0001 (no self-elevation of role) but the role lookup now
    -- runs through a SECURITY DEFINER helper, so it does NOT re-enter profiles
    -- RLS. A user may edit their own profile but the post-update role must
    -- still equal their stored role.
    id   = (SELECT auth.uid())
    AND role = public.profile_role((SELECT auth.uid()))
  );
