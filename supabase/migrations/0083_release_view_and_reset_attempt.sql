-- =============================================================================
-- Migration: 0083_release_view_and_reset_attempt.sql
-- Description: Two edge-case fixes.
--
--  #1  start_test() now returns `results_released` so the runner can show a
--      completed student their RELEASED results at /test/:slug (instead of the
--      stale "your teacher will review" message). Otherwise identical to 0082.
--
--  #2  reset_test_attempt(student, slug) — staff abandon a student's stuck
--      in-progress run so they can start fresh (the one-attempt lock only ever
--      gated SUBMITTED runs, so a never-submitted attempt was unresettable).
--      test_roster_status gains `has_in_progress` so the completion modal can
--      show "In progress" + a Reset action.
--
-- Forward-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- #1: start_test + results_released
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_test(p_slug text)
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

  SELECT * INTO v_run FROM public.test_runs
   WHERE user_id = v_uid AND test_id = v_test.id AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  v_have := FOUND;

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
      v_have := NOT v_can_retake;
    END IF;
  END IF;

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
    'results_released', (v_run.results_released_at IS NOT NULL),
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
      FROM public.test_modules m WHERE m.test_id = v_test.id)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- #2: reset_test_attempt — abandon a stuck in-progress run
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_test_attempt(p_student_id uuid, p_slug text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_count   integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  UPDATE public.test_runs
     SET status = 'abandoned'
   WHERE user_id = p_student_id AND test_id = v_test_id AND status = 'in_progress';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.attempt_reset', 'profile', p_student_id::text,
          jsonb_build_object('slug', p_slug, 'abandoned', v_count));

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_test_attempt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_test_attempt(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- test_roster_status + has_in_progress (return-type change → DROP + CREATE)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.test_roster_status(text);

CREATE FUNCTION public.test_roster_status(p_slug text)
RETURNS TABLE (
  student_id          uuid,
  student_name        text,
  run_id              uuid,
  score               integer,
  total               integer,
  submitted_at        timestamptz,
  results_released_at timestamptz,
  has_in_progress     boolean
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
  SELECT a.sid, a.sname, lr.id, lr.score, lr.total, lr.submitted_at, lr.results_released_at,
         EXISTS (SELECT 1 FROM public.test_runs ip
                  WHERE ip.user_id = a.sid AND ip.test_id = v_test_id
                    AND ip.status = 'in_progress')
    FROM assigned a
    LEFT JOIN LATERAL (
      SELECT r.id, r.score, r.total, r.submitted_at, r.results_released_at
        FROM public.test_runs r
       WHERE r.user_id = a.sid AND r.test_id = v_test_id AND r.status = 'submitted'
       ORDER BY r.submitted_at DESC NULLS LAST
       LIMIT 1
    ) lr ON true
   ORDER BY (lr.submitted_at IS NULL), a.sname;
END;
$$;

REVOKE ALL ON FUNCTION public.test_roster_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_roster_status(text) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 0083_release_view_and_reset_attempt.sql
-- =============================================================================
