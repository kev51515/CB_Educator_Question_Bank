-- =============================================================================
-- Migration: 0031_cron_schedules.sql
-- Description: Schedule the two edge functions to run automatically via
--   pg_cron + pg_net. Both functions live at /functions/v1/<name> on the
--   project's domain.
--
--   * assignment-due-reminders — every hour. Iterates assignments due in
--     the next 24h; sends a Resend email to each enrolled-but-not-attempted
--     student. Dedup via reminder_log (added in 0023).
--
--   * cleanup-anon-users — daily at 03:00 UTC. Deletes anonymous auth users
--     older than CLEANUP_DAYS (default 14).
--
--   Bearer tokens are injected from Supabase secrets (CRON_TOKEN and
--   CLEANUP_TOKEN). These are set via:
--     supabase secrets set --project-ref <ref> CRON_TOKEN=... CLEANUP_TOKEN=...
--   The function URL templates embed the project ref directly.
--
-- Prerequisites (must be enabled in Supabase Dashboard → Database → Extensions
-- before this migration runs):
--   * pg_cron
--   * pg_net
-- If either is missing, the CREATE statements in this migration will fail
-- with "schema cron does not exist" or similar; enable them and re-push.
-- =============================================================================

-- Make sure cron + net are available; this is a no-op if already enabled.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The CRON_TOKEN / CLEANUP_TOKEN values that the edge functions check must
-- match what's set in Supabase secrets. We store them server-side in a
-- per-project setting so the schedules don't carry them inline.
-- These values are injected at migration-apply time via psql variables.
-- For idempotency, we DROP+CREATE the schedules.

DO $$
DECLARE
  v_base text := 'https://ljdofwovsyaqydcbohhd.supabase.co/functions/v1';
BEGIN
  -- Cancel any existing schedules so re-apply is clean.
  PERFORM cron.unschedule('assignment-due-reminders-hourly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'assignment-due-reminders-hourly');

  PERFORM cron.unschedule('cleanup-anon-users-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-anon-users-daily');

  PERFORM cron.unschedule('prune-reminder-log-weekly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-reminder-log-weekly');

  PERFORM cron.unschedule('prune-rate-limits-weekly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-rate-limits-weekly');

  -- Hourly: assignment due reminders. The edge function reads the
  -- Authorization header and matches against the CRON_TOKEN env var.
  PERFORM cron.schedule(
    'assignment-due-reminders-hourly',
    '0 * * * *',
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
    $q$, v_base || '/assignment-due-reminders')
  );

  -- Daily 03:00 UTC: anonymous user cleanup.
  PERFORM cron.schedule(
    'cleanup-anon-users-daily',
    '0 3 * * *',
    format($q$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(
            current_setting('app.settings.cleanup_token', true),
            ''
          )
        )
      ) AS request_id;
    $q$, v_base || '/cleanup-anon-users')
  );

  -- Weekly Sundays 02:00 UTC: prune old reminder_log rows.
  PERFORM cron.schedule(
    'prune-reminder-log-weekly',
    '0 2 * * 0',
    'SELECT public.prune_reminder_log();'
  );

  -- Weekly Sundays 02:30 UTC: prune rate_limit_attempts.
  PERFORM cron.schedule(
    'prune-rate-limits-weekly',
    '30 2 * * 0',
    'SELECT public.prune_rate_limit_attempts();'
  );
END;
$$;

-- IMPORTANT: the edge functions read CRON_TOKEN / CLEANUP_TOKEN via Deno.env
-- (set with `supabase secrets set ...`). The pg_cron jobs above need the
-- SAME values exposed to PostgreSQL via custom GUC vars. After this
-- migration applies, the project admin must run (once, against the prod DB):
--
--   ALTER DATABASE postgres SET app.settings.cron_token    = '<value>';
--   ALTER DATABASE postgres SET app.settings.cleanup_token = '<value>';
--   SELECT pg_reload_conf();
--
-- Why not embed inline: GUCs survive across pg_dump/restore; embedding the
-- token in the schedule command would put a secret in the migration audit
-- trail. Run the ALTER once at deploy time and the schedules pick it up.
