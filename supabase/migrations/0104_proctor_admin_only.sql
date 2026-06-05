-- 0104_proctor_admin_only.sql
-- ============================================================================
-- Lock the full-test PROCTOR MUTATION RPCs to ADMIN-ONLY.
--
-- Decision (owner, launch-prep): limit live-test proctoring to a SINGLE
-- designated account (the admin) to avoid two teachers issuing conflicting
-- actions on the same sitting. Non-admin staff keep READ access (the live
-- monitor / roster / stats via test_live_progress + test_roster_status, both
-- unchanged) but can no longer MUTATE a run.
--
-- The ONLY change in each function below vs its prior definition (0076 / 0090 /
-- 0091 / 0100 / 0101 / 0102) is the first authorization gate:
--     IF NOT public.is_staff(v_uid)  →  IF NOT public.is_admin(v_uid)
-- Everything else (SECURITY DEFINER, search_path, signatures, bodies, audit
-- writes, error codes, grants) is preserved byte-for-byte. The subsequent
-- course-scope blocks are now redundant under admin-only (an admin always
-- satisfies them) but are kept to minimise the diff; they never reject an admin.
--
-- Read-only surfaces deliberately NOT narrowed: test_live_progress (monitor),
-- test_roster_status, test_run_state, get_test_result. Student-owned RPCs
-- (test_report_away / test_report_integrity / save_test_progress / etc.) are
-- untouched.
-- ============================================================================

-- 1) release_test_results  (was 0091) ---------------------------------------
CREATE OR REPLACE FUNCTION public.release_test_results(
  p_run_id   uuid,
  p_released boolean DEFAULT true
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_when      timestamptz;
  v_has_scope boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Scope: caller is admin, OR caller teaches at least one course that
  -- links the test this run belongs to. EXISTS handles the multi-course
  -- case (same test linked from multiple courses).
  IF public.is_admin(v_uid) THEN
    v_has_scope := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.test_runs        tr
        JOIN public.tests            t    ON t.id  = tr.test_id
        JOIN public.module_items     mi   ON mi.item_type = 'link'
                                         AND mi.url ILIKE '%/test/' || t.slug || '%'
        JOIN public.course_modules   cmod ON cmod.id = mi.module_id
        JOIN public.courses          c    ON c.id   = cmod.course_id
       WHERE tr.id        = p_run_id
         AND c.teacher_id = v_uid
    ) INTO v_has_scope;
  END IF;

  IF NOT v_has_scope THEN RAISE EXCEPTION 'not_authorized'; END IF;

  v_when := CASE WHEN p_released THEN now() ELSE NULL END;

  UPDATE public.test_runs
     SET results_released_at = v_when
   WHERE id = p_run_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_uid,
    CASE WHEN p_released THEN 'test_result.release' ELSE 'test_result.unrelease' END,
    'test_run', p_run_id::text,
    jsonb_build_object('released', p_released)
  );

  RETURN v_when;
END;
$$;
GRANT EXECUTE ON FUNCTION public.release_test_results(uuid, boolean) TO authenticated;

-- 2) release_test_results_for_teacher  (was 0076) ---------------------------
CREATE OR REPLACE FUNCTION public.release_test_results_for_teacher(
  p_slug text, p_released boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_test_id uuid;
  v_admin   boolean;
  v_count   integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.is_admin(v_uid);

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  UPDATE public.test_runs r
     SET results_released_at = CASE WHEN p_released THEN now() ELSE NULL END
   WHERE r.test_id = v_test_id
     AND r.status = 'submitted'
     AND (v_admin OR EXISTS (
            SELECT 1 FROM public.course_memberships cm
              JOIN public.courses c ON c.id = cm.course_id
             WHERE cm.student_id = r.user_id AND c.teacher_id = v_uid));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (
    v_uid,
    CASE WHEN p_released THEN 'test_result.release_bulk' ELSE 'test_result.unrelease_bulk' END,
    'test', v_test_id::text,
    jsonb_build_object('slug', p_slug, 'released', p_released, 'count', v_count)
  );

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.release_test_results_for_teacher(text, boolean) TO authenticated;

-- 3) allow_test_retake  (was 0090) ------------------------------------------
CREATE OR REPLACE FUNCTION public.allow_test_retake(p_student_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_test_id     uuid;
  v_has_scope   boolean := false;
  v_last_sub    timestamptz;
  v_last_grant  timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- Scope check: caller must be teacher of a course (or admin) where:
  --   • student is a member, AND
  --   • the course has a module_items link to this test.
  IF public.is_admin(v_uid) THEN
    v_has_scope := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.course_memberships cm
        JOIN public.course_modules     cmod ON cmod.course_id = cm.course_id
        JOIN public.module_items       mi   ON mi.module_id   = cmod.id
        JOIN public.courses            c    ON c.id           = cm.course_id
       WHERE cm.student_id  = p_student_id
         AND mi.item_type   = 'link'
         AND mi.url         ILIKE '%/test/' || p_slug || '%'
         AND c.teacher_id   = v_uid
    ) INTO v_has_scope;
  END IF;

  IF NOT v_has_scope THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Idempotency: refuse if a grant already exists that is newer than the
  -- student's latest submission (i.e., the grant has not been consumed yet).
  SELECT submitted_at INTO v_last_sub
    FROM public.test_runs
   WHERE user_id = p_student_id AND test_id = v_test_id AND status = 'submitted'
   ORDER BY submitted_at DESC NULLS LAST
   LIMIT 1;

  SELECT granted_at INTO v_last_grant
    FROM public.test_retake_grants
   WHERE user_id = p_student_id AND test_id = v_test_id
   ORDER BY granted_at DESC NULLS LAST
   LIMIT 1;

  -- A grant is still "live" if no submission has occurred after it was issued.
  IF v_last_grant IS NOT NULL AND (v_last_sub IS NULL OR v_last_grant > v_last_sub) THEN
    RAISE EXCEPTION 'retake_already_granted';
  END IF;

  INSERT INTO public.test_retake_grants (user_id, test_id, granted_by)
  VALUES (p_student_id, v_test_id, v_uid);

  INSERT INTO public.audit_events (actor_id, action, target_kind, target_id, details)
  VALUES (v_uid, 'test.retake_granted', 'profile', p_student_id::text,
          jsonb_build_object('slug', p_slug));
