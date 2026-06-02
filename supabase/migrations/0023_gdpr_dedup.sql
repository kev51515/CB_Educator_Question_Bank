-- 0023_gdpr_dedup.sql
-- Part 1: GDPR self-service data export (auth.uid()-scoped).
-- Part 2: Reminder log table + cleanup helper for assignment-due-reminders dedup.

-- =============================================================================
-- Part 1: GDPR data export
-- =============================================================================

CREATE OR REPLACE FUNCTION public.export_my_data() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT jsonb_build_object(
    'profile',                (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid),
    'course_memberships',     (SELECT coalesce(jsonb_agg(to_jsonb(cm)), '[]'::jsonb) FROM public.course_memberships cm WHERE cm.student_id = v_uid),
    'assignment_attempts',    (SELECT coalesce(jsonb_agg(to_jsonb(aa)), '[]'::jsonb) FROM public.assignment_attempts aa WHERE aa.student_id = v_uid),
    'portfolio_submissions',  (SELECT coalesce(jsonb_agg(to_jsonb(ps)), '[]'::jsonb) FROM public.portfolio_submissions ps WHERE ps.student_id = v_uid),
    'portfolio_feedback',     (SELECT coalesce(jsonb_agg(to_jsonb(pf)), '[]'::jsonb)
                               FROM public.portfolio_feedback pf
                               WHERE pf.submission_id IN (SELECT id FROM public.portfolio_submissions WHERE student_id = v_uid)),
    'exported_at',            now()
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- =============================================================================
-- Part 2: Reminder dedup log
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id bigserial PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_kind text NOT NULL,  -- 'assignment_due_24h' for now; extensible
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id, reminder_kind)
);
CREATE INDEX IF NOT EXISTS reminder_log_sent_idx ON public.reminder_log (sent_at DESC);
-- Service role only; clients should never read this.
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
-- No policies = nobody but service-role can read.

-- Cleanup function (run from pg_cron monthly)
CREATE OR REPLACE FUNCTION public.prune_reminder_log() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  DELETE FROM public.reminder_log WHERE sent_at < now() - interval '90 days';
$$;
GRANT EXECUTE ON FUNCTION public.prune_reminder_log() TO service_role;
