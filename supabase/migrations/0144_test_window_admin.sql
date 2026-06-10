-- =============================================================================
-- Migration: 0144_test_window_admin.sql
-- Purpose:   Teacher-facing admin RPCs for the partial/scheduled module
--            deployment feature introduced in 0143:
--
--     set_test_module_windows(course, slug, windows[])  — author/replace the
--         per-course schedule. Enforces a COMPLETE, CONTIGUOUS deployed range
--         (so the deployed positions form a valid run from first..last) and
--         refuses to retroactively re-lock a module a student already passed.
--     get_test_module_windows(course, slug)             — read the schedule for
--         the teacher UI (labels joined from test_modules).
--     finalize_metered_run(run_id)                      — escape hatch: a
--         teacher force-finalizes a run at its highest answered module so a
--         never-opened tail can't strand it out of the release queue forever.
--
--   All SECURITY DEFINER + SET search_path = public, auth; stable string error
--   codes; no inlined profiles EXISTS (uses is_staff/is_teacher_of_course/
--   is_admin helpers). Audit rows never include answer content.
--
--   Forward-only. Depends on 0143 (test_module_windows, run snapshot columns).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- set_test_module_windows — author/replace a course's release schedule.
--   p_windows: [{ "position": 1, "deployed": true, "opens_at": "2026-06-10T13:00:00Z" }, ...]
--     • deployed defaults to true if omitted; opens_at NULL ⇒ open immediately.
--     • MUST list every module position (1..max) so the deployed set is explicit.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_test_module_windows(
  p_course_id uuid, p_slug text, p_windows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_test_id   uuid;
  v_max_pos   integer;
  v_supplied  integer;
  v_dep_min   integer;
  v_dep_max   integer;
  v_dep_cnt   integer;
  w           jsonb;
  v_pos       integer;
  v_deployed  boolean;
  v_opens     timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, p_course_id) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- Test must already be assigned to the course (the Modules link exists).
  IF NOT EXISTS (
    SELECT 1 FROM public.module_items mi
      JOIN public.course_modules cm ON cm.id = mi.module_id
     WHERE cm.course_id = p_course_id
       AND mi.item_type = 'link'
       AND mi.url ILIKE '%/test/' || p_slug || '%'
  ) THEN
    RAISE EXCEPTION 'not_assigned';
  END IF;

  SELECT max(position) INTO v_max_pos FROM public.test_modules WHERE test_id = v_test_id;

  -- Schedule must cover every position exactly once.
  SELECT count(DISTINCT (elem->>'position')::int) INTO v_supplied
    FROM jsonb_array_elements(p_windows) AS e(elem);
  IF v_supplied <> v_max_pos THEN
    RAISE EXCEPTION 'schedule_incomplete'
      USING HINT = 'Provide one entry per module position (1..' || v_max_pos || ').';
  END IF;

  -- Deployed set must be a non-empty CONTIGUOUS range (the run walks first..last
  -- sequentially; a gap would be unreachable).
  SELECT min((elem->>'position')::int), max((elem->>'position')::int), count(*)
    INTO v_dep_min, v_dep_max, v_dep_cnt
    FROM jsonb_array_elements(p_windows) AS e(elem)
   WHERE COALESCE((elem->>'deployed')::boolean, true);
  IF v_dep_cnt IS NULL OR v_dep_cnt = 0 THEN
    RAISE EXCEPTION 'no_modules_deployed';
  END IF;
  IF (v_dep_max - v_dep_min + 1) <> v_dep_cnt THEN
    RAISE EXCEPTION 'non_contiguous_deployment'
      USING HINT = 'Deployed modules must be a contiguous range (e.g. 1-2 or 3-4).';
  END IF;

  -- Guard: never retroactively lock/undeploy a position a student in this course
  -- has already passed (current_module > position) or answered.
  FOR w IN SELECT value FROM jsonb_array_elements(p_windows) LOOP
    v_pos      := (w->>'position')::int;
    v_deployed := COALESCE((w->>'deployed')::boolean, true);
    v_opens    := CASE WHEN (w->>'opens_at') IS NULL OR (w->>'opens_at') = ''
                       THEN NULL ELSE (w->>'opens_at')::timestamptz END;

    IF (NOT v_deployed) OR (v_opens IS NOT NULL AND v_opens > now()) THEN
      IF EXISTS (
        SELECT 1 FROM public.test_runs tr
         WHERE tr.course_id = p_course_id
           AND tr.test_id   = v_test_id
           AND (tr.current_module > v_pos
                OR EXISTS (SELECT 1 FROM public.test_run_answers a
                            WHERE a.run_id = tr.id AND a.module_position = v_pos))
      ) THEN
        RAISE EXCEPTION 'position_already_passed'
          USING HINT = 'A student has already reached module ' || v_pos || '.';
      END IF;
    END IF;

    INSERT INTO public.test_module_windows
      (course_id, test_id, module_position, deployed, opens_at, created_by)
    VALUES (p_course_id, v_test_id, v_pos, v_deployed, v_opens, v_uid)
    ON CONFLICT (course_id, test_id, module_position) DO UPDATE
      SET deployed = EXCLUDED.deployed, opens_at = EXCLUDED.opens_at,
          updated_at = now();
  END LOOP;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.windows_set', 'course', p_course_id::text,
          jsonb_build_object('slug', p_slug, 'windows', p_windows));

  RETURN public.get_test_module_windows(p_course_id, p_slug);
