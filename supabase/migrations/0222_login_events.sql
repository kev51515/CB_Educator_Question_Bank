-- =============================================================================
-- Migration: 0222_login_events.sql
-- Description: Durable per-user login tracking with IP + device + geolocation.
--
-- Motivation: the only live source of login IPs was `auth.sessions` (current
-- sessions only — rows vanish on logout/expiry) and `auth.audit_log_entries`
-- (empty / not retained on this project). Neither gives a durable history.
-- `admin_user_overview` (0125) surfaced only `auth.users.last_sign_in_at` —
-- a single timestamp, no IP, no location.
--
-- This adds a persistent `public.login_events` log the client appends to once
-- per session via `log_login_event()`, which reads the real client IP + device
-- + Cloudflare country from PostgREST's `request.headers` (cf-connecting-ip /
-- x-forwarded-for / cf-ipcountry / user-agent). City + lat/long are filled in
-- lazily on read by an admin/teacher viewer (ipwho.is) via `set_login_geo()`,
-- so no geo-IP key, edge function, or cron is required.
--
-- Visibility: admins see everyone; a teacher sees login activity for students
-- enrolled in a course they own (via `can_see_user_activity`). Enforced both in
-- RLS (SELECT policy) and in every read RPC.
--
-- Privacy note: this stores IP + approximate location for (often minor)
-- students. It exists because the operator explicitly asked for detailed login
-- tracking. Keep the visibility gate strict — do NOT widen it to all staff.
--
-- Forward-only; idempotent (CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS). Applied directly via psql (additive) — see
-- docs/MIGRATIONS.md.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip           inet,
  user_agent   text,
  country_code text,                 -- from cf-ipcountry (instant, free)
  city         text,
  region       text,
  country      text,
  latitude     double precision,
  longitude    double precision,
  geo_status   text NOT NULL DEFAULT 'pending',   -- pending | done | failed
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_events_user_created_idx
  ON public.login_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_events_geo_pending_idx
  ON public.login_events (geo_status) WHERE geo_status = 'pending';

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Visibility helper: admin (any user) OR teacher of a course the subject is in.
-- SECURITY DEFINER so the RLS policy + RPCs share one source of truth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_see_user_activity(p_subject uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.course_memberships cm
        JOIN public.courses c ON c.id = cm.course_id
        WHERE cm.student_id = p_subject
          AND c.teacher_id = auth.uid()
          AND c.deleted_at IS NULL
      )
    );
$$;
REVOKE ALL ON FUNCTION public.can_see_user_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_user_activity(uuid) TO authenticated;

-- Read policy. Writes happen ONLY through the SECURITY DEFINER RPCs below
-- (which bypass RLS), so there is intentionally no INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS login_events_select ON public.login_events;
CREATE POLICY login_events_select ON public.login_events
  FOR SELECT USING (public.can_see_user_activity(user_id));

-- ---------------------------------------------------------------------------
-- Capture: called by the client once per session. Reads the real client IP +
-- device from PostgREST request headers. Silent no-op when unauthenticated.
-- Dedups same user+ip within 30 min so reloads/token-refreshes don't spam.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_login_event()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hdr jsonb := COALESCE(current_setting('request.headers', true), '{}')::jsonb;
  v_ip  text;
  v_ua  text;
  v_cc  text;
  v_ip_inet inet;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  v_ip := COALESCE(
    NULLIF(v_hdr->>'cf-connecting-ip', ''),
    NULLIF(split_part(COALESCE(v_hdr->>'x-forwarded-for', ''), ',', 1), '')
  );
  v_ua := NULLIF(v_hdr->>'user-agent', '');
  v_cc := NULLIF(upper(COALESCE(v_hdr->>'cf-ipcountry', '')), 'XX');  -- XX = unknown
  v_cc := NULLIF(v_cc, '');

  BEGIN
    v_ip_inet := v_ip::inet;
  EXCEPTION WHEN others THEN
    v_ip_inet := NULL;
  END;

  -- Dedup window.
  IF EXISTS (
    SELECT 1 FROM public.login_events
    WHERE user_id = v_uid
      AND created_at > now() - interval '30 minutes'
      AND ip IS NOT DISTINCT FROM v_ip_inet
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.login_events (user_id, ip, user_agent, country_code, geo_status)
  VALUES (
    v_uid, v_ip_inet, v_ua, v_cc,
    CASE WHEN v_ip_inet IS NULL THEN 'failed' ELSE 'pending' END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.log_login_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_login_event() TO authenticated;

-- ---------------------------------------------------------------------------
-- Read: full event history for one user (admin or that user's teacher).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_login_events(p_user_id uuid, p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.can_see_user_activity(p_user_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(e))
    FROM (
      SELECT id,
             host(ip)   AS ip,
             user_agent, country_code, city, region, country,
             latitude, longitude, geo_status, created_at
      FROM public.login_events
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
    ) e
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_login_events(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_login_events(uuid, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Read: per-roster last-login snapshot for a course (teacher of course / admin).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.course_login_overview(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_admin(v_uid)
          OR EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id AND c.teacher_id = v_uid))
  THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(r)
    FROM (
      SELECT cm.student_id,
             p.display_name,
             p.email,
             le.created_at AS last_login,
             host(le.ip)   AS ip,
             le.city, le.region, le.country, le.country_code,
             le.latitude, le.longitude, le.user_agent, le.geo_status,
             le.id         AS last_event_id
      FROM public.course_memberships cm
      JOIN public.profiles p ON p.id = cm.student_id
      LEFT JOIN LATERAL (
        SELECT * FROM public.login_events e
        WHERE e.user_id = cm.student_id
        ORDER BY e.created_at DESC
        LIMIT 1
      ) le ON true
      WHERE cm.course_id = p_course_id
      ORDER BY p.display_name NULLS LAST, p.email
    ) r
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.course_login_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_login_overview(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Geo write-back: a viewer who can see the event persists the city/lat-long it
-- resolved client-side (ipwho.is) so the next viewer reads it from cache.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_login_geo(
  p_event_id     uuid,
  p_city         text,
  p_region       text,
  p_country      text,
  p_country_code text,
  p_lat          double precision,
  p_lon          double precision
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_subject uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT user_id INTO v_subject FROM public.login_events WHERE id = p_event_id;
  IF v_subject IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.can_see_user_activity(v_subject) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE public.login_events
     SET city         = NULLIF(p_city, ''),
         region       = NULLIF(p_region, ''),
         country      = COALESCE(NULLIF(p_country, ''), country),
         country_code = COALESCE(NULLIF(p_country_code, ''), country_code),
         latitude     = p_lat,
         longitude    = p_lon,
         geo_status   = 'done'
   WHERE id = p_event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_login_geo(uuid, text, text, text, text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_login_geo(uuid, text, text, text, text, double precision, double precision) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0222_login_events.sql
-- =============================================================================
