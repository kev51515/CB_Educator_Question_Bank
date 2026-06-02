-- =============================================================================
-- Migration: 0021_rate_limit.sql
-- Description: Per-user rate limiting for high-traffic RPCs.
--   * Introduces a generic rate_limit_attempts ledger.
--   * Provides public.check_rate_limit(action, max, window_secs) helper that
--     atomically (per row) verifies the caller has not exceeded a quota for a
--     named action and records the attempt. SECURITY DEFINER so callers can
--     record without per-table write RLS paths.
--   * Provides public.prune_rate_limit_attempts() (intended for pg_cron).
--   * Wires check_rate_limit into the three highest-traffic anon/student RPCs:
--       - join_course_by_code (10/min)
--       - quick_start_with_code (5/min)
--       - redeem_teacher_invite (5/min)
--   * Staff (admin/teacher) callers are short-circuited — they are not rate
--     limited (they need to be able to drive support flows without lockouts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: rate_limit_attempts ledger
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL,  -- auth.uid() or IP-hash (not enforced FK; could be anon)
  action      text NOT NULL,  -- short string identifying the gated action
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_attempts_actor_action_idx
  ON public.rate_limit_attempts (actor_id, action, created_at DESC);

-- RLS: the table is only ever touched by SECURITY DEFINER helpers below.
-- We enable RLS but add no policies — that denies all direct access from
-- authenticated/anon roles, while the SECURITY DEFINER functions still work.
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- SECTION 2: check_rate_limit helper
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action      text,
  p_max         int,
  p_window_secs int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Staff exemption: support / admin flows should not get locked out by
  -- legitimate retry behaviour. Cheap STABLE call; safe inside SECURITY DEFINER.
  IF public.is_staff(v_uid) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.rate_limit_attempts
  WHERE actor_id = v_uid
    AND action = p_action
    AND created_at > now() - (p_window_secs || ' seconds')::interval;

  IF v_count >= p_max THEN
    RAISE EXCEPTION 'rate_limited'
      USING HINT = format('Too many %s attempts. Try later.', p_action);
  END IF;

  INSERT INTO public.rate_limit_attempts (actor_id, action) VALUES (v_uid, p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO authenticated;


-- -----------------------------------------------------------------------------
-- SECTION 3: prune_rate_limit_attempts (intended for pg_cron weekly)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prune_rate_limit_attempts() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  DELETE FROM public.rate_limit_attempts WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.prune_rate_limit_attempts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_rate_limit_attempts() TO service_role;


-- =============================================================================
-- SECTION 4: Wire check_rate_limit into existing RPCs
-- Each RPC is re-created via CREATE OR REPLACE preserving its current body
-- (per 0012 for join_course_by_code / quick_start_with_code, per 0005 for
-- redeem_teacher_invite). Only the rate-limit PERFORM is inserted as the first
-- statement after the auth.uid() check. Error code names are unchanged.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4a. join_course_by_code  — 10 attempts per minute
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_course_by_code(p_code text)
  RETURNS TABLE (
    id                   uuid,
    name                 text,
    description          text,
    join_code            text,
    teacher_display_name text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_course_id uuid;
  v_normalized text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in to join a course.';
  END IF;

  PERFORM public.check_rate_limit('join_course', 10, 60);

  v_normalized := upper(trim(coalesce(p_code, '')));

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'Join code is required.';
  END IF;

  SELECT c.id
    INTO v_course_id
    FROM public.courses c
   WHERE upper(c.join_code) = v_normalized
     AND c.archived = false
   LIMIT 1;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'No active course found for that code.';
  END IF;

  INSERT INTO public.course_memberships (course_id, student_id)
  VALUES (v_course_id, v_caller)
  ON CONFLICT (course_id, student_id) DO NOTHING;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.description,
    c.join_code,
    p.display_name AS teacher_display_name
  FROM public.courses c
  JOIN public.profiles p ON p.id = c.teacher_id
  WHERE c.id = v_course_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_course_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_course_by_code(text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 4b. quick_start_with_code  — 5 attempts per minute
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quick_start_with_code(
  p_code  text,
  p_name  text,
  p_email text
)
  RETURNS TABLE (
    class_id             uuid,
    class_name           text,
    teacher_display_name text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_course_id  uuid;
  v_class_name text;
  v_teacher    text;
  v_norm_code  text;
  v_norm_name  text;
  v_norm_email text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in (anonymously is fine) to use quick start.';
  END IF;

  PERFORM public.check_rate_limit('quick_start', 5, 60);

  v_norm_code  := upper(trim(coalesce(p_code, '')));
  v_norm_name  := trim(coalesce(p_name, ''));
  v_norm_email := lower(trim(coalesce(p_email, '')));

  IF v_norm_name = '' THEN
    RAISE EXCEPTION 'invalid_name'
      USING HINT = 'Please enter your full name.';
  END IF;

  IF v_norm_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email'
      USING HINT = 'That email does not look right.';
  END IF;

  IF v_norm_code = '' THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'Join code is required.';
  END IF;

  SELECT c.id, c.name
    INTO v_course_id, v_class_name
    FROM public.courses c
   WHERE upper(c.join_code) = v_norm_code
     AND c.archived = false
   LIMIT 1;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'No active course found for that code.';
  END IF;

  UPDATE public.profiles
     SET display_name = v_norm_name,
         email        = v_norm_email,
         updated_at   = now()
   WHERE id = v_caller;

  INSERT INTO public.course_memberships (course_id, student_id)
  VALUES (v_course_id, v_caller)
  ON CONFLICT (course_id, student_id) DO NOTHING;

  SELECT p.display_name
    INTO v_teacher
    FROM public.courses c
    JOIN public.profiles p ON p.id = c.teacher_id
   WHERE c.id = v_course_id;

  RETURN QUERY SELECT v_course_id, v_class_name, v_teacher;
END;
$$;

REVOKE ALL ON FUNCTION public.quick_start_with_code(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quick_start_with_code(text, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 4c. redeem_teacher_invite  — 5 attempts per minute
-- -----------------------------------------------------------------------------

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

  PERFORM public.check_rate_limit('redeem_invite', 5, 60);

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
-- END OF MIGRATION 0021_rate_limit.sql
-- =============================================================================
