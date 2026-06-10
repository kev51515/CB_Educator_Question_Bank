-- =============================================================================
-- Migration: 0159_line_dispatch_cron.sql  (renumbered from 0158 — roster_status_range holds 0158 on cloud)
-- Schedules the line-dispatch edge function (every minute) to drain line_outbox
-- to the LINE push API. Mirrors 0031's pattern exactly: pg_cron + pg_net
-- net.http_post to /functions/v1/line-dispatch with a Bearer token read from
-- the app.settings.cron_token GUC (already set on prod for the existing
-- reminders cron — line-dispatch reuses the SAME CRON_TOKEN secret, so no new
-- GUC/ALTER DATABASE step is needed).
--
-- A minute cadence keeps LINE delivery prompt; if line-dispatch isn't deployed
-- yet the posts 404 harmlessly and the outbox rows stay pending for the next
-- tick. Idempotent: unschedule-then-schedule. Forward-only.
--
-- !! VERIFY NUMBERING BEFORE PUSH — re-check `supabase migration list --linked`
--    (parallel session active). Prereqs pg_cron + pg_net already enabled (0031).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_base text := 'https://ljdofwovsyaqydcbohhd.supabase.co/functions/v1';
BEGIN
  PERFORM cron.unschedule('line-dispatch-minutely')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'line-dispatch-minutely');

  PERFORM cron.schedule(
    'line-dispatch-minutely',
    '* * * * *',
    format($q$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(
            current_setting('app.settings.cron_token', true),
            ''
          )
        )
      ) AS request_id;
    $q$, v_base || '/line-dispatch')
  );
END;
$$;

-- =============================================================================
-- END OF MIGRATION 0158_line_dispatch_cron.sql
-- =============================================================================
