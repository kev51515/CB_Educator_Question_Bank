-- =============================================================================
-- Migration: 0203_counseling_audit.sql
-- Description: Forensic audit trail for the four counseling student-data tables
--   that are written directly from the client (RLS-scoped, but until now with no
--   record of WHO changed an advisee's data):
--     counseling_profiles, college_applications, counseling_tasks,
--     counseling_meetings.
--
-- One AFTER INSERT/UPDATE/DELETE trigger per table, all sharing audit_counseling().
-- Each change writes an audit_events row: actor_id = auth.uid(), action =
--   'counseling.<op>', target_kind = <table>, target_id = <row id>, details =
--   { op, course_id, student_id, changed_fields[], status_from/status_to }.
--
-- PRIVACY (mirrors 0062 teacher-notes): the payload deliberately records only
--   *metadata* — the row's ids, the operation, and the NAMES of the columns that
--   changed (e.g. ['goals','notes']) — never the sensitive free-text/PII values
--   (gpa, goals, test_scores, application notes, meeting summaries). The one
--   exception is a controlled-vocabulary `status` transition (considering →
--   submitted, open → done), which is workflow state, not PII, and is genuinely
--   useful ("who marked this submitted").
--
-- Security model: SECURITY DEFINER + SET search_path = public, auth so the INSERT
--   survives audit_events' admin-read-only RLS (no INSERT policy exists — same
--   pattern as 0027 / 0056). actor_id is nullable for system/service writes.
--
-- Forward-only. Idempotent re-runs OK (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_counseling()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  -- The surviving row (NEW for ins/upd, OLD for del) — source of the ids.
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END;
  v_changed text[];
  v_status_old text := v_old->>'status';
  v_status_new text := v_new->>'status';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Names of columns whose value actually changed, minus the housekeeping
    -- timestamp. NULL ⇒ only updated_at moved ⇒ nothing material to audit.
    SELECT array_agg(key ORDER BY key) INTO v_changed
      FROM jsonb_each(v_new) AS e(key, val)
     WHERE key <> 'updated_at'
       AND v_new -> key IS DISTINCT FROM v_old -> key;
    IF v_changed IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    auth.uid(),
    'counseling.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_row ->> 'id',
    jsonb_strip_nulls(jsonb_build_object(
      'op',             TG_OP,
      'course_id',      v_row ->> 'course_id',
      'student_id',     v_row ->> 'student_id',
      'changed_fields', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(v_changed) END,
      'status_from',    CASE WHEN TG_OP = 'UPDATE' AND v_status_old IS DISTINCT FROM v_status_new
                             THEN v_status_old END,
      'status_to',      CASE WHEN TG_OP = 'UPDATE' AND v_status_old IS DISTINCT FROM v_status_new
                             THEN v_status_new END
    ))
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Attach to each counseling table. AFTER so the row is already committed-shaped;
-- FOR EACH ROW so we see per-record changes (and OLD/NEW for the diff).
DROP TRIGGER IF EXISTS trg_audit_counseling_profiles ON public.counseling_profiles;
CREATE TRIGGER trg_audit_counseling_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.counseling_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_counseling();

DROP TRIGGER IF EXISTS trg_audit_college_applications ON public.college_applications;
CREATE TRIGGER trg_audit_college_applications
  AFTER INSERT OR UPDATE OR DELETE ON public.college_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_counseling();

DROP TRIGGER IF EXISTS trg_audit_counseling_tasks ON public.counseling_tasks;
CREATE TRIGGER trg_audit_counseling_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.counseling_tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_counseling();

DROP TRIGGER IF EXISTS trg_audit_counseling_meetings ON public.counseling_meetings;
CREATE TRIGGER trg_audit_counseling_meetings
  AFTER INSERT OR UPDATE OR DELETE ON public.counseling_meetings
  FOR EACH ROW EXECUTE FUNCTION public.audit_counseling();

-- END OF MIGRATION 0203_counseling_audit.sql
