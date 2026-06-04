-- =============================================================================
-- Migration: 0102_proctor_pause.sql
-- Description: Force pause / resume for a live sitting (fire drill, interruption,
--              integrity stop) WITHOUT touching the core get_test_module /
--              submit_test_module RPCs:
--
--   • test_runs.paused_at — non-NULL while paused.
--   • proctor_set_pause(run, paused) — teacher-of-a-linking-course/admin. Pause
--     stamps paused_at; RESUME shifts current_module_started_at forward by the
--     paused duration, so the normal `now() - started` deadline math everywhere
--     resumes exactly where it left off (no time lost, nothing else to change).
--   • test_run_state(run) — a LIGHT owner-only poll for the runner: status,
--     paused, current_module, and a paused-aware seconds_remaining. Replaces the
--     heavy 30s get_test_module re-sync; drives extend (add-time) + pause + end
--     detection in one cheap call.
--   • test_live_progress recreated (DROP+CREATE) to also return `paused` and to
--     freeze seconds_remaining while paused (COALESCE(paused_at, now())).
--
-- Forward-only.
-- =============================================================================

ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- -----------------------------------------------------------------------------
-- proctor_set_pause — freeze / unfreeze a student's timer
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proctor_set_pause(p_run_id uuid, p_paused boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_run  public.test_runs%ROWTYPE;
  v_slug text;
  v_ok   boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;

  IF NOT public.is_admin(v_uid) THEN
    SELECT t.slug INTO v_slug FROM public.tests t WHERE t.id = v_run.test_id;
    SELECT EXISTS (
      SELECT 1 FROM public.module_items mi
        JOIN public.course_modules cm ON cm.id = mi.module_id
        JOIN public.courses c ON c.id = cm.course_id
       WHERE mi.item_type = 'link'
         AND mi.url ILIKE '%/test/' || v_slug || '%'
         AND c.teacher_id = v_uid
    ) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_authorized'; END IF;
  END IF;

  IF p_paused THEN
    IF v_run.paused_at IS NULL THEN
      UPDATE public.test_runs SET paused_at = now() WHERE id = p_run_id;
    END IF;
  ELSE
    IF v_run.paused_at IS NOT NULL THEN
      UPDATE public.test_runs
         SET current_module_started_at = current_module_started_at + (now() - paused_at),
             paused_at  = NULL,
             last_seen_at = now()
       WHERE id = p_run_id;
    END IF;
  END IF;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, CASE WHEN p_paused THEN 'proctor.pause' ELSE 'proctor.resume' END,
          'test_run', p_run_id::text, '{}'::jsonb);

  RETURN p_paused;
END;
$$;
REVOKE ALL ON FUNCTION public.proctor_set_pause(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proctor_set_pause(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- test_run_state — light owner poll (status / paused / remaining)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_run_state(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run public.test_runs%ROWTYPE;
  v_mod public.test_modules%ROWTYPE;
  v_rem integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT m.* INTO v_mod FROM public.test_modules m
   WHERE m.test_id = v_run.test_id AND m.position = v_run.current_module;

  IF v_run.status = 'in_progress' AND v_run.current_module_started_at IS NOT NULL AND v_mod.id IS NOT NULL THEN
    v_rem := greatest(0, v_mod.time_limit_seconds
              - floor(extract(epoch FROM (COALESCE(v_run.paused_at, now()) - v_run.current_module_started_at)))::int);
  ELSE
    v_rem := NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', v_run.status,
    'paused', (v_run.paused_at IS NOT NULL),
    'current_module', v_run.current_module,
    'seconds_remaining', v_rem);
END;
$$;
REVOKE ALL ON FUNCTION public.test_run_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_run_state(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- test_live_progress — add `paused`; freeze seconds_remaining while paused
-- (DROP+CREATE; otherwise identical to 0100)
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
-- END OF MIGRATION 0102_proctor_pause.sql
-- =============================================================================
