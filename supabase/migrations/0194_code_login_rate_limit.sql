-- =============================================================================
-- Migration: 0194_code_login_rate_limit.sql
-- Description: Per-IP rate-limit backing for the `student-code-login` edge
--              function, which lets a managed student sign in PASSWORDLESSLY
--              with their teacher-issued login code (mirrors the first-time
--              join: "the code gets you in"). Because a valid code mints a
--              session with no password, the endpoint MUST be brute-force
--              throttled — codes are 6 distinct letters from a 22-letter set
--              (~53M combos), and without a limit an attacker could enumerate.
--
--   • code_login_attempts — append-only (ip, created_at) log the edge function
--     writes on every attempt; it counts the window itself (service role).
--   • code_login_touch(ip, max, window) — SECURITY DEFINER helper: raises
--     'rate_limited' if the IP has >= max attempts in the window, else records
--     this one. Granted to service_role (the edge function's identity) only —
--     never to anon/authenticated, so a tampered client can't probe it.
--
-- The seat lookup + session minting live in the edge function (service role,
-- admin.generateLink), not here. Forward-only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.code_login_attempts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS code_login_attempts_ip_at
  ON public.code_login_attempts (ip, created_at DESC);

-- No RLS policies: only the service role (edge function) touches this table,
-- and service_role bypasses RLS. RLS on + zero policies = locked to everyone else.
ALTER TABLE public.code_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.code_login_touch(
  p_ip          text,
  p_max         int,
  p_window_secs int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip    text := COALESCE(NULLIF(btrim(p_ip), ''), 'unknown');
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.code_login_attempts
   WHERE ip = v_ip
     AND created_at > now() - (p_window_secs || ' seconds')::interval;

  IF v_count >= p_max THEN
    RAISE EXCEPTION 'rate_limited'
      USING HINT = 'Too many login attempts. Wait a minute and try again.';
  END IF;

  INSERT INTO public.code_login_attempts (ip) VALUES (v_ip);

  -- Opportunistic GC: drop rows older than an hour so the table stays small.
  DELETE FROM public.code_login_attempts
   WHERE created_at < now() - interval '1 hour';
END;
$$;

REVOKE ALL ON FUNCTION public.code_login_touch(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.code_login_touch(text, int, int) TO service_role;

-- =============================================================================
-- END OF MIGRATION 0194_code_login_rate_limit.sql
-- =============================================================================
