-- =============================================================================
-- Migration: 0087_live_proctoring.sql
-- Description: Live test monitoring so a teacher can proctor an (online) class —
--              see which student is on which question, how far they are, time
--              left, and whether they've gone idle.
--
--   • test_runs gains current_question (the question NUMBER the student is
--     viewing) + last_seen_at (heartbeat timestamp).
--   • test_heartbeat(run, question) — the student client pings this on every
--     question navigation + periodically. Owner-only, in-progress only, no-op
--     otherwise (never errors — proctoring telemetry must not break the test).
--   • test_live_progress(slug) — staff: the assigned roster with each student's
--     live state (submitted / in_progress with module+question+answered+time
--     left+idle / not_started). Scoped to the caller's students; admins all.
--
-- Forward-only.
-- =============================================================================

ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS current_question integer,
  ADD COLUMN IF NOT EXISTS last_seen_at     timestamptz;

-- -----------------------------------------------------------------------------
-- test_heartbeat — student pings their position (best-effort, owner only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_heartbeat(p_run_id uuid, p_question integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  UPDATE public.test_runs
     SET current_question = p_question, last_seen_at = now()
   WHERE id = p_run_id AND user_id = v_uid AND status = 'in_progress';
END;
$$;

REVOKE ALL ON FUNCTION public.test_heartbeat(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_heartbeat(uuid, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- test_live_progress — proctor view (staff)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_live_progress(p_slug text)
RETURNS TABLE (
  student_id       uuid,
  student_name     text,
  state            text,            -- 'submitted' | 'in_progress' | 'not_started'
  module_position  integer,
  module_label     text,
  current_question integer,
  answered         integer,
  module_questions integer,
  seconds_remaining integer,
  marked           integer,
  last_seen_at     timestamptz,
  submitted_at     timestamptz
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
    ip.last_seen_at,
    sub.submitted_at
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
-- END OF MIGRATION 0087_live_proctoring.sql
-- =============================================================================
