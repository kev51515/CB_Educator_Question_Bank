-- =============================================================================
-- Migration: 0003_quick_start_rpc.sql
-- Description: Adds the `quick_start_with_code` RPC that powers the
--              frictionless "I have a test code" entry path.
-- Platform: Supabase (PostgreSQL 15+)
--
-- Broader flow:
--   1. The viewer client calls supabase.auth.signInAnonymously() to mint an
--      anonymous JWT (auth.users row with is_anonymous=true). The DB trigger
--      from 0001_init.sql automatically creates a public.profiles row for
--      that user (email defaults to "" since anonymous users have no email).
--   2. The client then calls this RPC with the join code, the student's
--      typed name, and the student's typed email. We update the profile row
--      with that name + email, and insert a class_memberships row in the
--      same transaction.
--   3. The student lands in the app as a logged-in user enrolled in the
--      class — zero email round-trip, zero password.
--
-- Security note: we intentionally do NOT verify email ownership. The email
-- is captured for teacher visibility (roster shows it) but is treated as
-- unverified. Teachers control who gets the join code; that is the access
-- control story for this MVP. A future iteration may convert anonymous
-- accounts to real password accounts (Supabase supports linking).
-- =============================================================================


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
  v_class_id   uuid;
  v_class_name text;
  v_teacher    text;
  v_norm_code  text;
  v_norm_name  text;
  v_norm_email text;
BEGIN
  -- Why: this RPC requires an authenticated caller. The expected pattern is
  -- that the client has just minted an anonymous session via
  -- supabase.auth.signInAnonymously() — anonymous users still have a
  -- non-null auth.uid().
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in (anonymously is fine) to use quick start.';
  END IF;

  -- Normalize + validate inputs. We trim aggressively and case-fold the
  -- join code so the lookup is forgiving of teacher copy-paste artifacts.
  v_norm_code  := upper(trim(coalesce(p_code, '')));
  v_norm_name  := trim(coalesce(p_name, ''));
  v_norm_email := lower(trim(coalesce(p_email, '')));

  IF v_norm_name = '' THEN
    RAISE EXCEPTION 'invalid_name'
      USING HINT = 'Please enter your full name.';
  END IF;

  -- Lightweight email shape check. Not RFC 5322 — intentionally permissive
  -- to avoid false negatives on uncommon-but-valid addresses, but strict
  -- enough to catch obvious typos like missing "@" or trailing-dot domains.
  IF v_norm_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email'
      USING HINT = 'That email does not look right.';
  END IF;

  IF v_norm_code = '' THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'Join code is required.';
  END IF;

  -- Lookup target class (active classes only).
  SELECT c.id, c.name
    INTO v_class_id, v_class_name
    FROM public.classes c
   WHERE upper(c.join_code) = v_norm_code
     AND c.archived = false
   LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'invalid_join_code'
      USING HINT = 'No active class found for that code.';
  END IF;

  -- Update the caller's profile. We deliberately do NOT touch role — keep
  -- it at whatever the auto-profile trigger set ('student' by default).
  -- Anonymous sessions land here with email='' from the trigger, so this
  -- UPDATE is the first time the profile gets a real-looking email.
  UPDATE public.profiles
     SET display_name = v_norm_name,
         email        = v_norm_email,
         updated_at   = now()
   WHERE id = v_caller;

  -- Idempotent enrollment. Mirrors join_class_by_code semantics so calling
  -- quick-start twice with the same code is harmless.
  INSERT INTO public.class_memberships (class_id, student_id)
  VALUES (v_class_id, v_caller)
  ON CONFLICT (class_id, student_id) DO NOTHING;

  -- Fetch the teacher's display name for the confirmation payload. Pulled
  -- after the membership insert so a future tweak that swaps teachers
  -- mid-flight reflects the latest owner.
  SELECT p.display_name
    INTO v_teacher
    FROM public.classes c
    JOIN public.profiles p ON p.id = c.teacher_id
   WHERE c.id = v_class_id;

  RETURN QUERY SELECT v_class_id, v_class_name, v_teacher;
END;
$$;

-- Lock down the privilege surface. Only authenticated callers (including
-- anonymous-session callers, which still carry the `authenticated` role
-- in Supabase) may execute this function.
REVOKE ALL ON FUNCTION public.quick_start_with_code(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quick_start_with_code(text, text, text) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 0003_quick_start_rpc.sql
-- =============================================================================
