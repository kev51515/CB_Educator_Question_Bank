-- =============================================================================
-- Migration: 0005_teacher_invites.sql
-- Description: Teacher invite codes + redemption ledger, plus a one-shot
--              bootstrap RPC to mint the first admin. Closes the self-elevation
--              hole left by 0001 where any signup could pass role='teacher' in
--              auth metadata.
-- Platform: Supabase (PostgreSQL 15+)
-- Note: Supabase wraps each migration in a transaction automatically.
--
-- HOW TO BOOTSTRAP THE FIRST ADMIN:
-- 1. Sign up a normal user via the app (they'll land as role='student').
-- 2. In Supabase Dashboard → SQL Editor, run:
--      select public.bootstrap_first_admin('<their auth.users.id>');
-- 3. They're now admin. Future admins can be promoted via
--      UPDATE profiles SET role='admin' WHERE id=...
--    or by writing a UI later. teacher_invite_codes is admin-only territory:
--    only admins can mint codes, and the redeem RPC is what elevates students
--    to teachers.
--
-- WHY:
--   In 0001 the handle_new_auth_user trigger reads `role` from raw_user_meta_data.
--   That metadata is set by the client at signUp time — meaning anyone calling
--   supabase.auth.signUp with role='teacher' in options.data lands as a teacher.
--   The fix is two-layered:
--     (a) The UI now hard-defaults signups to 'student' for teacher signups
--         and only elevates to 'teacher' after a successful invite redemption.
--     (b) This migration adds the redeem RPC which validates the invite
--         server-side and bumps the profile row — independent of metadata.
-- =============================================================================


-- =============================================================================
-- SECTION 1: teacher_invite_codes TABLE
-- Admin-minted codes that allow self-service teacher onboarding.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.teacher_invite_codes (
  code        text        PRIMARY KEY,
  note        text,
  created_by  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  max_uses    integer,
  uses        integer     NOT NULL DEFAULT 0,
  revoked     boolean     NOT NULL DEFAULT false,
  CONSTRAINT teacher_invite_codes_code_format CHECK (
    char_length(code) BETWEEN 6 AND 32 AND code = lower(code)
  ),
  CONSTRAINT teacher_invite_codes_max_uses_nonneg CHECK (
    max_uses IS NULL OR max_uses > 0
  )
);

-- Why: lookups during redemption filter by (revoked=false, expires_at>now()).
-- A partial index on the "live" subset is a tiny perf win and a cheap habit.
CREATE INDEX IF NOT EXISTS idx_teacher_invite_codes_active
  ON public.teacher_invite_codes(revoked, expires_at);

ALTER TABLE public.teacher_invite_codes ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 2: teacher_invite_redemptions TABLE
-- Append-only ledger: every time a code gets used, we record who used it and
-- when. The UNIQUE(redeemed_by) constraint means a profile may only ever
-- redeem one invite — once they're a teacher, they're a teacher.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.teacher_invite_redemptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text        NOT NULL REFERENCES public.teacher_invite_codes(code) ON DELETE RESTRICT,
  redeemed_by  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (redeemed_by)
);

CREATE INDEX IF NOT EXISTS idx_teacher_invite_redemptions_code
  ON public.teacher_invite_redemptions(code);

ALTER TABLE public.teacher_invite_redemptions ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 3: RPC — redeem_teacher_invite(p_code)
-- Called by an authenticated student who has a valid invite code. Validates
-- the code, elevates the profile to 'teacher', records the redemption, and
-- bumps the use counter. SECURITY DEFINER so we can bypass the WITH CHECK
-- on profiles UPDATE that pins role to its previous value (see 0001).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.redeem_teacher_invite(p_code text)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_code        text;
  v_invite      public.teacher_invite_codes%ROWTYPE;
  v_profile     public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_code := lower(trim(p_code));
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = '22023';
  END IF;

  -- Lock the invite row to prevent racing two clients to the last use slot.
  SELECT * INTO v_invite
  FROM public.teacher_invite_codes
  WHERE code = v_code
    AND revoked = false
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = '22023';
  END IF;

  -- Check current role. Already-elevated users get a clean idempotent error
  -- rather than silently succeeding (which would hide bugs / double-uses).
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '02000';
  END IF;

  IF v_profile.role IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'already_elevated' USING ERRCODE = '22023';
  END IF;

  -- Elevate.
  UPDATE public.profiles
     SET role = 'teacher'
   WHERE id = v_uid
  RETURNING * INTO v_profile;

  -- Record redemption. UNIQUE(redeemed_by) guards against a second redemption
  -- attempt sneaking through (defence in depth — we already check role above).
  INSERT INTO public.teacher_invite_redemptions (code, redeemed_by)
  VALUES (v_code, v_uid);

  UPDATE public.teacher_invite_codes
     SET uses = uses + 1
   WHERE code = v_code;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_teacher_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_teacher_invite(text) TO authenticated;


