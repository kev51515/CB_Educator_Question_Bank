-- =============================================================================
-- Migration: 0142_peek_join_code.sql
-- Description: peek_join_code(p_code) — classify a typed code so the
--   QuickStart screen can route it WITHOUT relying on the code's SHAPE.
--
--   Why this exists
--   ---------------
--   A student's personal login code (profiles.login_code, e.g. "KMCZQR") and a
--   course join/short code (e.g. "74KPKZ") are BOTH bare 6-char strings in the
--   same A–Z/2–9 alphabet. The QuickStart screen used to guess from shape alone:
--   a 6-char code was assumed to be a COURSE code (quick-start enrolment, asks
--   name+email, no password) and only a "COURSECODE-NN" dash form was treated as
--   a managed SEAT code (claim, asks email+password). So a managed student handed
--   a bare personal code (no dash) was misrouted to quick-start, the claim RPC
--   never ran, and first login dead-ended ("Couldn't load your profile").
--
--   We deliberately keep the bare (dash-less) personal-code format. Instead the
--   client asks the server what a code IS:
--     'seat'   → a managed student login_code  → claim_student_seat (email+pw)
--     'course' → a course short_code/join_code → quick_start_with_code (name+email)
--     'none'   → unknown                        → fall through to the course error
--
--   Security: SECURITY DEFINER so the lookup can see profiles/courses past RLS,
--   but it returns ONLY a classification string — never a name, email, id, or any
--   row content — so it leaks nothing a code-holder couldn't already probe via
--   claim_student_seat / quick_start_with_code. (Code-enumeration on these codes
--   is an already-accepted product risk; see CLAUDE.md / the claim_seat rate
--   limit.) Callable pre-auth (granted to anon) because QuickStart resolves the
--   code as the student types, before the throwaway anonymous session is minted.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.peek_join_code(p_code text)
  RETURNS text   -- 'seat' | 'course' | 'none'
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
BEGIN
  IF v_code = '' THEN
    RETURN 'none';
  END IF;

  -- A managed student seat takes precedence: a personal login code is a
  -- credential, a course code is public, so resolving to the claim flow is the
  -- safer default if (improbably) both ever collided.
  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE managed = true
       AND upper(login_code) = v_code
  ) THEN
    RETURN 'seat';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.courses
     WHERE archived = false
       AND (upper(short_code) = v_code OR upper(join_code) = v_code)
  ) THEN
    RETURN 'course';
  END IF;

  RETURN 'none';
END;
$$;

REVOKE ALL ON FUNCTION public.peek_join_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_join_code(text) TO anon, authenticated;
