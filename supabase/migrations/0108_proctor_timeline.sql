-- =============================================================================
-- Migration: 0108_proctor_timeline.sql
-- Description: Per-event PROCTOR TIMELINE + denormalized aggregates + a
--              per-test proctoring level, so the live monitor can show an
--              auto-computed "flagged" pill and a post-hoc event log.
--
--   1. test_runs gains denormalized aggregates the live monitor reads without
--      a join: `away_total_seconds`, `focus_loss_count`, `focus_loss_seconds`
--      (existing away_count / integrity jsonb / last_seen_at / current_question
--      are kept and still maintained).
--
--   2. NEW `test_run_events` — one row per proctor signal (away / focus_loss /
--      fullscreen exit+enter / copy / paste / blocked-actions / devtools). RLS:
--      the owning student may READ their own; NO insert/update/delete policy —
--      writes flow only through the SECURITY DEFINER logger below, mirroring
--      test_run_answers (is_correct can't be forged; events can't be forged or
--      deleted by a tampered client).
--
--   3. `test_log_proctor_event(run, type, [duration], [module], [question])` —
--      UNIFIED best-effort logger (owner + allowlist only; NEVER throws, like
--      test_heartbeat / test_report_away / test_report_integrity). Inserts one
--      event row and bumps the matching denormalized counter on test_runs.
--      The 'copy'/'paste'/'fullscreen_exit'/blocked/devtools families keep the
--      SAME integrity jsonb counter shape 0103 introduced, so the existing live
--      monitor flag math keeps working untouched.
--
--   4. `get_test_run_timeline(run)` — owner OR a teacher of a course that
--      administers the run's test (reuses the new is_teacher_of_test helper)
--      reads the ordered event log for one sitting (post-hoc review).
--
--   5. tests.proctoring_level ('off'|'soft'|'strict', default 'soft') +
--      `set_test_proctoring_level(slug, level)` (teacher-of-course/admin,
--      audited) so the runner knows how aggressively to clamp down.
--
--   6. start_test now returns `proctoring_level`; test_live_progress recreated
--      (DROP+CREATE) to append the new aggregates + an inline `flagged` /
--      `flag_reasons`.
--
-- Forward-only. Telemetry RPC swallows all errors (must never break a test).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Denormalized aggregates on test_runs
-- -----------------------------------------------------------------------------
ALTER TABLE public.test_runs
  ADD COLUMN IF NOT EXISTS away_total_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS focus_loss_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS focus_loss_seconds integer NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. test_run_events — per-signal log (write-only via DEFINER RPC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_run_events (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id           uuid NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
  at               timestamptz NOT NULL DEFAULT now(),
  type             text NOT NULL CHECK (type IN (
                     'away', 'focus_loss', 'fullscreen_exit', 'fullscreen_enter',
                     'copy', 'paste', 'copy_blocked', 'paste_blocked',
                     'contextmenu_blocked', 'devtools')),
  module           integer,
  question         integer,
  duration_seconds integer,
  meta             jsonb
);

CREATE INDEX IF NOT EXISTS test_run_events_run_at
  ON public.test_run_events (run_id, at);

ALTER TABLE public.test_run_events ENABLE ROW LEVEL SECURITY;

-- Owner may READ their own events (post-hoc review). Writes happen ONLY via the
-- SECURITY DEFINER logger — there is intentionally NO INSERT/UPDATE/DELETE
-- policy, so a tampered client can neither forge nor erase its own trail.
DROP POLICY IF EXISTS test_run_events_owner_read ON public.test_run_events;
CREATE POLICY test_run_events_owner_read ON public.test_run_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.test_runs r
     WHERE r.id = test_run_events.run_id AND r.user_id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- 3. is_teacher_of_test(uid, test_id) — reusable scope helper
--    (same rule the proctor RPCs inline: teacher of a course whose module_items
--    link `/test/<slug>`). Factored out so the timeline + level RPCs share one
--    definition instead of re-inlining the join. SECURITY DEFINER per CLAUDE.md.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher_of_test(uid uuid, p_test_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tests t
      JOIN public.module_items   mi   ON mi.item_type = 'link'
                                     AND mi.url ILIKE '%/test/' || t.slug || '%'
      JOIN public.course_modules cm   ON cm.id = mi.module_id
      JOIN public.courses        c    ON c.id  = cm.course_id
     WHERE t.id = p_test_id
       AND c.teacher_id = uid
  );
$$;
REVOKE ALL ON FUNCTION public.is_teacher_of_test(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_test(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. test_log_proctor_event — unified best-effort logger (NEVER throws)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_log_proctor_event(
  p_run_id           uuid,
  p_type             text,
  p_duration_seconds integer DEFAULT NULL,
  p_module           integer DEFAULT NULL,
  p_question         integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_own boolean;
  v_dur integer := COALESCE(p_duration_seconds, 0);
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  -- Allowlist — a tampered client can only log known signal types.
  IF p_type NOT IN (
       'away', 'focus_loss', 'fullscreen_exit', 'fullscreen_enter',
       'copy', 'paste', 'copy_blocked', 'paste_blocked',
       'contextmenu_blocked', 'devtools') THEN
    RETURN;
  END IF;

  -- Ownership: the run must belong to the caller.
  SELECT EXISTS (
    SELECT 1 FROM public.test_runs r WHERE r.id = p_run_id AND r.user_id = v_uid
  ) INTO v_own;
  IF NOT v_own THEN RETURN; END IF;

  INSERT INTO public.test_run_events (run_id, type, module, question, duration_seconds)
  VALUES (p_run_id, p_type, p_module, p_question, p_duration_seconds);

  -- Denormalized aggregates the live monitor reads inline.
  IF p_type = 'away' THEN
    UPDATE public.test_runs
       SET away_count         = away_count + 1,
           away_total_seconds = away_total_seconds + v_dur,
           last_seen_at       = now()
     WHERE id = p_run_id;
  ELSIF p_type = 'focus_loss' THEN
    UPDATE public.test_runs
       SET focus_loss_count   = focus_loss_count + 1,
           focus_loss_seconds = focus_loss_seconds + v_dur
     WHERE id = p_run_id;
  ELSIF p_type IN ('copy', 'paste', 'fullscreen_exit',
                   'copy_blocked', 'paste_blocked',
                   'contextmenu_blocked', 'devtools') THEN
    -- Keep the existing 0103 integrity counter shape the monitor already reads.
    UPDATE public.test_runs
       SET integrity = jsonb_set(
             COALESCE(integrity, '{}'::jsonb), ARRAY[p_type],
             to_jsonb(COALESCE((integrity ->> p_type)::int, 0) + 1), true)
     WHERE id = p_run_id;
  END IF;
  -- 'fullscreen_enter' is logged as a raw event only (no aggregate).
EXCEPTION WHEN OTHERS THEN
  RETURN;  -- telemetry must NEVER break the test
END;
$$;
REVOKE ALL ON FUNCTION public.test_log_proctor_event(uuid, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_log_proctor_event(uuid, text, integer, integer, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. get_test_run_timeline — ordered event log for one sitting
--    Owner OR a teacher of the course administering the run's test.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_test_run_timeline(p_run_id uuid)
RETURNS TABLE (
  at               timestamptz,
  type             text,
  module           integer,
  question         integer,
  duration_seconds integer,
  meta             jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_test_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT r.user_id, r.test_id INTO v_owner, v_test_id
    FROM public.test_runs r WHERE r.id = p_run_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'run_not_found'; END IF;

  IF NOT (v_owner = v_uid
          OR public.is_admin(v_uid)
          OR public.is_teacher_of_test(v_uid, v_test_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT e.at, e.type, e.module, e.question, e.duration_seconds, e.meta
    FROM public.test_run_events e
   WHERE e.run_id = p_run_id
   ORDER BY e.at ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_test_run_timeline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_run_timeline(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Per-test proctoring level
-- -----------------------------------------------------------------------------
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS proctoring_level text NOT NULL DEFAULT 'soft'
    CHECK (proctoring_level IN ('off', 'soft', 'strict'));

CREATE OR REPLACE FUNCTION public.set_test_proctoring_level(p_slug text, p_level text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_level NOT IN ('off', 'soft', 'strict') THEN RAISE EXCEPTION 'invalid_level'; END IF;

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  IF NOT (public.is_admin(v_uid) OR public.is_teacher_of_test(v_uid, v_test_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.tests SET proctoring_level = p_level WHERE id = v_test_id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'proctor.set_level', 'test', v_test_id::text,
          jsonb_build_object('slug', p_slug, 'level', p_level));
END;
$$;
REVOKE ALL ON FUNCTION public.set_test_proctoring_level(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_test_proctoring_level(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. start_test — append `proctoring_level` (DROP+CREATE; jsonb return preserved)
--    Body identical to 0082 except the new top-level 'proctoring_level' key.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.start_test(text);

CREATE FUNCTION public.start_test(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_test       public.tests%ROWTYPE;
  v_run        public.test_runs%ROWTYPE;
  v_have       boolean := false;
  v_can_retake boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- 1. Resume an in-progress run.
  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  v_have := FOUND;

  -- 2. One-attempt — STUDENTS ONLY. Staff (preview) always get a fresh run.
  IF NOT v_have AND NOT public.is_staff(v_uid) THEN
    SELECT * INTO v_run FROM public.test_runs
     WHERE user_id = v_uid AND test_id = v_test.id AND status = 'submitted'
     ORDER BY submitted_at DESC LIMIT 1;
    IF FOUND THEN
      SELECT EXISTS (
        SELECT 1 FROM public.test_retake_grants g
         WHERE g.user_id = v_uid AND g.test_id = v_test.id
           AND g.granted_at > v_run.submitted_at
      ) INTO v_can_retake;
      v_have := NOT v_can_retake;  -- keep the submitted run unless retake granted
    END IF;
  END IF;

  -- 3. Create a new run (first attempt, granted retake, or any staff preview).
  IF NOT v_have THEN
    BEGIN
      INSERT INTO public.test_runs (user_id, test_id) VALUES (v_uid, v_test.id)
      RETURNING * INTO v_run;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_run FROM public.test_runs
       WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1;
    END;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'current_module', v_run.current_module,
    'started_at', v_run.started_at,
    'answered', (
      SELECT count(*) FROM public.test_run_answers
       WHERE run_id = v_run.id AND chosen IS NOT NULL),
    'test', jsonb_build_object(
      'slug', v_test.slug, 'title', v_test.title,
      'short_title', v_test.short_title, 'total_questions', v_test.total_questions),
    'modules', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'position', m.position, 'section', m.section, 'label', m.label,
        'time_limit_seconds', m.time_limit_seconds, 'question_count', m.question_count
      ) ORDER BY m.position), '[]'::jsonb)
      FROM public.test_modules m WHERE m.test_id = v_test.id),
    'proctoring_level', v_test.proctoring_level
  );
END;
$$;
REVOKE ALL ON FUNCTION public.start_test(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_test(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. test_live_progress — append away_total_seconds, focus_loss_count,
--    focus_loss_seconds, flagged, flag_reasons (DROP+CREATE; else identical to
--    0103 — every prior column preserved IN ORDER, new ones appended LAST).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.test_live_progress(text);

CREATE FUNCTION public.test_live_progress(p_slug text)
RETURNS TABLE (
  student_id        uuid,
  student_name      text,
  state             text,
  module_position   integer,
  module_label      text,
  current_question  integer,
  answered          integer,
  module_questions  integer,
  seconds_remaining integer,
  marked            integer,
  away_count        integer,
  paused            boolean,
  integrity         jsonb,
  last_seen_at      timestamptz,
  started_at        timestamptz,
  submitted_at      timestamptz,
  run_id            uuid,
  away_total_seconds integer,
  focus_loss_count   integer,
  focus_loss_seconds integer,
  flagged           boolean,
  flag_reasons      text[]
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
  ),
  rows AS (
    SELECT
      a.sid,
      a.sname,
      CASE WHEN sub.id IS NOT NULL THEN 'submitted'
           WHEN ip.id  IS NOT NULL THEN 'in_progress'
           ELSE 'not_started' END                                    AS state,
      ip.current_module                                              AS module_position,
      md.label                                                       AS module_label,
      ip.current_question                                           AS current_question,
      (SELECT count(*)::int FROM public.test_run_answers x
         JOIN public.test_questions tq ON tq.id = x.question_id
        WHERE x.run_id = ip.id AND tq.module_id = md.id AND x.chosen IS NOT NULL)
                                                                     AS answered,
      md.question_count                                             AS module_questions,
      CASE WHEN ip.id IS NOT NULL AND ip.current_module_started_at IS NOT NULL
           THEN greatest(0, md.time_limit_seconds
                  - floor(extract(epoch FROM (COALESCE(ip.paused_at, now()) - ip.current_module_started_at)))::int)
           END                                                       AS seconds_remaining,
      (SELECT count(*)::int FROM public.test_run_answers x
         JOIN public.test_questions tq ON tq.id = x.question_id
        WHERE x.run_id = ip.id AND tq.module_id = md.id AND x.marked)
                                                                     AS marked,
      COALESCE(ip.away_count, sub.away_count, 0)                     AS away_count,
      (ip.paused_at IS NOT NULL)                                     AS paused,
      COALESCE(ip.integrity, sub.integrity, '{}'::jsonb)            AS integrity,
      ip.last_seen_at                                               AS last_seen_at,
      COALESCE(ip.started_at, sub.started_at)                      AS started_at,
      sub.submitted_at                                             AS submitted_at,
      ip.id                                                         AS run_id,
      COALESCE(ip.away_total_seconds, sub.away_total_seconds, 0)    AS away_total_seconds,
      COALESCE(ip.focus_loss_count, sub.focus_loss_count, 0)        AS focus_loss_count,
      COALESCE(ip.focus_loss_seconds, sub.focus_loss_seconds, 0)    AS focus_loss_seconds
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
  ),
  flagged AS (
    SELECT r.*,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN r.away_total_seconds > 60 THEN 'away_60s' END,
        CASE WHEN r.away_count >= 3 THEN 'away_3x' END,
        CASE WHEN COALESCE((r.integrity ->> 'fullscreen_exit')::int, 0) >= 2 THEN 'fs_exit' END,
        CASE WHEN COALESCE((r.integrity ->> 'paste')::int, 0) >= 1 THEN 'paste' END,
        CASE WHEN COALESCE(r.focus_loss_count, 0) >= 3 THEN 'focus_3x' END
      ], NULL) AS reasons
    FROM rows r
  )
  SELECT
    f.sid, f.sname, f.state, f.module_position, f.module_label, f.current_question,
    f.answered, f.module_questions, f.seconds_remaining, f.marked, f.away_count,
    f.paused, f.integrity, f.last_seen_at, f.started_at, f.submitted_at, f.run_id,
    f.away_total_seconds, f.focus_loss_count, f.focus_loss_seconds,
    (array_length(f.reasons, 1) IS NOT NULL) AS flagged,
    f.reasons                                AS flag_reasons
  FROM flagged f
  ORDER BY
    CASE WHEN f.run_id IS NOT NULL THEN 0
         WHEN f.submitted_at IS NOT NULL THEN 1
         ELSE 2 END,
    f.sname;
END;
$$;
REVOKE ALL ON FUNCTION public.test_live_progress(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_live_progress(text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0108_proctor_timeline.sql
-- =============================================================================
