-- =============================================================================
-- Migration: 0171_domain_layer.sql
-- Description: Domain layer for the multi-vertical LMS. A "domain" is the
-- product-vertical lens the signed-in user is currently working in:
--
--   'academic'   — classic SAT-prep teaching (course_type 'class')
--   'counseling' — college/career counseling (course_type 'counseling')
--   'coaching'   — pickleball coaching (course_type 'pickleball_player'
--                  / 'pickleball_coach')
--
-- The domain drives front-end vocabulary (Teacher/Counselor/Coach) and accent
-- theming. It is a per-user PREFERENCE persisted on the caller's own profile
-- row; it intentionally does NOT change profiles.role or any RLS. A user with
-- courses across multiple verticals can switch their active domain freely.
--
-- This migration adds:
--   1. profiles.domain (nullable text + guarded CHECK constraint).
--   2. set_my_domain(p_domain)   — caller-scoped writer (SECURITY DEFINER).
--   3. derive_user_domain(p_user)— default-domain heuristic from taught courses.
--
-- profiles.role and all existing RLS/policies are left UNTOUCHED.
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles.domain — nullable; NULL means "not yet chosen, derive a default".
--    Guarded ADD COLUMN + guarded CHECK so re-runs are safe.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS domain text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_domain_chk'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_domain_chk
      CHECK (domain IS NULL OR domain IN ('academic', 'counseling', 'coaching'));
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. derive_user_domain — default-domain heuristic. Looks at the courses the
--    user TEACHES (courses.teacher_id) and picks the "most specialized" vertical
--    present, falling back to 'academic'. Used by the client as the default
--    when profiles.domain IS NULL, so a brand-new pickleball coach lands in the
--    coaching theme without having to flip the switcher first.
--
--    SECURITY DEFINER so it can read `courses` regardless of the caller's RLS,
--    matching the existing helpers (is_teacher_of_course, etc.). It only ever
--    reads — never writes — so there is no privilege-escalation surface.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_user_domain(p_user uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT CASE
    WHEN p_user IS NULL THEN 'academic'
    WHEN EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.teacher_id = p_user
        AND c.course_type IN ('pickleball_player', 'pickleball_coach')
    ) THEN 'coaching'
    WHEN EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.teacher_id = p_user
        AND c.course_type = 'counseling'
    ) THEN 'counseling'
    ELSE 'academic'
  END;
$$;
REVOKE ALL ON FUNCTION public.derive_user_domain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.derive_user_domain(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. set_my_domain — caller-scoped writer for the active-domain preference.
--    Updates ONLY the caller's own profiles row (WHERE id = auth.uid()), so it
--    cannot touch anyone else's profile and grants no extra privilege. Validates
--    the value against the same allow-list as the CHECK constraint and raises
--    stable string error codes the client switches on.
--
--    SECURITY DEFINER + SET search_path = public, auth per CLAUDE.md trigger/RPC
--    rule. Returns the updated profiles row so the client can reconcile state.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_domain(p_domain text)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.profiles;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_domain IS NULL
     OR p_domain NOT IN ('academic', 'counseling', 'coaching') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET domain = p_domain,
         updated_at = now()
   WHERE id = v_caller
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Auth row exists but no profile — shouldn't happen post-bootstrap, but
    -- fail loudly rather than silently no-op.
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_domain(text) TO authenticated;