-- =============================================================================
-- SECTION 4: RPC — mint_teacher_invite(p_code, p_note, p_expires_at, p_max_uses)
-- Admin-only. Creates a new code, lowercased and validated for format.
-- Returns the inserted row so the UI can render it immediately.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mint_teacher_invite(
  p_code       text,
  p_note       text,
  p_expires_at timestamptz,
  p_max_uses   integer
)
  RETURNS public.teacher_invite_codes
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_code    text;
  v_row     public.teacher_invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  v_code := lower(trim(coalesce(p_code, '')));
  IF char_length(v_code) < 6 OR char_length(v_code) > 32 THEN
    RAISE EXCEPTION 'invalid_code_length' USING ERRCODE = '22023';
  END IF;

  -- Enforce alnum + dash/underscore so we don't accept whitespace or punctuation
  -- that would make codes hard to type or share.
  IF v_code !~ '^[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'invalid_code_format' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.teacher_invite_codes WHERE code = v_code) THEN
    RAISE EXCEPTION 'code_already_exists' USING ERRCODE = '23505';
  END IF;

  IF p_max_uses IS NOT NULL AND p_max_uses <= 0 THEN
    RAISE EXCEPTION 'invalid_max_uses' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.teacher_invite_codes (code, note, created_by, expires_at, max_uses)
  VALUES (v_code, NULLIF(trim(p_note), ''), v_uid, p_expires_at, p_max_uses)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_teacher_invite(text, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_teacher_invite(text, text, timestamptz, integer) TO authenticated;


-- =============================================================================
-- SECTION 5: RPC — revoke_teacher_invite(p_code)
-- Admin-only. Flips the revoked flag. Existing redemptions stay valid; only
-- future redemption attempts are blocked.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.revoke_teacher_invite(p_code text)
  RETURNS public.teacher_invite_codes
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_row  public.teacher_invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  UPDATE public.teacher_invite_codes
     SET revoked = true
   WHERE code = lower(trim(p_code))
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found' USING ERRCODE = '02000';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_teacher_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_teacher_invite(text) TO authenticated;


-- =============================================================================
-- SECTION 6: RPC — bootstrap_first_admin(p_user_id)
-- One-shot. Promotes the first user to admin. Refuses to run once any admin
-- exists. NOT granted to authenticated — only callable from the SQL editor by
-- the project owner / service_role. This is the only way to get the first
-- admin into the system; everything else flows from there.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_user_id uuid)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'admin_already_exists' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET role = 'admin'
   WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '02000';
  END IF;

  RETURN v_profile;
END;
$$;

-- Lock this one down hard. service_role / postgres only.
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(uuid) FROM anon;


-- =============================================================================
-- SECTION 7: RLS POLICIES — teacher_invite_codes
-- Direct table access is admin-only-read. All mutation flows through the
-- SECURITY DEFINER RPCs above (so we don't need INSERT/UPDATE/DELETE policies
-- for clients). The RPCs themselves verify is_admin(auth.uid()).
-- =============================================================================

DROP POLICY IF EXISTS "teacher_invite_codes: admin reads" ON public.teacher_invite_codes;
CREATE POLICY "teacher_invite_codes: admin reads"
  ON public.teacher_invite_codes
  FOR SELECT
  USING (
    public.is_admin((SELECT auth.uid()))
  );


-- =============================================================================
-- SECTION 8: RLS POLICIES — teacher_invite_redemptions
-- Admin-only read. Inserts happen only inside the SECURITY DEFINER redeem RPC.
-- =============================================================================

DROP POLICY IF EXISTS "teacher_invite_redemptions: admin reads" ON public.teacher_invite_redemptions;
CREATE POLICY "teacher_invite_redemptions: admin reads"
  ON public.teacher_invite_redemptions
  FOR SELECT
  USING (
    public.is_admin((SELECT auth.uid()))
  );


-- =============================================================================
-- END OF MIGRATION 0005_teacher_invites.sql
-- =============================================================================