END;
$$;
REVOKE ALL ON FUNCTION public.set_test_module_windows(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_test_module_windows(uuid, text, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_test_module_windows — schedule + labels for the teacher UI.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_test_module_windows(p_course_id uuid, p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_teacher_of_course(v_uid, p_course_id) OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'position', m.position, 'section', m.section, 'label', m.label,
      'time_limit_seconds', m.time_limit_seconds, 'question_count', m.question_count,
      'deployed', COALESCE(w.deployed, true),
      'opens_at', w.opens_at,
      'submitted_count', (
        SELECT count(DISTINCT tr.user_id) FROM public.test_runs tr
          JOIN public.test_run_answers a ON a.run_id = tr.id AND a.module_position = m.position
         WHERE tr.course_id = p_course_id AND tr.test_id = v_test_id)
    ) ORDER BY m.position)
    FROM public.test_modules m
    LEFT JOIN public.test_module_windows w
      ON w.test_id = m.test_id AND w.module_position = m.position
     AND w.course_id = p_course_id
   WHERE m.test_id = v_test_id
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_test_module_windows(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_module_windows(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- finalize_metered_run — teacher escape hatch. Finalizes a stranded in-progress
-- run at its highest ANSWERED module (scores only what was actually taken).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_metered_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_run       public.test_runs%ROWTYPE;
  v_has_scope boolean := false;
  v_score     integer;
  v_total     integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;

  -- Scope: admin, or a teacher of a course linking this run's test (0091 pattern).
  IF public.is_admin(v_uid) THEN
    v_has_scope := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.tests          t
        JOIN public.module_items   mi   ON mi.item_type = 'link'
                                       AND mi.url ILIKE '%/test/' || t.slug || '%'
        JOIN public.course_modules cmod ON cmod.id = mi.module_id
       WHERE t.id = v_run.test_id
         AND public.is_teacher_of_course(v_uid, cmod.course_id)
    ) INTO v_has_scope;
  END IF;
  IF NOT v_has_scope THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.test_run_answers WHERE run_id = v_run.id) THEN
    RAISE EXCEPTION 'nothing_to_finalize';
  END IF;

  SELECT count(*) FILTER (WHERE is_correct), count(*)
    INTO v_score, v_total
    FROM public.test_run_answers WHERE run_id = v_run.id;

  UPDATE public.test_runs SET
    status = 'submitted',
    submitted_at = now(),
    current_module = (SELECT max(module_position) FROM public.test_run_answers WHERE run_id = v_run.id),
    current_module_started_at = NULL,
    score = v_score,
    total = v_total,
    duration_seconds = GREATEST(0, COALESCE((
      SELECT sum((e.value->>'elapsed_seconds')::int)
        FROM jsonb_each(COALESCE(module_timing, '{}'::jsonb)) e
       WHERE e.value->>'elapsed_seconds' IS NOT NULL), 0)),
    section_scores = (
      SELECT jsonb_object_agg(s.section, jsonb_build_object('correct', s.correct, 'total', s.total))
      FROM (
        SELECT m.section,
               count(*) FILTER (WHERE a.is_correct) AS correct,
               count(*) AS total
          FROM public.test_run_answers a
          JOIN public.test_questions tq ON tq.id = a.question_id
          JOIN public.test_modules m ON m.id = tq.module_id
         WHERE a.run_id = v_run.id
         GROUP BY m.section
      ) s)
   WHERE id = v_run.id;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.run_force_finalized', 'test_run', p_run_id::text,
          jsonb_build_object('score', v_score, 'total', v_total));

  RETURN jsonb_build_object('finished', true, 'run_id', v_run.id,
    'score', v_score, 'total', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_metered_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_metered_run(uuid) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0144_test_window_admin.sql
-- =============================================================================
