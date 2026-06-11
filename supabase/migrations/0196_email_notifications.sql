-- =============================================================================
-- Migration: 0196_email_notifications.sql
-- Email notification channel via Resend, mirroring the LINE architecture
-- (0153 outbox + 0158/0160 cron-drained edge function):
--
--   notifications INSERT ──trigger──▶ email_outbox ──cron+edge fn──▶ Resend
--
--   1. profiles.email_notifications — per-user master switch (default ON).
--      Self-serve via the "profiles: own row update" policy (0001); the 0093
--      display_name guard is column-specific and unaffected.
--   2. email_outbox — delivery queue (service-role only; RLS on, no policies).
--      Stores kind/title/body/link; the edge function renders the HTML so
--      templates can evolve without migrations.
--   3. enqueue_email_for_notification() — AFTER INSERT ON notifications.
--      Whitelisted kinds only (announcement, assignment_grade, feedback,
--      message — the high-value ones; discussion noise stays in-app).
--      Skips: managed students (synthetic %@students.local addresses are
--      non-deliverable BY DESIGN — see 0148), missing/disabled recipients.
--      Recipient-only for now (no guardian fan-out — guardians get LINE).
--   4. pg_cron: drain every 2 minutes via the email-dispatch edge function
--      (Bearer token from private.cron_secrets, the 0160 pattern).
--
-- Required function secrets (set out-of-band, never in a migration):
--   RESEND_API_KEY, EMAIL_FROM, CRON_TOKEN (already set for LINE).
-- Console prerequisite: verify the sending domain in the Resend dashboard
--   (DNS records) or sends will be rejected.
--
-- Per CLAUDE.md: trigger INSERTs into another table ⇒ SECURITY DEFINER +
-- SET search_path. Forward-only; idempotent where cheap.
-- !! Verify numbering before push (parallel session active). !!
-- =============================================================================

-- ---- 1. per-user master switch ----------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true;

-- ---- 2. delivery queue --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id              bigserial PRIMARY KEY,
  profile_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  kind            text,
  title           text NOT NULL,
  body            text,
  link            text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        int  NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
-- Drain query: WHERE status='pending' ORDER BY created_at.
CREATE INDEX IF NOT EXISTS email_outbox_pending_idx
  ON public.email_outbox (created_at) WHERE status = 'pending';

-- Service-role only — RLS on with no policies (the 0153 line_outbox pattern).
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

-- ---- 3. enqueue trigger -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_email_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.kind NOT IN ('announcement', 'assignment_grade', 'feedback', 'message') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.email_outbox (profile_id, recipient_email, kind, title, body, link)
  SELECT p.id, p.email, NEW.kind, NEW.title, NEW.body, NEW.link
  FROM public.profiles p
  WHERE p.id = NEW.recipient_id
    AND p.email_notifications
    AND COALESCE(p.managed, false) = false      -- managed students: teacher-run accounts
    AND p.email IS NOT NULL
    AND p.email LIKE '%@%'
    AND p.email NOT LIKE '%@students.local';    -- synthetic, non-deliverable (0148)

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enqueue_email ON public.notifications;
CREATE TRIGGER trg_enqueue_email
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_email_for_notification();

-- ---- 4. cron drain ------------------------------------------------------------
DO $outer$
DECLARE
  v_base text := 'https://ljdofwovsyaqydcbohhd.supabase.co/functions/v1';
BEGIN
  PERFORM cron.unschedule('email-dispatch-2min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-dispatch-2min');

  -- Every 2 minutes (email is less latency-sensitive than LINE chat pushes,
  -- and the gentler cadence stays far inside Resend's default rate limits).
  PERFORM cron.schedule(
    'email-dispatch-2min',
    '*/2 * * * *',
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
    $q$, v_base || '/email-dispatch')
  );
END;
$outer$;