END;
$$;
GRANT EXECUTE ON FUNCTION public.allow_test_retake(uuid, text) TO authenticated;

-- 4) reset_test_attempt  (was 0090) -----------------------------------------
CREATE OR REPLACE FUNCTION public.reset_test_attempt(p_student_id uuid, p_slug text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_test_id   uuid;
  v_count     integer;
  v_has_scope boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT id INTO v_test_id FROM public.tests WHERE slug = p_slug;
  IF v_test_id IS NULL THEN RAISE EXCEPTION 'test_not_found'; END IF;

  -- Same scope pattern as allow_test_retake.
  IF public.is_admin(v_uid) THEN
    v_has_scope := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.course_memberships cm
        JOIN public.course_modules     cmod ON cmod.course_id = cm.course_id
        JOIN public.module_items       mi   ON mi.module_id   = cmod.id
        JOIN public.courses            c    ON c.id           = cm.course_id
       WHERE cm.student_id  = p_student_id
         AND mi.item_type   = 'link'
         AND mi.url         ILIKE '%/test/' || p_slug || '%'
         AND c.teacher_id   = v_uid
    ) INTO v_has_scope;
  END IF;

  IF NOT v_has_scope THEN RAISE EXCEPTION 'not_authorized'; END IF;

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
GRANT EXECUTE ON FUNCTION public.reset_test_attempt(uuid, text) TO authenticated;

-- 5) proctor_add_time  (was 0100) -------------------------------------------
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
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
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
GRANT EXECUTE ON FUNCTION public.proctor_add_time(uuid, integer) TO authenticated;

-- 6) proctor_force_submit  (was 0101) ---------------------------------------
CREATE OR REPLACE FUNCTION public.proctor_force_submit(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_run   public.test_runs%ROWTYPE;
  v_slug  text;
  v_ok    boolean;
  v_score integer;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_run FROM public.test_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'in_progress' THEN RAISE EXCEPTION 'run_already_submitted'; END IF;

  -- Scope: admin, or a teacher of a course that links this test.
  IF NOT public.is_admin(v_uid) THEN
    SELECT t.slug INTO v_slug FROM public.tests t WHERE t.id = v_run.test_id;
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

  -- Grade everything the student has recorded so far (idempotent: already-graded
  -- submitted modules re-resolve to the same value).
  UPDATE public.test_run_answers a
     SET is_correct = public._grade_answer(tq.type, tq.correct_answer, tq.accepted, a.chosen)
    FROM public.test_questions tq
   WHERE tq.id = a.question_id AND a.run_id = v_run.id;

  -- Total = the WHOLE test (unreached questions count against the student).
  SELECT count(*) INTO v_total
    FROM public.test_questions tq
    JOIN public.test_modules m ON m.id = tq.module_id
   WHERE m.test_id = v_run.test_id;

  SELECT count(*) FILTER (WHERE is_correct) INTO v_score
    FROM public.test_run_answers WHERE run_id = v_run.id;

  UPDATE public.test_runs SET
    status                    = 'submitted',
    submitted_at              = now(),
    current_module_started_at = NULL,
    score                     = v_score,
    total                     = v_total,
    duration_seconds          = floor(extract(epoch FROM (now() - started_at)))::int,
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
  VALUES (v_uid, 'proctor.force_submit', 'test_run', p_run_id::text,
          jsonb_build_object('score', v_score, 'total', v_total));

  RETURN jsonb_build_object('score', v_score, 'total', v_total);
END;
$$;
GRANT EXECUTE ON FUNCTION public.proctor_force_submit(uuid) TO authenticated;

-- 7) proctor_set_pause  (was 0102) ------------------------------------------
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
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;

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
GRANT EXECUTE ON FUNCTION public.proctor_set_pause(uuid, boolean) TO authenticated;
