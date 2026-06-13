-- =============================================================================
-- Migration: 0241_study_coach_rate_limit.sql
-- Description: Per-STUDENT rate-limit backing for the AI Study Coach edge
--              function. Mirrors the 0194 code-login throttle, but because the
--              coach endpoint runs in an authenticated session, it keys on the
--              signed-in user (auth.uid()) instead of the request IP. This caps
--              an individual student to ~20 coach calls per 5-minute window, so
--              a runaway client (or a curious student) can't burn the upstream
--              LLM budget.
--
--   • study_coach_attempts — append-only (user_id, created_at) log written on
--     every coach call; the touch helper counts the window itself.
--   • study_coach_touch(max, window) — SECURITY DEFINER helper: raises
--     'not_authenticated' if there's no session, 'rate_limited' if the user has
--     >= max attempts in the window, else records this one. Granted to
--     authenticated only; the function reads auth.uid() so a client can't spoof
--     another student's bucket.
--
-- Forward-only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.study_coach_attempts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_coach_attempts_user_at
  ON public.study_coach_attempts (user_id, created_at DESC);

-- No RLS policies: only the SECURITY DEFINER RPC below touches this table.
-- RLS on + zero policies = locked to everyone else.
ALTER TABLE public.study_coach_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.study_coach_touch(
  p_max         int DEFAULT 20,
  p_window_secs int DEFAULT 300
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
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'You must be signed in to use the Study Coach.';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.study_coach_attempts
   WHERE user_id = v_uid
     AND created_at > now() - (p_window_secs || ' seconds')::interval;

  IF v_count >= p_max THEN
    RAISE EXCEPTION 'rate_limited'
      USING HINT = 'Too many Study Coach requests. Wait a few minutes and try again.';
  END IF;

  INSERT INTO public.study_coach_attempts (user_id) VALUES (v_uid);

  -- Opportunistic GC: drop this user's rows older than the window so the
  -- table stays small.
  DELETE FROM public.study_coach_attempts
   WHERE user_id = v_uid
     AND created_at < now() - (p_window_secs || ' seconds')::interval;
END;
$$;

REVOKE ALL ON FUNCTION public.study_coach_touch(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_coach_touch(int, int) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0241_study_coach_rate_limit.sql
-- =============================================================================
