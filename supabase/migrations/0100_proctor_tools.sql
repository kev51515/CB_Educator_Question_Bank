-- =============================================================================
-- Migration: 0100_proctor_tools.sql
-- Description: Make the live proctor monitor ACTIONABLE + add an integrity
--              signal, so a teacher can actually run a sitting:
--
--   1. INTEGRITY — `test_runs.away_count`: how many times the student left the
--      test tab. `test_report_away(run)` increments it (best-effort, owner +
--      in_progress only, like test_heartbeat — telemetry must never break the
--      test). Surfaced to the proctor via test_live_progress.
--
--   2. ACCOMMODATIONS — `proctor_add_time(run, seconds)`: a teacher of a course
--      linking the test (or admin) extends the student's CURRENT module by
--      shifting current_module_started_at later, so the existing deadline math
--      (get_test_module / test_live_progress / submit) all see the new time with
--      no other changes. Audited. Stable error codes.
--
--   3. test_live_progress recreated to also return `away_count` (DROP+CREATE —
--      return-type change). Body otherwise identical to 0099.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Integrity counter + reporter
-- -----------------------------------------------------------------------------
ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS away_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.test_report_away(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  UPDATE public.test_runs
     SET away_count = away_count + 1, last_seen_at = now()
   WHERE id = p_run_id AND user_id = v_uid AND status = 'in_progress';
END;
$$;
REVOKE ALL ON FUNCTION public.test_report_away(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_report_away(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Proctor add-time (accommodations / tech recovery)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proctor_add_time(p_run_id uuid, p_seconds integer)
RETURNS integer  -- echoes seconds added
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_slug    text;
  v_ok      boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_seconds IS NULL OR p_seconds <= 0 OR p_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid_seconds'
      USING HINT = 'Add between 1 and 3600 seconds.';
  END IF;

  SELECT r.test_id INTO v_test_id
    FROM public.test_runs r
   WHERE r.id = p_run_id AND r.status = 'in_progress';
  IF v_test_id IS NULL THEN
    RAISE EXCEPTION 'run_not_found'
      USING HINT = 'No in-progress run for that id.';
  END IF;

  -- Scope: admin, or a teacher of a course that links this test (same rule as
  -- test_live_progress / release_test_results).
  IF NOT public.is_admin(v_uid) THEN
    SELECT t.slug INTO v_slug FROM public.tests t WHERE t.id = v_test_id;
    SELECT EXISTS (
      SELECT 1
        FROM public.module_items mi
        JOIN public.course_modules cm ON cm.id = mi.module_id
        JOIN public.courses c ON c.id = cm.course_id
       WHERE mi.item_type = 'link'
         AND mi.url ILIKE '%/test/' || v_slug || '%'
         AND c.teacher_id = v_uid
    ) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_authorized'; END IF;
  END IF;

  -- Extend the current module: pushing the module start later increases
  -- seconds_remaining everywhere it's derived. No other column changes needed.
  UPDATE public.test_runs
     SET current_module_started_at =
           COALESCE(current_module_started_at, now()) + make_interval(secs => p_seconds)
   WHERE id = p_run_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'proctor.add_time', 'test_run', p_run_id::text,
          jsonb_build_object('seconds', p_seconds));

  RETURN p_seconds;
END;
$$;
REVOKE ALL ON FUNCTION public.proctor_add_time(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proctor_add_time(uuid, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. test_live_progress — add away_count (DROP+CREATE; else identical to 0099)
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
                - floor(extract(epoch FROM (now() - ip.current_module_started_at)))::int)
         END,
    (SELECT count(*)::int FROM public.test_run_answers x
       JOIN public.test_questions tq ON tq.id = x.question_id
      WHERE x.run_id = ip.id AND tq.module_id = md.id AND x.marked),
    COALESCE(ip.away_count, sub.away_count, 0),
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
-- END OF MIGRATION 0100_proctor_tools.sql
-- =============================================================================
