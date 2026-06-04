-- =============================================================================
-- Migration: 0103_integrity_signals.sql
-- Description: Extensible integrity telemetry for live proctoring. A single
--              `test_runs.integrity` jsonb counter bag (so new signals don't
--              need new columns / new live_progress recreates) + a best-effort
--              reporter, surfaced to the proctor via test_live_progress.
--
--   • test_runs.integrity jsonb '{}' — { paste: 3, fullscreen_exit: 1, ... }.
--   • test_report_integrity(run, event) — owner + in_progress only, best-effort
--     like test_heartbeat (telemetry must never break the test). Event is held
--     to a small allowlist so a tampered client can't write arbitrary keys.
--   • test_live_progress recreated (DROP+CREATE) to also return `integrity`.
--
-- Forward-only.
-- =============================================================================

ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS integrity jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.test_report_integrity(p_run_id uuid, p_event text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_event, '')));
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  -- Allowlist — a tampered client can only bump known integrity counters.
  IF v_key NOT IN ('paste', 'copy', 'blur', 'fullscreen_exit') THEN RETURN; END IF;
  UPDATE public.test_runs
     SET integrity = jsonb_set(
           integrity, ARRAY[v_key],
           to_jsonb(coalesce((integrity ->> v_key)::int, 0) + 1), true),
         last_seen_at = now()
   WHERE id = p_run_id AND user_id = v_uid AND status = 'in_progress';
END;
$$;
REVOKE ALL ON FUNCTION public.test_report_integrity(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_report_integrity(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- test_live_progress — add `integrity` (DROP+CREATE; otherwise identical to 0102)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.test_live_progress(text);

CREATE FUNCTION public.test_live_progress(p_slug text)
RETURNS TABLE (
  student_id       uuid,
  student_name     text,
  state            text,
  module_position  integer,
  module_label     text,
  current_question integer,
  answered         integer,
  module_questions integer,
  seconds_remaining integer,
  marked           integer,
  away_count       integer,
  paused           boolean,
  integrity        jsonb,
  last_seen_at     timestamptz,
  started_at       timestamptz,
  submitted_at     timestamptz,
  run_id           uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_admin   boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.is_admin(v_uid);

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  RETURN QUERY
  WITH assigned AS (
    SELECT DISTINCT cm.student_id AS sid, p.display_name AS sname
      FROM public.module_items mi
      JOIN public.course_modules cmod ON cmod.id = mi.module_id
      JOIN public.courses c ON c.id = cmod.course_id
      JOIN public.course_memberships cm ON cm.course_id = c.id
      JOIN public.profiles p ON p.id = cm.student_id
     WHERE mi.item_type = 'link'
       AND mi.url ILIKE '%/test/' || p_slug || '%'
       AND (v_admin OR c.teacher_id = v_uid)
  )
  SELECT
    a.sid,
    a.sname,
    CASE WHEN sub.id IS NOT NULL THEN 'submitted'
         WHEN ip.id  IS NOT NULL THEN 'in_progress'
         ELSE 'not_started' END,
    ip.current_module,
    md.label,
    ip.current_question,
    (SELECT count(*)::int FROM public.test_run_answers x
       JOIN public.test_questions tq ON tq.id = x.question_id
      WHERE x.run_id = ip.id AND tq.module_id = md.id AND x.chosen IS NOT NULL),
    md.question_count,
    CASE WHEN ip.id IS NOT NULL AND ip.current_module_started_at IS NOT NULL
         THEN greatest(0, md.time_limit_seconds
                - floor(extract(epoch FROM (COALESCE(ip.paused_at, now()) - ip.current_module_started_at)))::int)
         END,
    (SELECT count(*)::int FROM public.test_run_answers x
       JOIN public.test_questions tq ON tq.id = x.question_id
      WHERE x.run_id = ip.id AND tq.module_id = md.id AND x.marked),
    COALESCE(ip.away_count, sub.away_count, 0),
    (ip.paused_at IS NOT NULL),
    COALESCE(ip.integrity, sub.integrity, '{}'::jsonb),
    ip.last_seen_at,
    COALESCE(ip.started_at, sub.started_at),
    sub.submitted_at,
    ip.id
  FROM assigned a
  LEFT JOIN LATERAL (
    SELECT r.* FROM public.test_runs r
     WHERE r.user_id = a.sid AND r.test_id = v_test_id AND r.status = 'in_progress'
     ORDER BY r.started_at DESC LIMIT 1
  ) ip ON true
  LEFT JOIN LATERAL (
    SELECT r.* FROM public.test_runs r
     WHERE r.user_id = a.sid AND r.test_id = v_test_id AND r.status = 'submitted'
     ORDER BY r.submitted_at DESC LIMIT 1
  ) sub ON true
  LEFT JOIN public.test_modules md
    ON md.test_id = v_test_id AND md.position = ip.current_module
  ORDER BY
    CASE WHEN ip.id IS NOT NULL THEN 0
         WHEN sub.id IS NOT NULL THEN 1
         ELSE 2 END,
    a.sname;
END;
$$;
REVOKE ALL ON FUNCTION public.test_live_progress(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_live_progress(text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0103_integrity_signals.sql
-- =============================================================================
