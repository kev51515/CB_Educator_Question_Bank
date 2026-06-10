-- =============================================================================
-- Migration: 0160_cron_token_via_table.sql
-- Fixes cron auth for edge functions. 0031 relied on app.settings.cron_token
-- (a GUC) for the Bearer token, but the managed `postgres` role can't set that
-- custom param ("permission denied to set parameter") — so the GUC was empty
-- and EVERY cron-invoked function (line-dispatch AND assignment-due-reminders)
-- got 403. Fix: read the token from a locked private table instead of the GUC.
--
-- The token VALUE is inserted out-of-band (it's a secret, never in a migration):
--   INSERT INTO private.cron_secrets(key,value) VALUES('cron_token','<token>')
--     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- and the SAME value is set as the CRON_TOKEN function secret
--   (supabase secrets set CRON_TOKEN=<token>). Both already done on prod.
--
-- Idempotent (IF NOT EXISTS / unschedule-then-schedule). Forward-only.
-- !! Verify numbering before push (parallel session active). !!
-- =============================================================================

-- Operational fix: cron token via a locked private table (the app.settings GUC
-- can't be set — managed postgres role lacks superuser). Both cron-invoked
-- functions read the token from here; the value is inserted out-of-band.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.cron_secrets (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE private.cron_secrets ENABLE ROW LEVEL SECURITY;  -- private schema isn't API-exposed; defense-in-depth

DO $outer$
DECLARE
  v_base text := 'https://ljdofwovsyaqydcbohhd.supabase.co/functions/v1';
BEGIN
  PERFORM cron.unschedule('line-dispatch-minutely')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'line-dispatch-minutely');
  PERFORM cron.unschedule('assignment-due-reminders-hourly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'assignment-due-reminders-hourly');

  -- Every minute: drain the LINE outbox.
  PERFORM cron.schedule(
    'line-dispatch-minutely',
    '* * * * *',
    format($q$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(
            (SELECT value FROM private.cron_secrets WHERE key = 'cron_token'), ''
          )
        )
      ) AS request_id;
    $q$, v_base || '/line-dispatch')
  );

  -- Hourly: assignment due reminders (same root-cause fix — was 403'ing on the empty GUC).
  PERFORM cron.schedule(
    'assignment-due-reminders-hourly',
    '0 * * * *',
    format($q$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(
            (SELECT value FROM private.cron_secrets WHERE key = 'cron_token'), ''
          )
        )
      ) AS request_id;
    $q$, v_base || '/assignment-due-reminders')
  );
END;
$outer$;
