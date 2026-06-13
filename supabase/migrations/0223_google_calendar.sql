-- =============================================================================
-- Migration: 0223_google_calendar.sql
-- Description: Opt-in Google Calendar connection for creating Google Meet links
--   from the Recordings surface (Phase 5). See docs/GOOGLE_CALENDAR_SETUP.md.
--
--   Stores a per-user Google OAuth REFRESH TOKEN so an edge function can mint
--   access tokens server-side and create a Calendar event (which auto-generates
--   a Meet link). The refresh token is a SECRET: the table has NO user-facing
--   SELECT policy — it's written via a SECURITY DEFINER RPC and read only by the
--   service role inside the `create-meet-link` edge function. Users learn their
--   connection state via `google_calendar_status()` (no token exposed).
--
--   This is the ONLY part of the Meet integration that needs Google OAuth.
--   Recording a Meet (tab-audio capture) already works without any of this.
--
-- Forward-only. Idempotent. STAGED — not pushed (dormant until the owner adds
--   the calendar.events scope in Google Cloud Console + sets the OAuth secrets).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
  user_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  scope         text,
  connected_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_gcal_tokens_updated_at ON public.google_calendar_tokens;
CREATE TRIGGER trg_gcal_tokens_updated_at
  BEFORE UPDATE ON public.google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: NO user policies at all — the table is reachable only through the
-- SECURITY DEFINER RPCs below + the service role. (RLS enabled with zero
-- policies = deny-all to anon/authenticated.)
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Store / refresh the caller's Google refresh token (called right after the
-- opt-in OAuth redirect captures provider_refresh_token client-side).
CREATE OR REPLACE FUNCTION public.connect_google_calendar(
  p_refresh_token text,
  p_scope         text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF coalesce(btrim(p_refresh_token), '') = '' THEN
    RAISE EXCEPTION 'missing_token' USING ERRCODE = '22000';
  END IF;
  INSERT INTO public.google_calendar_tokens (user_id, refresh_token, scope)
  VALUES (auth.uid(), p_refresh_token, p_scope)
  ON CONFLICT (user_id) DO UPDATE
    SET refresh_token = EXCLUDED.refresh_token,
        scope        = EXCLUDED.scope,
        updated_at   = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.connect_google_calendar(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.disconnect_google_calendar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM public.google_calendar_tokens WHERE user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.disconnect_google_calendar() TO authenticated;

-- Connection status WITHOUT exposing the token.
CREATE OR REPLACE FUNCTION public.google_calendar_status()
RETURNS TABLE (connected boolean, connected_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
    SELECT true, t.connected_at
      FROM public.google_calendar_tokens t
     WHERE t.user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::timestamptz;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.google_calendar_status() TO authenticated;

-- =============================================================================
