-- =============================================================================
-- Migration: 0138_counseling_deadline_reminders.sql
-- Description: Daily in-app deadline reminders for counseling — nudge a student
-- about (a) college application deadlines 3 days and 1 day out (not yet
-- submitted) and (b) counseling tasks due tomorrow (still open). Uses the
-- existing `notifications` table + the 'reminder' kind (already has a clock icon
-- client-side), so no email infra needed. Scheduled via pg_cron (enabled 0031).
--
-- Idempotency: each reminder is guarded by NOT EXISTS a same-title 'reminder'
-- created in the last 20h, so a re-run / double schedule won't double-notify.
--
-- Forward-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_counseling_deadline_reminders()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_apps  integer := 0;
  v_tasks integer := 0;
BEGIN
  -- (a) College deadlines 3 days / 1 day out, not yet submitted.
  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  SELECT
    ca.student_id,
    'reminder',
    'College deadline ' || (ca.deadline - current_date) || ' day(s) away: ' || ca.college_name,
    'Plan: ' || COALESCE(ca.plan, 'TBD') || ' · Status: ' || ca.status,
    '/courses/' || COALESCE(c.short_code, ca.course_id::text)
  FROM public.college_applications ca
  JOIN public.courses c ON c.id = ca.course_id
  WHERE ca.deadline IN (current_date + 1, current_date + 3)
    AND ca.status NOT IN ('submitted','accepted','rejected','waitlisted','deferred','enrolled')
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = ca.student_id
        AND n.kind = 'reminder'
        AND n.title = 'College deadline ' || (ca.deadline - current_date) || ' day(s) away: ' || ca.college_name
        AND n.created_at > now() - interval '20 hours'
    );
  GET DIAGNOSTICS v_apps = ROW_COUNT;

  -- (b) Counseling tasks due tomorrow, still open.
  INSERT INTO public.notifications (recipient_id, kind, title, body, link)
  SELECT
    t.student_id,
    'reminder',
    'Task due tomorrow: ' || t.title,
    t.details,
    '/courses/' || COALESCE(c.short_code, t.course_id::text)
  FROM public.counseling_tasks t
  JOIN public.courses c ON c.id = t.course_id
  WHERE t.due_date = current_date + 1
    AND t.status = 'open'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = t.student_id
        AND n.kind = 'reminder'
        AND n.title = 'Task due tomorrow: ' || t.title
        AND n.created_at > now() - interval '20 hours'
    );
  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RETURN v_apps + v_tasks;
END;
$$;

-- Cron worker only — not user-callable. service_role (used by tooling/smoke) may
-- invoke it; revoke from everyone else.
REVOKE ALL ON FUNCTION public.run_counseling_deadline_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_counseling_deadline_reminders() TO service_role;

-- Schedule daily at 01:00 UTC (~09:00 Taipei). Guard if pg_cron is absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available; skipping schedule. Re-run after enabling.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('counseling-deadline-reminders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'counseling-deadline-reminders');

  PERFORM cron.schedule(
    'counseling-deadline-reminders',
    '0 1 * * *',
    'SELECT public.run_counseling_deadline_reminders();'
  );
END
$$;

-- =============================================================================
-- END OF MIGRATION 0138_counseling_deadline_reminders.sql
-- =============================================================================
